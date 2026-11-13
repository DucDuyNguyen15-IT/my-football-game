// Task 7.3 — "thử sửa request" (ROADMAP GĐ7, PRD §7.4/§8): client gửi thêm/sửa field để tự cộng xu,
// tự chọn thẻ, dùng đồ của người khác → server bỏ qua hoặc từ chối, không bao giờ có lợi.
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  MatchResultResponse,
  MeResponse,
  OpenPackResponse,
  SellCardsResponse,
  SquadResponse,
  StartMatchResponse,
  UpgradeCardResponse,
  type Rarity,
  type StartedMatch,
} from '@pitch/shared';
import {
  CARD_SALE_PRICE,
  MATCH_REWARD,
  PACKS,
  STARTER_FREE_PACK5,
  STARTER_SQUAD,
  UPGRADE,
} from '../config/economy';
import { seedCards } from '../db/seed';
import { cards, matches, packBoxes, packOpenings } from '../db/schema';
import { buildApp } from '../app';
import { createTestApp, FakeClock, resetTestData, testDb } from '../../test/helpers';
import {
  apiClient,
  dbState,
  expectLedgerConsistent,
  giveCard,
  MIN,
  type TestUser,
} from '../../test/client';

const clock = new FakeClock();
/** Kết quả quay ép thẻ tiếp theo: < tỉ lệ → thành công. */
let nextRoll = 0;
const { app } = createTestApp(clock, { enableDevRoutes: true, rng: () => nextRoll });
const api = apiClient(app);
afterAll(() => app.close());

beforeEach(async () => {
  nextRoll = 0;
  clock.set('2026-01-01T00:00:00Z');
  await resetTestData(testDb());
  await seedCards(testDb());
});

const errorCode = (res: { json(): unknown }) => ApiError.parse(res.json()).error.code;

/** Ảnh chụp những gì kẻ gian muốn đổi: xu, sổ cái, thẻ (cấp/may mắn), đội hình, lượt miễn phí. */
async function snapshot(user: TestUser) {
  const s = await dbState(user.userId);
  return {
    coins: s.coins,
    freePack5Credits: s.user.freePack5Credits,
    isAdmin: s.user.isAdmin,
    ledger: s.ledger.map((t) => [t.type, t.amount, t.balanceAfter]),
    cards: s.cards,
    slots: s.slots,
  };
}

/** Các field "ước gì server tin" nhét thêm vào mọi request. */
const GREEDY = {
  price: 0,
  coins: 999_999,
  balance: 999_999,
  amount: 999_999,
  reward: 999_999,
  rarity: 'legend',
  level: 5,
  isAdmin: true,
};

async function boxOf(userId: number) {
  const [box] = await testDb().select().from(packBoxes).where(eq(packBoxes.userId, userId));
  return {
    bronze: box!.bronzeLeft,
    silver: box!.silverLeft,
    gold: box!.goldLeft,
    legend: box!.legendLeft,
  };
}

describe('tamper: đăng ký', () => {
  it('gửi thêm coins / isAdmin / freePack5Credits / id → bị bỏ qua, chỉ nhận đúng quà tân thủ', async () => {
    const victim = await api.signup('nan_nhan');
    const user = await api.signup('tham_lam', 0, {
      ...GREEDY,
      id: String(victim.userId),
      userId: String(victim.userId),
      freePack5Credits: 99,
      is_admin: true,
    });
    expect(user.userId).not.toBe(victim.userId);
    const s = await snapshot(user);
    expect(s.coins).toBe(0);
    expect(s.isAdmin).toBe(false);
    expect(s.freePack5Credits).toBe(STARTER_FREE_PACK5);
    expect(s.ledger).toEqual([]);
    expect(s.cards).toHaveLength(STARTER_SQUAD.slots.length);
    expect(s.cards.every((c) => c.rarity === 'bronze' && c.level === 0)).toBe(true);
  });
});

describe('tamper: mở gói', () => {
  it('price: 0 / rarity: legend / userId người khác → vẫn trừ đủ giá, thẻ theo phiếu trong hộp của mình', async () => {
    const victim = await api.signup('nan_nhan', 500);
    const user = await api.signup('tham_lam', 500);
    const victimBefore = await snapshot(victim);
    const boxBefore = await boxOf(user.userId);

    const res = await api.openPack(user, 'pack1', {
      payment: 'coins',
      ...GREEDY,
      userId: String(victim.userId),
      size: 50,
      cards: [{ cardId: '60', rarity: 'legend' }],
      guarantee: true,
    });
    expect(res.statusCode).toBe(200);
    const data = OpenPackResponse.parse(res.json()).data;
    expect(data.balance).toBe(500 - PACKS.pack1.price);
    expect(data.cards).toHaveLength(PACKS.pack1.size);

    const s = await dbState(user.userId);
    expect(s.coins).toBe(500 - PACKS.pack1.price);
    expect(s.cards).toHaveLength(STARTER_SQUAD.slots.length + 1);
    // Thẻ nhận được đúng bằng một phiếu rút khỏi hộp của chính mình (không tự chọn độ hiếm).
    const got = s.cards.find((c) => String(c.id) === data.cards[0]!.id)!;
    const boxAfter = await boxOf(user.userId);
    for (const r of ['bronze', 'silver', 'gold', 'legend'] as const) {
      expect(boxBefore[r] - boxAfter[r], r).toBe(r === got.rarity ? 1 : 0);
    }
    expect(await snapshot(victim)).toEqual(victimBefore);
    await expectLedgerConsistent(user.userId);
  });

  it('không đủ xu thì price: 0 cũng không cứu được; payment lạ / lượt miễn phí cho gói 1 → 400', async () => {
    const user = await api.signup('tham_lam', 50);
    const before = await snapshot(user);

    const poor = await api.openPack(user, 'pack1', { payment: 'coins', price: 0, coins: 9999 });
    expect(poor.statusCode).toBe(409);
    expect(errorCode(poor)).toBe('insufficient_coins');
    for (const payment of ['free', 'gift', null, 0, { type: 'coins', price: 0 }]) {
      expect((await api.openPack(user, 'pack1', { payment })).statusCode).toBe(400);
    }
    expect((await api.openPack(user, 'pack1', { payment: 'free_credit' })).statusCode).toBe(400);
    expect((await api.openPack(user, 'pack99', { payment: 'coins' })).statusCode).toBe(404);
    expect(await snapshot(user)).toEqual(before);
  });

  it('lượt miễn phí chỉ có một: lần hai (kể cả kèm freePack5Credits: 99) → 409', async () => {
    const user = await api.signup('tham_lam');
    expect((await api.openPack(user, 'pack5', { payment: 'free_credit' })).statusCode).toBe(200);
    const again = await api.openPack(user, 'pack5', {
      payment: 'free_credit',
      freePack5Credits: 99,
      credits: 99,
    });
    expect(again.statusCode).toBe(409);
    const s = await dbState(user.userId);
    expect(s.user.freePack5Credits).toBe(0);
    expect(s.cards).toHaveLength(STARTER_SQUAD.slots.length + PACKS.pack5.size);
    expect(s.coins).toBe(0);
  });

  it('dùng lại Idempotency-Key của người khác → không lấy được kết quả/thẻ của họ, tự trả tiền', async () => {
    const victim = await api.signup('nan_nhan', 500);
    const user = await api.signup('tham_lam', 500);
    const key = randomUUID();
    const first = await api.openPack(victim, 'pack1', { payment: 'coins' }, key);
    const stolen = await api.openPack(user, 'pack1', { payment: 'coins' }, key);
    expect(stolen.statusCode).toBe(200);
    const mine = OpenPackResponse.parse(stolen.json()).data;
    expect(mine.cards[0]!.id).not.toBe(OpenPackResponse.parse(first.json()).data.cards[0]!.id);
    expect((await dbState(user.userId)).coins).toBe(500 - PACKS.pack1.price);
    expect((await dbState(victim.userId)).coins).toBe(500 - PACKS.pack1.price);
    // Cùng key nhưng đổi gói để "nâng cấp" lần mở cũ → 409, không mở thêm.
    const swap = await api.openPack(user, 'pack5', { payment: 'coins' }, key);
    expect(errorCode(swap)).toBe('idempotency_conflict');
    expect(await testDb().select().from(packOpenings)).toHaveLength(2);
  });
});

describe('tamper: bán thẻ', () => {
  it('gửi price / coins / rarity → giá vẫn theo bảng server', async () => {
    const user = await api.signup('tham_lam');
    const bronze = await giveCard(user.userId, 'bronze', { level: 5 });
    const res = await api.sell(user, {
      playerCardIds: [String(bronze)],
      ...GREEDY,
      price: 9999,
      prices: { [bronze]: 9999 },
      coinsGained: 9999,
    });
    expect(res.statusCode).toBe(200);
    expect(SellCardsResponse.parse(res.json()).data).toEqual({
      coinsGained: CARD_SALE_PRICE.bronze,
      balance: CARD_SALE_PRICE.bronze,
    });
    expect((await dbState(user.userId)).coins).toBe(CARD_SALE_PRICE.bronze);
    await expectLedgerConsistent(user.userId);
  });

  it('bán playerCardId của người khác (kể cả trộn với thẻ mình, kèm userId của họ) → 404, không ai đổi gì', async () => {
    const victim = await api.signup('nan_nhan');
    const user = await api.signup('tham_lam');
    const theirs = await giveCard(victim.userId, 'legend');
    const mine = await giveCard(user.userId, 'bronze');
    const before = [await snapshot(user), await snapshot(victim)];

    for (const body of [
      { playerCardIds: [String(theirs)] },
      { playerCardIds: [String(theirs)], userId: String(victim.userId) },
      { playerCardIds: [String(mine), String(theirs)] },
      { playerCardIds: [String(theirs), String(mine)], ownerId: victim.userId },
    ]) {
      const res = await api.sell(user, body);
      expect(res.statusCode).toBe(404);
    }
    expect([await snapshot(user), await snapshot(victim)]).toEqual(before);
  });

  it('bán trùng một thẻ nhiều lần trong một request / id sai kiểu / thẻ trong đội hình → từ chối', async () => {
    const user = await api.signup('tham_lam');
    const mine = String(await giveCard(user.userId, 'gold'));
    const inSquad = String((await dbState(user.userId)).slots[0]!.playerCardId);
    const before = await snapshot(user);

    for (const playerCardIds of [
      [mine, mine],
      [mine, `0${mine}`, ` ${mine}`],
      [Number(mine)],
      [`${mine}.0`],
      [`-${mine}`],
      [],
      mine,
    ]) {
      expect((await api.sell(user, { playerCardIds })).statusCode, String(playerCardIds)).toBe(400);
    }
    const squad = await api.sell(user, { playerCardIds: [mine, inSquad] });
    expect(errorCode(squad)).toBe('card_in_squad');
    expect(await snapshot(user)).toEqual(before);

    // "07" và "7" là cùng một thẻ: server gộp lại, chỉ trả tiền một lần.
    const alias = await api.sell(user, { playerCardIds: [mine, `0${mine}`, `00${mine}`] });
    expect(alias.statusCode).toBe(200);
    expect(SellCardsResponse.parse(alias.json()).data.coinsGained).toBe(CARD_SALE_PRICE.gold);
    expect((await dbState(user.userId)).coins).toBe(CARD_SALE_PRICE.gold);
    await expectLedgerConsistent(user.userId);
  });

  it('bán xong gửi lại đúng request → 404, không được tiền lần hai', async () => {
    const user = await api.signup('tham_lam');
    const body = { playerCardIds: [String(await giveCard(user.userId, 'legend'))] };
    expect((await api.sell(user, body)).statusCode).toBe(200);
    expect((await api.sell(user, body)).statusCode).toBe(404);
    expect((await dbState(user.userId)).coins).toBe(CARD_SALE_PRICE.legend);
  });
});

describe('tamper: ép thẻ', () => {
  it('gửi success / level / fee / rate → kết quả vẫn do server quay, phí vẫn trừ đủ', async () => {
    const user = await api.signup('tham_lam', 1000);
    const target = await giveCard(user.userId, 'bronze', { level: 1 });
    const material = await giveCard(user.userId, 'bronze');
    nextRoll = 99; // +1 → +2 có tỉ lệ 80% → chắc chắn trượt
    const res = await api.upgrade(user, target, {
      materialId: String(material),
      ...GREEDY,
      success: true,
      fee: 0,
      rate: 100,
      luck: 100,
      toLevel: 5,
    });
    expect(res.statusCode).toBe(200);
    const fee = UPGRADE.steps[1].baseFee * UPGRADE.rarityFeeMultiplier.bronze;
    expect(UpgradeCardResponse.parse(res.json()).data).toMatchObject({
      success: false,
      level: 1,
      luck: UPGRADE.luckPerFail,
      rate: UPGRADE.steps[1].baseRate,
      fee,
      balance: 1000 - fee,
    });
    const s = await dbState(user.userId);
    expect(s.coins).toBe(1000 - fee);
    expect(s.cards.find((c) => c.id === target)).toMatchObject({ level: 1 });
    expect(s.cards.some((c) => c.id === material)).toBe(false); // nguyên liệu vẫn mất
    await expectLedgerConsistent(user.userId);
  });

  it('nguyên liệu hoặc thẻ đích là của người khác → 404, không ai mất thẻ/xu', async () => {
    const victim = await api.signup('nan_nhan', 1000);
    const user = await api.signup('tham_lam', 1000);
    const theirGold = await giveCard(victim.userId, 'gold', { level: 4 });
    const theirBronze = await giveCard(victim.userId, 'bronze');
    const myBronze = await giveCard(user.userId, 'bronze');
    const before = [await snapshot(user), await snapshot(victim)];

    // Đốt thẻ của nạn nhân làm nguyên liệu cho mình.
    const burn = await api.upgrade(user, myBronze, { materialId: String(theirBronze) });
    // Ép thẻ của nạn nhân bằng thẻ mình (rồi mong "chuyển" được), kèm userId giả.
    const hijack = await api.upgrade(user, theirGold, {
      materialId: String(myBronze),
      userId: String(victim.userId),
    });
    // Cả hai thẻ đều của nạn nhân: phá hoại kho người khác.
    const grief = await api.upgrade(user, theirGold, { materialId: String(theirBronze) });
    for (const res of [burn, hijack, grief]) expect(res.statusCode).toBe(404);
    expect([await snapshot(user), await snapshot(victim)]).toEqual(before);
  });

  it('nguyên liệu kém độ hiếm / chính thẻ đó / không đủ xu → từ chối, không đổi gì', async () => {
    const user = await api.signup('tham_lam', 10);
    const gold = await giveCard(user.userId, 'gold');
    const bronze = await giveCard(user.userId, 'bronze');
    const bronze2 = await giveCard(user.userId, 'bronze');
    const before = await snapshot(user);

    expect(errorCode(await api.upgrade(user, gold, { materialId: String(bronze) }))).toBe(
      'invalid_material',
    );
    expect(errorCode(await api.upgrade(user, gold, { materialId: String(gold) }))).toBe(
      'invalid_material',
    );
    const poor = await api.upgrade(user, bronze, { materialId: String(bronze2), fee: 0 });
    expect(errorCode(poor)).toBe('insufficient_coins');
    expect(await snapshot(user)).toEqual(before);
  });
});

describe('tamper: đội hình', () => {
  it('xếp thẻ của người khác vào đội mình → 404; đội hình hai bên giữ nguyên', async () => {
    const victim = await api.signup('nan_nhan');
    const user = await api.signup('tham_lam');
    const theirLegend = await giveCard(victim.userId, 'legend', { level: 5 });
    const squad = SquadResponse.parse((await api.call(user, 'GET', '/squad')).json()).data;
    const before = [await snapshot(user), await snapshot(victim)];

    const res = await api.putSquad(user, {
      formation: squad.formation,
      slots: { ...squad.slots, P6: String(theirLegend) },
    });
    expect(res.statusCode).toBe(404);
    expect([await snapshot(user), await snapshot(victim)]).toEqual(before);
  });

  it('gửi userId người khác / teamRating / field lạ → chỉ đội mình đổi, điểm đội do server tính', async () => {
    const victim = await api.signup('nan_nhan');
    const user = await api.signup('tham_lam');
    const squad = SquadResponse.parse((await api.call(user, 'GET', '/squad')).json()).data;
    const victimBefore = await snapshot(victim);

    const res = await api.putSquad(user, {
      formation: squad.formation,
      slots: { ...squad.slots, B4: null },
      userId: String(victim.userId),
      teamRating: 99,
      warnings: [],
    });
    expect(res.statusCode).toBe(200);
    const saved = SquadResponse.parse(res.json()).data;
    expect(saved.teamRating).toBe(squad.teamRating);
    expect(saved.teamRating).toBeLessThan(99);
    expect((await dbState(user.userId)).slots).toHaveLength(STARTER_SQUAD.slots.length - 1);
    expect(await snapshot(victim)).toEqual(victimBefore);

    // Ô không tồn tại / cùng một thẻ ở hai ô → từ chối.
    const extraSlot = await api.putSquad(user, {
      formation: squad.formation,
      slots: { ...squad.slots, P7: squad.slots.B1 },
    });
    expect(extraSlot.statusCode).toBe(400);
    const twice = await api.putSquad(user, {
      formation: squad.formation,
      slots: { ...squad.slots, B5: squad.slots.GK },
    });
    expect(errorCode(twice)).toBe('invalid_squad');
  });
});

describe('tamper: kết quả trận', () => {
  async function started(user: TestUser, difficulty = 'easy'): Promise<StartedMatch> {
    const res = await api.startMatch(user, { difficulty });
    expect(res.statusCode).toBe(201);
    return StartMatchResponse.parse(res.json()).data;
  }

  it('tỉ số 99–0 / 21–0 / số âm / số lẻ → từ chối, không cộng xu, trận chưa xong', async () => {
    const user = await api.signup('tham_lam');
    const m = await started(user);
    clock.advance(6 * MIN);
    const before = await snapshot(user);

    for (const [homeGoals, awayGoals] of [
      [99, 0],
      [21, 0],
      [0, 99],
      [999, 998],
    ]) {
      const res = await api.submitResult(user, m.matchId, { token: m.token, homeGoals, awayGoals });
      expect(res.statusCode).toBe(422);
      expect(errorCode(res)).toBe('match_token_invalid');
    }
    for (const homeGoals of [-1, 1.5, '5', 1e9, null]) {
      const res = await api.submitResult(user, m.matchId, {
        token: m.token,
        homeGoals,
        awayGoals: 0,
      });
      expect(res.statusCode).toBe(400);
    }
    // Luân lưu khi không hoà, hoặc luân lưu hoà → không hợp lệ.
    for (const body of [
      { homeGoals: 0, awayGoals: 3, shootout: { home: 5, away: 0 } },
      { homeGoals: 1, awayGoals: 1, shootout: { home: 3, away: 3 } },
    ]) {
      const res = await api.submitResult(user, m.matchId, { token: m.token, ...body });
      expect(res.statusCode).toBe(422);
    }
    expect(await snapshot(user)).toEqual(before);
    const [row] = await testDb()
      .select()
      .from(matches)
      .where(eq(matches.id, Number(m.matchId)));
    expect(row).toMatchObject({ status: 'started', reward: 0, outcome: null });
  });

  it('gửi reward / outcome / difficulty / userId → thưởng vẫn theo tỉ số + độ khó server đã lưu', async () => {
    const victim = await api.signup('nan_nhan');
    const user = await api.signup('tham_lam');
    const victimBefore = await snapshot(victim);
    const m = await started(user, 'easy');
    clock.advance(6 * MIN);
    const res = await api.submitResult(user, m.matchId, {
      token: m.token,
      homeGoals: 0,
      awayGoals: 2,
      ...GREEDY,
      outcome: 'win',
      difficulty: 'hard',
      userId: String(victim.userId),
      matchId: '999',
      rewardEligible: true,
    });
    expect(res.statusCode).toBe(200);
    expect(MatchResultResponse.parse(res.json()).data).toMatchObject({
      outcome: 'loss',
      reward: MATCH_REWARD.easy.loss,
      balance: MATCH_REWARD.easy.loss,
    });
    expect((await dbState(user.userId)).coins).toBe(MATCH_REWARD.easy.loss);
    expect(await snapshot(victim)).toEqual(victimBefore);
    await expectLedgerConsistent(user.userId);
  });

  it('nộp sớm hơn 6 phút / bịa token / dùng token của trận khác → 422, không thưởng', async () => {
    const user = await api.signup('tham_lam');
    const a = await started(user);
    const b = await started(user);
    const win = { homeGoals: 3, awayGoals: 0 };

    const early = await api.submitResult(user, a.matchId, { token: a.token, ...win });
    expect(errorCode(early)).toBe('match_token_invalid');
    clock.advance(6 * MIN);
    for (const token of ['x'.repeat(43), b.token, a.token.slice(0, -1), `${a.token}x`]) {
      const res = await api.submitResult(user, a.matchId, { token, ...win });
      expect(res.statusCode).toBe(422);
    }
    expect((await dbState(user.userId)).coins).toBe(0);
  });

  it('nộp trận của người khác (kể cả có token thật của họ) → 404, không ai được thưởng', async () => {
    const victim = await api.signup('nan_nhan');
    const user = await api.signup('tham_lam');
    const theirs = await started(victim);
    clock.advance(6 * MIN);
    const res = await api.submitResult(user, theirs.matchId, {
      token: theirs.token,
      homeGoals: 5,
      awayGoals: 0,
      userId: String(victim.userId),
    });
    expect(res.statusCode).toBe(404);
    expect((await dbState(user.userId)).coins).toBe(0);
    expect((await dbState(victim.userId)).coins).toBe(0);
    // Nạn nhân vẫn nộp được kết quả thật của mình.
    const real = await api.submitResult(victim, theirs.matchId, {
      token: theirs.token,
      homeGoals: 0,
      awayGoals: 1,
    });
    expect(real.statusCode).toBe(200);
  });

  it('thua xong nộp lại "thắng 20–0" cùng token → vẫn kết quả cũ, xu cộng đúng một lần', async () => {
    const user = await api.signup('tham_lam');
    const m = await started(user, 'hard');
    clock.advance(6 * MIN);
    const lose = { token: m.token, homeGoals: 0, awayGoals: 1 };
    expect((await api.submitResult(user, m.matchId, lose)).statusCode).toBe(200);
    for (let i = 0; i < 3; i++) {
      const res = await api.submitResult(user, m.matchId, {
        token: m.token,
        homeGoals: 20,
        awayGoals: 0,
      });
      expect(res.statusCode).toBe(200);
      expect(MatchResultResponse.parse(res.json()).data).toMatchObject({
        outcome: 'loss',
        reward: MATCH_REWARD.hard.loss,
        balance: MATCH_REWARD.hard.loss,
      });
    }
    const s = await dbState(user.userId);
    expect(s.coins).toBe(MATCH_REWARD.hard.loss);
    expect(s.ledger).toHaveLength(1);
  });

  it('bắt đầu trận với đội hình/đội máy tự khai → bị bỏ qua, đội nhà lấy từ đội hình đã lưu', async () => {
    const user = await api.signup('tham_lam');
    const honest = await started(user);
    const res = await api.startMatch(user, {
      difficulty: 'easy',
      home: { formation: '2-3-1', players: [] },
      away: { formation: '2-3-1', players: [] },
      seed: 1,
      rewardEligible: true,
      squad: { GK: '999' },
    });
    expect(res.statusCode).toBe(201);
    expect(StartMatchResponse.parse(res.json()).data.home).toEqual(honest.home);
  });
});

describe('tamper: id ngoài phạm vi và đường tắt', () => {
  const HUGE = '9'.repeat(30);

  it('id khổng lồ ở mọi chỗ nhận id → 4xx, không bao giờ 500', async () => {
    const user = await api.signup('tham_lam', 1000);
    const mine = String(await giveCard(user.userId, 'bronze'));
    const squad = SquadResponse.parse((await api.call(user, 'GET', '/squad')).json()).data;
    const before = await snapshot(user);

    const responses = [
      await api.sell(user, { playerCardIds: [HUGE] }),
      await api.sell(user, { playerCardIds: [mine, HUGE] }),
      await api.upgrade(user, HUGE, { materialId: mine }),
      await api.upgrade(user, mine, { materialId: HUGE }),
      await api.putSquad(user, { formation: squad.formation, slots: { ...squad.slots, B5: HUGE } }),
      await api.submitResult(user, HUGE, { token: 'x'.repeat(43), homeGoals: 1, awayGoals: 0 }),
    ];
    for (const res of responses) {
      expect(res.statusCode, res.body).toBeGreaterThanOrEqual(400);
      expect(res.statusCode, res.body).toBeLessThan(500);
    }
    expect(await snapshot(user)).toEqual(before);
  });

  it('không có API nào cho client tự sửa số dư: PUT/PATCH /me, POST /coins… → 404', async () => {
    const user = await api.signup('tham_lam');
    for (const [method, url] of [
      ['PUT', '/api/v1/me'],
      ['PATCH', '/api/v1/me'],
      ['POST', '/api/v1/me'],
      ['POST', '/api/v1/coins'],
      ['POST', '/api/v1/player-cards'],
      ['PUT', '/api/v1/packs'],
      ['POST', '/api/v1/admin/grant'],
    ] as const) {
      const res = await app.inject({
        method,
        url,
        payload: GREEDY,
        headers: { 'content-type': 'application/json' },
        cookies: { sid: user.sid },
      });
      expect(res.statusCode, `${method} ${url}`).toBe(404);
    }
    expect((await dbState(user.userId)).coins).toBe(0);
  });

  it('server không bật ENABLE_DEV_ROUTES: /dev/grant-coins không tồn tại dù đã đăng nhập', async () => {
    const user = await api.signup('tham_lam');
    const prod = buildApp({ db: testDb(), clock, rateLimit: false });
    const res = await prod.inject({
      method: 'POST',
      url: '/api/v1/dev/grant-coins',
      payload: { amount: 1_000_000 },
      headers: { 'content-type': 'application/json' },
      cookies: { sid: user.sid },
    });
    await prod.close();
    expect(res.statusCode).toBe(404);
    expect((await dbState(user.userId)).coins).toBe(0);
  });

  it('danh mục thẻ không sửa được từ client (không có route ghi /cards)', async () => {
    const user = await api.signup('tham_lam');
    const rarityCount = async (rarity: Rarity) =>
      (await testDb().select().from(cards).where(eq(cards.rarity, rarity))).length;
    const legends = await rarityCount('legend');
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE'] as const) {
      const res = await app.inject({
        method,
        url: '/api/v1/cards',
        payload: { id: '1', rarity: 'legend' },
        headers: { 'content-type': 'application/json' },
        cookies: { sid: user.sid },
      });
      expect(res.statusCode).toBe(404);
    }
    expect(await rarityCount('legend')).toBe(legends);
  });
});

describe('GET /me — rewardedMatchesToday', () => {
  const me = async (user: TestUser) =>
    MeResponse.parse((await api.call(user, 'GET', '/me')).json()).data;

  it('đếm đúng trận có thưởng của chính mình trong ngày GMT+7; đăng nhập lại cũng trả đúng', async () => {
    const user = await api.signup('nguoi_choi');
    const other = await api.signup('nguoi_khac');
    expect((await me(user)).rewardedMatchesToday).toBe(0);

    const play = async (who: TestUser, homeGoals: number, awayGoals: number) => {
      const res = await api.startMatch(who);
      const m = StartMatchResponse.parse(res.json()).data;
      clock.advance(6 * MIN);
      return api.submitResult(who, m.matchId, { token: m.token, homeGoals, awayGoals });
    };
    await play(user, 2, 0);
    await play(user, 0, 2); // thua vẫn có thưởng → vẫn đếm
    await play(other, 1, 0);
    // Trận bắt đầu nhưng chưa nộp / nộp bị từ chối → không đếm.
    await api.startMatch(user);
    const bad = StartMatchResponse.parse((await api.startMatch(user)).json()).data;
    clock.advance(6 * MIN);
    await api.submitResult(user, bad.matchId, { token: bad.token, homeGoals: 99, awayGoals: 0 });

    const mine = await me(user);
    expect(mine.rewardedMatchesToday).toBe(2);
    expect(mine.coins).toBe(MATCH_REWARD.easy.win + MATCH_REWARD.easy.loss);
    expect((await me(other)).rewardedMatchesToday).toBe(1);

    const login = await api.call(null, 'POST', '/auth/login', {
      username: 'nguoi_choi',
      password: 'mat-khau-dai',
    });
    expect(MeResponse.parse(login.json()).data.rewardedMatchesToday).toBe(2);

    // 2026-01-01 00:00Z = 07:00 GMT+7 → sang 17:00Z là ngày GMT+7 mới.
    clock.set('2026-01-01T17:00:01Z');
    expect((await me(user)).rewardedMatchesToday).toBe(0);
  });
});
