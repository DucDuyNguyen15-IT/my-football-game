import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  ClaimMissionResponse,
  MatchResultResponse,
  MeResponse,
  OpenPackResponse,
  StartMatchResponse,
  TodayMissionsResponse,
  type MissionProgress,
} from '@pitch/shared';
import { DAILY_MISSION_COUNT, MISSIONS } from '../config/economy';
import { seedCards } from '../db/seed';
import { coinTransactions, dailyMissions, users } from '../db/schema';
import { advanceProgress, missionDelta, pickDailyMissions } from '../domain/missions';
import { createTestApp, FakeClock, resetTestData, testDb } from '../../test/helpers';

const clock = new FakeClock();
const { app } = createTestApp(clock);
afterAll(() => app.close());

beforeEach(async () => {
  clock.set('2026-03-10T05:00:00Z'); // 12:00 GMT+7
  await resetTestData(testDb());
  await seedCards(testDb());
});

const json = { 'content-type': 'application/json' };
const MIN = 60_000;
const errorCode = (res: { json(): unknown }) => ApiError.parse(res.json()).error.code;

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

async function login(username = 'nguoi_choi'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { username, password: 'mat-khau-dai' },
    headers: json,
  });
  expect(res.statusCode).toBe(200);
  return res.cookies.find((c) => c.name === 'sid')!.value;
}

async function getMissions(sid: string): Promise<MissionProgress[]> {
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/missions/today',
    cookies: { sid },
  });
  expect(res.statusCode).toBe(200);
  return TodayMissionsResponse.parse(res.json()).data;
}

async function claim(sid: string, code: string) {
  return app.inject({
    method: 'POST',
    url: `/api/v1/missions/${code}/claim`,
    payload: {},
    headers: json,
    cookies: { sid },
  });
}

async function playMatch(
  sid: string,
  opts: {
    difficulty?: 'easy' | 'hard';
    homeGoals: number;
    awayGoals: number;
    shootout?: { home: number; away: number };
  },
) {
  const startRes = await app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    payload: { difficulty: opts.difficulty ?? 'easy' },
    headers: json,
    cookies: { sid },
  });
  expect(startRes.statusCode).toBe(201);
  const started = StartMatchResponse.parse(startRes.json()).data;
  clock.advance(6 * MIN);
  const body = {
    token: started.token,
    homeGoals: opts.homeGoals,
    awayGoals: opts.awayGoals,
    ...(opts.shootout && { shootout: opts.shootout }),
  };
  const submitRes = await app.inject({
    method: 'POST',
    url: `/api/v1/matches/${started.matchId}/result`,
    payload: body,
    headers: json,
    cookies: { sid },
  });
  expect(submitRes.statusCode).toBe(200);
  return {
    started,
    body,
    result: MatchResultResponse.parse(submitRes.json()).data,
  };
}

async function openFreePack(sid: string, key: string = randomUUID()) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/packs/pack5/open',
    payload: { payment: 'free_credit' },
    headers: { ...json, 'idempotency-key': key },
    cookies: { sid },
  });
  expect(res.statusCode).toBe(200);
  return OpenPackResponse.parse(res.json()).data;
}

async function me(sid: string) {
  const res = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid } });
  return MeResponse.parse(res.json()).data;
}

/** Tìm ngày GMT+7 mà `pickDailyMissions(userId, day)` chứa đủ mã cần thiết, đặt clock và làm mới phiên. */
async function moveToDayWithMissions(
  userId: number,
  requiredCodes: string[],
  username = 'nguoi_choi',
): Promise<string> {
  for (let d = 0; d < 200; d++) {
    const dt = new Date(Date.UTC(2026, 2, 10 + d, 5, 0, 0)); // 12:00 GMT+7 cùng ngày YYYY-MM-DD
    const day = dt.toISOString().slice(0, 10);
    const picked = new Set<string>(pickDailyMissions(userId, day).map((m) => m.code));
    if (requiredCodes.every((c) => picked.has(c))) {
      clock.set(dt.toISOString());
      return login(username);
    }
  }
  throw new Error(`Không tìm được ngày có ${requiredCodes.join(', ')}`);
}

describe('Nhiệm vụ ngày (F12)', () => {
  it('chưa đăng nhập → 401 cho GET /missions/today và POST /missions/:code/claim', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/missions/today' })).statusCode).toBe(
      401,
    );
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/missions/win_match/claim',
          payload: {},
          headers: json,
        })
      ).statusCode,
    ).toBe(401);
  });

  it('GET /missions/today tự tạo 3 nhiệm vụ của ngày GMT+7 và gọi lại vẫn ổn định', async () => {
    const { sid, userId } = await signup();
    const first = await getMissions(sid);
    expect(first).toHaveLength(DAILY_MISSION_COUNT);
    expect(first.every((m) => m.progress === 0 && !m.claimed)).toBe(true);
    const expectedCodes = pickDailyMissions(userId, '2026-03-10').map((m) => m.code);
    expect(first.map((m) => m.code)).toEqual(expectedCodes);

    const second = await getMissions(sid);
    expect(second).toEqual(first);
  });

  it('đá trận TRƯỚC KHI mở màn nhiệm vụ vẫn tạo & tăng tiến độ; trả về trong match result', async () => {
    const { userId } = await signup();
    // Không gọi GET /missions/today trước; đặt ngày có thắng trận + ghi bàn + giữ sạch lưới.
    const sid = await moveToDayWithMissions(userId, ['win_match', 'score_goals', 'clean_sheet']);

    // Chưa có dòng nào trong DB trước khi đá.
    expect(
      await testDb().select().from(dailyMissions).where(eq(dailyMissions.userId, userId)),
    ).toHaveLength(0);

    const { result, started, body } = await playMatch(sid, {
      difficulty: 'hard',
      homeGoals: 4,
      awayGoals: 0,
    });
    expect(result.missions).toHaveLength(3);
    expect(result.missions.find((m) => m.code === 'win_match')).toMatchObject({
      progress: 1,
      target: 1,
      claimed: false,
    });
    expect(result.missions.find((m) => m.code === 'score_goals')).toMatchObject({
      progress: 3, // 4 bàn kẹp trần target = 3
      target: 3,
      claimed: false,
    });
    expect(result.missions.find((m) => m.code === 'clean_sheet')).toMatchObject({
      progress: 1,
      target: 1,
      claimed: false,
    });

    // GET /missions/today khớp đúng kết quả vừa trả về.
    expect(await getMissions(sid)).toEqual(result.missions);

    // Nộp lại cùng match token không cộng dồn tiến độ lần 2.
    const retryRes = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/${started.matchId}/result`,
      payload: body,
      headers: json,
      cookies: { sid },
    });
    expect(retryRes.statusCode).toBe(200);
    expect(MatchResultResponse.parse(retryRes.json()).data).toEqual(result);
  });

  it('mở gói TRƯỚC KHI mở màn nhiệm vụ vẫn tăng open_pack; gửi lại cùng Idempotency-Key không tăng lần 2', async () => {
    const { userId } = await signup();
    const sid = await moveToDayWithMissions(userId, ['open_pack']);

    const key = randomUUID();
    await openFreePack(sid, key);
    const list1 = await getMissions(sid);
    expect(list1.find((m) => m.code === 'open_pack')).toMatchObject({
      progress: 1,
      target: 1,
      claimed: false,
    });

    // Retry cùng Idempotency-Key không đổi gì.
    await openFreePack(sid, key);
    expect(await getMissions(sid)).toEqual(list1);
  });

  it('tiến độ tăng đúng với các sự kiện: đá 2 trận, đá mức Khó, hoà/thua không tăng win_match', async () => {
    const { userId } = await signup();
    const sid = await moveToDayWithMissions(userId, ['win_match', 'play_hard', 'play_matches']);

    await playMatch(sid, { difficulty: 'easy', homeGoals: 1, awayGoals: 1 });
    let list = await getMissions(sid);
    expect(list.find((m) => m.code === 'win_match')?.progress).toBe(0);
    expect(list.find((m) => m.code === 'play_hard')?.progress).toBe(0);
    expect(list.find((m) => m.code === 'play_matches')?.progress).toBe(1);

    await playMatch(sid, {
      difficulty: 'hard',
      homeGoals: 0,
      awayGoals: 0,
      shootout: { home: 4, away: 2 },
    });
    list = await getMissions(sid);
    expect(list.find((m) => m.code === 'win_match')?.progress).toBe(1);
    expect(list.find((m) => m.code === 'play_hard')?.progress).toBe(1);
    expect(list.find((m) => m.code === 'play_matches')?.progress).toBe(2);
  });

  it('claim: chưa xong → 422; sai mã → 404; đủ điều kiện → +xu + ledger; nhận 2 lần → 409', async () => {
    const { userId } = await signup();
    const sid = await moveToDayWithMissions(userId, ['open_pack', 'win_match']);
    const initialMissions = await getMissions(sid);
    const notToday = MISSIONS.find((m) => !initialMissions.some((t) => t.code === m.code))!.code;

    // Mã không nằm trong bộ 3 hôm nay → 404.
    const missing = await claim(sid, notToday);
    expect(missing.statusCode).toBe(404);
    expect(errorCode(missing)).toBe('not_found');

    // Chưa hoàn thành → 422 mission_incomplete, không đổi xu.
    const incomplete = await claim(sid, 'open_pack');
    expect(incomplete.statusCode).toBe(422);
    expect(errorCode(incomplete)).toBe('mission_incomplete');
    expect((await me(sid)).coins).toBe(0);

    // Hoàn thành mở gói.
    await openFreePack(sid);
    const okRes = await claim(sid, 'open_pack');
    expect(okRes.statusCode).toBe(200);
    const claimedData = ClaimMissionResponse.parse(okRes.json()).data;
    expect(claimedData).toEqual({ reward: 50, balance: 50 });

    const updated = await getMissions(sid);
    expect(updated.find((m) => m.code === 'open_pack')?.claimed).toBe(true);

    // Nhận lần 2 → 409 mission_already_claimed, xu vẫn 50.
    const twice = await claim(sid, 'open_pack');
    expect(twice.statusCode).toBe(409);
    expect(errorCode(twice)).toBe('mission_already_claimed');
    expect((await me(sid)).coins).toBe(50);

    // Đối soát sổ cái.
    const ledger = await testDb()
      .select()
      .from(coinTransactions)
      .where(eq(coinTransactions.userId, userId))
      .orderBy(asc(coinTransactions.id));
    expect(ledger).toHaveLength(1);
    expect(ledger[0]).toMatchObject({
      type: 'mission_reward',
      amount: 50,
      balanceAfter: 50,
    });
    const [u] = await testDb().select().from(users).where(eq(users.id, userId));
    expect(u!.coins).toBe(ledger.reduce((s, r) => s + r.amount, 0));
  });

  it('2 request claim song song → đúng 1 thành công và 1 bị từ chối, chỉ cộng xu một lần', async () => {
    const { userId } = await signup();
    const sid = await moveToDayWithMissions(userId, ['open_pack']);
    await openFreePack(sid);

    const [a, b] = await Promise.all([claim(sid, 'open_pack'), claim(sid, 'open_pack')]);
    const codes = [a.statusCode, b.statusCode].sort();
    expect(codes).toEqual([200, 409]);
    expect((await me(sid)).coins).toBe(50);
  });

  it('reset lúc 00:00 GMT+7 (FakeClock): 23:59 và 00:01 là hai ngày riêng biệt', async () => {
    const { sid, userId } = await signup();
    // 2026-03-10 23:50 GMT+7 = 2026-03-10T16:50:00Z → nộp sau 6' là 23:56 GMT+7.
    clock.set('2026-03-10T16:50:00Z');
    await playMatch(sid, { difficulty: 'hard', homeGoals: 3, awayGoals: 0 });
    clock.set('2026-03-10T16:59:00Z'); // 23:59 GMT+7
    const day1 = await getMissions(sid);
    const eventDay1 = {
      type: 'match_finished' as const,
      difficulty: 'hard' as const,
      outcome: 'win' as const,
      homeGoals: 3,
      awayGoals: 0,
    };
    const expectedDay1 = pickDailyMissions(userId, '2026-03-10').map((def) =>
      advanceProgress(0, def.target, missionDelta(def.event, eventDay1)),
    );
    expect(day1.map((m) => m.progress)).toEqual(expectedDay1);
    expect(day1.some((m) => m.progress > 0)).toBe(true);

    // Chuyển qua 00:01 GMT+7 ngày 2026-03-11 (= 2026-03-10T17:01:00Z).
    clock.set('2026-03-10T17:01:00Z');
    const day2 = await getMissions(sid);
    expect(day2).toHaveLength(DAILY_MISSION_COUNT);
    expect(day2.map((m) => m.code)).toEqual(
      pickDailyMissions(userId, '2026-03-11').map((m) => m.code),
    );
    expect(day2.every((m) => m.progress === 0 && !m.claimed)).toBe(true);
  });
});
