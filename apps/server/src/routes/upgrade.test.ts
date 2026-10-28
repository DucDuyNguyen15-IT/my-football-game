import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, EconomyConfigResponse, UpgradeCardResponse, type Rarity } from '@pitch/shared';
import { UPGRADE } from '../config/economy';
import { seedCards } from '../db/seed';
import {
  analyticsEvents,
  cards,
  cardUpgrades,
  coinTransactions,
  playerCards,
  squadSlots,
  users,
} from '../db/schema';
import { createTestApp, resetTestData, testDb } from '../../test/helpers';

/** Kết quả quay tiếp theo của rng tiêm vào app: < tỉ lệ → thành công. */
let nextRoll = 0;
const { app } = createTestApp(undefined, { enableDevRoutes: true, rng: () => nextRoll });
afterAll(() => app.close());

beforeEach(async () => {
  nextRoll = 0;
  await resetTestData(testDb());
  await seedCards(testDb());
});

const json = { 'content-type': 'application/json' };
const errorCode = (res: { json(): unknown }) => ApiError.parse(res.json()).error.code;

async function signup(
  username = 'nguoi_choi',
  coins = 0,
): Promise<{ sid: string; userId: number }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, password: 'mat-khau-dai' },
    headers: json,
  });
  expect(res.statusCode).toBe(201);
  const sid = res.cookies.find((c) => c.name === 'sid')!.value;
  if (coins > 0) {
    const grant = await app.inject({
      method: 'POST',
      url: '/api/v1/dev/grant-coins',
      payload: { amount: coins },
      headers: json,
      cookies: { sid },
    });
    expect(grant.statusCode).toBe(200);
  }
  return { sid, userId: Number(res.json().data.id) };
}

/** Thêm thẻ (mẫu đầu tiên của độ hiếm) vào kho, ngoài đội hình. */
async function giveCard(
  userId: number,
  rarity: Rarity,
  state: { level?: number; luck?: number } = {},
): Promise<string> {
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
  return String(row!.id);
}

const upgrade = (sid: string, id: string, materialId: unknown, key: string = randomUUID()) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/player-cards/${id}/upgrade`,
    payload: { materialId },
    headers: { ...json, 'idempotency-key': key },
    cookies: { sid },
  });

async function snapshot(userId: number) {
  const db = testDb();
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const ledger = await db
    .select()
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, userId))
    .orderBy(asc(coinTransactions.id));
  const owned = await db
    .select({ id: playerCards.id, level: playerCards.level, luck: playerCards.luck })
    .from(playerCards)
    .where(eq(playerCards.userId, userId))
    .orderBy(asc(playerCards.id));
  const upgrades = await db.select().from(cardUpgrades).where(eq(cardUpgrades.userId, userId));
  return { coins: user!.coins, ledger, owned, upgrades };
}

const cardState = async (id: string) => {
  const [row] = await testDb()
    .select({ level: playerCards.level, luck: playerCards.luck })
    .from(playerCards)
    .where(eq(playerCards.id, Number(id)));
  return row;
};

describe('GET /api/v1/config/economy — bảng ép thẻ', () => {
  it('trả bảng ép đúng config server', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/config/economy' });
    expect(res.statusCode).toBe(200);
    const { upgrade: table } = EconomyConfigResponse.parse(res.json()).data;
    expect(table).toEqual({
      maxLevel: UPGRADE.maxLevel,
      luckPerFail: UPGRADE.luckPerFail,
      steps: UPGRADE.steps,
      rarityFeeMultiplier: UPGRADE.rarityFeeMultiplier,
    });
  });
});

describe('POST /api/v1/player-cards/:id/upgrade', () => {
  it('cần đăng nhập và Idempotency-Key', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/player-cards/1/upgrade',
      payload: { materialId: '2' },
      headers: json,
    });
    expect(res.statusCode).toBe(401);

    const { sid, userId } = await signup('nguoi_a', 1000);
    const target = await giveCard(userId, 'bronze');
    const material = await giveCard(userId, 'bronze');
    const noKey = await app.inject({
      method: 'POST',
      url: `/api/v1/player-cards/${target}/upgrade`,
      payload: { materialId: material },
      headers: json,
      cookies: { sid },
    });
    expect(noKey.statusCode).toBe(400);
    expect(errorCode(noKey)).toBe('validation_error');
  });

  it('thành công: lên cấp, may mắn về 0, xoá nguyên liệu, trừ phí, ghi sổ cái + lịch sử + analytics', async () => {
    const { sid, userId } = await signup('nguoi_a', 1000);
    const target = await giveCard(userId, 'silver', { level: 1, luck: 20 });
    const material = await giveCard(userId, 'gold', { level: 3 });
    nextRoll = 99; // tỉ lệ 80 + 20 = 100 → vẫn thành công

    const res = await upgrade(sid, target, material);
    expect(res.statusCode).toBe(200);
    const data = UpgradeCardResponse.parse(res.json()).data;
    const fee = 100 * 2;
    expect(data).toEqual({ success: true, level: 2, luck: 0, rate: 100, fee, balance: 1000 - fee });

    const after = await snapshot(userId);
    expect(after.coins).toBe(1000 - fee);
    expect(after.owned.map((c) => String(c.id))).not.toContain(material);
    expect(await cardState(target)).toEqual({ level: 2, luck: 0 });
    const tx = after.ledger.at(-1)!;
    expect(tx).toMatchObject({ type: 'upgrade_fee', amount: -fee, balanceAfter: 1000 - fee });
    expect(tx.refType).toBe('card_upgrade');
    expect(after.upgrades).toHaveLength(1);
    expect(after.upgrades[0]).toMatchObject({
      id: tx.refId,
      playerCardId: Number(target),
      materialPlayerCardId: Number(material),
      fromLevel: 1,
      toLevel: 2,
      rate: 100,
      success: true,
    });
    const events = await testDb()
      .select()
      .from(analyticsEvents)
      .where(eq(analyticsEvents.name, 'upgrade'));
    expect(events).toHaveLength(1);
  });

  it('thất bại: giữ cấp, +10 may mắn, vẫn mất nguyên liệu và phí', async () => {
    const { sid, userId } = await signup('nguoi_a', 1000);
    const target = await giveCard(userId, 'bronze', { level: 4 });
    const material = await giveCard(userId, 'bronze');
    nextRoll = 25; // tỉ lệ 25 → trượt

    const data = UpgradeCardResponse.parse((await upgrade(sid, target, material)).json()).data;
    expect(data).toEqual({ success: false, level: 4, luck: 10, rate: 25, fee: 800, balance: 200 });
    expect(await cardState(target)).toEqual({ level: 4, luck: 10 });
    const after = await snapshot(userId);
    expect(after.owned.map((c) => String(c.id))).not.toContain(material);
    expect(after.coins).toBe(200);
    expect(after.upgrades[0]).toMatchObject({ success: false, fromLevel: 4, toLevel: 4 });
  });

  it('3 lần trượt ở +5 → lần thứ 4 tỉ lệ 55%', async () => {
    const { sid, userId } = await signup('nguoi_a', 10_000);
    const target = await giveCard(userId, 'bronze', { level: 4 });
    nextRoll = 99;
    const rates: number[] = [];
    for (let i = 0; i < 4; i++) {
      const material = await giveCard(userId, 'bronze');
      const res = await upgrade(sid, target, material);
      expect(res.statusCode).toBe(200);
      rates.push(UpgradeCardResponse.parse(res.json()).data.rate);
    }
    expect(rates).toEqual([25, 35, 45, 55]);
  });

  it('thẻ đã +5 → 422 max_level, không thay đổi gì', async () => {
    const { sid, userId } = await signup('nguoi_a', 10_000);
    const target = await giveCard(userId, 'bronze', { level: 5 });
    const material = await giveCard(userId, 'bronze');
    const before = await snapshot(userId);
    const res = await upgrade(sid, target, material);
    expect(res.statusCode).toBe(422);
    expect(errorCode(res)).toBe('max_level');
    expect(await snapshot(userId)).toEqual(before);
  });

  it('nguyên liệu thấp độ hiếm hơn hoặc chính thẻ được ép → 422 invalid_material', async () => {
    const { sid, userId } = await signup('nguoi_a', 10_000);
    const target = await giveCard(userId, 'gold');
    const material = await giveCard(userId, 'silver');
    const before = await snapshot(userId);
    for (const res of [await upgrade(sid, target, material), await upgrade(sid, target, target)]) {
      expect(res.statusCode).toBe(422);
      expect(errorCode(res)).toBe('invalid_material');
    }
    expect(await snapshot(userId)).toEqual(before);
  });

  it('nguyên liệu trong đội hình → 409 card_in_squad; thẻ được ép trong đội hình thì vẫn ép được', async () => {
    const { sid, userId } = await signup('nguoi_a', 10_000);
    const slots = await testDb().select().from(squadSlots).where(eq(squadSlots.userId, userId));
    const inSquad = String(slots[0]!.playerCardId); // thẻ khởi đầu Đồng
    const loose = await giveCard(userId, 'bronze');
    const before = await snapshot(userId);

    const res = await upgrade(sid, loose, inSquad);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('card_in_squad');
    expect(await snapshot(userId)).toEqual(before);

    const ok = await upgrade(sid, inSquad, loose);
    expect(ok.statusCode).toBe(200);
    expect(await cardState(inSquad)).toEqual({ level: 1, luck: 0 });
  });

  it('thiếu xu → 409 insufficient_coins, không thay đổi gì', async () => {
    const { sid, userId } = await signup('nguoi_a', 49);
    const target = await giveCard(userId, 'bronze');
    const material = await giveCard(userId, 'bronze');
    const before = await snapshot(userId);
    const res = await upgrade(sid, target, material);
    expect(res.statusCode).toBe(409);
    expect(errorCode(res)).toBe('insufficient_coins');
    expect(await snapshot(userId)).toEqual(before);
  });

  it('thẻ không tồn tại hoặc của người khác → 404', async () => {
    const a = await signup('nguoi_a', 1000);
    const b = await signup('nguoi_b', 1000);
    const mine = await giveCard(a.userId, 'bronze');
    const theirs = await giveCard(b.userId, 'bronze');
    for (const res of [
      await upgrade(a.sid, mine, theirs),
      await upgrade(a.sid, theirs, mine),
      await upgrade(a.sid, mine, '999999'),
      await upgrade(a.sid, '99999999999999999999', mine),
    ]) {
      expect(res.statusCode).toBe(404);
      expect(errorCode(res)).toBe('not_found');
    }
    expect((await snapshot(a.userId)).coins).toBe(1000);
  });

  it('cùng key gửi lại → cùng kết quả, trừ phí một lần; cùng key khác nguyên liệu → 409', async () => {
    const { sid, userId } = await signup('nguoi_a', 1000);
    const target = await giveCard(userId, 'bronze', { level: 3 });
    const material = await giveCard(userId, 'bronze');
    const other = await giveCard(userId, 'bronze');
    const key = randomUUID();
    nextRoll = 99; // trượt lần đầu

    const first = await upgrade(sid, target, material, key);
    expect(first.statusCode).toBe(200);
    nextRoll = 0; // nếu quay lại thì sẽ thành công — kết quả phải giữ nguyên
    const again = await upgrade(sid, target, material, key);
    expect(again.statusCode).toBe(200);
    expect(again.json()).toEqual(first.json());

    const after = await snapshot(userId);
    expect(after.coins).toBe(1000 - 400);
    expect(after.ledger.filter((t) => t.type === 'upgrade_fee')).toHaveLength(1);
    expect(after.upgrades).toHaveLength(1);

    const conflict = await upgrade(sid, target, other, key);
    expect(conflict.statusCode).toBe(409);
    expect(errorCode(conflict)).toBe('idempotency_conflict');
    expect(await snapshot(userId)).toEqual(after);
  });

  it('2 lần ép song song dùng cùng nguyên liệu → đúng 1 thành công; sổ cái khớp số dư', async () => {
    const { sid, userId } = await signup('nguoi_a', 1000);
    const t1 = await giveCard(userId, 'bronze');
    const t2 = await giveCard(userId, 'bronze');
    const material = await giveCard(userId, 'bronze');

    const results = await Promise.all([upgrade(sid, t1, material), upgrade(sid, t2, material)]);
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 404]);
    const after = await snapshot(userId);
    expect(after.coins).toBe(1000 - 50);
    expect(after.upgrades).toHaveLength(1);
    expect(after.ledger.filter((t) => t.type === 'upgrade_fee')).toHaveLength(1);
    expect(after.ledger.reduce((s, t) => s + t.amount, 0)).toBe(after.coins);
    expect(after.ledger.at(-1)!.balanceAfter).toBe(after.coins);
  });
});
