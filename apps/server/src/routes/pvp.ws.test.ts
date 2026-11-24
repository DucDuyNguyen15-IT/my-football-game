import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { apiClient, type TestUser } from '../../test/client';
import { createTestApp, resetTestData, testDb } from '../../test/helpers';
import { seedCards } from '../db/seed';

// T021 (phần WebSocket) trên socket TCP thật (injectWS không phát sự kiện đóng phía server).
const db = testDb();
const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Client {
  ws: WebSocket;
  opened: Promise<void>;
  closed: Promise<number>;
  msgs: { t: string; code?: string }[];
}

function startApp(pvp: Parameters<typeof createTestApp>[1] = {}) {
  const { app } = createTestApp(undefined, pvp);
  const api = apiClient(app);
  let origin = '';
  const connect = (u: TestUser): Client => {
    // `headers` là mở rộng của undici (Origin/Cookie không đặt được bằng WebSocket chuẩn).
    const ws = new WebSocket(`${origin.replace('http', 'ws')}/api/v1/pvp/ws`, {
      headers: { origin, cookie: `sid=${u.sid}` },
    } as never);
    const msgs: Client['msgs'] = [];
    ws.addEventListener('message', (e) => msgs.push(JSON.parse(String(e.data))));
    return {
      ws,
      msgs,
      opened: new Promise((res, rej) => {
        ws.addEventListener('open', () => res());
        ws.addEventListener('error', () => rej(new Error('upgrade bị từ chối')));
      }),
      closed: new Promise((res) => ws.addEventListener('close', (e) => res(e.code))),
    };
  };
  return {
    app,
    api,
    connect,
    async start() {
      await app.listen({ port: 0, host: '127.0.0.1' });
      origin = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
    },
  };
}

describe('WS PvP', () => {
  const h = startApp({ pvp: { maxPerIp: 4 } });
  let alice: TestUser;
  const opened: Client[] = [];
  const open = async (u = alice) => {
    const c = h.connect(u);
    opened.push(c);
    await c.opened;
    return c;
  };

  beforeAll(() => h.start());
  afterAll(() => h.app.close());
  beforeEach(async () => {
    opened.splice(0).forEach((c) => c.ws.close());
    await delay(50);
    await resetTestData(db);
    await seedCards(db);
    alice = await h.api.signup('alice');
  });

  it('tin sai schema → error bad_message rồi đóng 4400', async () => {
    const c = await open();
    c.ws.send(JSON.stringify({ t: 'nope' }));
    expect(await c.closed).toBe(4400);
    expect(c.msgs).toEqual([{ t: 'error', code: 'bad_message' }]);
  });

  it('maxPayload 512 byte: tin lớn hơn bị đóng', async () => {
    const c = await open();
    c.ws.send('x'.repeat(600));
    expect(await c.closed).toBe(1009);
  });

  it('kết nối thứ 5 từ cùng IP bị từ chối', async () => {
    for (let i = 0; i < 4; i++) await open();
    const fifth = h.connect(alice);
    await expect(fifth.opened).rejects.toThrow();
    opened.push(fifth);
  });

  it('bufferedAmount > 256 KB thì đóng 4408 và xử như rớt mạng (xoá mục hàng chờ)', async () => {
    const c = await open();
    c.ws.send(JSON.stringify({ t: 'queue_join' }));
    await delay(100);
    expect(h.app.pvp.queue.size).toBe(1);
    const [server] = [...h.app.websocketServer.clients];
    Object.defineProperty(server, 'bufferedAmount', { get: () => 300_000 });
    c.ws.send(JSON.stringify({ t: 'room_create' })); // busy → server gửi → vượt ngưỡng
    expect(await c.closed).toBe(4408);
    expect(h.app.pvp.queue.size).toBe(0);
  });

  it('socket đóng thì mục hàng chờ bị xoá; chủ phòng waiting đóng socket thì phòng đóng', async () => {
    const q = await open();
    q.ws.send(JSON.stringify({ t: 'queue_join' }));
    await delay(100);
    expect(h.app.pvp.queue.size).toBe(1);
    q.ws.close();
    await q.closed;
    await delay(100);
    expect(h.app.pvp.queue.size).toBe(0);

    const host = await open();
    host.ws.send(JSON.stringify({ t: 'room_create' }));
    await delay(100);
    expect(host.msgs[0]?.t).toBe('room_created');
    expect(h.app.pvp.rooms.size).toBe(1);
    host.ws.close();
    await host.closed;
    await delay(100);
    expect(h.app.pvp.rooms.size).toBe(0);
  });

  it('đăng xuất đóng mọi WS PvP của user', async () => {
    const a = await open();
    const b = await open();
    expect((await h.api.call(alice, 'POST', '/auth/logout', {})).statusCode).toBe(204);
    expect(await Promise.all([a.closed, b.closed])).toEqual([4401, 4401]);
  });

  it('xoá tài khoản đóng mọi WS PvP của user', async () => {
    const a = await open();
    const res = await h.app.inject({
      method: 'DELETE',
      url: '/api/v1/me',
      cookies: { sid: alice.sid },
      headers: { 'content-type': 'application/json' },
      payload: { username: 'alice', password: 'mat-khau-dai' },
    });
    expect(res.statusCode).toBe(204);
    expect(await a.closed).toBe(4401);
  });
});

describe('WS PvP khi máy chủ bận', () => {
  const h = startApp({ pvp: { maxSessions: 0 } });
  beforeAll(async () => {
    await h.start();
    await resetTestData(db);
    await seedCards(db);
  });
  afterAll(() => h.app.close());

  it('queue_join khi quá PVP_MAX_SESSIONS → error server_busy', async () => {
    const user = await h.api.signup('busyuser');
    const c = h.connect(user);
    await c.opened;
    c.ws.send(JSON.stringify({ t: 'queue_join' }));
    await delay(100);
    expect(c.msgs).toEqual([{ t: 'error', code: 'server_busy' }]);
    c.ws.close();
  });
});
