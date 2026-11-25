import { eq } from 'drizzle-orm';
import { ROOM_CODE_ALPHABET, SquadSlot, type MatchTeamSetup } from '@pitch/shared';
import type { Db } from '../../db/client';
import { playerCards, squads, squadSlots, users } from '../../db/schema';
import { buildHomeTeam, type SquadEntry } from '../../domain/match-teams';
import type { Rng } from '../../domain/rng';
import type { CardCatalog } from '../cards';
import type { HubConn, Participant, PvpHub } from './hub';

/** Seed của sim là uint32 (`seedRng` trong `@pitch/sim`). */
const SEED_RANGE = 2 ** 32;

export const ROOM_TTL_MS = 10 * 60_000;

export interface LoadedPlayer {
  userId: number;
  username: string;
  team: MatchTeamSetup;
}

export interface PvpDevOptions {
  halfLengthSec?: number | undefined;
  autopilot?: boolean | undefined;
}

export interface Room {
  code: string;
  host: HubConn;
  hostUserId: number;
  hostPlayer?: LoadedPlayer;
  expiresAt: number;
  status: 'waiting' | 'full' | 'closed';
}

/**
 * Nạp và kiểm tra đội hình của user cho PvP (dùng chung luật với `startMatch`: đủ 7 người đá
 * chính, ô GK phải là thủ môn).
 */
export async function loadPlayerSquad(
  db: Db,
  catalog: CardCatalog,
  userId: number,
): Promise<{ ok: true; player: LoadedPlayer } | { ok: false; code: 'invalid_squad' }> {
  const [user] = await db
    .select({ username: users.username })
    .from(users)
    .where(eq(users.id, userId));
  const [squad] = await db
    .select({ formation: squads.formation })
    .from(squads)
    .where(eq(squads.userId, userId));
  if (!user || !squad) return { ok: false, code: 'invalid_squad' };

  const rows = await db
    .select({ slot: squadSlots.slot, cardId: playerCards.cardId, level: playerCards.level })
    .from(squadSlots)
    .innerJoin(playerCards, eq(playerCards.id, squadSlots.playerCardId))
    .where(eq(squadSlots.userId, userId));

  const slots: Partial<Record<SquadSlot, SquadEntry>> = {};
  for (const row of rows) {
    const card = catalog.byId.get(String(row.cardId));
    if (!card) return { ok: false, code: 'invalid_squad' };
    slots[SquadSlot.parse(row.slot)] = { card, level: row.level };
  }

  if (slots.GK && slots.GK.card.position !== 'GK') {
    return { ok: false, code: 'invalid_squad' };
  }
  const home = buildHomeTeam(squad.formation, slots);
  if (!home.ok) return { ok: false, code: 'invalid_squad' };

  return { ok: true, player: { userId, username: user.username, team: home.team } };
}

/** Hàm dựng trận PvP dùng chung cho phòng (friendly) và hàng chờ (ranked, T035). */
export async function startPvpMatch(
  hub: PvpHub,
  args: {
    kind: 'ranked' | 'friendly';
    home: Participant;
    away: Participant;
    rng: Rng;
    dev?: PvpDevOptions | undefined;
  },
) {
  const seed = args.rng(SEED_RANGE);
  // Tung đồng xu chọn sân: người tạo phòng / vào hàng chờ trước không mặc nhiên là đội nhà.
  const [home, away] = args.rng(2) === 1 ? [args.away, args.home] : [args.home, args.away];
  return hub.createSession({
    kind: args.kind,
    seed,
    home,
    away,
    ...(args.dev && { dev: args.dev }),
  });
}

export function generateRoomCode(rng: Rng, existing: ReadonlyMap<string, Room>): string {
  let code: string;
  do {
    code = Array.from({ length: 6 }, () => ROOM_CODE_ALPHABET[rng(ROOM_CODE_ALPHABET.length)]).join(
      '',
    );
  } while (existing.has(code));
  return code;
}

function storeAndSendRoom(hub: PvpHub, conn: HubConn, hostPlayer?: LoadedPlayer): void {
  const code = generateRoomCode(hub.rng, hub.rooms);
  const expiresAt = hub.now() + ROOM_TTL_MS;
  hub.rooms.set(code, {
    code,
    host: conn,
    hostUserId: conn.userId,
    ...(hostPlayer && { hostPlayer }),
    expiresAt,
    status: 'waiting',
  });
  conn.send({
    t: 'room_created',
    code,
    expiresAt: new Date(hub.clockNow().getTime() + ROOM_TTL_MS).toISOString(),
  });
}

export function handleRoomCreate(hub: PvpHub, conn: HubConn): void {
  if (!hub.hasCardCatalog) {
    storeAndSendRoom(hub, conn);
    return;
  }
  const uid = conn.userId;
  hub.beginPending(uid);
  void hub
    .loadPlayer(uid)
    .then((res) => {
      if (hub.isClosed(conn)) return;
      if (!res.ok) {
        conn.send({ t: 'error', code: 'invalid_squad' });
        return;
      }
      if (hub.full) {
        conn.send({ t: 'error', code: 'server_busy' });
        return;
      }
      if (hub.hasEntry(uid, { includePending: false })) {
        conn.send({ t: 'error', code: 'busy' });
        return;
      }
      storeAndSendRoom(hub, conn, res.player);
    })
    .catch((err: unknown) => {
      hub.reportError(err);
      if (!hub.isClosed(conn)) conn.send({ t: 'error', code: 'server_busy' });
    })
    .finally(() => {
      hub.endPending(uid);
    });
}

export function handleRoomJoin(hub: PvpHub, conn: HubConn, code: string): void {
  const room = hub.rooms.get(code);
  if (!room || room.status === 'closed') {
    conn.send({ t: 'error', code: 'room_not_found' });
    return;
  }
  if (room.hostUserId === conn.userId) {
    conn.send({ t: 'error', code: 'self_join' });
    return;
  }
  if (room.status === 'full') {
    conn.send({ t: 'error', code: 'room_full' });
    return;
  }
  if (hub.now() >= room.expiresAt) {
    hub.closeRoom(room);
    conn.send({ t: 'error', code: 'room_expired' });
    return;
  }
  if (!hub.hasCardCatalog) {
    conn.send({ t: 'error', code: 'invalid_squad' });
    return;
  }

  room.status = 'full';
  const uid = conn.userId;
  hub.beginPending(uid);
  // Host cũng "đang bận": phòng đã 'full' nên hasEntry không còn thấy host, mà host vẫn có thể vào phiên khác.
  const hostUid = room.hostUserId;
  hub.beginPending(hostUid);

  const hostPromise = room.hostPlayer
    ? Promise.resolve({ ok: true as const, player: room.hostPlayer })
    : hub.loadPlayer(room.hostUserId);

  void Promise.all([hostPromise, hub.loadPlayer(uid)])
    .then(async ([hostRes, guestRes]) => {
      if (!guestRes.ok) {
        if (!hub.isClosed(room.host) && room.status === 'full') room.status = 'waiting';
        else hub.closeRoom(room);
        if (!hub.isClosed(conn)) conn.send({ t: 'error', code: 'invalid_squad' });
        return;
      }
      if (!hostRes.ok || hub.isClosed(room.host) || room.status !== 'full') {
        hub.closeRoom(room);
        if (!hub.isClosed(conn)) conn.send({ t: 'error', code: 'room_not_found' });
        return;
      }
      if (hub.isClosed(conn)) {
        room.status = 'waiting';
        return;
      }
      if (hub.full) {
        room.status = 'waiting';
        conn.send({ t: 'error', code: 'server_busy' });
        return;
      }
      const sess = await startPvpMatch(hub, {
        kind: 'friendly',
        home: { ...hostRes.player, conn: room.host },
        away: { ...guestRes.player, conn },
        rng: hub.rng,
        dev: hub.dev,
      });
      if (!sess) {
        room.status = 'waiting';
      } else {
        hub.scheduleRoomCleanup(room);
      }
    })
    .catch((err: unknown) => {
      hub.reportError(err);
      if (!hub.isClosed(room.host) && room.status === 'full') room.status = 'waiting';
      if (!hub.isClosed(conn)) conn.send({ t: 'error', code: 'server_busy' });
    })
    .finally(() => {
      hub.endPending(uid);
      hub.endPending(hostUid);
    });
}
