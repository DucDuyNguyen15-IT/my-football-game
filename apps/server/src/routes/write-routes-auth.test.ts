// Task 7.3 — PRD §8: "mọi API thay đổi dữ liệu đều yêu cầu đăng nhập". Danh sách route lấy tự động
// từ Fastify (hook `onRoute`) nên route ghi mới thêm sau này tự vào diện kiểm.
import type { RouteOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ApiError } from '@pitch/shared';
import { buildApp } from '../app';
import { seedCards } from '../db/seed';
import { coinTransactions, playerCards, sessions, users } from '../db/schema';
import { FakeClock, resetTestData, testDb } from '../../test/helpers';

const WRITE_METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];

/**
 * Ngoại lệ DUY NHẤT: route ghi công khai để lấy phiên. Thêm route vào đây phải có lý do — mọi route
 * ghi khác bắt buộc có `requireAuth`.
 */
const PUBLIC_WRITE_ROUTES = [
  'POST /api/v1/auth/register',
  'POST /api/v1/auth/login',
  'POST /api/v1/auth/google',
];

const registered: { method: string; url: string }[] = [];
const onRoute = (route: RouteOptions) => {
  for (const method of [route.method].flat()) registered.push({ method, url: route.url });
};
// Bật mọi nhóm route tuỳ chọn (dev, Google) để không route ghi nào lọt khỏi danh sách.
const app = buildApp({
  db: testDb(),
  clock: new FakeClock(),
  rateLimit: false,
  enableDevRoutes: true,
  googleClientId: 'test-client.apps.googleusercontent.com',
  onRoute,
});
afterAll(() => app.close());

beforeAll(async () => {
  await resetTestData(testDb());
  await seedCards(testDb());
  await app.ready();
});

const key = (r: { method: string; url: string }) => `${r.method} ${r.url}`;
const writeRoutes = () => registered.filter((r) => WRITE_METHODS.includes(r.method));
const protectedRoutes = () => writeRoutes().filter((r) => !PUBLIC_WRITE_ROUTES.includes(key(r)));
/** Thay tham số đường dẫn bằng giá trị hợp lệ về hình thức. */
const concrete = (url: string) => url.replace(':code', 'pack1').replace(/:\w+/g, '1');

const call = (r: { method: string; url: string }, cookies?: Record<string, string>) =>
  app.inject({
    method: r.method as 'POST',
    url: concrete(r.url),
    payload: {},
    headers: {
      'content-type': 'application/json',
      'idempotency-key': '3f2b8c1e-7a4d-4e9b-9c55-0d1e2f3a4b5c',
    },
    ...(cookies && { cookies }),
  });

describe('mọi route ghi đều yêu cầu đăng nhập', () => {
  it('danh sách route lấy từ Fastify có đủ các route ghi đã biết', () => {
    const keys = writeRoutes().map(key);
    expect(keys).toEqual(
      expect.arrayContaining([
        'POST /api/v1/auth/logout',
        'POST /api/v1/packs/:code/open',
        'POST /api/v1/player-cards/sell',
        'POST /api/v1/player-cards/:id/upgrade',
        'PUT /api/v1/squad',
        'POST /api/v1/matches',
        'POST /api/v1/matches/:id/result',
        'POST /api/v1/dev/grant-coins',
      ]),
    );
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('ngoại lệ công khai chỉ gồm route /auth/* có thật', () => {
    const keys = writeRoutes().map(key);
    for (const pub of PUBLIC_WRITE_ROUTES) {
      expect(keys, `ngoại lệ ${pub} không còn tồn tại — gỡ khỏi danh sách`).toContain(pub);
      expect(pub).toMatch(/^POST \/api\/v1\/auth\//);
    }
    expect(protectedRoutes().length).toBe(keys.length - PUBLIC_WRITE_ROUTES.length);
  });

  it('không cookie → 401 unauthenticated với mọi route ghi (trừ ngoại lệ)', async () => {
    expect(protectedRoutes().length).toBeGreaterThan(0);
    for (const r of protectedRoutes()) {
      const res = await call(r);
      expect(res.statusCode, key(r)).toBe(401);
      expect(ApiError.parse(res.json()).error.code, key(r)).toBe('unauthenticated');
    }
  });

  it('cookie phiên bịa / rỗng → 401 với mọi route ghi (trừ ngoại lệ)', async () => {
    for (const r of protectedRoutes()) {
      for (const sid of ['khong-co-phien-nay', '', '1', "' or 1=1 --"]) {
        expect((await call(r, { sid })).statusCode, `${key(r)} sid=${sid}`).toBe(401);
      }
    }
  });

  it('các lần gọi chưa đăng nhập không để lại dữ liệu nào', async () => {
    for (const r of protectedRoutes()) await call(r);
    const db = testDb();
    expect(await db.select().from(users)).toHaveLength(0);
    expect(await db.select().from(sessions)).toHaveLength(0);
    expect(await db.select().from(playerCards)).toHaveLength(0);
    expect(await db.select().from(coinTransactions)).toHaveLength(0);
  });

  it('route đọc dữ liệu riêng của người chơi cũng cần đăng nhập', async () => {
    for (const url of ['/api/v1/me', '/api/v1/packs', '/api/v1/player-cards', '/api/v1/squad']) {
      expect(registered.map(key)).toContain(`GET ${url}`);
      expect((await app.inject({ method: 'GET', url })).statusCode, url).toBe(401);
    }
  });

  it('mặc định (không ENABLE_DEV_ROUTES) không có route /dev/*', async () => {
    const seen: string[] = [];
    const prod = buildApp({
      db: testDb(),
      rateLimit: false,
      onRoute: (r) => void seen.push(r.url),
    });
    await prod.ready();
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.filter((u) => u.includes('/dev/'))).toEqual([]);
    await prod.close();
  });
});
