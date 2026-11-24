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
  PvpMatchSetup,
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
export const DISCONNECT_SINGLE_MS = 30_000;
export const DISCONNECT_TOTAL_MS = 60_000;
export const HASH_TIMEOUT_MS = 15_000;
export const CATCHUP_GRACE_MS = 10_000;
export const DUAL_DESYNC_WINDOW_MS = 1200;
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
const other = (s: TeamSide): TeamSide => (s === 'home' ? 'away' : 'home');

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
  private readonly disconnectedSince: Record<TeamSide, number | null> = { home: null, away: null };
  private readonly disconnectedUsedMs: Record<TeamSide, number> = { home: 0, away: 0 };
  private readonly desyncCount: Record<TeamSide, number> = { home: 0, away: 0 };
  private readonly lastHashAt: Record<TeamSide, number> = { home: 0, away: 0 };
  private readonly catchingUpSince: Record<TeamSide, number | null> = { home: null, away: null };
  private readonly lastGoodHashTick: Record<TeamSide, number> = { home: -1, away: -1 };
  private pendingDesyncForfeit: { side: TeamSide; tick: number; deadlineMs: number } | null = null;

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

  whenEnded(): Promise<void> {
    return this.endPromise ?? Promise.resolve();
  }

  sideOf(userId: number): TeamSide | null {
    return SIDES.find((s) => this.users[s] === userId) ?? null;
  }

  attach(side: TeamSide, conn: PvpConn): void {
    this.sockets[side] = conn;
  }

  private remainingDisconnectMs(side: TeamSide, nowMs: number): number {
    const since = this.disconnectedSince[side];
    const cur = since === null ? 0 : Math.max(0, nowMs - since);
    return Math.max(
      0,
      Math.min(
        DISCONNECT_SINGLE_MS - cur,
        DISCONNECT_TOTAL_MS - (this.disconnectedUsedMs[side] + cur),
      ),
    );
  }

  /** Socket đóng/rớt: người đó đứng yên, bắt đầu đếm 30 s/lần (60 s cộng dồn). */
  detach(side: TeamSide, conn: PvpConn): void {
    if (this.sockets[side] !== conn) return;
    delete this.sockets[side];
    this.setInput(side, 0);
    if ((this.phase === 'countdown' || this.phase === 'running') && this.disconnectedSince[side] === null) {
      const now = this.deps.time.now();
      this.disconnectedSince[side] = now;
      const remainingMs = Math.ceil(this.remainingDisconnectMs(side, now));
      this.sockets[other(side)]?.send({ t: 'opp_disconnected', remainingMs });
      void this.track('pvp_disconnect', { kind: this.kind, side, userId: this.users[side] });
    }
  }

  /** Vào lại trận (sau khi rớt hoặc tụt > 300 khung): gắn socket, cộng dồn thời gian rớt, gửi `catchup`. */
  onRejoin(side: TeamSide, conn: PvpConn): void {
    const now = this.deps.time.now();
    this.attach(side, conn);
    if (this.disconnectedSince[side] !== null) {
      this.disconnectedUsedMs[side] += Math.max(0, now - this.disconnectedSince[side]);
      this.disconnectedSince[side] = null;
      this.sockets[other(side)]?.send({ t: 'opp_reconnected' });
    }
    this.sendCatchup(side, now);
  }

  private sendCatchup(side: TeamSide, nowMs: number): void {
    this.catchingUpSince[side] = nowMs;
    this.lastHashAt[side] = nowMs;
    this.sockets[side]?.send({
      t: 'catchup',
      setup: this.setup as PvpMatchSetup,
      log: this.recorder.encode(),
      tick: Math.max(0, this.state.tick - 1),
    });
  }

  onCatchupDone(side: TeamSide): void {
    if (this.phase === 'ended') return;
    this.catchingUpSince[side] = null;
    this.lastHashAt[side] = this.deps.time.now();
  }

  onHash(side: TeamSide, tick: number, h: number): void {
    if (this.phase !== 'running') return;
    const now = this.deps.time.now();
    this.lastHashAt[side] = now;
    if (tick === 0) return;
    const oldest = this.serverHashes.keys().next().value;
    if (oldest !== undefined && tick < oldest) {
      // Mã băm cũ hơn cửa sổ 30 s: bỏ qua, không phạt (R5).
      return;
    }
    const expected = this.serverHashes.get(tick);
    if (expected !== undefined && expected === h) {
      this.lastGoodHashTick[side] = Math.max(this.lastGoodHashTick[side], tick);
      if (
        this.pendingDesyncForfeit &&
        this.pendingDesyncForfeit.side !== side &&
        tick >= this.pendingDesyncForfeit.tick
      ) {
        void this.finish('forfeit_desync', this.pendingDesyncForfeit.side);
      }
      return;
    }
    this.handleDesync(side, tick, now);
  }

  private handleDesync(side: TeamSide, tick: number, nowMs: number): void {
    if (this.phase === 'ended') return;
    void this.track('pvp_desync', { kind: this.kind, tick, side, userId: this.users[side] });
    this.desyncCount[side] += 1;
    if (this.desyncCount[side] === 1) {
      this.sendCatchup(side, nowMs);
      return;
    }
    const foe = other(side);
    if (this.desyncCount[foe] >= 2) {
      this.pendingDesyncForfeit = null;
      void this.finish('void_desync');
      return;
    }
    if (
      this.desyncCount[foe] === 1 &&
      this.disconnectedSince[foe] === null &&
      this.lastGoodHashTick[foe] < tick
    ) {
      this.pendingDesyncForfeit = {
        side,
        tick,
        deadlineMs: nowMs + DUAL_DESYNC_WINDOW_MS,
      };
      return;
    }
    void this.finish('forfeit_desync', side);
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
    if (this.phase === 'countdown' || this.phase === 'running') {
      for (const side of SIDES) {
        if (this.disconnectedSince[side] !== null && this.remainingDisconnectMs(side, nowMs) <= 0) {
          if (this.disconnectedSince[other(side)] !== null) {
            void this.finish('void_both_left');
          } else {
            void this.finish('forfeit_disconnect', side);
          }
          return;
        }
      }
    }
    if (this.phase === 'countdown') {
      if (nowMs < this.goAt) return;
      this.phase = 'running';
      this.lastHashAt.home = nowMs;
      this.lastHashAt.away = nowMs;
    }
    if (this.phase !== 'running') return;

    if (this.pendingDesyncForfeit && nowMs >= this.pendingDesyncForfeit.deadlineMs) {
      const forfeitSide = this.pendingDesyncForfeit.side;
      this.pendingDesyncForfeit = null;
      void this.finish('forfeit_desync', forfeitSide);
      return;
    }

    // Kiểm tra quá hạn 15 s không gửi hash của bên đang kết nối & không đang dựng lại (miễn tối đa 10 s).
    const timedOut: TeamSide[] = [];
    for (const side of SIDES) {
      if (this.disconnectedSince[side] !== null) continue;
      const cuSince = this.catchingUpSince[side];
      if (cuSince !== null) {
        if (nowMs - cuSince < CATCHUP_GRACE_MS) continue;
        this.catchingUpSince[side] = null;
        this.lastHashAt[side] = cuSince + CATCHUP_GRACE_MS;
      }
      if (nowMs - this.lastHashAt[side] >= HASH_TIMEOUT_MS) {
        this.lastHashAt[side] = nowMs;
        timedOut.push(side);
      }
    }
    if (timedOut.length === 2 && this.desyncCount.home + 1 >= 2 && this.desyncCount.away + 1 >= 2) {
      for (const side of timedOut) {
        void this.track('pvp_desync', {
          kind: this.kind,
          tick: this.state.tick,
          side,
          userId: this.users[side],
        });
        this.desyncCount[side] += 1;
      }
      void this.finish('void_desync');
      return;
    }
    for (const side of timedOut) {
      this.handleDesync(side, this.state.tick, nowMs);
      if (this.phase !== 'running') return;
    }

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

  private track(
    name: 'pvp_start' | 'pvp_disconnect' | 'pvp_desync',
    props: Record<string, unknown>,
  ): Promise<void> {
    return track(
      this.deps.db,
      null,
      name,
      { pvpId: this.pvpId, ...props },
      this.deps.clock.now(),
    ).catch((err: unknown) => this.deps.onError(err));
  }
}
