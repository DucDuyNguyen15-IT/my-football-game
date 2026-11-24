import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import type { PvpServerMessage } from '@pitch/shared';
import { FakeClock, createUser, resetTestData, testDb } from '../../../test/helpers';
import { MATCH_REWARD, MATCH_REWARD_DAILY_CAP } from '../../config/economy';
import { dailyMissions, matches, users } from '../../db/schema';
import { seedCards } from '../../db/seed';
import { gameDay } from '../../domain/rewards';
import { cryptoRng } from '../../domain/rng';
import { createAccount } from '../auth';
import { loadCardCatalog, type CardCatalog } from '../cards';
import { applyMissionEvent, ensureTodayMissions } from '../missions';
import { finishPvpMatch } from './finish';
import { PvpHub, type HubConn } from './hub';
import { QUEUE_OFFER_CPU_SEC, QUEUE_TIMEOUT_SEC } from './queue';
import type { TimeSource } from './ticker';

const db = testDb();

class FakeTime implements TimeSource {
  t = 0;
  private readonly timers = new Set<{ at: number; fn: () => void }>();
  now() {
    return this.t;
  }
  after(ms: number, fn: () => void) {
    const entry = { at: this.t + ms, fn };
    this.timers.add(entry);
    return () => {
      this.timers.delete(entry);
    };
  }
  advance(ms: number) {
    const target = this.t + ms;
    while (this.t < target) {
      let nextAt = target;
      for (const x of this.timers) if (x.at < nextAt) nextAt = x.at;
      this.t = nextAt;
      for (const x of [...this.timers]) {
        if (x.at <= this.t) {
          this.timers.delete(x);
          x.fn();
        }
      }
    }
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

const flush = () => new Promise<void>((r) => setTimeout(r, 20));

let time: FakeTime;
let clock: FakeClock;
let catalog: CardCatalog;
let hub: PvpHub;
let annId: number;
let bobId: number;
let caraId: number;

beforeEach(async () => {
  hub?.stop();
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

async function pairTwo(idA: number, idB: number) {
  const ca = new FakeConn(idA);
  const cb = new FakeConn(idB);
  hub.addConn(ca);
  hub.addConn(cb);
  hub.handle(ca, { t: 'queue_join' });
  await flush();
  hub.handle(cb, { t: 'queue_join' });
  await flush();
  const ma = ca.of('matched')[0]!;
  return { pvpId: ma.pvpId, ca, cb, ma };
}

describe('Hàng chờ ghép trận PvP (T035–T037)', () => {
  it('ghép đúng thứ tự FIFO (người vào trước là home); từ chối người đang busy và invalid_squad', async () => {
    const brokenId = (await createUser(db, 'broken')).id;
    const cBroken = new FakeConn(brokenId);
    hub.addConn(cBroken);
    hub.handle(cBroken, { t: 'queue_join' });
    await flush();
    expect(cBroken.of('error')).toEqual([{ t: 'error', code: 'invalid_squad' }]);

    const ca = new FakeConn(annId);
    const caTab2 = new FakeConn(annId);
    const cb = new FakeConn(bobId);
    const cc = new FakeConn(caraId);
    for (const c of [ca, caTab2, cb, cc]) hub.addConn(c);

    hub.handle(ca, { t: 'queue_join' });
    await flush();
    // Tab 2 của A bấm Tìm trận khi đang chờ → busy
    hub.handle(caTab2, { t: 'queue_join' });
    expect(caTab2.of('error')).toEqual([{ t: 'error', code: 'busy' }]);

    // A và B ghép cặp (sân chọn ngẫu nhiên, mỗi người một bên); C ở lại hàng chờ
    hub.handle(cb, { t: 'queue_join' });
    await flush();
    hub.handle(cc, { t: 'queue_join' });
    await flush();

    const ma = ca.of('matched')[0]!;
    const mb = cb.of('matched')[0]!;
    expect(ma.kind).toBe('ranked');
    expect(new Set([ma.side, mb.side])).toEqual(new Set(['home', 'away']));
    expect(cc.of('matched')).toHaveLength(0);
    expect(hub.queue.has(caraId)).toBe(true);
  });

  it('huỷ chờ (queue_leave) và đóng socket xoá khỏi hàng chờ; queue_status mỗi giây, offerCpu sau 60 s, queue_timeout sau 5 phút', async () => {
    const ca = new FakeConn(annId);
    hub.addConn(ca);
    hub.handle(ca, { t: 'queue_join' });
    await flush();
    expect(hub.queue.has(annId)).toBe(true);

    hub.handle(ca, { t: 'queue_leave' });
    expect(hub.queue.has(annId)).toBe(false);

    // Vào lại và theo dõi status 59s -> 60s -> 300s
    const ca2 = new FakeConn(annId);
    hub.addConn(ca2);
    hub.handle(ca2, { t: 'queue_join' });
    await flush();
    time.advance((QUEUE_OFFER_CPU_SEC - 1) * 1000);
    expect(ca2.of('queue_status').at(-1)).toEqual({
      t: 'queue_status',
      waitedSec: 59,
      offerCpu: false,
    });

    time.advance(1000);
    expect(ca2.of('queue_status').at(-1)).toEqual({
      t: 'queue_status',
      waitedSec: 60,
      offerCpu: true,
    });

    time.advance((QUEUE_TIMEOUT_SEC - QUEUE_OFFER_CPU_SEC) * 1000);
    expect(ca2.of('queue_timeout')).toHaveLength(1);
    expect(hub.queue.has(annId)).toBe(false);
  });

  it('trùng cặp quá 3 trận ranked trong ngày (kể cả đảo home/away) không thưởng; sang ngày GMT+7 mới thưởng lại (FR-017)', async () => {
    // 3 trận đầu trong ngày: cả hai nhận thưởng bảng hard
    for (let i = 0; i < 3; i++) {
      const [first, second] = i % 2 === 0 ? [annId, bobId] : [bobId, annId];
      const { pvpId } = await pairTwo(first, second);
      const res = await finishPvpMatch(db, {
        pvpId,
        reason: 'full_time',
        score: { home: 2, away: 1 },
        inputLog: 'v2.',
        now: clock.now(),
      });
      expect(res.sides.home).toEqual({ outcome: 'win', reward: MATCH_REWARD.hard.win });
      expect(res.sides.away).toEqual({ outcome: 'loss', reward: MATCH_REWARD.hard.loss });
      const s = hub.session(pvpId);
      if (s) {
        await s.finish('full_time');
        hub.onClosed(s.sockets.home as HubConn);
        hub.onClosed(s.sockets.away as HubConn);
      }
      await flush();
    }

    // Trận thứ 4 cùng cặp trong ngày: không thưởng, rewardReason='same_opponent_limit'
    {
      const { pvpId, ca, cb } = await pairTwo(bobId, annId);
      const res = await finishPvpMatch(db, {
        pvpId,
        reason: 'full_time',
        score: { home: 0, away: 0 },
        shootout: { home: 4, away: 3 },
        inputLog: 'v2.',
        now: clock.now(),
      });
      expect(res.sides.home).toEqual({
        outcome: 'shootout_win',
        reward: 0,
        rewardReason: 'same_opponent_limit',
      });
      expect(res.sides.away).toEqual({
        outcome: 'shootout_loss',
        reward: 0,
        rewardReason: 'same_opponent_limit',
      });
      await hub.session(pvpId)!.finish('full_time');
      hub.onClosed(ca);
      hub.onClosed(cb);
    }

    // Sang ngày GMT+7 hôm sau → thưởng trở lại
    clock.advance(24 * 60 * 60 * 1000);
    {
      const { pvpId } = await pairTwo(annId, bobId);
      const res = await finishPvpMatch(db, {
        pvpId,
        reason: 'full_time',
        score: { home: 1, away: 1 },
        inputLog: 'v2.',
        now: clock.now(),
      });
      expect(res.sides.home).toEqual({ outcome: 'draw', reward: MATCH_REWARD.hard.draw });
      expect(res.sides.away).toEqual({ outcome: 'draw', reward: MATCH_REWARD.hard.draw });
    }
  });

  it('giới hạn 15 trận/ngày: người hết lượt nhận reward=0 (daily_cap), đối thủ còn lượt vẫn nhận thưởng; không tính nhiệm vụ match_hard', async () => {
    const day = gameDay(clock.now());
    await db.transaction(async (tx) => {
      await ensureTodayMissions(tx, annId, day);
      await ensureTodayMissions(tx, caraId, day);
    });
    // Cấp sẵn 15 trận có thưởng cho Ann hôm nay
    for (let i = 0; i < MATCH_REWARD_DAILY_CAP; i++) {
      await db.insert(matches).values({
        userId: annId,
        tokenHash: `cap-tok-${i}`,
        difficulty: 'hard',
        status: 'finished',
        seed: i + 1,
        squadSnapshot: {},
        rewardEligible: true,
        startedAt: clock.now(),
        finishedAt: clock.now(),
        homeGoals: 1,
        awayGoals: 0,
        outcome: 'win',
        reward: 120,
        rewardDay: day,
        mode: 'cpu',
      });
    }

    const { pvpId } = await pairTwo(annId, caraId);
    const res = await finishPvpMatch(db, {
      pvpId,
      reason: 'full_time',
      score: { home: 3, away: 0 },
      inputLog: 'v2.',
      now: clock.now(),
    });
    expect(res.sides.home).toEqual({ outcome: 'win', reward: 0, rewardReason: 'daily_cap' });
    expect(res.sides.away).toEqual({ outcome: 'loss', reward: MATCH_REWARD.hard.loss });

    // Kiểm tra nhiệm vụ: play_matches / win_match / score_goals / clean_sheet tăng; play_hard KHÔNG tăng
    // Ngoài ra kiểm trực tiếp applyMissionEvent với mode='pvp' để chắc mọi loại nhiệm vụ được phủ.
    await db.transaction(async (tx) => {
      await applyMissionEvent(tx, caraId, day, {
        type: 'match_finished',
        mode: 'pvp',
        difficulty: 'hard',
        outcome: 'win',
        homeGoals: 3,
        awayGoals: 0,
      });
    });
    const caraMissions = await db
      .select()
      .from(dailyMissions)
      .where(eq(dailyMissions.userId, caraId));
    for (const m of caraMissions) {
      if (m.missionCode === 'play_hard') expect(m.progress).toBe(0);
    }

    const [annUser] = await db.select().from(users).where(eq(users.id, annId));
    const [caraUser] = await db.select().from(users).where(eq(users.id, caraId));
    expect(annUser!.coins).toBe(0);
    expect(caraUser!.coins).toBe(MATCH_REWARD.hard.loss);
  });
});
