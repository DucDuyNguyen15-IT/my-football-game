import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type TestUser } from '../../test/client';
import { seedCards } from '../db/seed';
import { createTestApp, resetTestData, testDb } from '../../test/helpers';

// T049 (A18): hook xác thực chạy ở preValidation, TRƯỚC upgrade; handler WS không bao giờ được gọi.
const HOST = 'game.test';
const db = testDb();
const { app } = createTestApp();
const api = apiClient(app);
let alice: TestUser;
let addConn: ReturnType<typeof vi.spyOn>;

const ws = (headers: Record<string, string>) =>
  app.injectWS('/api/v1/pvp/ws', { headers: { host: HOST, ...headers } });
const good = (u: TestUser) => ({ origin: `https://${HOST}`, cookie: `sid=${u.sid}` });

beforeAll(() => app.ready());
afterAll(() => app.close());
beforeEach(async () => {
  await resetTestData(db);
  await seedCards(db);
  alice = await api.signup('alice');
  addConn = vi.spyOn(app.pvp, 'addConn');
});

describe('WS PvP: xác thực trước upgrade', () => {
  it('cookie + Origin hợp lệ thì upgrade và handler chạy', async () => {
    const sock = await ws(good(alice));
    expect(addConn).toHaveBeenCalledTimes(1);
    sock.terminate();
  });

  it('thiếu Origin → 403, handler không chạy', async () => {
    await expect(ws({ cookie: `sid=${alice.sid}` })).rejects.toThrow('403');
    expect(addConn).not.toHaveBeenCalled();
  });

  it('Origin sai → 403', async () => {
    await expect(ws({ ...good(alice), origin: 'https://evil.test' })).rejects.toThrow('403');
    expect(addConn).not.toHaveBeenCalled();
  });

  it('chưa đăng nhập → 401', async () => {
    await expect(ws({ origin: `https://${HOST}` })).rejects.toThrow('401');
    expect(addConn).not.toHaveBeenCalled();
  });

  it('session đã thu hồi (đăng xuất) → 401', async () => {
    expect((await api.call(alice, 'POST', '/auth/logout', {})).statusCode).toBe(204);
    await expect(ws(good(alice))).rejects.toThrow('401');
    expect(addConn).not.toHaveBeenCalled();
  });
});
