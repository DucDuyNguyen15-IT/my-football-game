import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, MeResponse } from '@pitch/shared';
import { sessions, users } from '../db/schema';
import { hashToken, SESSION_TTL_MS } from '../services/auth';
import { createTestApp, createUser, resetTestData, testDb } from '../../test/helpers';

const DAY = 24 * 60 * 60 * 1000;
const { app, clock } = createTestApp();
afterAll(() => app.close());

beforeEach(async () => {
  await resetTestData(testDb());
  await createUser(testDb(), 'Tester_1', 'dung-mat-khau');
});

const login = (body: object, headers: Record<string, string> = {}, cookies = {}) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: body,
    headers: { 'content-type': 'application/json', ...headers },
    cookies,
  });

async function loginOk(): Promise<string> {
  const res = await login({ username: 'tester_1', password: 'dung-mat-khau' });
  expect(res.statusCode).toBe(200);
  return res.cookies.find((c) => c.name === 'sid')!.value;
}

const me = (sid?: string) =>
  app.inject({ method: 'GET', url: '/api/v1/me', cookies: sid ? { sid } : {} });

describe('POST /auth/login', () => {
  it('đúng mật khẩu → Me + cookie phiên an toàn; DB chỉ giữ hash token', async () => {
    const res = await login({ username: 'TESTER_1', password: 'dung-mat-khau' });
    expect(res.statusCode).toBe(200);
    const body = MeResponse.parse(res.json());
    expect(body.data).toMatchObject({ username: 'Tester_1', coins: 0, freePack5Credits: 0 });

    const sid = res.cookies.find((c) => c.name === 'sid')!;
    expect(sid).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
    const rows = await testDb().select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(hashToken(sid.value));
    expect(rows[0]!.id).not.toContain(sid.value);
  });

  it('mật khẩu lưu dạng argon2id', async () => {
    const [u] = await testDb().select().from(users).where(eq(users.username, 'Tester_1'));
    expect(u!.passwordHash).toMatch(/^\$argon2id\$/);
  });

  it('sai mật khẩu hoặc không có user → 401 invalid_credentials, không cấp cookie', async () => {
    for (const body of [
      { username: 'tester_1', password: 'sai-mat-khau' },
      { username: 'khong_ai', password: 'dung-mat-khau' },
    ]) {
      const res = await login(body);
      expect(res.statusCode).toBe(401);
      expect(ApiError.parse(res.json()).error.code).toBe('invalid_credentials');
      expect(res.cookies).toHaveLength(0);
    }
  });

  it('body sai schema → 400 validation_error', async () => {
    const res = await login({ username: 'a', password: '' });
    expect(res.statusCode).toBe(400);
    expect(ApiError.parse(res.json()).error.code).toBe('validation_error');
  });

  it('đăng nhập lại trên cùng trình duyệt → xoay token, phiên cũ hết dùng', async () => {
    const first = await loginOk();
    const res = await login(
      { username: 'tester_1', password: 'dung-mat-khau' },
      {},
      { sid: first },
    );
    const second = res.cookies.find((c) => c.name === 'sid')!.value;
    expect(second).not.toBe(first);
    expect((await me(first)).statusCode).toBe(401);
    expect((await me(second)).statusCode).toBe(200);
  });
});

describe('GET /me', () => {
  it('không cookie hoặc cookie lạ → 401 unauthenticated', async () => {
    for (const sid of [undefined, 'token-bia']) {
      const res = await me(sid);
      expect(res.statusCode).toBe(401);
      expect(ApiError.parse(res.json()).error.code).toBe('unauthenticated');
    }
  });

  it('có phiên → Me đúng contract', async () => {
    const res = await me(await loginOk());
    expect(res.statusCode).toBe(200);
    expect(MeResponse.parse(res.json()).data.username).toBe('Tester_1');
  });

  it('phiên hết hạn sau 30 ngày không dùng', async () => {
    const sid = await loginOk();
    clock.advance(SESSION_TTL_MS + 1000);
    expect((await me(sid)).statusCode).toBe(401);
  });

  it('gia hạn trượt: dùng sau 2 ngày → hạn mới tính từ lúc đó', async () => {
    const sid = await loginOk();
    clock.advance(2 * DAY);
    const res = await me(sid);
    expect(res.cookies.find((c) => c.name === 'sid')?.value).toBe(sid);
    clock.advance(SESSION_TTL_MS - DAY);
    expect((await me(sid)).statusCode).toBe(200);
  });
});

describe('POST /auth/logout', () => {
  it('xoá phiên, cookie cũ hết dùng', async () => {
    const sid = await loginOk();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: {},
      headers: { 'content-type': 'application/json' },
      cookies: { sid },
    });
    expect(res.statusCode).toBe(204);
    expect(res.cookies.find((c) => c.name === 'sid')?.value).toBe('');
    expect((await me(sid)).statusCode).toBe(401);
    expect(await testDb().select().from(sessions)).toHaveLength(0);
  });

  it('chưa đăng nhập → 401', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      payload: {},
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('chặn CSRF cho request đổi dữ liệu', () => {
  const body = 'username=tester_1&password=dung-mat-khau';

  it('thiếu Content-Type JSON (form, text) → 415', async () => {
    for (const type of ['application/x-www-form-urlencoded', 'text/plain']) {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/login',
        payload: body,
        headers: { 'content-type': type },
      });
      expect(res.statusCode).toBe(415);
      expect(ApiError.parse(res.json()).error.code).toBe('validation_error');
    }
  });

  it('Origin khác host → 403 forbidden; Origin cùng host → cho qua', async () => {
    const creds = { username: 'tester_1', password: 'dung-mat-khau' };
    for (const origin of ['https://evil.example', 'null']) {
      const res = await login(creds, { origin, host: 'mfg.local' });
      expect(res.statusCode).toBe(403);
      expect(ApiError.parse(res.json()).error.code).toBe('forbidden');
    }
    const ok = await login(creds, { origin: 'https://mfg.local', host: 'mfg.local' });
    expect(ok.statusCode).toBe(200);
  });
});
