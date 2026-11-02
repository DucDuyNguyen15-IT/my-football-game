import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  EconomyConfigResponse,
  effectiveStats,
  MatchResultResponse,
  MeResponse,
  SquadResponse,
  StartMatchResponse,
  type Card,
  type Squad,
  type StartedMatch,
} from '@pitch/shared';
import { MATCH_REWARD, MATCH_REWARD_DAILY_CAP } from '../config/economy';
import { readSeedCards, seedCards } from '../db/seed';
import { coinTransactions, matches, users } from '../db/schema';
import { CPU_TARGET_OVR, startersAverageOvr } from '../domain/match-teams';
import { hashMatchToken } from '../services/matches';
import { createTestApp, FakeClock, resetTestData, testDb } from '../../test/helpers';

const clock = new FakeClock();
const { app } = createTestApp(clock);
afterAll(() => app.close());

beforeEach(async () => {
  clock.set('2026-01-01T00:00:00Z');
  await resetTestData(testDb());
  await seedCards(testDb());
});

const json = { 'content-type': 'application/json' };
const catalog = new Map<string, Card>(readSeedCards().map((c) => [c.id, c]));

async function signup(username = 'nguoi_choi'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, password: 'mat-khau-dai' },
    headers: json,
  });
  expect(res.statusCode).toBe(201);
  return res.cookies.find((c) => c.name === 'sid')!.value;
}

async function getSquad(sid: string): Promise<Squad> {
  const res = await app.inject({ method: 'GET', url: '/api/v1/squad', cookies: { sid } });
  return SquadResponse.parse(res.json()).data;
}

async function putSquad(sid: string, body: object): Promise<void> {
  const res = await app.inject({
    method: 'PUT',
    url: '/api/v1/squad',
    payload: body,
    headers: json,
    cookies: { sid },
  });
  expect(res.statusCode).toBe(200);
}

const start = (sid: string | undefined, payload: object) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    payload,
    headers: json,
    ...(sid && { cookies: { sid } }),
  });

describe('POST /api/v1/matches', () => {
  it('cần đăng nhập; độ khó sai → 400', async () => {
    expect((await start(undefined, { difficulty: 'easy' })).statusCode).toBe(401);
    const sid = await signup();
    expect((await start(sid, { difficulty: 'legend' })).statusCode).toBe(400);
  });

  it('đội khởi đầu vào trận: 201, chỉ số = công thức shared, lưu trận started + hash token', async () => {
    const sid = await signup();
    const res = await start(sid, { difficulty: 'easy' });
    expect(res.statusCode).toBe(201);
    const m = StartMatchResponse.parse(res.json()).data;
    expect(m.rewardEligible).toBe(true);
    expect(m.token).toMatch(/^[\w-]{43}$/);
    expect(m.home.formation).toBe('2-3-1');
    expect(m.home.players).toHaveLength(11);
    for (const p of m.home.players) {
      const card = catalog.get(p.cardId!)!;
      expect(p.position).toBe(card.position);
      expect(p.stats).toEqual(effectiveStats(card, 0));
    }
    expect(Math.abs(startersAverageOvr(m.away) - CPU_TARGET_OVR.easy)).toBeLessThanOrEqual(3);

    const [row] = await testDb()
      .select()
      .from(matches)
      .where(eq(matches.id, Number(m.matchId)));
    expect(row).toMatchObject({
      status: 'started',
      difficulty: 'easy',
      seed: m.seed,
      rewardEligible: true,
      tokenHash: hashMatchToken(m.token),
      reward: 0,
      outcome: null,
    });
    expect(row!.tokenHash).not.toContain(m.token);
    expect(row!.squadSnapshot).toEqual({ formation: '2-3-1', home: m.home, away: m.away });
  });

  it('máy Khó: OVR TB ±3 quanh 78; mỗi trận token + seed mới', async () => {
    const sid = await signup();
    const a = StartMatchResponse.parse((await start(sid, { difficulty: 'hard' })).json()).data;
    const b = StartMatchResponse.parse((await start(sid, { difficulty: 'hard' })).json()).data;
    for (const m of [a, b]) {
      expect(Math.abs(startersAverageOvr(m.away) - CPU_TARGET_OVR.hard)).toBeLessThanOrEqual(3);
    }
    expect(a.token).not.toBe(b.token);
    expect(a.matchId).not.toBe(b.matchId);
  });

  it('sai vị trí + dự bị: chỉ số trong response áp phạt 15% đúng công thức shared', async () => {
    const sid = await signup();
    const s = await getSquad(sid);
    // Đổi hậu vệ P1 ↔ tiền đạo P6 (2-3-1: P1 = DF, P6 = FW).
    await putSquad(sid, {
      formation: s.formation,
      slots: { ...s.slots, P1: s.slots.P6, P6: s.slots.P1 },
    });
    const m = StartMatchResponse.parse((await start(sid, { difficulty: 'easy' })).json()).data;
    const p1 = m.home.players.find((p) => p.slot === 'P1')!;
    const card = catalog.get(p1.cardId!)!;
    expect(card.position).toBe('FW');
    expect(p1.stats).toEqual(effectiveStats(card, 0, 'DF'));
  });

  it('đội thiếu thủ môn → 422 invalid_squad nêu rõ, không tạo trận', async () => {
    const sid = await signup();
    const s = await getSquad(sid);
    await putSquad(sid, { formation: s.formation, slots: { ...s.slots, GK: null } });
    const res = await start(sid, { difficulty: 'easy' });
    expect(res.statusCode).toBe(422);
    const err = ApiError.parse(res.json()).error;
    expect(err.code).toBe('invalid_squad');
    expect(err.message).toContain('thủ môn');
    expect(err.details).toEqual([{ field: 'slots.GK', message: 'Ô đá chính đang trống' }]);
    expect(await testDb().select().from(matches)).toHaveLength(0);
  });

  it('thiếu người đá chính (đủ GK) → 422 nêu số người và ô trống', async () => {
    const sid = await signup();
    const s = await getSquad(sid);
    await putSquad(sid, { formation: s.formation, slots: { ...s.slots, P3: null, P6: null } });
    const err = ApiError.parse((await start(sid, { difficulty: 'hard' })).json()).error;
    expect(err.code).toBe('invalid_squad');
    expect(err.message).toContain('2 người đá chính');
    expect(err.message).toContain('P3, P6');
  });
});

const MIN = 60_000;

describe('GET /api/v1/config/economy — thưởng trận', () => {
  it('trả bảng thưởng + trần ngày đúng config server', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/config/economy' });
    const data = EconomyConfigResponse.parse(res.json()).data;
    expect(data.matchReward).toEqual(MATCH_REWARD);
    expect(data.matchRewardDailyCap).toBe(MATCH_REWARD_DAILY_CAP);
  });
});

const submit = (sid: string | undefined, matchId: string, payload: object) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/matches/${matchId}/result`,
    payload,
    headers: json,
    ...(sid && { cookies: { sid } }),
  });

async function startOk(sid: string, difficulty: 'easy' | 'hard' = 'easy'): Promise<StartedMatch> {
  const res = await start(sid, { difficulty });
  expect(res.statusCode).toBe(201);
  return StartMatchResponse.parse(res.json()).data;
}

async function me(sid: string) {
  const res = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid } });
  return MeResponse.parse(res.json()).data;
}

async function ledger(userId: string) {
  return testDb()
    .select()
    .from(coinTransactions)
    .where(eq(coinTransactions.userId, Number(userId)))
    .orderBy(asc(coinTransactions.id));
}

const errorOf = (res: { json(): unknown }) => ApiError.parse(res.json()).error.code;

describe('POST /api/v1/matches/:id/result', () => {
  it('thắng Dễ sau 6 phút: +60 xu, trận finished, ledger match_reward đúng', async () => {
    const sid = await signup();
    const user = await me(sid);
    const m = await startOk(sid);
    clock.advance(6 * MIN);
    const res = await submit(sid, m.matchId, { token: m.token, homeGoals: 3, awayGoals: 1 });
    expect(res.statusCode).toBe(200);
    const r = MatchResultResponse.parse(res.json()).data;
    expect(r).toEqual({ outcome: 'win', reward: 60, balance: user.coins + 60, missions: [] });

    const [row] = await testDb()
      .select()
      .from(matches)
      .where(eq(matches.id, Number(m.matchId)));
    expect(row).toMatchObject({
      status: 'finished',
      outcome: 'win',
      reward: 60,
      homeGoals: 3,
      awayGoals: 1,
      rewardDay: '2026-01-01',
    });
    expect(row!.finishedAt).toEqual(clock.now());

    const tx = await ledger(user.id);
    expect(tx.at(-1)).toMatchObject({
      type: 'match_reward',
      amount: 60,
      balanceAfter: user.coins + 60,
      refType: 'match',
      refId: Number(m.matchId),
    });
    const [u] = await testDb()
      .select()
      .from(users)
      .where(eq(users.id, Number(user.id)));
    expect(u!.coins).toBe(tx.reduce((s, t) => s + t.amount, 0));
  });

  it('GET /me đếm số trận có thưởng hôm nay (GMT+7), sang ngày mới về 0', async () => {
    const sid = await signup();
    expect((await me(sid)).rewardedMatchesToday).toBe(0);
    const m = await startOk(sid);
    clock.advance(6 * MIN);
    await submit(sid, m.matchId, { token: m.token, homeGoals: 1, awayGoals: 0 });
    expect((await me(sid)).rewardedMatchesToday).toBe(1);
    clock.advance(24 * 60 * MIN);
    expect((await me(sid)).rewardedMatchesToday).toBe(0);
  });

  it('thưởng theo độ khó + luân lưu (Khó: thắng luân lưu 90, thua luân lưu 60)', async () => {
    const sid = await signup();
    const a = await startOk(sid, 'hard');
    const b = await startOk(sid, 'hard');
    clock.advance(7 * MIN);
    const resA = await submit(sid, a.matchId, {
      token: a.token,
      homeGoals: 1,
      awayGoals: 1,
      shootout: { home: 4, away: 3 },
    });
    const ra = MatchResultResponse.parse(resA.json()).data;
    expect(ra).toMatchObject({ outcome: 'shootout_win', reward: 90 });
    const resB = await submit(sid, b.matchId, {
      token: b.token,
      homeGoals: 0,
      awayGoals: 0,
      shootout: { home: 2, away: 4 },
    });
    const rb = MatchResultResponse.parse(resB.json()).data;
    expect(rb).toMatchObject({ outcome: 'shootout_loss', reward: 60, balance: ra.balance + 60 });
  });

  it('gửi lại cùng token → cùng kết quả, xu chỉ cộng một lần', async () => {
    const sid = await signup();
    const user = await me(sid);
    const m = await startOk(sid);
    clock.advance(6 * MIN);
    const body = { token: m.token, homeGoals: 2, awayGoals: 2 };
    const first = MatchResultResponse.parse((await submit(sid, m.matchId, body)).json()).data;
    clock.advance(MIN);
    const again = await submit(sid, m.matchId, body);
    expect(again.statusCode).toBe(200);
    expect(MatchResultResponse.parse(again.json()).data).toEqual(first);
    expect(first).toMatchObject({ outcome: 'draw', reward: 30, balance: user.coins + 30 });
    expect((await ledger(user.id)).filter((t) => t.type === 'match_reward')).toHaveLength(1);
    expect((await me(sid)).coins).toBe(user.coins + 30);
    // Token khác cho trận đã xong vẫn bị từ chối.
    const forged = await submit(sid, m.matchId, { ...body, token: 'x'.repeat(43) });
    expect(forged.statusCode).toBe(422);
    expect(errorOf(forged)).toBe('match_token_invalid');
  });

  describe('từ chối (422 match_token_invalid, không đổi xu/trận)', () => {
    const cases: Array<[string, (m: StartedMatch) => object, number]> = [
      ['token sai', () => ({ token: 'sai'.repeat(15), homeGoals: 1, awayGoals: 0 }), 6 * MIN],
      ['chưa đủ 6 phút', (m) => ({ token: m.token, homeGoals: 1, awayGoals: 0 }), 6 * MIN - 1000],
      ['tỉ số 21', (m) => ({ token: m.token, homeGoals: 21, awayGoals: 0 }), 6 * MIN],
      [
        'luân lưu khi không hoà',
        (m) => ({ token: m.token, homeGoals: 2, awayGoals: 1, shootout: { home: 3, away: 1 } }),
        6 * MIN,
      ],
      [
        'luân lưu hoà',
        (m) => ({ token: m.token, homeGoals: 1, awayGoals: 1, shootout: { home: 3, away: 3 } }),
        6 * MIN,
      ],
    ];
    for (const [name, body, wait] of cases) {
      it(name, async () => {
        const sid = await signup();
        const user = await me(sid);
        const m = await startOk(sid);
        clock.advance(wait);
        const res = await submit(sid, m.matchId, body(m));
        expect(res.statusCode).toBe(422);
        expect(errorOf(res)).toBe('match_token_invalid');
        expect((await me(sid)).coins).toBe(user.coins);
        const [row] = await testDb()
          .select()
          .from(matches)
          .where(eq(matches.id, Number(m.matchId)));
        expect(row).toMatchObject({ status: 'started', reward: 0, outcome: null });
      });
    }
  });

  it('trận của người khác / không tồn tại → 404; chưa đăng nhập → 401; body sai → 400', async () => {
    const owner = await signup('chu_tran');
    const other = await signup('nguoi_khac');
    const m = await startOk(owner);
    clock.advance(6 * MIN);
    const body = { token: m.token, homeGoals: 1, awayGoals: 0 };
    const stolen = await submit(other, m.matchId, body);
    expect(stolen.statusCode).toBe(404);
    expect(errorOf(stolen)).toBe('not_found');
    expect((await submit(owner, '999999', body)).statusCode).toBe(404);
    expect((await submit(owner, 'abc', body)).statusCode).toBe(404);
    expect((await submit(undefined, m.matchId, body)).statusCode).toBe(401);
    const negative = await submit(owner, m.matchId, { ...body, homeGoals: -1 });
    expect(negative.statusCode).toBe(400);
    // Chủ trận vẫn nộp được sau các lần thử trên.
    expect((await submit(owner, m.matchId, body)).statusCode).toBe(200);
  });

  it('trần 15 trận/ngày GMT+7: trận 16 thưởng 0; 23:59 và 00:01 là hai ngày khác nhau', async () => {
    clock.set('2026-03-10T16:50:00Z'); // 23:50 GMT+7
    const sid = await signup();
    const user = await me(sid);
    const started: StartedMatch[] = [];
    for (let i = 0; i < 17; i++) started.push(await startOk(sid));
    expect(started.every((m) => m.rewardEligible)).toBe(true);

    clock.set('2026-03-10T16:59:00Z'); // 23:59 GMT+7
    const body = (m: StartedMatch) => ({ token: m.token, homeGoals: 1, awayGoals: 0 });
    for (const m of started.slice(0, 15)) {
      const r = MatchResultResponse.parse((await submit(sid, m.matchId, body(m))).json()).data;
      expect(r.reward).toBe(60);
    }
    const m16 = started[15]!;
    const r16 = MatchResultResponse.parse((await submit(sid, m16.matchId, body(m16))).json()).data;
    expect(r16).toMatchObject({ outcome: 'win', reward: 0, balance: user.coins + 15 * 60 });
    expect((await startOk(sid)).rewardEligible).toBe(false);

    clock.set('2026-03-10T17:01:00Z'); // 00:01 GMT+7 ngày hôm sau
    const m17 = started[16]!;
    const r17 = MatchResultResponse.parse((await submit(sid, m17.matchId, body(m17))).json()).data;
    expect(r17.reward).toBe(60);
    expect((await startOk(sid)).rewardEligible).toBe(true);

    const rows = await testDb()
      .select({ reward: matches.reward, rewardDay: matches.rewardDay })
      .from(matches)
      .where(eq(matches.userId, Number(user.id)))
      .orderBy(asc(matches.id));
    expect(rows.slice(0, 15).every((r) => r.rewardDay === '2026-03-10' && r.reward === 60)).toBe(
      true,
    );
    expect(rows[15]).toMatchObject({ rewardDay: '2026-03-10', reward: 0 });
    expect(rows[16]).toMatchObject({ rewardDay: '2026-03-11', reward: 60 });

    const rewards = (await ledger(user.id)).filter((t) => t.type === 'match_reward');
    expect(rewards).toHaveLength(16);
    expect(rewards.map((t) => t.refId)).not.toContain(Number(m16.matchId));
    expect((await me(sid)).coins).toBe(user.coins + 16 * 60);
  });
});
