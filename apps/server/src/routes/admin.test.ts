import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, OnboardingStatsResponse, RetentionResponse } from '@pitch/shared';
import { seedCards } from '../db/seed';
import { analyticsEvents, cards, playerCards, users } from '../db/schema';
import { createTestApp, FakeClock, resetTestData, testDb } from '../../test/helpers';

const clock = new FakeClock('2026-10-01T10:00:00+07:00');
const { app } = createTestApp(clock, { rng: () => 0 });
afterAll(() => app.close());

beforeEach(async () => {
  clock.set('2026-10-01T10:00:00+07:00');
  await resetTestData(testDb());
  await seedCards(testDb());
});

const json = { 'content-type': 'application/json' };
const errorCode = (res: { json(): unknown }) => ApiError.parse(res.json()).error.code;

async function signup(username: string): Promise<{ sid: string; userId: number }> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, password: 'mat-khau-dai', acceptTerms: true },
    headers: json,
  });
  expect(res.statusCode).toBe(201);
  return {
    sid: res.cookies.find((c) => c.name === 'sid')!.value,
    userId: Number(res.json().data.id),
  };
}

async function makeAdmin(userId: number): Promise<void> {
  await testDb().update(users).set({ isAdmin: true }).where(eq(users.id, userId));
}

describe('GET /api/v1/admin/retention', () => {
  it('chưa đăng nhập → 401; không phải admin → 403; query sai → 400', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/v1/admin/retention' });
    expect(anon.statusCode).toBe(401);
    expect(errorCode(anon)).toBe('unauthenticated');

    const user = await signup('nguoi_thuong');
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/retention',
      cookies: { sid: user.sid },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(errorCode(forbidden)).toBe('forbidden');

    await makeAdmin(user.userId);
    for (const url of [
      '/api/v1/admin/retention?from=2026-13-01',
      '/api/v1/admin/retention?from=2026-02-30',
      '/api/v1/admin/retention?from=2026-10-10&to=2026-10-05',
      '/api/v1/admin/retention?days=0',
    ]) {
      const bad = await app.inject({ method: 'GET', url, cookies: { sid: user.sid } });
      expect(bad.statusCode).toBe(400);
      expect(errorCode(bad)).toBe('validation_error');
    }
  });

  it('ghi đủ sự kiện analytics trong transaction và session_seen tối đa 1 lần/ngày GMT+7', async () => {
    const { sid, userId } = await signup('theo_doi');

    // Gọi nhiều API (kể cả song song) trong cùng ngày GMT+7 → chỉ có 1 session_seen.
    await Promise.all([
      app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid } }),
      app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid } }),
      app.inject({ method: 'GET', url: '/api/v1/packs', cookies: { sid } }),
    ]);

    // 23:59 GMT+7 vẫn cùng ngày 2026-10-01 → không ghi thêm session_seen.
    clock.set('2026-10-01T23:59:00+07:00');
    await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid } });

    // 00:01 GMT+7 ngày mới 2026-10-02 → ghi 1 session_seen mới.
    clock.set('2026-10-02T00:01:00+07:00');
    await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid } });

    // Mở gói miễn phí (pack_open)
    const packRes = await app.inject({
      method: 'POST',
      url: '/api/v1/packs/pack5/open',
      payload: { payment: 'free_credit' },
      headers: { ...json, 'idempotency-key': randomUUID() },
      cookies: { sid },
    });
    expect(packRes.statusCode).toBe(200);

    // Đá trận + nộp kết quả (match_start, match_end) — retry cùng token không ghi match_end lần 2.
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { difficulty: 'easy' },
      headers: json,
      cookies: { sid },
    });
    expect(startRes.statusCode).toBe(201);
    const { matchId, token } = startRes.json().data as { matchId: string; token: string };
    clock.advance(6 * 60 * 1000);
    const resultBody = { token, homeGoals: 2, awayGoals: 0 };
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/matches/${matchId}/result`,
          payload: resultBody,
          headers: json,
          cookies: { sid },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: `/api/v1/matches/${matchId}/result`,
          payload: resultBody,
          headers: json,
          cookies: { sid },
        })
      ).statusCode,
    ).toBe(200);

    // Ép thẻ (upgrade)
    const [bronzeCard] = await testDb()
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.rarity, 'bronze'))
      .orderBy(asc(cards.id))
      .limit(1);
    const [targetPc, matPc] = await testDb()
      .insert(playerCards)
      .values([
        { userId, cardId: bronzeCard!.id, source: 'pack', acquiredAt: clock.now() },
        { userId, cardId: bronzeCard!.id, source: 'pack', acquiredAt: clock.now() },
      ])
      .returning({ id: playerCards.id });
    const upRes = await app.inject({
      method: 'POST',
      url: `/api/v1/player-cards/${targetPc!.id}/upgrade`,
      payload: { materialId: String(matPc!.id) },
      headers: { ...json, 'idempotency-key': randomUUID() },
      cookies: { sid },
    });
    expect(upRes.statusCode).toBe(200);

    // Nhận nhiệm vụ đã hoàn thành (mission_claim)
    const missionsRes = await app.inject({
      method: 'GET',
      url: '/api/v1/missions/today',
      cookies: { sid },
    });
    const claimable = (missionsRes.json().data as { code: string; progress: number; target: number }[]).find(
      (m) => m.progress >= m.target,
    );
    expect(claimable).toBeDefined();
    const claimRes = await app.inject({
      method: 'POST',
      url: `/api/v1/missions/${claimable!.code}/claim`,
      payload: {},
      headers: json,
      cookies: { sid },
    });
    expect(claimRes.statusCode).toBe(200);

    // Đăng nhập lại (login)
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'theo_doi', password: 'mat-khau-dai' },
      headers: json,
    });
    expect(loginRes.statusCode).toBe(200);

    const rows = await testDb()
      .select({ name: analyticsEvents.name })
      .from(analyticsEvents)
      .where(eq(analyticsEvents.userId, userId))
      .orderBy(asc(analyticsEvents.id));
    const counts = rows.reduce<Record<string, number>>((acc, r) => {
      acc[r.name] = (acc[r.name] ?? 0) + 1;
      return acc;
    }, {});

    expect(counts).toEqual({
      register: 1,
      session_seen: 2,
      pack_open: 1,
      match_start: 1,
      match_end: 1,
      upgrade: 1,
      mission_claim: 1,
      login: 1,
    });
  });

  it('tính D1/D7 đúng qua 3 nhóm ngày đăng ký; giữ cookie không cần login ngày 7 vẫn tính D7', async () => {
    // Nhóm 1 (2026-10-01): 4 người chơi
    clock.set('2026-10-01T10:00:00+07:00');
    const c1a = await signup('c1_a');
    const c1b = await signup('c1_b');
    const c1c = await signup('c1_c');
    await signup('c1_d');

    // Ngày 2 (2026-10-02): c1_a (chỉ dùng cookie cũ) và c1_b quay lại → D1 = 2/4 = 0.5
    clock.set('2026-10-02T09:00:00+07:00');
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid: c1a.sid } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid: c1b.sid } })).statusCode).toBe(200);

    // Nhóm 2 (2026-10-05): 2 người chơi
    clock.set('2026-10-05T14:00:00+07:00');
    const c2a = await signup('c2_a');
    await signup('c2_b');

    // Ngày 2 của Nhóm 2 (2026-10-06): 1 người quay lại → D1 = 1/2 = 0.5
    clock.set('2026-10-06T20:00:00+07:00');
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid: c2a.sid } })).statusCode).toBe(200);

    // Ngày 8 của Nhóm 1 (2026-10-08): c1_a (còn cookie, KHÔNG login) & c1_c quay lại → D7 = 2/4 = 0.5
    // Đồng thời tạo Nhóm 3 (2026-10-08): 1 admin mới đăng ký ngay hôm nay → D1 = null, D7 = null
    clock.set('2026-10-08T11:00:00+07:00');
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid: c1a.sid } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid: c1c.sid } })).statusCode).toBe(200);

    const admin = await signup('admin_user');
    await makeAdmin(admin.userId);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/retention',
      cookies: { sid: admin.sid },
    });
    expect(res.statusCode).toBe(200);
    const data = RetentionResponse.parse(res.json()).data;
    expect(data).toEqual([
      { cohortDay: '2026-10-01', registered: 4, d1: 0.5, d7: 0.5 },
      { cohortDay: '2026-10-05', registered: 2, d1: 0.5, d7: null },
      { cohortDay: '2026-10-08', registered: 1, d1: null, d7: null },
    ]);

    // Kiểm tra lọc from/to
    const filtered = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/retention?from=2026-10-02&to=2026-10-06',
      cookies: { sid: admin.sid },
    });
    expect(filtered.statusCode).toBe(200);
    expect(RetentionResponse.parse(filtered.json()).data).toEqual([
      { cohortDay: '2026-10-05', registered: 2, d1: 0.5, d7: null },
    ]);

    // Kiểm tra lọc ?days=4 theo app.clock.now() (2026-10-08 -> 2026-10-05..2026-10-08)
    const byDays = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/retention?days=4',
      cookies: { sid: admin.sid },
    });
    expect(byDays.statusCode).toBe(200);
    expect(RetentionResponse.parse(byDays.json()).data).toEqual([
      { cohortDay: '2026-10-05', registered: 2, d1: 0.5, d7: null },
      { cohortDay: '2026-10-08', registered: 1, d1: null, d7: null },
    ]);
  });
});

describe('GET /api/v1/admin/onboarding', () => {
  it('chặn 401/403 và validate query; trả null khi chưa ai vào trận', async () => {
    const anon = await app.inject({ method: 'GET', url: '/api/v1/admin/onboarding' });
    expect(anon.statusCode).toBe(401);
    expect(errorCode(anon)).toBe('unauthenticated');

    const user = await signup('tan_thu_1');
    const forbidden = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/onboarding',
      cookies: { sid: user.sid },
    });
    expect(forbidden.statusCode).toBe(403);
    expect(errorCode(forbidden)).toBe('forbidden');

    await makeAdmin(user.userId);
    const empty = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/onboarding?days=7',
      cookies: { sid: user.sid },
    });
    expect(empty.statusCode).toBe(200);
    expect(OnboardingStatsResponse.parse(empty.json()).data).toEqual({
      from: '2026-09-25',
      to: '2026-10-01',
      totalRegistered: 1,
      completedUsers: 0,
      withinTargetUsers: 0,
      medianSeconds: null,
      p90Seconds: null,
    });
  });

  it('tính trung vị register -> match_start chính xác bằng FakeClock, bỏ qua user chưa đá', async () => {
    // 3 user đăng ký ở các mốc khác nhau, thời gian tới trận đầu lần lượt: 45s, 90s, 150s → median = 90s
    clock.set('2026-10-01T10:00:00+07:00');
    const u1 = await signup('fast_user');
    clock.advance(45 * 1000);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/matches',
          payload: { difficulty: 'easy' },
          headers: json,
          cookies: { sid: u1.sid },
        })
      ).statusCode,
    ).toBe(201);
    // Trận thứ 2 sau 300s không làm thay đổi thời gian tới trận ĐẦU TIÊN
    clock.advance(300 * 1000);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/matches',
          payload: { difficulty: 'easy' },
          headers: json,
          cookies: { sid: u1.sid },
        })
      ).statusCode,
    ).toBe(201);

    clock.set('2026-10-01T11:00:00+07:00');
    const u2 = await signup('mid_user');
    clock.advance(90 * 1000);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/matches',
          payload: { difficulty: 'easy' },
          headers: json,
          cookies: { sid: u2.sid },
        })
      ).statusCode,
    ).toBe(201);

    clock.set('2026-10-02T09:00:00+07:00');
    const u3 = await signup('slow_user');
    clock.advance(150 * 1000);
    expect(
      (
        await app.inject({
          method: 'POST',
          url: '/api/v1/matches',
          payload: { difficulty: 'easy' },
          headers: json,
          cookies: { sid: u3.sid },
        })
      ).statusCode,
    ).toBe(201);

    // User thứ 4 đăng ký nhưng chưa từng vào trận (admin cũng chưa vào trận)
    const admin = await signup('onboard_admin');
    await makeAdmin(admin.userId);

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/onboarding?from=2026-10-01&to=2026-10-02',
      cookies: { sid: admin.sid },
    });
    expect(res.statusCode).toBe(200);
    const stats = OnboardingStatsResponse.parse(res.json()).data;
    expect(stats).toEqual({
      from: '2026-10-01',
      to: '2026-10-02',
      totalRegistered: 4,
      completedUsers: 3,
      withinTargetUsers: 2,
      medianSeconds: 90,
      p90Seconds: 138,
    });

    // Lọc chỉ ngày 2026-10-01: chỉ gồm u1 (45s) và u2 (90s) → trung vị = 67.5s
    const day1Res = await app.inject({
      method: 'GET',
      url: '/api/v1/admin/onboarding?from=2026-10-01&to=2026-10-01',
      cookies: { sid: admin.sid },
    });
    expect(day1Res.statusCode).toBe(200);
    expect(OnboardingStatsResponse.parse(day1Res.json()).data).toEqual({
      from: '2026-10-01',
      to: '2026-10-01',
      totalRegistered: 2,
      completedUsers: 2,
      withinTargetUsers: 2,
      medianSeconds: 67.5,
      p90Seconds: 85.5,
    });
  });
});
