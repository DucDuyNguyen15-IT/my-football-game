import { readFileSync } from 'node:fs';
import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ApiError, FORMATIONS, MeResponse, type Position } from '@pitch/shared';
import { STARTER_SQUAD } from '../config/economy';
import { CARDS_SEED_FILE, seedCards } from '../db/seed';
import { packBoxes, playerCards, squads, squadSlots, users } from '../db/schema';
import { createTestApp, resetTestData, testDb } from '../../test/helpers';

const { app } = createTestApp();
afterAll(() => app.close());

beforeEach(async () => {
  await resetTestData(testDb());
  await seedCards(testDb());
});

const register = (payload: object) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload,
    headers: { 'content-type': 'application/json' },
  });

const seed = JSON.parse(readFileSync(CARDS_SEED_FILE, 'utf8')) as {
  id: number;
  rarity: string;
  position: Position;
}[];

describe('STARTER_SQUAD (PRD §7.1)', () => {
  it('11 thẻ Đồng khác nhau: 1 TM, 3 HV, 4 TV, 3 TĐ; ô đá chính đúng vị trí trong 2-3-1', () => {
    const cards = STARTER_SQUAD.slots.map(([slot, id]) => ({
      slot,
      card: seed.find((c) => c.id === id)!,
    }));
    expect(new Set(cards.map((c) => c.card.id)).size).toBe(11);
    expect(cards.every((c) => c.card.rarity === 'bronze')).toBe(true);
    const count = (p: Position) => cards.filter((c) => c.card.position === p).length;
    expect([count('GK'), count('DF'), count('MF'), count('FW')]).toEqual([1, 3, 4, 3]);
    const roles = FORMATIONS[STARTER_SQUAD.formation] as Record<string, Position>;
    for (const { slot, card } of cards) {
      if (slot in roles) expect(card.position).toBe(roles[slot]);
    }
    expect(cards.filter((c) => c.slot.startsWith('B'))).toHaveLength(4);
  });
});

describe('POST /auth/register', () => {
  it('201 + cookie; nhận đúng 11 thẻ, hộp 58/30/10/2, 1 gói 5 miễn phí, đội hình xếp sẵn', async () => {
    const res = await register({ username: 'Moi_Vao', password: 'mat-khau-dai' });
    expect(res.statusCode).toBe(201);
    const me = MeResponse.parse(res.json()).data;
    expect(me).toMatchObject({ username: 'Moi_Vao', coins: 0, freePack5Credits: 1 });
    const sid = res.cookies.find((c) => c.name === 'sid')!.value;
    const meRes = await app.inject({ method: 'GET', url: '/api/v1/me', cookies: { sid } });
    expect(meRes.statusCode).toBe(200);

    const db = testDb();
    const userId = Number(me.id);
    const owned = await db.select().from(playerCards).where(eq(playerCards.userId, userId));
    expect(owned).toHaveLength(11);
    expect(owned.every((c) => c.source === 'starter' && c.level === 0)).toBe(true);
    expect(owned.map((c) => c.cardId).sort((a, b) => a - b)).toEqual(
      STARTER_SQUAD.slots.map(([, id]) => id as number).sort((a, b) => a - b),
    );

    const [box] = await db.select().from(packBoxes).where(eq(packBoxes.userId, userId));
    expect(box).toMatchObject({
      bronzeLeft: 58,
      silverLeft: 30,
      goldLeft: 10,
      legendLeft: 2,
      cycle: 1,
    });

    const [squad] = await db.select().from(squads).where(eq(squads.userId, userId));
    expect(squad!.formation).toBe('2-3-1');
    const slots = await db.select().from(squadSlots).where(eq(squadSlots.userId, userId));
    expect(slots).toHaveLength(11);
    const cardOf = new Map(owned.map((c) => [c.id, c.cardId]));
    for (const [slot, cardId] of STARTER_SQUAD.slots) {
      const s = slots.find((x) => x.slot === slot)!;
      expect(cardOf.get(s.playerCardId)).toBe(cardId);
    }
  });

  it('trùng tên (khác hoa thường) → 409 username_taken, không tạo dữ liệu thừa', async () => {
    expect((await register({ username: 'trung_ten', password: 'mat-khau-dai' })).statusCode).toBe(
      201,
    );
    const res = await register({ username: 'TRUNG_TEN', password: 'mat-khau-khac' });
    expect(res.statusCode).toBe(409);
    expect(ApiError.parse(res.json()).error.code).toBe('username_taken');
    const db = testDb();
    expect(await db.select().from(users)).toHaveLength(1);
    expect(await db.select().from(playerCards)).toHaveLength(11);
    expect(await db.select().from(packBoxes)).toHaveLength(1);
    expect(await db.select().from(squadSlots)).toHaveLength(11);
  });

  it('username/password sai định dạng → 400 validation_error', async () => {
    for (const body of [
      { username: 'ab', password: 'mat-khau-dai' },
      { username: 'co dau cach', password: 'mat-khau-dai' },
      { username: 'hop_le', password: 'ngan' },
      { username: 'hop_le', password: 'mat-khau-dai', email: 'khong-phai-email' },
    ]) {
      const res = await register(body);
      expect(res.statusCode).toBe(400);
      expect(ApiError.parse(res.json()).error.code).toBe('validation_error');
    }
    expect(await testDb().select().from(users)).toHaveLength(0);
  });

  it('đăng nhập lại được bằng tài khoản vừa tạo', async () => {
    await register({ username: 'quay_lai', password: 'mat-khau-dai' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { username: 'quay_lai', password: 'mat-khau-dai' },
      headers: { 'content-type': 'application/json' },
    });
    expect(res.statusCode).toBe(200);
  });
});
