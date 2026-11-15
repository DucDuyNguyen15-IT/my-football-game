// Task 8.2 — Test hồi quy bảo mật: header bảo mật, bodyLimit, hết hạn match token 2 giờ, xoay phiên, thứ tự khoá squad, rate limit, giới hạn luân lưu.
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, MatchResultResponse, SquadResponse, StartMatchResponse } from '@pitch/shared';
import { BODY_LIMIT_BYTES, buildApp } from '../app';
import { MATCH_MAX_AGE_SEC, MATCH_MIN_DURATION_SEC } from '../config/economy';
import { seedCards } from '../db/seed';
import { matches, sessions } from '../db/schema';
import { createSession, hashToken, SESSION_RENEW_AFTER_MS } from '../services/auth';
import { createTestApp, FakeClock, resetTestData, testDb } from '../../test/helpers';

const clock = new FakeClock();
const { app } = createTestApp(clock);
afterAll(() => app.close());

beforeEach(async () => {
  clock.set('2026-01-01T00:00:00Z');
  await resetTestData(testDb());
  await seedCards(testDb());
  await app.ready();
});

const json = { 'content-type': 'application/json' };
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

describe('HTTP security headers & Cache-Control', () => {
  it('mọi response đều có header bảo mật; endpoint riêng tư dùng no-store, endpoint công khai giữ cache public', async () => {
    const { sid } = await signup();
    const meRes = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid } });
    const packsRes = await app.inject({ method: 'GET', url: '/api/v1/packs', cookies: { sid } });
    const loginRes = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'nguoi_choi', password: 'mat-khau-dai' },
      headers: json,
    });
    const cardsRes = await app.inject({ method: 'GET', url: '/api/v1/cards' });
    const economyRes = await app.inject({ method: 'GET', url: '/api/v1/config/economy' });

    for (const res of [meRes, packsRes, loginRes, cardsRes, economyRes]) {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['content-security-policy']).toBe(
        "default-src 'none'; frame-ancestors 'none'",
      );
    }

    expect(meRes.headers['cache-control']).toBe('no-store');
    expect(packsRes.headers['cache-control']).toBe('no-store');
    expect(cardsRes.headers['cache-control']).toBe('public, max-age=3600');
    expect(economyRes.headers['cache-control']).toBe('public, max-age=300');
  });
});

describe('giới hạn kích thước body (bodyLimit)', () => {
  it('từ chối payload JSON vượt 64 KiB với 400 validation_error', async () => {
    const oversized = JSON.stringify({
      username: 'nguoi_choi',
      password: 'x'.repeat(BODY_LIMIT_BYTES + 1024),
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: oversized,
      headers: json,
    });
    expect(res.statusCode).toBe(400);
    expect(errorCode(res)).toBe('validation_error');
  });
});

describe('hết hạn match token sau 2 giờ (ARCHITECTURE §5.2 #4)', () => {
  it('nộp sau quá 2 giờ → 422 match_token_invalid, xu giữ nguyên 0', async () => {
    const { sid, userId } = await signup();
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { difficulty: 'easy' },
      headers: json,
      cookies: { sid },
    });
    expect(startRes.statusCode).toBe(201);
    const m = StartMatchResponse.parse(startRes.json()).data;

    clock.advance(MATCH_MAX_AGE_SEC * 1000 + 1000);
    const submitRes = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/${m.matchId}/result`,
      payload: { token: m.token, homeGoals: 2, awayGoals: 0 },
      headers: json,
      cookies: { sid },
    });
    expect(submitRes.statusCode).toBe(422);
    expect(errorCode(submitRes)).toBe('match_token_invalid');

    const meRes = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid } });
    expect(meRes.json().data.coins).toBe(0);
    const [row] = await testDb()
      .select()
      .from(matches)
      .where(eq(matches.id, Number(m.matchId)));
    expect(row?.userId).toBe(userId);
    expect(row?.status).toBe('started');
  });

  it('bắt đầu trận mới sau 2 giờ tự chuyển trận cũ sang expired; trận cũ không nộp được nữa', async () => {
    const { sid } = await signup();
    const startA = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { difficulty: 'easy' },
      headers: json,
      cookies: { sid },
    });
    const mA = StartMatchResponse.parse(startA.json()).data;

    clock.advance(MATCH_MAX_AGE_SEC * 1000 + 1000);
    const startB = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { difficulty: 'easy' },
      headers: json,
      cookies: { sid },
    });
    expect(startB.statusCode).toBe(201);
    const mB = StartMatchResponse.parse(startB.json()).data;

    const [rowA] = await testDb()
      .select()
      .from(matches)
      .where(eq(matches.id, Number(mA.matchId)));
    expect(rowA?.status).toBe('expired');

    const submitA = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/${mA.matchId}/result`,
      payload: { token: mA.token, homeGoals: 1, awayGoals: 0 },
      headers: json,
      cookies: { sid },
    });
    expect(submitA.statusCode).toBe(422);
    expect(errorCode(submitA)).toBe('match_token_invalid');

    // Trận B vẫn nộp được bình thường sau 6 phút.
    clock.advance(6 * 60_000);
    const submitB = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/${mB.matchId}/result`,
      payload: { token: mB.token, homeGoals: 1, awayGoals: 0 },
      headers: json,
      cookies: { sid },
    });
    expect(submitB.statusCode).toBe(200);
    expect(MatchResultResponse.parse(submitB.json()).data.outcome).toBe('win');
  });
});

describe('xoay phiên khi đăng ký (POST /auth/register)', () => {
  it('đăng ký mới khi trình duyệt đang có cookie phiên cũ → xoá phiên cũ trong DB và 401 khi dùng lại', async () => {
    const first = await signup('user_a');
    const second = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: 'user_b', password: 'mat-khau-dai' },
      headers: json,
      cookies: { sid: first.sid },
    });
    expect(second.statusCode).toBe(201);
    const secondSid = second.cookies.find((c) => c.name === 'sid')!.value;
    expect(secondSid).not.toBe(first.sid);

    const oldSessionRows = await testDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, hashToken(first.sid)));
    expect(oldSessionRows).toHaveLength(0);

    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid: first.sid } })).statusCode).toBe(
      401,
    );
    expect((await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid: secondSid } })).statusCode).toBe(
      200,
    );
  });
});

describe('trần tỉ số luân lưu (MATCH_MAX_GOALS)', () => {
  it('từ chối shootout vượt quá 20 bàn mỗi đội với 422 match_token_invalid', async () => {
    const { sid } = await signup();
    const startRes = await app.inject({
      method: 'POST',
      url: '/api/v1/matches',
      payload: { difficulty: 'easy' },
      headers: json,
      cookies: { sid },
    });
    expect(startRes.statusCode).toBe(201);
    const m = StartMatchResponse.parse(startRes.json()).data;

    clock.advance(MATCH_MIN_DURATION_SEC * 1000 + 1000);
    const res = await app.inject({
      method: 'POST',
      url: `/api/v1/matches/${m.matchId}/result`,
      payload: { token: m.token, homeGoals: 1, awayGoals: 1, shootout: { home: 999, away: 0 } },
      headers: json,
      cookies: { sid },
    });
    expect(res.statusCode).toBe(422);
    expect(errorCode(res)).toBe('match_token_invalid');
  });
});

describe('thứ tự khoá PUT /squad (users → player_cards id ASC → squads)', () => {
  it('khoá users FOR UPDATE rồi player_cards ORDER BY id ASC FOR UPDATE rồi mới khoá squads FOR UPDATE', async () => {
    const { sid } = await signup();
    const getRes = await app.inject({ method: 'GET', url: '/api/v1/squad', cookies: { sid } });
    const squad = SquadResponse.parse(getRes.json()).data;
    const swapped = { ...squad.slots, P1: squad.slots.P6, P6: squad.slots.P1 };

    const lockQueries: string[] = [];
    const db = testDb();
    const origTx = db.transaction.bind(db);
    const chainMethods = new Set(['from', 'where', 'orderBy']);
    const wrapBuilder = (obj: object): object =>
      new Proxy(obj, {
        get(target, prop) {
          const val = Reflect.get(target, prop);
          if (prop === 'for' && typeof val === 'function') {
            return (...args: unknown[]) => {
              const res = val.apply(target, args) as { toSQL?: () => { sql: string } };
              if (typeof res?.toSQL === 'function') lockQueries.push(res.toSQL().sql.toLowerCase());
              return res;
            };
          }
          if (typeof val === 'function') {
            if (chainMethods.has(String(prop))) {
              return (...args: unknown[]) => wrapBuilder(val.apply(target, args) as object);
            }
            return val.bind(target);
          }
          return val;
        },
      });
    const tracedDb = new Proxy(db, {
      get(target, prop, receiver) {
        if (prop !== 'transaction') return Reflect.get(target, prop, receiver);
        return (cb: (tx: unknown) => Promise<unknown>, config?: unknown) =>
          origTx(async (tx) => {
            const origSelect = tx.select.bind(tx);
            const tracedTx = new Proxy(tx, {
              get(t, p, r) {
                if (p !== 'select') return Reflect.get(t, p, r);
                return (...args: unknown[]) => wrapBuilder(origSelect(...(args as [])));
              },
            });
            return cb(tracedTx);
          }, config as never);
      },
    });

    const tracedApp = buildApp({ db: tracedDb, clock, rateLimit: false });
    try {
      const putRes = await tracedApp.inject({
        method: 'PUT',
        url: '/api/v1/squad',
        payload: { formation: squad.formation, slots: swapped },
        headers: json,
        cookies: { sid },
      });
      expect(putRes.statusCode).toBe(200);
      expect(lockQueries).toHaveLength(3);
      expect(lockQueries[0]).toMatch(/from "users".*for update/);
      expect(lockQueries[1]).toMatch(/from "player_cards".*order by "player_cards"\."id" asc.*for update/);
      expect(lockQueries[2]).toMatch(/from "squads".*for update/);
    } finally {
      await tracedApp.close();
    }
  });
});

describe('rate limit trước khi truy vấn/ghi phiên lặp trong requireAuth', () => {
  it('request chưa đăng nhập (không cookie hoặc cookie giả) vượt 100 req/phút/IP bị chặn 429', async () => {
    const limited = buildApp({ db: testDb(), clock });
    try {
      for (let i = 0; i < 100; i++) {
        const res = await limited.inject({
          method: 'GET',
          url: '/api/v1/me',
          remoteAddress: '10.0.0.11',
          ...(i % 2 === 0 ? { cookies: { sid: 'sid-gia-mao' } } : {}),
        });
        expect(res.statusCode).toBe(401);
      }
      const blockedNoCookie = await limited.inject({
        method: 'GET',
        url: '/api/v1/me',
        remoteAddress: '10.0.0.11',
      });
      expect(blockedNoCookie.statusCode).toBe(429);
      expect(errorCode(blockedNoCookie)).toBe('rate_limited');
      expect(Number(blockedNoCookie.headers['retry-after'])).toBeGreaterThan(0);

      const blockedFakeSid = await limited.inject({
        method: 'GET',
        url: '/api/v1/me',
        remoteAddress: '10.0.0.11',
        cookies: { sid: 'sid-gia-mao' },
      });
      expect(blockedFakeSid.statusCode).toBe(429);
      expect(errorCode(blockedFakeSid)).toBe('rate_limited');

      const otherIp = await limited.inject({
        method: 'GET',
        url: '/api/v1/me',
        remoteAddress: '10.0.0.12',
      });
      expect(otherIp.statusCode).toBe(401);
    } finally {
      await limited.close();
    }
  });

  it('người dùng vượt 100 req/phút bị chặn 429 trước khi gia hạn phiên (không UPDATE sessions)', async () => {
    const { sid } = await signup();
    const [before] = await testDb()
      .select()
      .from(sessions)
      .where(eq(sessions.id, hashToken(sid)));
    expect(before).toBeDefined();

    const limited = buildApp({ db: testDb(), clock });
    try {
      for (let i = 0; i < 100; i++) {
        const ok = await limited.inject({
          method: 'GET',
          url: '/api/v1/me',
          cookies: { sid },
          remoteAddress: '10.0.0.21',
        });
        expect(ok.statusCode).toBe(200);
      }
      clock.advance(SESSION_RENEW_AFTER_MS + 1000);
      const blocked = await limited.inject({
        method: 'GET',
        url: '/api/v1/me',
        cookies: { sid },
        remoteAddress: '10.0.0.21',
      });
      expect(blocked.statusCode).toBe(429);
      expect(errorCode(blocked)).toBe('rate_limited');
      expect(blocked.cookies).toHaveLength(0);

      const [after] = await testDb()
        .select()
        .from(sessions)
        .where(eq(sessions.id, hashToken(sid)));
      expect(after!.expiresAt.getTime()).toBe(before!.expiresAt.getTime());
    } finally {
      await limited.close();
    }
  });

  it('đường dẫn mã hoá %xx (/api/v1/%61uth/login) vẫn bị tính vào giới hạn /auth theo IP (B2-01)', async () => {
    const limited = buildApp({ db: testDb(), clock });
    try {
      const login = (url: string) =>
        limited.inject({
          method: 'POST',
          url,
          remoteAddress: '10.0.0.31',
          payload: { username: 'khong_ton_tai', password: 'saimatkhau1' },
        });
      for (let i = 0; i < 10; i++) expect((await login('/api/v1/auth/login')).statusCode).toBe(401);
      const encoded = await login('/api/v1/%61uth/login');
      expect(encoded.statusCode).toBe(429);
      expect(errorCode(encoded)).toBe('rate_limited');
    } finally {
      await limited.close();
    }
  });

  it('POST /api/v1/auth/logout chỉ tính vào authLimit, không trừ thêm lượt userRateLimit', async () => {
    const { sid, userId } = await signup();
    const secondSession = await createSession(testDb(), userId, clock.now());

    const limited = buildApp({ db: testDb(), clock });
    try {
      for (let i = 0; i < 99; i++) {
        const res = await limited.inject({
          method: 'GET',
          url: '/api/v1/me',
          cookies: { sid },
          remoteAddress: '10.0.0.31',
        });
        expect(res.statusCode).toBe(200);
      }
      const logoutRes = await limited.inject({
        method: 'POST',
        url: '/api/v1/auth/logout',
        payload: {},
        headers: json,
        cookies: { sid: secondSession.token },
        remoteAddress: '10.0.0.31',
      });
      expect(logoutRes.statusCode).toBe(204);

      const lastAllowed = await limited.inject({
        method: 'GET',
        url: '/api/v1/me',
        cookies: { sid },
        remoteAddress: '10.0.0.31',
      });
      expect(lastAllowed.statusCode).toBe(200);

      const overLimit = await limited.inject({
        method: 'GET',
        url: '/api/v1/me',
        cookies: { sid },
        remoteAddress: '10.0.0.31',
      });
      expect(overLimit.statusCode).toBe(429);
    } finally {
      await limited.close();
    }
  });
});
