import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { ROOM_CODE_ALPHABET, type PvpServerMessage } from '@pitch/shared';
import { FakeClock, createUser, resetTestData, testDb } from '../../../test/helpers';
import { cards, matches, playerCards, squadSlots, squads } from '../../db/schema';
import { seedCards } from '../../db/seed';
import { gameDay } from '../../domain/rewards';
import { cryptoRng } from '../../domain/rng';
import { createAccount } from '../auth';
import { loadCardCatalog, type CardCatalog } from '../cards';
import { countRewardedMatches } from '../matches';
import { PvpHub, ROOM_TTL_MS, type HubConn } from './hub';
import { generateRoomCode } from './rooms';
import type { TimeSource } from './ticker';

const db = testDb();
const TICK_MS = 1000 / 60;

class FakeTime implements TimeSource {
  t = 0;
  now() {
    return this.t;
  }
  after() {
    return () => {};
  }
}

class FakeConn implements HubConn {
  msgs: PvpServerMessage[] = [];
  closedWith: number | null = null;
  lastPongAt = 0;
  constructor(readonly userId: number) {}
  send(m: PvpServerMessage) {
    this.msgs.push(m);
  }
  close(code: number) {
    this.closedWith = code;
  }
  ping() {}
  terminate() {}
  of<T extends PvpServerMessage['t']>(t: T) {
    return this.msgs.filter((m): m is Extract<PvpServerMessage, { t: T }> => m.t === t);
  }
}

async function waitUntil(fn: () => boolean, ms = 2000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!fn()) {
    if (Date.now() >= deadline) throw new Error('waitUntil timed out');
    await new Promise<void>((r) => setTimeout(r, 5));
  }
}

let time: FakeTime;
let clock: FakeClock;
let catalog: CardCatalog;
let hub: PvpHub;
let annId: number;
let bobId: number;
let caraId: number;

beforeEach(async () => {
  await resetTestData(db);
  await seedCards(db);
  catalog = await loadCardCatalog(db);
  time = new FakeTime();
  clock = new FakeClock('2026-03-10T12:00:00Z');
  hub = new PvpHub({
    db,
    clock,
    rng: cryptoRng,
    time,
    cardCatalog: async () => catalog,
    dev: { halfLengthSec: 10, autopilot: true },
  });
  annId = (await createAccount(db, { username: 'ann', passwordHash: 'h' }, clock.now())).id;
  bobId = (await createAccount(db, { username: 'bob', passwordHash: 'h' }, clock.now())).id;
  caraId = (await createAccount(db, { username: 'cara', passwordHash: 'h' }, clock.now())).id;
});
afterAll(() => hub?.stop());

describe('Phòng PvP (T024–T025)', () => {
  it('mã phòng 6 ký tự thuộc bảng chữ an toàn, không chứa 0/O/1/I', () => {
    const existing = new Map();
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode(cryptoRng, existing);
      expect(code).toHaveLength(6);
      expect(code).not.toMatch(/[0O1I]/);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it('tạo phòng, vào phòng, trả lỗi room_not_found / self_join / room_full / room_expired / busy', async () => {
    const ca = new FakeConn(annId);
    const cb = new FakeConn(bobId);
    const cc = new FakeConn(caraId);
    hub.addConn(ca);
    hub.addConn(cb);
    hub.addConn(cc);

    // Chưa có phòng → room_not_found
    hub.handle(cb, { t: 'room_join', code: 'ZZZZZZ' });
    expect(cb.of('error').at(-1)).toEqual({ t: 'error', code: 'room_not_found' });

    // Chủ phòng tạo phòng → nhận room_created
    hub.handle(ca, { t: 'room_create' });
    await waitUntil(() => ca.of('room_created').length >= 1);
    const created = ca.of('room_created')[0]!;
    expect(created.code).toHaveLength(6);

    // Tự vào phòng mình → self_join
    hub.handle(ca, { t: 'room_join', code: created.code });
    expect(ca.of('error').at(-1)).toEqual({ t: 'error', code: 'self_join' });

    // Tab 2 của chủ phòng tạo/vào phòng khác → busy (A1)
    const ca2 = new FakeConn(annId);
    hub.handle(ca2, { t: 'room_create' });
    expect(ca2.of('error').at(-1)).toEqual({ t: 'error', code: 'busy' });

    // Hết hạn sau 10 phút → room_expired
    time.t += ROOM_TTL_MS;
    hub.handle(cb, { t: 'room_join', code: created.code });
    expect(cb.of('error').at(-1)).toEqual({ t: 'error', code: 'room_expired' });
    expect(hub.rooms.size).toBe(0);

    // Tạo phòng mới, B vào thành công, C vào sau → room_full
    hub.handle(ca, { t: 'room_create' });
    await waitUntil(() => ca.of('room_created').length >= 2);
    const code2 = ca.of('room_created')[1]!.code;
    hub.handle(cb, { t: 'room_join', code: code2 });
    hub.handle(cc, { t: 'room_join', code: code2 });
    expect(cc.of('error').at(-1)).toEqual({ t: 'error', code: 'room_full' });
    await waitUntil(() => ca.of('matched').length >= 1 && cb.of('matched').length >= 1);

    const ma = ca.of('matched')[0]!;
    const mb = cb.of('matched')[0]!;
    expect(ma.kind).toBe('friendly');
    expect(ma.side).toBe('home');
    expect(ma.opponent.username).toBe('bob');
    expect(mb.side).toBe('away');
    expect(mb.opponent.username).toBe('ann');
    expect(ma.setup.humans).toEqual(['home', 'away']);
    expect(ma.setup.halfLengthSec).toBe(10);
    expect(ma.setup.autopilot).toBe(true);
  });

  it('đội hình thiếu người hoặc GK không phải thủ môn → invalid_squad khi tạo/vào phòng', async () => {
    // Thiếu cầu thủ đá chính (chỉ tạo user không có squad)
    const brokenId = (await createUser(db, 'broken')).id;
    const cBroken = new FakeConn(brokenId);
    hub.addConn(cBroken);
    hub.handle(cBroken, { t: 'room_create' });
    await waitUntil(() => cBroken.of('error').length >= 1);
    expect(cBroken.of('error').at(-1)).toEqual({ t: 'error', code: 'invalid_squad' });

    // Ô GK đặt thẻ không phải GK
    const [fwCard] = await db.select().from(cards).where(eq(cards.position, 'FW')).limit(1);
    const [ownedFw] = await db
      .insert(playerCards)
      .values({ userId: bobId, cardId: fwCard!.id, source: 'pack', acquiredAt: clock.now() })
      .returning({ id: playerCards.id });
    await db
      .update(squadSlots)
      .set({ playerCardId: ownedFw!.id })
      .where(and(eq(squadSlots.userId, bobId), eq(squadSlots.slot, 'GK')));

    const ca = new FakeConn(annId);
    const cb = new FakeConn(bobId);
    hub.addConn(ca);
    hub.addConn(cb);
    hub.handle(ca, { t: 'room_create' });
    await waitUntil(() => ca.of('room_created').length >= 1);
    const code = ca.of('room_created')[0]!.code;
    hub.handle(cb, { t: 'room_join', code });
    await waitUntil(() => cb.of('error').length >= 1);
    expect(cb.of('error').at(-1)).toEqual({ t: 'error', code: 'invalid_squad' });
    // Phòng vẫn waiting để người khác có thể vào
    expect(hub.rooms.get(code)?.status).toBe('waiting');
  });

  it('chủ phòng rời bằng room_leave hoặc đóng socket thì phòng đóng', async () => {
    const ca = new FakeConn(annId);
    const cb = new FakeConn(bobId);
    hub.addConn(ca);
    hub.addConn(cb);

    hub.handle(ca, { t: 'room_create' });
    await waitUntil(() => ca.of('room_created').length >= 1);
    const code1 = ca.of('room_created')[0]!.code;
    hub.handle(ca, { t: 'room_leave' });
    hub.handle(cb, { t: 'room_join', code: code1 });
    expect(cb.of('error').at(-1)).toEqual({ t: 'error', code: 'room_not_found' });

    hub.handle(ca, { t: 'room_create' });
    await waitUntil(() => ca.of('room_created').length >= 2);
    const code2 = ca.of('room_created')[1]!.code;
    hub.onClosed(ca);
    hub.handle(cb, { t: 'room_join', code: code2 });
    expect(cb.of('error').at(-1)).toEqual({ t: 'error', code: 'room_not_found' });
  });

  it('trận friendly đá hết giờ: reward = 0, rewardReason = friendly, không tính giới hạn ngày (FR-022)', async () => {
    const ca = new FakeConn(annId);
    const cb = new FakeConn(bobId);
    hub.addConn(ca);
    hub.addConn(cb);

    hub.handle(ca, { t: 'room_create' });
    await waitUntil(() => ca.of('room_created').length >= 1);
    const code = ca.of('room_created')[0]!.code;
    hub.handle(cb, { t: 'room_join', code });
    await waitUntil(() => ca.of('matched').length >= 1 && cb.of('matched').length >= 1);

    const pvpId = ca.of('matched')[0]!.pvpId;
    const sess = hub.session(pvpId)!;
    hub.handle(ca, { t: 'ready' });
    hub.handle(cb, { t: 'ready' });

    for (let i = 0; i < Math.ceil(3000 / TICK_MS); i++) {
      time.t += TICK_MS;
      hub.ticker.pump();
    }
    for (let i = 0; i < 30_000 && !sess.done; i++) {
      time.t += TICK_MS;
      hub.ticker.pump();
      const t = sess.state.tick;
      if (t > 0 && t % 60 === 0) {
        const h = sess.serverHashes.get(t);
        if (h !== undefined) {
          hub.handle(ca, { t: 'hash', tick: t, h });
          hub.handle(cb, { t: 'hash', tick: t, h });
        }
      }
    }
    expect(sess.done).toBe(true);
    await sess.finish('full_time');

    const endA = ca.of('end')[0]!;
    const endB = cb.of('end')[0]!;
    expect([endA.home, endA.away]).toEqual([endB.home, endB.away]);
    expect(endA.you).toMatchObject({ reward: 0, rewardReason: 'friendly' });
    expect(endB.you).toMatchObject({ reward: 0, rewardReason: 'friendly' });
    expect(await countRewardedMatches(db, annId, gameDay(clock.now()))).toBe(0);
    expect(await countRewardedMatches(db, bobId, gameDay(clock.now()))).toBe(0);

    // Xoá squad không ảnh hưởng test khác (đảm bảo dùng import squads)
    expect((await db.select().from(squads)).length).toBeGreaterThan(0);
    expect((await db.select().from(matches)).every((m) => m.mode === 'pvp_friendly')).toBe(true);
  }, 60_000);
});
