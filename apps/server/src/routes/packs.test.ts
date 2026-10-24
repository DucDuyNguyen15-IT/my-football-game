import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, GrantCoinsResponse, OpenPackResponse, PacksResponse } from '@pitch/shared';
import { seedCards } from '../db/seed';
import {
  analyticsEvents,
  coinTransactions,
  packBoxes,
  packOpenings,
  playerCards,
  users,
} from '../db/schema';
import { createTestApp, resetTestData, testDb } from '../../test/helpers';

const { app } = createTestApp(undefined, { enableDevRoutes: true });
const { app: prodApp } = createTestApp();
afterAll(async () => {
  await app.close();
  await prodApp.close();
});

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

const open = (sid: string, code: string, payment: string, key: string | null = randomUUID()) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/packs/${code}/open`,
    payload: { payment },
    headers: key === null ? json : { ...json, 'idempotency-key': key },
    cookies: { sid },
  });

async function grant(sid: string, amount: number): Promise<number> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/dev/grant-coins',
    payload: { amount },
    headers: json,
    cookies: { sid },
  });
  expect(res.statusCode).toBe(200);
  return GrantCoinsResponse.parse(res.json()).data.balance;
}

const errorCode = (res: { json(): unknown }) => ApiError.parse(res.json()).error.code;

async function snapshot(userId: number) {
  const db = testDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [box] = await db.select().from(packBoxes).where(eq(packBoxes.userId, userId));
  const cards = await db.select().from(playerCards).where(eq(playerCards.userId, userId));
  const ledger = await db
    .select()
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId));
  const openings = await db.select().from(packOpenings).where(eq(packOpenings.userId, userId));
  return {
    coins: user!.coins,
    credits: user!.freePack5Credits,
    box: box!,
    cardCount: cards.length,
    ledger,
    openings,
  };
}

/** Bất biến đối soát (PRD §7): tổng sổ cái = `users.coins`. */
async function expectLedgerMatches(userId: number) {
  const [row] = await testDb()
    .select({ sum: sql<string>`coalesce(sum(${coinTransactions.amount}), 0)` })
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId));
  const { coins } = await snapshot(userId);
  expect(Number(row!.sum)).toBe(coins);
}

describe('GET /packs', () => {
  it('chưa đăng nhập → 401', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/packs' });
    expect(res.statusCode).toBe(401);
  });

  it('trả gói từ config + hộp 58/30/10/2, tỉ lệ kế tiếp', async () => {
    const { sid } = await signup();
    const res = await app.inject({ method: 'GET', url: '/api/v1/packs', cookies: { sid } });
    expect(res.statusCode).toBe(200);
    const { packs, box } = PacksResponse.parse(res.json()).data;
    expect(packs).toEqual([
      { code: 'pack1', size: 1, price: 100, guaranteeAvailable: false },
      { code: 'pack5', size: 5, price: 450, guaranteeAvailable: true },
    ]);
    expect(box).toEqual({
      left: { bronze: 58, silver: 30, gold: 10, legend: 2 },
      total: 100,
      nextOdds: { bronze: 0.58, silver: 0.3, gold: 0.1, legend: 0.02 },
      cycle: 1,
    });
  });
});

describe('POST /packs/:code/open', () => {
  it('lượt miễn phí: giá 0, credit − 1, 5 thẻ (≥ 1 Bạc+), không có dòng ledger, ghi analytics', async () => {
    const { sid, userId } = await signup();
    const res = await open(sid, 'pack5', 'free_credit');
    expect(res.statusCode).toBe(200);
    const data = OpenPackResponse.parse(res.json()).data;
    expect(data.cards).toHaveLength(5);
    expect(data).toMatchObject({ balance: 0, freePack5Credits: 0 });
    expect(data.box.total).toBe(95);

    const catalog = await app.cardCatalog();
    const rarities = data.cards.map((c) => catalog.byId.get(c.cardId)!.rarity);
    expect(rarities.some((r) => r !== 'bronze')).toBe(true);
    for (const c of data.cards) expect(c).toMatchObject({ level: 0, luck: 0, inSquad: false });

    const s = await snapshot(userId);
    expect(s).toMatchObject({ coins: 0, credits: 0, cardCount: 16 });
    expect(s.ledger).toHaveLength(0);
    expect(s.openings).toHaveLength(1);
    expect(s.openings[0]).toMatchObject({ price: 0, payment: 'free_credit', packCode: 'pack5' });
    const events = await testDb()
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.name, 'pack_open'));
    expect(events).toHaveLength(1);
    expect(events[0]!.props).toMatchObject({ pack: 'pack5', payment: 'free_credit', rarities });

    // Hết lượt miễn phí → 409, không đổi gì.
    const again = await open(sid, 'pack5', 'free_credit');
    expect(again.statusCode).toBe(409);
    expect((await snapshot(userId)).cardCount).toBe(16);
  });

  it('không đủ xu → 409 insufficient_coins; xu, hộp, kho không đổi', async () => {
    const { sid, userId } = await signup();
    await grant(sid, 99);
    const before = await snapshot(userId);
    const res = await open(sid, 'pack1', 'coins');
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('insufficient_coins');
    const after = await snapshot(userId);
    expect(after).toEqual(before);
  });

  it('mở bằng xu: trừ giá, ledger pack_purchase trỏ tới pack_opening, tổng ledger = coins', async () => {
    const { sid, userId } = await signup();
    await grant(sid, 1000);
    const res = await open(sid, 'pack5', 'coins');
    expect(res.statusCode).toBe(200);
    expect(OpenPackResponse.parse(res.json()).data.balance).toBe(550);
    const s = await snapshot(userId);
    expect(s.coins).toBe(550);
    const purchase = s.ledger.find((t) => t.type === 'pack_purchase')!;
    expect(purchase).toMatchObject({
      amount: -450,
      balanceAfter: 550,
      refType: 'pack_opening',
      refId: s.openings[0]!.id,
    });
    expect(s.box.bronzeLeft + s.box.silverLeft + s.box.goldLeft + s.box.legendLeft).toBe(95);
    await expectLedgerMatches(userId);
  });

  it('gửi lại cùng key → cùng kết quả, chỉ trừ xu một lần', async () => {
    const { sid, userId } = await signup();
    await grant(sid, 1000);
    const key = randomUUID();
    const first = await open(sid, 'pack1', 'coins', key);
    const second = await open(sid, 'pack1', 'coins', key);
    expect(first.statusCode).toBe(200);
    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual(first.json());
    const s = await snapshot(userId);
    expect(s.coins).toBe(900);
    expect(s.openings).toHaveLength(1);
    expect(s.cardCount).toBe(12);
    await expectLedgerMatches(userId);
  });

  it('cùng key nhưng khác gói hoặc cách trả → 409 idempotency_conflict', async () => {
    const { sid } = await signup();
    await grant(sid, 1000);
    const key = randomUUID();
    expect((await open(sid, 'pack1', 'coins', key)).statusCode).toBe(200);
    const otherPack = await open(sid, 'pack5', 'coins', key);
    expect(otherPack.statusCode).toBe(409);
    expect(errorCode(otherPack)).toBe('idempotency_conflict');
    const otherPayment = await open(sid, 'pack5', 'free_credit', key);
    expect(errorCode(otherPayment)).toBe('idempotency_conflict');
  });

  it('key của người khác không ảnh hưởng (idempotency theo từng user)', async () => {
    const a = await signup('nguoi_a');
    const b = await signup('nguoi_b');
    const key = randomUUID();
    expect((await open(a.sid, 'pack5', 'free_credit', key)).statusCode).toBe(200);
    const res = await open(b.sid, 'pack5', 'free_credit', key);
    expect(res.statusCode).toBe(200);
    expect((await snapshot(b.userId)).cardCount).toBe(16);
  });

  it('2 request song song khác key khi chỉ đủ xu cho 1 → đúng 1 thành công, số dư ≥ 0', async () => {
    const { sid, userId } = await signup();
    await grant(sid, 100);
    const results = await Promise.all([open(sid, 'pack1', 'coins'), open(sid, 'pack1', 'coins')]);
    const codes = results.map((r) => r.statusCode).sort();
    expect(codes).toEqual([200, 409]);
    const s = await snapshot(userId);
    expect(s.coins).toBe(0);
    expect(s.openings).toHaveLength(1);
    expect(s.cardCount).toBe(12);
    await expectLedgerMatches(userId);
  });

  it('2 request song song cùng key → một kết quả, mở một lần', async () => {
    const { sid, userId } = await signup();
    await grant(sid, 1000);
    const key = randomUUID();
    const [a, b] = await Promise.all([
      open(sid, 'pack5', 'coins', key),
      open(sid, 'pack5', 'coins', key),
    ]);
    expect([a.statusCode, b.statusCode]).toEqual([200, 200]);
    expect(b.json()).toEqual(a.json());
    const s = await snapshot(userId);
    expect(s.coins).toBe(550);
    expect(s.openings).toHaveLength(1);
    expect(s.cardCount).toBe(16);
  });

  it('mở liên tục hết hộp → hộp tự làm mới (cycle 2), đúng 2/10/30/58 trong 100 phiếu đầu', async () => {
    const { sid, userId } = await signup();
    await grant(sid, 21 * 450);
    for (let i = 0; i < 20; i++) expect((await open(sid, 'pack5', 'coins')).statusCode).toBe(200);
    const s = await snapshot(userId);
    expect(s.box).toMatchObject({ bronzeLeft: 0, silverLeft: 0, goldLeft: 0, legendLeft: 0 });
    const catalog = await app.cardCatalog();
    const pack = await testDb()
      .select({ cardId: playerCards.cardId })
      .from(playerCards)
      .where(sql`${playerCards.userId} = ${userId} and ${playerCards.source} = 'pack'`);
    const count = (r: string) =>
      pack.filter((p) => catalog.byId.get(String(p.cardId))!.rarity === r).length;
    expect([count('legend'), count('gold'), count('silver'), count('bronze')]).toEqual([
      2, 10, 30, 58,
    ]);

    const res = await open(sid, 'pack1', 'coins');
    expect(OpenPackResponse.parse(res.json()).data.box).toMatchObject({ total: 99, cycle: 2 });
    await expectLedgerMatches(userId);
  });

  it('request sai: thiếu/hỏng Idempotency-Key → 400; gói lạ → 404; gói 1 bằng lượt miễn phí → 400', async () => {
    const { sid, userId } = await signup();
    for (const res of [
      await open(sid, 'pack5', 'free_credit', null),
      await open(sid, 'pack5', 'free_credit', 'khong-phai-uuid'),
      await open(sid, 'pack5', 'the-thuong'),
      await open(sid, 'pack1', 'free_credit'),
    ]) {
      expect(res.statusCode).toBe(400);
      expect(errorCode(res)).toBe('validation_error');
    }
    const unknown = await open(sid, 'pack99', 'coins');
    expect(unknown.statusCode).toBe(404);
    expect((await snapshot(userId)).cardCount).toBe(11);
  });

  it('chưa đăng nhập → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/packs/pack1/open',
      payload: { payment: 'coins' },
      headers: { ...json, 'idempotency-key': randomUUID() },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /dev/grant-coins', () => {
  it('không bật ENABLE_DEV_ROUTES → 404', async () => {
    const { sid } = await signup();
    const res = await prodApp.inject({
      method: 'POST',
      url: '/api/v1/dev/grant-coins',
      payload: { amount: 1000 },
      headers: json,
      cookies: { sid },
    });
    expect(res.statusCode).toBe(404);
  });

  it('bật → cộng xu qua ledger admin_adjust; trừ quá số dư → 409', async () => {
    const { sid, userId } = await signup();
    expect(await grant(sid, 500)).toBe(500);
    const s = await snapshot(userId);
    expect(s.ledger).toMatchObject([{ type: 'admin_adjust', amount: 500, balanceAfter: 500 }]);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/dev/grant-coins',
      payload: { amount: -501 },
      headers: json,
      cookies: { sid },
    });
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('insufficient_coins');
    await expectLedgerMatches(userId);
  });
});
