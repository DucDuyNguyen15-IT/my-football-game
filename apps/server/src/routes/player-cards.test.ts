import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  computeOvr,
  EconomyConfigResponse,
  effectiveStats,
  PlayerCardsResponse,
  SellCardsResponse,
  type Rarity,
} from '@pitch/shared';
import { CARD_SALE_PRICE } from '../config/economy';
import { seedCards } from '../db/seed';
import { cards, coinTransactions, playerCards, squadSlots, users } from '../db/schema';
import { toCard } from '../services/cards';
import { createTestApp, resetTestData, testDb } from '../../test/helpers';

const { app } = createTestApp(undefined, { enableDevRoutes: true });
afterAll(() => app.close());

beforeEach(async () => {
  await resetTestData(testDb());
  await seedCards(testDb());
});

const json = { 'content-type': 'application/json' };

async function signup(username = 'nguoi_choi'): Promise<{ sid: string; userId: number }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, password: 'mat-khau-dai' },
    headers: json,
  });
  expect(res.statusCode).toBe(201);
  return {
    sid: res.cookies.find((c) => c.name === 'sid')!.value,
    userId: Number(res.json().data.id),
  };
}

/** Mở gói 5 miễn phí → 5 thẻ ngoài đội hình; trả id các thẻ đó. */
async function openFreePack(sid: string): Promise<string[]> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/packs/pack5/open',
    payload: { payment: 'free_credit' },
    headers: { ...json, 'idempotency-key': randomUUID() },
    cookies: { sid },
  });
  expect(res.statusCode).toBe(200);
  return (res.json().data.cards as { id: string }[]).map((c) => c.id);
}

const list = (sid: string, query = '') =>
  app.inject({ method: 'GET', url: `/api/v1/player-cards${query}`, cookies: { sid } });

const sell = (sid: string, playerCardIds: unknown) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/player-cards/sell',
    payload: { playerCardIds },
    headers: json,
    cookies: { sid },
  });

const errorCode = (res: { json(): unknown }) => ApiError.parse(res.json()).error.code;

async function rarityOf(playerCardIds: string[]): Promise<Rarity[]> {
  const rows = await testDb()
    .select({ id: playerCards.id, rarity: cards.rarity })
    .from(playerCards)
    .innerJoin(cards, eq(cards.id, playerCards.cardId));
  const byId = new Map(rows.map((r) => [String(r.id), r.rarity]));
  return playerCardIds.map((id) => byId.get(id)!);
}

async function wallet(userId: number) {
  const db = testDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const ledger = await db
    .select()
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .orderBy(asc(coinTransactions.id));
  const owned = await db.select().from(playerCards).where(eq(playerCards.userId, userId));
  return { coins: user!.coins, ledger, owned: owned.length };
}

describe('GET /api/v1/player-cards', () => {
  it('cần đăng nhập', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/player-cards' });
    expect(res.statusCode).toBe(401);
  });

  it('liệt kê thẻ khởi đầu (trong đội hình) + thẻ từ gói, chỉ số hiệu lực theo công thức shared', async () => {
    const { sid } = await signup();
    const packIds = await openFreePack(sid);
    const res = await list(sid);
    expect(res.statusCode).toBe(200);
    const data = PlayerCardsResponse.parse(res.json()).data;
    expect(data).toHaveLength(16);
    // Mặc định mới nhận trước: 5 thẻ gói nằm đầu, đều ngoài đội hình.
    expect(data.slice(0, 5).map((c) => c.id)).toEqual([...packIds].sort((a, b) => +b - +a));
    expect(data.filter((c) => c.inSquad)).toHaveLength(11);

    const catalog = new Map(
      (await testDb().select().from(cards)).map((r) => [String(r.id), toCard(r)]),
    );
    for (const pc of data) {
      expect(pc.effectiveStats).toEqual(effectiveStats(catalog.get(pc.cardId)!, pc.level));
    }
  });

  it('áp phạt sai vị trí cho thẻ đá chính lệch vai trò', async () => {
    const { sid, userId } = await signup();
    const db = testDb();
    // Đổi chỗ thủ môn (ô GK) và một ô đá chính → cả hai sai vị trí.
    const slots = await db.select().from(squadSlots).where(eq(squadSlots.userId, userId));
    const gk = slots.find((s) => s.slot === 'GK')!;
    const p1 = slots.find((s) => s.slot === 'P1')!;
    await db.delete(squadSlots).where(eq(squadSlots.userId, userId));
    await db.insert(squadSlots).values(
      slots.map((s) => ({
        userId,
        slot: s.slot === 'GK' ? 'P1' : s.slot === 'P1' ? 'GK' : s.slot,
        playerCardId: s.playerCardId,
      })),
    );
    const data = PlayerCardsResponse.parse((await list(sid)).json()).data;
    const [gkRow] = await db.select().from(playerCards).where(eq(playerCards.id, gk.playerCardId));
    const [gkCard] = await db.select().from(cards).where(eq(cards.id, gkRow!.cardId));
    const shown = data.find((c) => c.id === String(gk.playerCardId))!;
    expect(shown.effectiveStats).toEqual(effectiveStats(toCard(gkCard!), 0, 'DF'));
    expect(shown.effectiveStats).not.toEqual(effectiveStats(toCard(gkCard!), 0));
    expect(data.find((c) => c.id === String(p1.playerCardId))!.inSquad).toBe(true);
  });

  it('lọc theo vị trí/độ hiếm và sắp xếp theo OVR', async () => {
    const { sid } = await signup();
    await openFreePack(sid);
    const catalog = new Map(
      (await testDb().select().from(cards)).map((r) => [String(r.id), toCard(r)]),
    );

    const gks = PlayerCardsResponse.parse((await list(sid, '?position=GK')).json()).data;
    expect(gks.length).toBeGreaterThanOrEqual(1);
    expect(gks.every((c) => catalog.get(c.cardId)!.position === 'GK')).toBe(true);

    const bronze = PlayerCardsResponse.parse((await list(sid, '?rarity=bronze')).json()).data;
    expect(bronze.every((c) => catalog.get(c.cardId)!.rarity === 'bronze')).toBe(true);
    expect(bronze.length).toBeGreaterThanOrEqual(11);

    const byOvr = PlayerCardsResponse.parse((await list(sid, '?sort=-ovr')).json()).data;
    const ovrs = byOvr.map((c) => computeOvr(catalog.get(c.cardId)!.position, c.effectiveStats));
    expect(ovrs).toEqual([...ovrs].sort((a, b) => b - a));

    expect((await list(sid, '?sort=bad')).statusCode).toBe(400);
  });
});

describe('GET /api/v1/config/economy', () => {
  it('trả giá bán thẻ đúng config server, không cần đăng nhập', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/config/economy' });
    expect(res.statusCode).toBe(200);
    expect(EconomyConfigResponse.parse(res.json()).data.cardSalePrice).toEqual(CARD_SALE_PRICE);
  });
});

describe('POST /api/v1/player-cards/sell', () => {
  it('bán nhiều thẻ: cộng xu theo độ hiếm, xoá thẻ, mỗi thẻ một dòng sổ cái khớp số dư', async () => {
    const { sid, userId } = await signup();
    const ids = await openFreePack(sid);
    const before = await wallet(userId);
    const expected = (await rarityOf(ids)).reduce((s, r) => s + CARD_SALE_PRICE[r], 0);

    const res = await sell(sid, ids);
    expect(res.statusCode).toBe(200);
    const { coinsGained, balance } = SellCardsResponse.parse(res.json()).data;
    expect(coinsGained).toBe(expected);
    expect(balance).toBe(before.coins + expected);

    const after = await wallet(userId);
    expect(after.coins).toBe(balance);
    expect(after.owned).toBe(before.owned - 5);
    const sales = after.ledger.filter((t) => t.type === 'card_sale');
    expect(sales).toHaveLength(5);
    expect(sales.reduce((s, t) => s + t.amount, 0)).toBe(expected);
    expect(sales.at(-1)!.balanceAfter).toBe(balance);
    expect(sales.map((t) => String(t.refId)).sort()).toEqual([...ids].sort());
    expect(sales.every((t) => t.refType === 'player_card')).toBe(true);
  });

  it('thẻ của người khác → 404, không thay đổi gì', async () => {
    const a = await signup('nguoi_a');
    const b = await signup('nguoi_b');
    const [mine] = await openFreePack(a.sid);
    const theirs = await openFreePack(b.sid);
    const before = await wallet(a.userId);
    const res = await sell(a.sid, [mine, theirs[0]]);
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('not_found');
    expect(await wallet(a.userId)).toEqual(before);
    expect((await wallet(b.userId)).owned).toBe(16);
  });

  it('có thẻ trong đội hình → 409 card_in_squad, không thẻ nào bị bán', async () => {
    const { sid, userId } = await signup();
    const ids = await openFreePack(sid);
    const [slot] = await testDb().select().from(squadSlots).where(eq(squadSlots.userId, userId));
    const before = await wallet(userId);
    const res = await sell(sid, [...ids, String(slot!.playerCardId)]);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('card_in_squad');
    expect(await wallet(userId)).toEqual(before);
  });

  it('2 request bán cùng một thẻ song song → xu chỉ cộng một lần, request kia 404', async () => {
    const { sid, userId } = await signup();
    const [id] = await openFreePack(sid);
    const before = await wallet(userId);
    const [price] = (await rarityOf([id!])).map((r) => CARD_SALE_PRICE[r]);

    const results = await Promise.all([sell(sid, [id]), sell(sid, [id])]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404]);
    const after = await wallet(userId);
    expect(after.coins).toBe(before.coins + price!);
    expect(after.ledger.filter((t) => t.type === 'card_sale')).toHaveLength(1);
    expect(after.owned).toBe(before.owned - 1);
  });

  it('body sai: rỗng, trùng thẻ, quá 50 thẻ → 400', async () => {
    const { sid } = await signup();
    const [id] = await openFreePack(sid);
    for (const body of [[], [id, id], Array.from({ length: 51 }, (_, i) => String(i + 1))]) {
      const res = await sell(sid, body);
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe('validation_error');
    }
  });
});
