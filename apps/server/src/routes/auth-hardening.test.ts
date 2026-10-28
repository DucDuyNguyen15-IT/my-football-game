import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, MeResponse, PlayerCardsResponse, SquadResponse } from '@pitch/shared';
import { buildApp } from '../app';
import { seedCards } from '../db/seed';
import { sessions, users } from '../db/schema';
import { LOGIN_LOCK_MS, SESSION_TTL_MS } from '../services/auth';
import { createTestApp, createUser, FakeClock, resetTestData, testDb } from '../../test/helpers';

const MINUTE = 60_000;
const JSON_HEADERS = { 'content-type': 'application/json' };
const GOOD = { username: 'tester_1', password: 'dung-mat-khau' };
const BAD = { username: 'tester_1', password: 'sai-mat-khau' };

const { app, clock } = createTestApp(new FakeClock(), { enableDevRoutes: true });
afterAll(() => app.close());

beforeEach(async () => {
  await resetTestData(testDb());
  await seedCards(testDb()); // danh mục thẻ được nạp một lần ở onReady — phải có trước request đầu
  await createUser(testDb(), 'Tester_1', 'dung-mat-khau');
});

type App = ReturnType<typeof buildApp>;
const login = (body: object, a: App = app, remoteAddress = '127.0.0.1') =>
  a.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: body,
    headers: JSON_HEADERS,
    remoteAddress,
  });
const sidOf = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.find((c) => c.name === 'sid')!.value;
const get = (url: string, sid: string, a: App = app) =>
  a.inject({ method: 'GET', url, cookies: { sid } });
const errorCode = (res: { json: () => unknown }) => ApiError.parse(res.json()).error.code;

describe('khoá đăng nhập (PRD §8, F8)', () => {
  it('5 lần sai → lần 6 bị khoá kể cả đúng mật khẩu; sau 15 phút đăng nhập được', async () => {
    for (let i = 0; i < 5; i++) {
      const res = await login(BAD);
      expect(res.statusCode).toBe(401);
      expect(errorCode(res)).toBe('invalid_credentials');
    }
    const locked = await login(GOOD);
    expect(locked.statusCode).toBe(429);
    expect(errorCode(locked)).toBe('login_locked');
    expect(locked.headers['retry-after']).toBe(String(LOGIN_LOCK_MS / 1000));
    expect(locked.cookies).toHaveLength(0);

    clock.advance(5 * MINUTE);
    const still = await login(GOOD);
    expect(still.statusCode).toBe(429);
    expect(still.headers['retry-after']).toBe(String(10 * 60));

    clock.advance(10 * MINUTE);
    const ok = await login(GOOD);
    expect(ok.statusCode).toBe(200);
    const [u] = await testDb().select().from(users).where(eq(users.username, 'Tester_1'));
    expect(u).toMatchObject({
      failedLoginCount: 0,
      failedLoginWindowStart: null,
      lockedUntil: null,
    });
  });

  it('lần sai cách nhau hơn 15 phút không cộng dồn', async () => {
    for (let i = 0; i < 4; i++) expect((await login(BAD)).statusCode).toBe(401);
    clock.advance(15 * MINUTE);
    expect((await login(BAD)).statusCode).toBe(401);
    expect((await login(GOOD)).statusCode).toBe(200);
  });

  it('đăng nhập đúng đặt lại bộ đếm', async () => {
    for (let i = 0; i < 4; i++) await login(BAD);
    expect((await login(GOOD)).statusCode).toBe(200);
    for (let i = 0; i < 4; i++) await login(BAD);
    expect((await login(GOOD)).statusCode).toBe(200);
  });

  it('khoá theo tài khoản: tài khoản khác vẫn đăng nhập được', async () => {
    await createUser(testDb(), 'Tester_2', 'mat-khau-hai');
    for (let i = 0; i < 5; i++) await login(BAD);
    expect((await login({ username: 'tester_2', password: 'mat-khau-hai' })).statusCode).toBe(200);
  });
});

describe('phiên', () => {
  it('đăng nhập dọn phiên đã hết hạn trong DB', async () => {
    await login(GOOD);
    clock.advance(SESSION_TTL_MS + MINUTE);
    const res = await login(GOOD);
    const rows = await testDb().select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.expiresAt.getTime()).toBeGreaterThan(clock.now().getTime());
    expect((await get('/api/v1/me', sidOf(res))).statusCode).toBe(200);
  });

  it('đăng xuất → cookie cũ không dùng được; đăng nhập lại → thẻ, xu, đội hình giữ nguyên', async () => {
    const reg = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: 'Giu_Do', password: 'mat-khau-giu-do' },
      headers: JSON_HEADERS,
    });
    expect(reg.statusCode).toBe(201);
    const sid = sidOf(reg);
    const grant = await app.inject({
      method: 'POST',
      url: '/api/v1/dev/grant-coins',
      payload: { amount: 1234 },
      headers: JSON_HEADERS,
      cookies: { sid },
    });
    expect(grant.statusCode).toBe(200);

    const snapshot = async (s: string) => ({
      me: MeResponse.parse((await get('/api/v1/me', s)).json()).data,
      cards: PlayerCardsResponse.parse((await get('/api/v1/player-cards', s)).json()).data,
      squad: SquadResponse.parse((await get('/api/v1/squad', s)).json()).data,
    });
    const before = await snapshot(sid);
    expect(before.me.coins).toBe(1234);
    expect(before.cards.length).toBeGreaterThanOrEqual(11);

    const out = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: {},
      headers: JSON_HEADERS,
      cookies: { sid },
    });
    expect(out.statusCode).toBe(204);
    expect((await get('/api/v1/me', sid)).statusCode).toBe(401);
    expect((await get('/api/v1/player-cards', sid)).statusCode).toBe(401);

    const again = await login({ username: 'giu_do', password: 'mat-khau-giu-do' });
    expect(again.statusCode).toBe(200);
    const newSid = sidOf(again);
    expect(newSid).not.toBe(sid);
    expect(await snapshot(newSid)).toEqual(before);
  });

  it('cookie phiên chỉ có Secure khi bật (production)', async () => {
    const plain = buildApp({ db: testDb(), clock, secureCookies: false, rateLimit: false });
    try {
      const res = await login(GOOD, plain);
      expect(res.cookies.find((c) => c.name === 'sid')!.secure).toBeFalsy();
    } finally {
      await plain.close();
    }
  });
});

describe('giới hạn tần suất (@fastify/rate-limit)', () => {
  const limited = () => buildApp({ db: testDb(), clock });

  it('/auth/* quá 10 request/phút/IP → 429 rate_limited + Retry-After; IP khác không bị ảnh hưởng', async () => {
    const a = limited();
    try {
      for (let i = 0; i < 10; i++) {
        expect((await login(BAD, a, '10.0.0.1')).statusCode).not.toBe(429);
        clock.advance(16 * MINUTE); // tránh khoá đăng nhập lẫn vào phép thử
      }
      const res = await login(GOOD, a, '10.0.0.1');
      expect(res.statusCode).toBe(429);
      expect(errorCode(res)).toBe('rate_limited');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      expect((await login(GOOD, a, '10.0.0.2')).statusCode).toBe(200);
    } finally {
      await a.close();
    }
  });

  it('quá 100 request/phút/người → 429; người khác không bị ảnh hưởng', async () => {
    await createUser(testDb(), 'Tester_2', 'mat-khau-hai');
    const a = limited();
    try {
      const sid1 = sidOf(await login(GOOD, a, '10.0.0.3'));
      const sid2 = sidOf(
        await login({ username: 'tester_2', password: 'mat-khau-hai' }, a, '10.0.0.4'),
      );
      for (let i = 0; i < 100; i++) expect((await get('/api/v1/me', sid1, a)).statusCode).toBe(200);
      const res = await get('/api/v1/me', sid1, a);
      expect(res.statusCode).toBe(429);
      expect(errorCode(res)).toBe('rate_limited');
      expect(res.headers['retry-after']).toBeDefined();
      expect((await get('/api/v1/me', sid2, a)).statusCode).toBe(200);
    } finally {
      await a.close();
    }
  });
});
