import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, SquadResponse, type Squad } from '@pitch/shared';
import { seedCards } from '../db/seed';
import { playerCards, squadSlots } from '../db/schema';
import { createTestApp, resetTestData, testDb } from '../../test/helpers';

const { app } = createTestApp();
afterAll(() => app.close());

beforeEach(async () => {
  await resetTestData(testDb());
  await seedCards(testDb());
});

const json = { 'content-type': 'application/json' };
const PASSWORD = 'mat-khau-dai';

async function signup(username = 'nguoi_choi'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, password: PASSWORD },
    headers: json,
  });
  expect(res.statusCode).toBe(201);
  return res.cookies.find((c) => c.name === 'sid')!.value;
}

async function openFreePack(sid: string): Promise<string[]> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/packs/pack5/open',
    payload: { payment: 'free_credit' },
    headers: { ...json, 'idempotency-key': randomUUID() },
    cookies: { sid },
  });
  expect(res.statusCode).toBe(200);
  return (res.json().data.cards as { id: string }[]).map((c) => c.id);
}

async function getSquad(sid: string): Promise<Squad> {
  const res = await app.inject({ method: 'GET', url: '/api/v1/squad', cookies: { sid } });
  expect(res.statusCode).toBe(200);
  return SquadResponse.parse(res.json()).data;
}

const put = (sid: string, body: object) =>
  app.inject({
    method: 'PUT',
    url: '/api/v1/squad',
    payload: body,
    headers: json,
    cookies: { sid },
  });

const errorCode = (res: { json(): unknown }) => ApiError.parse(res.json()).error.code;

describe('GET /api/v1/squad', () => {
  it('cần đăng nhập', async () => {
    expect((await app.inject({ method: 'GET', url: '/api/v1/squad' })).statusCode).toBe(401);
  });

  it('đội khởi đầu: 2-3-1, 7 chính + 4 dự bị, đúng vị trí, không cảnh báo', async () => {
    const squad = await getSquad(await signup());
    expect(squad.formation).toBe('2-3-1');
    expect(Object.values(squad.slots).filter(Boolean)).toHaveLength(11);
    expect(squad.slots.B5).toBeNull();
    expect(squad.warnings).toEqual([]);
    expect(squad.teamRating).toBeGreaterThan(40);
  });
});

describe('PUT /api/v1/squad', () => {
  it('đổi chỗ thủ môn ↔ hậu vệ → cảnh báo sai vị trí, rating giảm; đăng nhập lại vẫn còn', async () => {
    const sid = await signup();
    const before = await getSquad(sid);
    const slots = { ...before.slots, GK: before.slots.P1, P1: before.slots.GK };
    const res = await put(sid, { formation: '2-3-1', slots });
    expect(res.statusCode).toBe(200);
    const saved = SquadResponse.parse(res.json()).data;
    expect(saved.warnings.map((w) => [w.code, w.slot])).toEqual([
      ['misposition', 'GK'],
      ['misposition', 'P1'],
    ]);
    expect(saved.teamRating).toBeLessThan(before.teamRating);

    const login = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'nguoi_choi', password: PASSWORD },
      headers: json,
    });
    const sid2 = login.cookies.find((c) => c.name === 'sid')!.value;
    expect(await getSquad(sid2)).toEqual(saved);
  });

  it('đổi sơ đồ + đưa thẻ mới vào dự bị, bỏ trống ô → cảnh báo thiếu người', async () => {
    const sid = await signup();
    const [fresh] = await openFreePack(sid);
    const before = await getSquad(sid);
    const res = await put(sid, {
      formation: '2-2-2',
      slots: { ...before.slots, GK: null, B5: fresh },
    });
    expect(res.statusCode).toBe(200);
    const saved = SquadResponse.parse(res.json()).data;
    expect(saved.formation).toBe('2-2-2');
    expect(saved.slots.GK).toBeNull();
    expect(saved.slots.B5).toBe(fresh);
    expect(saved.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['missing_starters', 'missing_gk']),
    );
  });

  it('thẻ của người khác → 404, đội hình không đổi', async () => {
    const a = await signup('nguoi_a');
    const b = await signup('nguoi_b');
    const [theirs] = await openFreePack(b);
    const before = await getSquad(a);
    const res = await put(a, { formation: '2-3-1', slots: { ...before.slots, B5: theirs } });
    expect(res.statusCode).toBe(404);
    expect(errorCode(res)).toBe('not_found');
    expect(await getSquad(a)).toEqual(before);
  });

  it('một thẻ ở hai ô → 422 invalid_squad', async () => {
    const sid = await signup();
    const before = await getSquad(sid);
    const res = await put(sid, {
      formation: '2-3-1',
      slots: { ...before.slots, B5: before.slots.GK },
    });
    expect(res.statusCode).toBe(422);
    expect(errorCode(res)).toBe('invalid_squad');
    expect(await getSquad(sid)).toEqual(before);
  });

  it('ô lạ hoặc sơ đồ lạ → 400', async () => {
    const sid = await signup();
    expect((await put(sid, { formation: '2-3-1', slots: { B6: null } })).statusCode).toBe(400);
    expect((await put(sid, { formation: '4-4-2', slots: {} })).statusCode).toBe(400);
  });

  it('lưu đội hình và bán chính thẻ đó song song → không 500, kết quả nhất quán', async () => {
    for (let round = 0; round < 3; round++) {
      await resetTestData(testDb());
      await seedCards(testDb());
      const sid = await signup();
      const [card] = await openFreePack(sid);
      const before = await getSquad(sid);
      const [putRes, sellRes] = await Promise.all([
        put(sid, { formation: '2-3-1', slots: { ...before.slots, B5: card } }),
        app.inject({
          method: 'POST',
          url: '/api/v1/player-cards/sell',
          payload: { playerCardIds: [card] },
          headers: json,
          cookies: { sid },
        }),
      ]);
      const codes = [putRes.statusCode, sellRes.statusCode];
      expect([
        [200, 409],
        [404, 200],
      ]).toContainEqual(codes);
      const db = testDb();
      const owned = await db
        .select()
        .from(playerCards)
        .where(eq(playerCards.id, Number(card)));
      const inSquad = await db
        .select()
        .from(squadSlots)
        .where(eq(squadSlots.playerCardId, Number(card)));
      if (sellRes.statusCode === 200) {
        expect(owned).toHaveLength(0);
        expect(inSquad).toHaveLength(0);
      } else {
        expect(owned).toHaveLength(1);
        expect(inSquad).toHaveLength(1);
      }
    }
  });
});
