// Client HTTP gọn cho test nhiều bước (7.3): gọi API thật qua `app.inject`, đọc DB để đối chiếu.
import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { expect } from 'vitest';
import type { Rarity } from '@pitch/shared';
import { cards, coinTransactions, playerCards, squadSlots, users } from '../src/db/schema';
import type { Rng } from '../src/domain/rng';
import { testDb } from './helpers';

export const JSON_HEADERS = { 'content-type': 'application/json' };
export const MIN = 60_000;

/** PRNG có seed (mulberry32) cho test — server cấm `Math.random`, và chuỗi thao tác phải lặp lại được. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return (maxExclusive) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * maxExclusive);
  };
}

export interface TestUser {
  sid: string;
  userId: number;
  username: string;
}

export function apiClient(app: FastifyInstance) {
  const call = (
    user: TestUser | null,
    method: 'GET' | 'POST' | 'PUT',
    url: string,
    payload?: unknown,
    headers: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: `/api/v1${url}`,
      ...(payload !== undefined && { payload: payload as object }),
      headers: { ...(method !== 'GET' && JSON_HEADERS), ...headers },
      ...(user && { cookies: { sid: user.sid } }),
    });

  return {
    call,
    /** Đăng ký qua API (kèm quà tân thủ); `coins` > 0 thì cấp thêm qua `/dev/grant-coins` (có ghi sổ). */
    async signup(username: string, coins = 0, extra: object = {}): Promise<TestUser> {
      const res = await call(null, 'POST', '/auth/register', {
        username,
        password: 'mat-khau-dai',
        ...extra,
      });
      expect(res.statusCode).toBe(201);
      const user: TestUser = {
        sid: res.cookies.find((c) => c.name === 'sid')!.value,
        userId: Number(res.json().data.id),
        username,
      };
      if (coins > 0) {
        expect((await call(user, 'POST', '/dev/grant-coins', { amount: coins })).statusCode).toBe(
          200,
        );
      }
      return user;
    },
    openPack: (user: TestUser, code: string, body: unknown, key: string = randomUUID()) =>
      call(user, 'POST', `/packs/${code}/open`, body, { 'idempotency-key': key }),
    sell: (user: TestUser, body: unknown) => call(user, 'POST', '/player-cards/sell', body),
    upgrade: (user: TestUser, id: string | number, body: unknown, key: string = randomUUID()) =>
      call(user, 'POST', `/player-cards/${id}/upgrade`, body, { 'idempotency-key': key }),
    putSquad: (user: TestUser, body: unknown) => call(user, 'PUT', '/squad', body),
    startMatch: (user: TestUser, body: unknown = { difficulty: 'easy' }) =>
      call(user, 'POST', '/matches', body),
    submitResult: (user: TestUser, matchId: string | number, body: unknown) =>
      call(user, 'POST', `/matches/${matchId}/result`, body),
  };
}

/** Trạng thái thật trong DB của một người chơi: số dư, sổ cái, thẻ (kèm độ hiếm), ô đội hình. */
export async function dbState(userId: number) {
  const db = testDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const ledger = await db
    .select()
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .orderBy(asc(coinTransactions.id));
  const owned = await db
    .select({
      id: playerCards.id,
      cardId: playerCards.cardId,
      level: playerCards.level,
      luck: playerCards.luck,
      rarity: cards.rarity,
    })
    .from(playerCards)
    .innerJoin(cards, eq(cards.id, playerCards.cardId))
    .where(eq(playerCards.userId, userId))
    .orderBy(asc(playerCards.id));
  const slots = await db
    .select({ slot: squadSlots.slot, playerCardId: squadSlots.playerCardId })
    .from(squadSlots)
    .where(eq(squadSlots.userId, userId))
    .orderBy(asc(squadSlots.slot));
  const inSquad = new Set(slots.map((s) => s.playerCardId));
  return {
    user: user!,
    coins: user!.coins,
    ledger,
    ledgerSum: ledger.reduce((s, t) => s + t.amount, 0),
    cards: owned,
    /** Thẻ ngoài đội hình (bán/làm nguyên liệu được). */
    spare: owned.filter((c) => !inSquad.has(c.id)),
    slots,
  };
}

/** Chèn thẳng một thẻ (mẫu đầu tiên của độ hiếm) vào kho, ngoài đội hình — không qua sổ cái. */
export async function giveCard(
  userId: number,
  rarity: Rarity,
  state: { level?: number; luck?: number } = {},
): Promise<number> {
  const db = testDb();
  const [card] = await db
    .select({ id: cards.id })
    .from(cards)
    .where(eq(cards.rarity, rarity))
    .orderBy(asc(cards.id))
    .limit(1);
  const [row] = await db
    .insert(playerCards)
    .values({ userId, cardId: card!.id, source: 'pack', acquiredAt: new Date(), ...state })
    .returning({ id: playerCards.id });
  return row!.id;
}

/**
 * Bất biến sổ cái của một người chơi: `coins = SUM(amount)`, không âm, và `balance_after` của từng
 * dòng bằng tổng luỹ kế tới dòng đó (không dòng nào bị chèn/sửa lệch).
 */
export async function expectLedgerConsistent(userId: number): Promise<void> {
  const { coins, ledger, ledgerSum } = await dbState(userId);
  expect(coins).toBeGreaterThanOrEqual(0);
  expect(coins).toBe(ledgerSum);
  let running = 0;
  for (const tx of ledger) {
    running += tx.amount;
    expect(tx.balanceAfter).toBe(running);
  }
}
