import { eq } from 'drizzle-orm';
import { buildMatchSetup, type MatchSetup } from '@pitch/sim';
import { type MatchTeamSetup, type PvpClientMessage, type PvpMatchSetup } from '@pitch/shared';
import type { Clock } from '../../clock';
import type { Db } from '../../db/client';
import { pvpMatches } from '../../db/schema';
import type { Rng } from '../../domain/rng';
import { track } from '../analytics';
import type { CardCatalog } from '../cards';
import { loadStoredPvpResult } from './finish';
import { QUEUE_TICK_MS, handleQueueJoin, tickQueue, type QueueEntry } from './queue';
import {
  ROOM_TTL_MS,
  handleRoomCreate,
  handleRoomJoin,
  loadPlayerSquad,
  type LoadedPlayer,
  type PvpDevOptions,
  type Room,
} from './rooms';
import { PvpSession, type PvpConn, type SessionDeps } from './session';
import { PvpTicker, type TimeSource } from './ticker';

/** Số phiên đồng thời tối đa (research R11: đo 20/11, dư ~2,6 lần theo p99). */
export const PVP_MAX_SESSIONS = 50;
export { ROOM_TTL_MS };
/** Phiên đã xong còn giữ trong bộ nhớ để `rejoin` trả lại `end`. */
export const ENDED_KEEP_MS = 60_000;
export const HEARTBEAT_MS = 2000;
export const PONG_TIMEOUT_MS = 5000;
/** Chặn `rejoin` dồn dập: cùng socket đã giữ phía đó / tra DB trận đã xong. */
export const REJOIN_COOLDOWN_MS = 2000;

/** Đầu cuối WebSocket như hub thấy. */
export interface HubConn extends PvpConn {
  /** `time.now()` lần cuối nhận pong. */
  lastPongAt: number;
  ping(): void;
  /** Cắt ngay, không chờ bắt tay đóng. */
  terminate(): void;
  /** Băm token phiên đăng nhập (`sessions.id`) lúc nâng cấp WS; không có thì không gắn với phiên. */
  sid?: string;
  /** Hạn phiên đăng nhập (ms epoch, giờ `Clock`) lúc nâng cấp WS. */
  sessionExpiresAt?: number;
}

export interface HubOptions {
  db: Db;
  clock: Clock;
  rng: Rng;
  time: TimeSource;
  maxSessions?: number;
  cardCatalog?: () => Promise<CardCatalog>;
  dev?: PvpDevOptions;
  onError?: (err: unknown) => void;
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
 * Hàng chờ (US2) và phân xử rớt mạng/lệch mã băm (US3) là task sau: chỗ móc ở `queue_join`,
 * `hash`, `catchup_done`, `leave`.
 */
export class PvpHub {
  readonly ticker: PvpTicker;
  readonly queue = new Map<number, QueueEntry>();
  readonly rooms = new Map<string, Room>();
  private readonly byId = new Map<number, PvpSession>();
  /** Phiên đang `live` của mỗi user. */
  private readonly byUser = new Map<number, PvpSession>();
  private readonly conns = new Map<number, Set<HubConn>>();
  private readonly closedConns = new WeakSet<HubConn>();
  /** Đếm theo user (không phải Set): `tryPairQueue` và `handleQueueJoin` có thể cùng giữ chỗ một user. */
  private readonly pendingUsers = new Map<number, number>();
  /** Lần `rejoin` cuối của từng socket (chống dồn tin, A: rejoin-unthrottled). */
  private readonly lastRejoinAt = new WeakMap<HubConn, number>();
  private readonly lastLookupAt = new WeakMap<HubConn, number>();
  private queueTimer: (() => void) | null = null;
  private readonly maxSessions: number;
  private readonly sessionDeps: SessionDeps;

  constructor(private readonly o: HubOptions) {
    this.maxSessions = o.maxSessions ?? PVP_MAX_SESSIONS;
    this.ticker = new PvpTicker(
      o.time,
      (skipped) => {
        void track(o.db, null, 'pvp_desync', { tickSkipped: skipped }, o.clock.now()).catch(
          (err: unknown) => o.onError?.(err),
        );
      },
      (err, s) => {
        o.onError?.(err);
        // Phiên lỗi: huỷ (void) riêng phiên đó để không kẹt `live` mãi.
        if (s instanceof PvpSession) void s.finish('void_desync');
      },
    );
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

  get rng(): Rng {
    return this.o.rng;
  }

  get dev(): PvpDevOptions | undefined {
    return this.o.dev;
  }

  get hasCardCatalog(): boolean {
    return this.o.cardCatalog !== undefined;
  }

  now(): number {
    return this.o.time.now();
  }

  clockNow(): Date {
    return this.o.clock.now();
  }

  reportError(err: unknown): void {
    this.o.onError?.(err);
  }

  beginPending(userId: number): void {
    this.pendingUsers.set(userId, (this.pendingUsers.get(userId) ?? 0) + 1);
  }

  endPending(userId: number): void {
    const n = (this.pendingUsers.get(userId) ?? 0) - 1;
    if (n > 0) this.pendingUsers.set(userId, n);
    else this.pendingUsers.delete(userId);
  }

  isClosed(conn: HubConn): boolean {
    return this.closedConns.has(conn);
  }

  async loadPlayer(
    userId: number,
  ): Promise<{ ok: true; player: LoadedPlayer } | { ok: false; code: 'invalid_squad' }> {
    const catalog = await this.o.cardCatalog!();
    return loadPlayerSquad(this.o.db, catalog, userId);
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
    for (const c of [...(this.conns.get(userId) ?? [])]) {
      c.close(4401);
      c.terminate();
      this.onClosed(c);
    }
  }

  /** Phiên đăng nhập `sid` (băm) bị huỷ/xoay: đóng mọi WS PvP gắn với phiên đó. */
  closeSession(sid: string): void {
    for (const set of [...this.conns.values()]) {
      for (const c of [...set]) {
        if (c.sid !== sid) continue;
        c.close(4401);
        c.terminate();
        this.onClosed(c);
      }
    }
  }

  /** Mỗi 2 s: ping, và cắt socket quá 5 s không có pong (coi như rớt mạng; `onClosed` lo phần còn lại). */
  sweep(): void {
    const now = this.o.time.now();
    const wall = this.o.clock.now().getTime();
    for (const set of [...this.conns.values()]) {
      for (const c of [...set]) {
        if (c.sessionExpiresAt !== undefined && wall >= c.sessionExpiresAt) {
          // Phiên đăng nhập hết hạn: socket không được sống lâu hơn phiên.
          c.close(4401);
          c.terminate();
          this.onClosed(c);
        } else if (now - c.lastPongAt > PONG_TIMEOUT_MS) {
          c.terminate();
          this.onClosed(c);
        } else {
          c.ping();
        }
      }
    }
  }

  /** Socket đã đóng (hoặc bị coi là chết). Idempotent. */
  onClosed(conn: HubConn): void {
    this.closedConns.add(conn);
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
    dev?: PvpDevOptions;
  }): Promise<PvpSession | null> {
    if (this.full) {
      for (const p of [args.home, args.away]) p.conn.send({ t: 'error', code: 'server_busy' });
      return null;
    }
    const { home, away } = args;
    // Mỗi user chỉ một phiên live: không ghi đè `byUser` làm phiên cũ mồ côi (kiểm cả sau await bên dưới).
    const busy = () => this.byUser.get(home.userId)?.live || this.byUser.get(away.userId)?.live;
    if (busy()) {
      for (const p of [home, away]) p.conn.send({ t: 'error', code: 'busy' });
      return null;
    }
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
    if (busy()) {
      // Race: user vừa vào phiên khác trong lúc ghi DB. Huỷ dòng vừa tạo (chưa có ai tham gia).
      for (const p of [home, away]) p.conn.send({ t: 'error', code: 'busy' });
      await this.o.db.delete(pvpMatches).where(eq(pvpMatches.id, row!.id));
      return null;
    }
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
    // Socket đã bị đóng/thu hồi (VD đăng xuất) không được điều khiển hay gắn lại vào trận.
    if (this.closedConns.has(conn)) return;
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
        if (msg.t === 'room_join') {
          const own = this.rooms.get(msg.code);
          if (own && own.status !== 'closed' && own.hostUserId === uid) {
            return conn.send({ t: 'error', code: 'self_join' });
          }
        }
        if (this.hasEntry(uid)) return conn.send({ t: 'error', code: 'busy' });
        if (msg.t === 'queue_join') {
          handleQueueJoin(this, conn);
        } else if (msg.t === 'room_create') {
          handleRoomCreate(this, conn);
        } else {
          handleRoomJoin(this, conn, msg.code);
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
        return holder?.sess.onHash(holder.side, msg.tick, msg.h);
      case 'catchup_done':
        return holder?.sess.onCatchupDone(holder.side);
    }
  }

  ensureQueueTimer(): void {
    if (this.queue.size === 0 || this.queueTimer) return;
    this.queueTimer = this.o.time.after(QUEUE_TICK_MS, () => {
      this.queueTimer = null;
      tickQueue(this);
      this.ensureQueueTimer();
    });
  }

  tickQueue(): void {
    tickQueue(this);
  }

  stop(): void {
    this.queueTimer?.();
    this.queueTimer = null;
    this.ticker.stop();
  }

  hasEntry(uid: number, opts: { includePending?: boolean } = {}): boolean {
    const includePending = opts.includePending ?? true;
    if (includePending && this.pendingUsers.has(uid)) return true;
    if (this.queue.has(uid) || this.byUser.has(uid)) return true;
    const now = this.o.time.now();
    for (const r of this.rooms.values()) {
      if (r.hostUserId === uid && r.status === 'waiting' && now < r.expiresAt) return true;
    }
    return false;
  }

  closeRoom(room: Room): void {
    room.status = 'closed';
    this.rooms.delete(room.code);
  }

  scheduleRoomCleanup(room: Room): void {
    const ttl = Math.max(0, room.expiresAt - this.o.time.now());
    this.o.time.after(ttl, () => {
      if (this.rooms.get(room.code) === room) this.rooms.delete(room.code);
    });
  }

  private rejoin(conn: HubConn, pvpId: number): void {
    const s = this.byId.get(pvpId);
    const now = this.o.time.now();
    const mySide = s?.sideOf(conn.userId);
    // Socket đã giữ phía đó và vừa rejoin: bỏ qua (mỗi lần là mã hoá lại cả log).
    if (s?.live && mySide && s.sockets[mySide] === conn) {
      const last = this.lastRejoinAt.get(conn);
      if (last !== undefined && now - last < REJOIN_COOLDOWN_MS) return;
      this.lastRejoinAt.set(conn, now);
    }
    // Tra DB trận không còn trong bộ nhớ: tối đa một lần / cooldown mỗi socket.
    if (!s) {
      const last = this.lastLookupAt.get(conn);
      if (last !== undefined && now - last < REJOIN_COOLDOWN_MS) return;
      this.lastLookupAt.set(conn, now);
    }
    if (s) {
      const side = s.sideOf(conn.userId);
      if (!side) {
        conn.send({ t: 'error', code: 'not_in_match' });
        return;
      }
      if (!s.live) {
        void s.whenEnded().then(() => {
          if (this.closedConns.has(conn) || !s.result) return;
          conn.send({
            t: 'end',
            reason: s.result.reason,
            home: s.result.home,
            away: s.result.away,
            you: s.result.sides[side],
          });
        });
        return;
      }
      const held = s.sockets[side];
      if (held && held !== conn) {
        conn.send({ t: 'error', code: 'busy' });
        return;
      }
      s.onRejoin(side, conn);
      return;
    }

    void loadStoredPvpResult(this.o.db, pvpId, conn.userId)
      .then((stored) => {
        if (this.closedConns.has(conn)) return;
        if (!stored) {
          conn.send({ t: 'error', code: 'not_in_match' });
          return;
        }
        conn.send({
          t: 'end',
          reason: stored.result.reason,
          home: stored.result.home,
          away: stored.result.away,
          you: stored.result.sides[stored.side],
        });
      })
      .catch((err: unknown) => {
        this.o.onError?.(err);
        if (!this.closedConns.has(conn)) conn.send({ t: 'error', code: 'server_busy' });
      });
  }
}
