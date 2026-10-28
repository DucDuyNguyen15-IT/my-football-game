import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  ApiError,
  effectiveStats,
  SquadResponse,
  StartMatchResponse,
  type Card,
  type Squad,
} from '@pitch/shared';
import { readSeedCards, seedCards } from '../db/seed';
import { matches } from '../db/schema';
import { CPU_TARGET_OVR, startersAverageOvr } from '../domain/match-teams';
import { hashMatchToken } from '../services/matches';
import { createTestApp, resetTestData, testDb } from '../../test/helpers';

const { app } = createTestApp();
afterAll(() => app.close());

beforeEach(async () => {
  await resetTestData(testDb());
  await seedCards(testDb());
});

const json = { 'content-type': 'application/json' };
const catalog = new Map<string, Card>(readSeedCards().map((c) => [c.id, c]));

async function signup(username = 'nguoi_choi'): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, password: 'mat-khau-dai' },
    headers: json,
  });
  expect(res.statusCode).toBe(201);
  return res.cookies.find((c) => c.name === 'sid')!.value;
}

async function getSquad(sid: string): Promise<Squad> {
  const res = await app.inject({ method: 'GET', url: '/api/v1/squad', cookies: { sid } });
  return SquadResponse.parse(res.json()).data;
}

async function putSquad(sid: string, body: object): Promise<void> {
  const res = await app.inject({
    method: 'PUT',
    url: '/api/v1/squad',
    payload: body,
    headers: json,
    cookies: { sid },
  });
  expect(res.statusCode).toBe(200);
}

const start = (sid: string | undefined, payload: object) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/matches',
    payload,
    headers: json,
    ...(sid && { cookies: { sid } }),
  });

describe('POST /api/v1/matches', () => {
  it('cần đăng nhập; độ khó sai → 400', async () => {
    expect((await start(undefined, { difficulty: 'easy' })).statusCode).toBe(401);
    const sid = await signup();
    expect((await start(sid, { difficulty: 'legend' })).statusCode).toBe(400);
  });

  it('đội khởi đầu vào trận: 201, chỉ số = công thức shared, lưu trận started + hash token', async () => {
    const sid = await signup();
    const res = await start(sid, { difficulty: 'easy' });
    expect(res.statusCode).toBe(201);
    const m = StartMatchResponse.parse(res.json()).data;
    expect(m.rewardEligible).toBe(false);
    expect(m.token).toMatch(/^[\w-]{43}$/);
    expect(m.home.formation).toBe('2-3-1');
    expect(m.home.players).toHaveLength(11);
    for (const p of m.home.players) {
      const card = catalog.get(p.cardId!)!;
      expect(p.position).toBe(card.position);
      expect(p.stats).toEqual(effectiveStats(card, 0));
    }
    expect(Math.abs(startersAverageOvr(m.away) - CPU_TARGET_OVR.easy)).toBeLessThanOrEqual(3);

    const [row] = await testDb()
      .select()
      .from(matches)
      .where(eq(matches.id, Number(m.matchId)));
    expect(row).toMatchObject({
      status: 'started',
      difficulty: 'easy',
      seed: m.seed,
      rewardEligible: false,
      tokenHash: hashMatchToken(m.token),
      reward: 0,
      outcome: null,
    });
    expect(row!.tokenHash).not.toContain(m.token);
    expect(row!.squadSnapshot).toEqual({ formation: '2-3-1', home: m.home, away: m.away });
  });

  it('máy Khó: OVR TB ±3 quanh 78; mỗi trận token + seed mới', async () => {
    const sid = await signup();
    const a = StartMatchResponse.parse((await start(sid, { difficulty: 'hard' })).json()).data;
    const b = StartMatchResponse.parse((await start(sid, { difficulty: 'hard' })).json()).data;
    for (const m of [a, b]) {
      expect(Math.abs(startersAverageOvr(m.away) - CPU_TARGET_OVR.hard)).toBeLessThanOrEqual(3);
    }
    expect(a.token).not.toBe(b.token);
    expect(a.matchId).not.toBe(b.matchId);
  });

  it('sai vị trí + dự bị: chỉ số trong response áp phạt 15% đúng công thức shared', async () => {
    const sid = await signup();
    const s = await getSquad(sid);
    // Đổi hậu vệ P1 ↔ tiền đạo P6 (2-3-1: P1 = DF, P6 = FW).
    await putSquad(sid, {
      formation: s.formation,
      slots: { ...s.slots, P1: s.slots.P6, P6: s.slots.P1 },
    });
    const m = StartMatchResponse.parse((await start(sid, { difficulty: 'easy' })).json()).data;
    const p1 = m.home.players.find((p) => p.slot === 'P1')!;
    const card = catalog.get(p1.cardId!)!;
    expect(card.position).toBe('FW');
    expect(p1.stats).toEqual(effectiveStats(card, 0, 'DF'));
  });

  it('đội thiếu thủ môn → 422 invalid_squad nêu rõ, không tạo trận', async () => {
    const sid = await signup();
    const s = await getSquad(sid);
    await putSquad(sid, { formation: s.formation, slots: { ...s.slots, GK: null } });
    const res = await start(sid, { difficulty: 'easy' });
    expect(res.statusCode).toBe(422);
    const err = ApiError.parse(res.json()).error;
    expect(err.code).toBe('invalid_squad');
    expect(err.message).toContain('thủ môn');
    expect(err.details).toEqual([{ field: 'slots.GK', message: 'Ô đá chính đang trống' }]);
    expect(await testDb().select().from(matches)).toHaveLength(0);
  });

  it('thiếu người đá chính (đủ GK) → 422 nêu số người và ô trống', async () => {
    const sid = await signup();
    const s = await getSquad(sid);
    await putSquad(sid, { formation: s.formation, slots: { ...s.slots, P3: null, P6: null } });
    const err = ApiError.parse((await start(sid, { difficulty: 'hard' })).json()).error;
    expect(err.code).toBe('invalid_squad');
    expect(err.message).toContain('2 người đá chính');
    expect(err.message).toContain('P3, P6');
  });
});
