import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError } from '@pitch/shared';
import { seedCards } from '../db/seed';
import { createTestApp, createUser, FakeClock, resetTestData, testDb } from '../../test/helpers';

// Cookie thiết bị quen `did` (SEC-13a): người lạ không khoá được chủ tài khoản ở thiết bị quen.
const GOOD = { username: 'tester_1', password: 'dung-mat-khau' };
const BAD = { username: 'tester_1', password: 'sai-mat-khau' };

const { app } = createTestApp(new FakeClock());
afterAll(() => app.close());

beforeEach(async () => {
  await resetTestData(testDb());
  await seedCards(testDb());
  await createUser(testDb(), 'Tester_1', 'dung-mat-khau');
  await createUser(testDb(), 'Tester_2', 'mat-khau-hai');
});

const login = (body: object, did?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: body,
    headers: { 'content-type': 'application/json' },
    ...(did ? { cookies: { did } } : {}),
  });
const didOf = (res: { cookies: { name: string; value: string }[] }) =>
  res.cookies.find((c) => c.name === 'did')!.value;
const errorCode = (res: { json: () => unknown }) => ApiError.parse(res.json()).error.code;
const strangerLocks = async () => {
  for (let i = 0; i < 5; i++) await login(BAD);
  expect(errorCode(await login(GOOD))).toBe('login_locked');
};

describe('cookie thiết bị quen did (SEC-13a)', () => {
  it('đăng nhập đúng đặt did: httpOnly, SameSite=Lax, Secure, path /api/v1/auth, ~1 năm', async () => {
    const c = (await login(GOOD)).cookies.find((x) => x.name === 'did')!;
    expect(c).toMatchObject({
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
      path: '/api/v1/auth',
    });
    expect(c.maxAge).toBe(365 * 24 * 60 * 60);
  });

  it('đăng ký cũng đặt did', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: 'nguoi_moi', password: 'mat-khau-moi-1', acceptTerms: true },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(201);
    expect(didOf(res)).toBeTruthy();
  });

  it('người lạ khoá tài khoản; chủ có did + đúng mật khẩu vẫn vào được', async () => {
    const did = didOf(await login(GOOD));
    await strangerLocks();
    expect((await login(GOOD)).statusCode).toBe(429);
    expect((await login(GOOD, did)).statusCode).toBe(200);
  });

  it('thiết bị quen sai 5 lần → khoá nhánh thiết bị (kể cả đúng mật khẩu), người lạ không bị ảnh hưởng', async () => {
    const did = didOf(await login(GOOD));
    for (let i = 0; i < 5; i++) expect((await login(BAD, did)).statusCode).toBe(401);
    expect(errorCode(await login(GOOD, did))).toBe('login_locked');
    expect((await login(GOOD)).statusCode).toBe(200); // nhánh người lạ chưa bị khoá
  });

  it('did giả, sửa chữ ký, hoặc của user khác → đường khoá thường', async () => {
    const did = didOf(await login(GOOD));
    const other = didOf(await login({ username: 'tester_2', password: 'mat-khau-hai' }));
    await strangerLocks();
    const forged = `${did.slice(0, -2)}${did.endsWith('AA') ? 'BB' : 'AA'}`;
    for (const bad of ['rac', forged, other, `2.${did.split('.').slice(1).join('.')}`]) {
      expect((await login(GOOD, bad)).statusCode).toBe(429);
    }
  });

  it('30 request song song mang did chỉ kiểm mật khẩu 5 lần (A-1)', async () => {
    const did = didOf(await login(GOOD));
    const codes = (await Promise.all(Array.from({ length: 30 }, () => login(BAD, did)))).map(
      (r) => r.statusCode,
    );
    expect(codes.filter((c) => c === 401)).toHaveLength(5);
    expect(codes.filter((c) => c === 429)).toHaveLength(25);
  });
});
