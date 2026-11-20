import { buildMatchSetup, type MatchSetup } from '@pitch/sim';
import {
  ROOM_CODE_ALPHABET,
  type MatchTeamSetup,
  type PvpClientMessage,
  type PvpMatchSetup,
} from '@pitch/shared';
import type { Clock } from '../../clock';
import type { Db } from '../../db/client';
import { pvpMatches } from '../../db/schema';
import type { Rng } from '../../domain/rng';
import { track } from '../analytics';
import { PvpSession, type PvpConn, type SessionDeps } from './session';
import { PvpTicker, type TimeSource } from './ticker';

/** Số phiên đồng thời tối đa (research R11: đo 20/11, dư ~2,6 lần theo p99). */
export const PVP_MAX_SESSIONS = 50;
export const ROOM_TTL_MS = 10 * 60_000;
/** Phiên đã xong còn giữ trong bộ nhớ để `rejoin` trả lại `end`. */
export const ENDED_KEEP_MS = 60_000;
export const HEARTBEAT_MS = 2000;
export const PONG_TIMEOUT_MS = 5000;

/** Đầu cuối WebSocket như hub thấy. */
export interface HubConn extends PvpConn {
  /** `time.now()` lần cuối nhận pong. */
  lastPongAt: number;
  ping(): void;
  /** Cắt ngay, không chờ bắt tay đóng. */
  terminate(): void;
}

export interface HubOptions {
  db: Db;
  clock: Clock;
  rng: Rng;
  time: TimeSource;
  maxSessions?: number;
  onError?: (err: unknown) => void;
}

interface Room {
  code: string;
  host: HubConn;
  hostUserId: number;
  expiresAt: number;
  status: 'waiting' | 'full' | 'closed';
}

export interface Participant {
  userId: number;
  username: string;
  team: MatchTeamSetup;
  conn: HubConn;
}

/**
 * Trạng thái PvP trong bộ nhớ của MỘT tiến trình (hàng chờ, phòng, phiên) + bộ giữ nhịp chung.
 * shortcut: trạng thái trong bộ nhớ một tiến trình, nâng cấp khi chạy nhiều instance (R8).
 * Ghép cặp (US1) và phân xử rớt mạng/lệch mã băm (US2, US3) là task sau: chỗ móc ở `queue_join`,
 * `room_join`, `hash`, `catchup_done`, `leave`.
 */
export class PvpHub {
  readonly ticker: PvpTicker;
  readonly queue = new Map<number, { conn: HubConn; enqueuedAt: number }>();
  readonly rooms = new Map<string, Room>();
  private readonly byId = new Map<number, PvpSession>();
  /** Phiên đang `live` của mỗi user. */
  private readonly byUser = new Map<number, PvpSession>();
  private readonly conns = new Map<number, Set<HubConn>>();
  private readonly maxSessions: number;
  private readonly sessionDeps: SessionDeps;

  constructor(private readonly o: HubOptions) {
    this.maxSessions = o.maxSessions ?? PVP_MAX_SESSIONS;
    this.ticker = new PvpTicker(o.time, (skipped) => {
      void track(o.db, null, 'pvp_desync', { tickSkipped: skipped }, o.clock.now()).catch(
        (err: unknown) => o.onError?.(err),
      );
    });
    this.sessionDeps = {
      db: o.db,
      clock: o.clock,
      time: o.time,
      onError: (e) => o.onError?.(e),
      onEnded: (s) => {
        for (const u of Object.values(s.users)) if (this.byUser.get(u) === s) this.byUser.delete(u);
        o.time.after(ENDED_KEEP_MS, () => this.byId.delete(s.pvpId));
      },
    };
  }

  get sessionCount(): number {
    return [...this.byId.values()].filter((s) => s.live).length;
  }

  get full(): boolean {
    return this.sessionCount >= this.maxSessions;
  }

  session(pvpId: number): PvpSession | undefined {
    return this.byId.get(pvpId);
  }

  addConn(conn: HubConn): void {
    let set = this.conns.get(conn.userId);
    if (!set) this.conns.set(conn.userId, (set = new Set()));
    set.add(conn);
  }

  /** Đăng xuất / xoá tài khoản (session bị thu hồi): đóng mọi WS PvP của user (A18). */
  closeUser(userId: number): void {
    for (const c of [...(this.conns.get(userId) ?? [])]) c.close(4401);
  }

  /** Mỗi 2 s: ping, và cắt socket quá 5 s không có pong (coi như rớt mạng; `onClosed` lo phần còn lại). */
  sweep(): void {
    const now = this.o.time.now();
    for (const set of this.conns.values()) {
      for (const c of [...set]) {
        if (now - c.lastPongAt > PONG_TIMEOUT_MS) c.terminate();
        else c.ping();
      }
    }
  }

  /** Socket đã đóng (hoặc bị coi là chết). Idempotent. */
  onClosed(conn: HubConn): void {
    const set = this.conns.get(conn.userId);
    set?.delete(conn);
    if (set?.size === 0) this.conns.delete(conn.userId);
    if (this.queue.get(conn.userId)?.conn === conn) this.queue.delete(conn.userId);
    for (const room of this.rooms.values()) {
      if (room.host === conn && room.status === 'waiting') this.closeRoom(room);
    }
    const s = this.byUser.get(conn.userId);
    const side = s?.sideOf(conn.userId);
    if (s && side) s.detach(side, conn);
  }

  /** Tạo phiên: ghi `pvp_matches` (`live`) rồi đưa vào vòng nhịp, gửi `matched`. `null` nếu quá `PVP_MAX_SESSIONS`. */
  async createSession(args: {
    kind: 'ranked' | 'friendly';
    seed: number;
    home: Participant;
    away: Participant;
    dev?: { halfLengthSec?: number; autopilot?: boolean };
  }): Promise<PvpSession | null> {
    if (this.full) {
      for (const p of [args.home, args.away]) p.conn.send({ t: 'error', code: 'server_busy' });
      return null;
    }
    const { home, away } = args;
    const [row] = await this.o.db
      .insert(pvpMatches)
      .values({
        kind: args.kind,
        homeUserId: home.userId,
        awayUserId: away.userId,
        seed: args.seed,
        squadSnapshot: {
          formation_home: home.team.formation,
          formation_away: away.team.formation,
          home: home.team,
          away: away.team,
        },
        startedAt: this.o.clock.now(),
      })
      .returning({ id: pvpMatches.id });
    const setup: MatchSetup = {
      ...buildMatchSetup(
        { seed: args.seed, difficulty: 'hard', home: home.team, away: away.team },
        args.dev,
      ),
      humans: ['home', 'away'],
    };
    const s = new PvpSession(
      { pvpId: row!.id, kind: args.kind, users: { home: home.userId, away: away.userId }, setup },
      this.sessionDeps,
    );
    this.byId.set(s.pvpId, s);
    this.byUser.set(home.userId, s);
    this.byUser.set(away.userId, s);
    s.attach('home', home.conn);
    s.attach('away', away.conn);
    for (const [side, me, foe] of [
      ['home', home, away],
      ['away', away, home],
    ] as const) {
      me.conn.send({
        t: 'matched',
        pvpId: s.pvpId,
        kind: args.kind,
        side,
        opponent: { username: foe.username, squad: foe.team },
        setup: setup as PvpMatchSetup,
      });
    }
    void track(
      this.o.db,
      null,
      'pvp_matched',
      { pvpId: s.pvpId, kind: args.kind },
      this.o.clock.now(),
    ).catch((err: unknown) => this.o.onError?.(err));
    this.ticker.add(s);
    return s;
  }

  /** Xử một tin đã qua zod từ socket `conn`. */
  handle(conn: HubConn, msg: PvpClientMessage): void {
    const uid = conn.userId;
    const sess = this.byUser.get(uid);
    const side = sess?.sideOf(uid) ?? null;
    // Chỉ socket đang giữ phía đó mới điều khiển được trận (A1).
    const holder = sess && side && sess.sockets[side] === conn ? { sess, side } : null;
    switch (msg.t) {
      case 'queue_join':
      case 'room_create':
      case 'room_join':
        if (this.full) return conn.send({ t: 'error', code: 'server_busy' });
        if (this.hasEntry(uid)) return conn.send({ t: 'error', code: 'busy' });
        if (msg.t === 'queue_join') {
          this.queue.set(uid, { conn, enqueuedAt: this.o.time.now() });
          // US1: ghép cặp FIFO + `queue_status`/`queue_timeout`.
        } else if (msg.t === 'room_create') {
          this.createRoom(conn);
        } else {
          this.joinRoom(conn, msg.code);
        }
        return;
      case 'queue_leave':
        if (this.queue.get(uid)?.conn === conn) this.queue.delete(uid);
        return;
      case 'room_leave':
        for (const r of this.rooms.values()) {
          if (r.host === conn && r.status === 'waiting') this.closeRoom(r);
        }
        return;
      case 'ready':
        return holder
          ? holder.sess.ready(holder.side)
          : conn.send({ t: 'error', code: 'not_in_match' });
      case 'input':
        return holder?.sess.setInput(holder.side, msg.c);
      case 'sub':
        return holder?.sess.requestSub(holder.side, msg.out, msg.bench);
      case 'rejoin':
        return this.rejoin(conn, msg.pvpId);
      case 'leave':
        // US3: tính như rớt mạng (đồng hồ 30 s/60 s, xử thua).
        if (holder) holder.sess.detach(holder.side, conn);
        return conn.close(1000);
      case 'hash':
      case 'catchup_done':
        return; // US2: so mã băm với `serverHashes`, ép `catchup`, xử `forfeit_desync`.
    }
  }

  stop(): void {
    this.ticker.stop();
  }

  private hasEntry(uid: number): boolean {
    if (this.queue.has(uid) || this.byUser.has(uid)) return true;
    for (const r of this.rooms.values())
      if (r.hostUserId === uid && r.status !== 'closed') return true;
    return false;
  }

  private createRoom(conn: HubConn): void {
    let code: string;
    do {
      code = Array.from(
        { length: 6 },
        () => ROOM_CODE_ALPHABET[this.o.rng(ROOM_CODE_ALPHABET.length)],
      ).join('');
    } while (this.rooms.has(code));
    const expiresAt = this.o.time.now() + ROOM_TTL_MS;
    this.rooms.set(code, {
      code,
      host: conn,
      hostUserId: conn.userId,
      expiresAt,
      status: 'waiting',
    });
    conn.send({
      t: 'room_created',
      code,
      expiresAt: new Date(this.o.clock.now().getTime() + ROOM_TTL_MS).toISOString(),
    });
  }

  private joinRoom(conn: HubConn, code: string): void {
    const room = this.rooms.get(code);
    if (!room || room.status === 'closed') return conn.send({ t: 'error', code: 'room_not_found' });
    if (room.hostUserId === conn.userId) return conn.send({ t: 'error', code: 'self_join' });
    if (room.status === 'full') return conn.send({ t: 'error', code: 'room_full' });
    if (this.o.time.now() >= room.expiresAt) {
      this.closeRoom(room);
      return conn.send({ t: 'error', code: 'room_expired' });
    }
    // US1: nạp đội hình hai bên, `createSession({kind:'friendly'})`.
  }

  private closeRoom(room: Room): void {
    room.status = 'closed';
    this.rooms.delete(room.code);
  }

  private rejoin(conn: HubConn, pvpId: number): void {
    const s = this.byId.get(pvpId);
    const side = s?.sideOf(conn.userId);
    if (!s || !side) return conn.send({ t: 'error', code: 'not_in_match' });
    const held = s.sockets[side];
    if (s.live && held && held !== conn) return conn.send({ t: 'error', code: 'busy' });
    s.attach(side, conn);
    if (!s.live) return s.sendEnd(side);
    // US3: `catchup` có `setup`, `log` (recorder.encode()) và `tick` hiện tại; hạn rớt mạng.
    conn.send({
      t: 'catchup',
      setup: s.setup as PvpMatchSetup,
      log: s.recorder.encode(),
      tick: Math.max(0, s.state.tick - 1), // khung cuối cùng đã có trong log
    });
  }
}
