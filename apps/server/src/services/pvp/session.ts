import {
  InputRecorder2,
  NO_INPUT,
  canSubstituteNow,
  checkSubStructure,
  createMatch,
  decodeInput,
  stateHash,
  stepBoth,
  substitute,
  type MatchSetup,
  type MatchState,
  type PlayerInput,
  type TeamSide,
} from '@pitch/sim';
import type {
  PvpClientMessage,
  PvpEndReason,
  PvpErrorCode,
  PvpServerMessage,
  PvpSub,
} from '@pitch/shared';

type BenchSlot = Extract<PvpClientMessage, { t: 'sub' }>['bench'];
import type { Clock } from '../../clock';
import type { Db } from '../../db/client';
import { track } from '../analytics';
import { finishPvpMatch, type FinishResult } from './finish';
import type { Tickable, TimeSource } from './ticker';

/** Đầu cuối của một người chơi, như phiên thấy (route bọc `ws`, test dùng client giả). */
export interface PvpConn {
  readonly userId: number;
  send(msg: PvpServerMessage): void;
  close(code: number): void;
}

export const COUNTDOWN_MS = 3000;
export const READY_TIMEOUT_MS = 30_000;
const HASH_EVERY = 60;
const HASH_KEEP = 30;

export interface SessionDeps {
  db: Db;
  clock: Clock;
  time: TimeSource;
  /** Phiên đã kết thúc và đã ghi DB (hoặc ghi lỗi). */
  onEnded(session: PvpSession, result: FinishResult | null): void;
  onError(err: unknown): void;
}

export interface SessionInit {
  pvpId: number;
  kind: 'ranked' | 'friendly';
  users: Record<TeamSide, number>;
  /** `setup.humans` phải là cả hai đội. */
  setup: MatchSetup;
}

type Phase = 'lobby' | 'countdown' | 'running' | 'ended';
const SIDES: TeamSide[] = ['home', 'away'];

/** Một trận PvP trong bộ nhớ (data-model §3). Nguồn sự thật là `state` của sim bóng trên server. */
export class PvpSession implements Tickable {
  readonly pvpId: number;
  readonly kind: 'ranked' | 'friendly';
  readonly users: Record<TeamSide, number>;
  readonly setup: MatchSetup;
  state: MatchState;
  /** Mã băm của sim bóng, khoá = `state.tick` SAU khi step (bội số của 60); giữ 30 mã gần nhất. */
  readonly serverHashes = new Map<number, number>();
  readonly recorder = new InputRecorder2();
  readonly sockets: Partial<Record<TeamSide, PvpConn>> = {};
  /** Kết quả đã lưu, có sau khi kết thúc. */
  result: FinishResult | null = null;
  private phase: Phase = 'lobby';
  private readonly readySides = new Set<TeamSide>();
  private readonly lastCode: Record<TeamSide, number> = { home: 0, away: 0 };
  private readonly inputs: Record<TeamSide, PlayerInput> = { home: NO_INPUT, away: NO_INPUT };
  private readonly pendingSubs: Partial<Record<TeamSide, { out: string; bench: BenchSlot }>> = {};
  private readonly matchedAt: number;
  private goAt = 0;
  private endPromise: Promise<void> | null = null;

  constructor(
    init: SessionInit,
    private readonly deps: SessionDeps,
  ) {
    this.pvpId = init.pvpId;
    this.kind = init.kind;
    this.users = init.users;
    this.setup = init.setup;
    this.state = createMatch(init.setup);
    this.matchedAt = deps.time.now();
  }

  get done(): boolean {
    return this.phase === 'ended';
  }

  get live(): boolean {
    return this.phase !== 'ended';
  }

  sideOf(userId: number): TeamSide | null {
    return SIDES.find((s) => this.users[s] === userId) ?? null;
  }

  attach(side: TeamSide, conn: PvpConn): void {
    this.sockets[side] = conn;
  }

  /** Socket đóng/rớt: người đó đứng yên. Xử thua theo thời gian rớt thuộc US3 (chỗ móc). */
  detach(side: TeamSide, conn: PvpConn): void {
    if (this.sockets[side] !== conn) return;
    delete this.sockets[side];
    this.setInput(side, 0);
  }

  ready(side: TeamSide): void {
    if (this.phase !== 'lobby') return;
    this.readySides.add(side);
    if (this.readySides.size < 2) return;
    this.phase = 'countdown';
    this.goAt = this.deps.time.now() + COUNTDOWN_MS;
    // Tương đối (A16): không gửi startAt theo đồng hồ server.
    this.broadcast({ t: 'start', countdownMs: COUNTDOWN_MS });
    void this.track('pvp_start', { kind: this.kind });
  }

  setInput(side: TeamSide, code: number): void {
    this.lastCode[side] = code;
    this.inputs[side] = code === 0 ? NO_INPUT : decodeInput(code);
  }

  /** Lệnh thay người: sai cấu trúc → `sub_rejected` ngay; đúng → xếp chờ tới bóng chết (mỗi đội 1 lệnh). */
  requestSub(side: TeamSide, out: string, bench: BenchSlot): void {
    if (this.phase === 'ended' || checkSubStructure(this.state, side, out, bench)) {
      this.sockets[side]?.send({ t: 'error', code: 'sub_rejected' });
      return;
    }
    this.pendingSubs[side] = { out, bench };
  }

  onTick(nowMs: number): void {
    if (this.phase === 'lobby') {
      if (nowMs - this.matchedAt >= READY_TIMEOUT_MS) void this.finish('void_not_ready');
      return;
    }
    if (this.phase === 'countdown') {
      if (nowMs < this.goAt) return;
      this.phase = 'running';
    }
    if (this.phase !== 'running') return;

    const tick = this.state.tick;
    const subs: PvpSub[] = [];
    if (canSubstituteNow(this.state)) {
      for (const side of SIDES) {
        const p = this.pendingSubs[side];
        if (!p) continue;
        delete this.pendingSubs[side];
        const r = substitute(this.state, side, p.out, p.bench);
        if (!r.ok) {
          this.sockets[side]?.send({ t: 'error', code: 'sub_rejected' }); // muộn: vừa thành không hợp lệ
          continue;
        }
        this.state = r.state;
        this.recorder.sub(tick, side, p.out, p.bench);
        subs.push({ team: side, out: p.out, bench: p.bench });
      }
    }
    this.recorder.tick(this.inputs);
    this.state = stepBoth(this.state, this.inputs);
    this.broadcast({
      t: 'f',
      f: subs.length
        ? [tick, this.lastCode.home, this.lastCode.away, subs]
        : [tick, this.lastCode.home, this.lastCode.away],
    });
    if (this.state.tick % HASH_EVERY === 0) {
      this.serverHashes.set(this.state.tick, stateHash(this.state));
      if (this.serverHashes.size > HASH_KEEP) {
        this.serverHashes.delete(this.serverHashes.keys().next().value!);
      }
    }
    if (this.state.phase === 'full_time') void this.finish('full_time');
  }

  /** Kết thúc (mọi cách), idempotent: gọi lại trả cùng promise. Ghi DB rồi gửi `end` cho cả hai. */
  finish(reason: PvpEndReason, forfeit?: TeamSide): Promise<void> {
    if (this.endPromise) return this.endPromise;
    this.phase = 'ended';
    const sh = this.state.shootout;
    const goals = (k: boolean[]) => k.filter(Boolean).length;
    this.endPromise = finishPvpMatch(this.deps.db, {
      pvpId: this.pvpId,
      reason,
      ...(forfeit && { forfeit }),
      score: { ...this.state.score },
      shootout: sh ? { home: goals(sh.home), away: goals(sh.away) } : undefined,
      inputLog: this.recorder.encode(),
      now: this.deps.clock.now(),
    }).then(
      (res) => {
        this.result = res;
        for (const side of SIDES) this.sendEnd(side);
        this.deps.onEnded(this, res);
      },
      (err: unknown) => {
        this.deps.onError(err);
        this.deps.onEnded(this, null);
      },
    );
    return this.endPromise;
  }

  /** Gửi lại `end` cho một bên (kể cả socket vừa `rejoin` sau khi trận xong). */
  sendEnd(side: TeamSide): void {
    const r = this.result;
    if (!r) return;
    this.sockets[side]?.send({
      t: 'end',
      reason: r.reason,
      home: r.home,
      away: r.away,
      you: r.sides[side],
    });
  }

  sendError(side: TeamSide, code: PvpErrorCode): void {
    this.sockets[side]?.send({ t: 'error', code });
  }

  private broadcast(msg: PvpServerMessage): void {
    for (const side of SIDES) this.sockets[side]?.send(msg);
  }

  private track(name: 'pvp_start', props: Record<string, unknown>): Promise<void> {
    return track(
      this.deps.db,
      null,
      name,
      { pvpId: this.pvpId, ...props },
      this.deps.clock.now(),
    ).catch((err: unknown) => this.deps.onError(err));
  }
}
