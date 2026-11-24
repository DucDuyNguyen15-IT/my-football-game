import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  NO_INPUT,
  cpuHardTeam,
  createMatch,
  replayMatch,
  replayToState,
  starterLikeTeam,
  stateHash,
  stepBoth,
} from '@pitch/sim';
import type { PvpServerMessage } from '@pitch/shared';
import { FakeClock, createUser, resetTestData, testDb } from '../../../test/helpers';
import { coinTransactions, matches, pvpMatches, users } from '../../db/schema';
import { gameDay } from '../../domain/rewards';
import { cryptoRng } from '../../domain/rng';
import { finishPvpMatch, forfeitScore } from './finish';
import { PvpHub, type HubConn } from './hub';
import { MAX_CATCHUP_TICKS, PvpTicker, type Tickable, type TimeSource } from './ticker';

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

let time: FakeTime;
let clock: FakeClock;
let hub: PvpHub;
let ids: number[];
beforeEach(async () => {
  await resetTestData(db);
  time = new FakeTime();
  clock = new FakeClock('2026-03-10T12:00:00Z');
  hub = new PvpHub({ db, clock, rng: cryptoRng, time, maxSessions: 2 });
  ids = [(await createUser(db, 'ann')).id, (await createUser(db, 'bob')).id];
});
afterAll(() => hub?.stop());

const player = (i: number, conn = new FakeConn(ids[i]!)) => ({
  userId: ids[i]!,
  username: i === 0 ? 'ann' : 'bob',
  team: i === 0 ? starterLikeTeam : cpuHardTeam,
  conn,
});

async function startPair(kind: 'ranked' | 'friendly' = 'ranked', autopilot = false) {
  const ca = new FakeConn(ids[0]!);
  const cb = new FakeConn(ids[1]!);
  const s = (await hub.createSession({
    kind,
    seed: 7,
    home: player(0, ca),
    away: player(1, cb),
    dev: { halfLengthSec: 10, autopilot },
  }))!;
  return { s, ca, cb };
}

/** Tua giờ giả theo từng tick và chạy vòng nhịp. */
function run(ms: number) {
  for (let i = 0; i < Math.ceil(ms / TICK_MS); i++) {
    time.t += TICK_MS;
    hub.ticker.pump();
  }
}

describe('PvpSession', () => {
  it('start có countdownMs=3000 và không có startAt; khung phát đúng thứ tự; input giữ tới khi đổi', async () => {
    const { ca, cb } = await startPair();
    hub.handle(ca, { t: 'ready' });
    expect(ca.of('start')).toHaveLength(0);
    hub.handle(cb, { t: 'ready' });
    for (const c of [ca, cb]) {
      expect(c.of('start')).toEqual([{ t: 'start', countdownMs: 3000 }]);
      expect('startAt' in c.of('start')[0]!).toBe(false);
    }
    run(2900);
    expect(ca.of('f')).toHaveLength(0); // còn đếm ngược
    run(300);
    hub.handle(ca, { t: 'input', c: 5 }); // gửi một lần, server giữ
    hub.handle(cb, { t: 'sub', out: 'away-ZZ', bench: 'B1' });
    expect(cb.of('error')).toEqual([{ t: 'error', code: 'sub_rejected' }]);
    run(200);
    const frames = ca.of('f').map((m) => m.f);
    frames.forEach((f, i) => expect(f[0]).toBe(i));
    expect(frames[0]).toEqual([0, 0, 0]);
    expect(frames.at(-1)).toEqual([frames.length - 1, 5, 0]); // input giữ, không cần gửi lại
    expect(frames.some((f) => f[1] === 5)).toBe(true);
    expect(cb.of('f')).toHaveLength(frames.length);
  });

  it('quy ước tick: khung mang tick TRƯỚC step (đầu tiên là 0); hash khoá theo state.tick SAU step; catchup.tick là khung cuối trong log', async () => {
    const { s, ca, cb } = await startPair();
    hub.handle(ca, { t: 'ready' });
    hub.handle(cb, { t: 'ready' });
    run(3000);
    run(TICK_MS * 130);
    const frames = ca.of('f').map((m) => m.f);
    expect(frames[0]![0]).toBe(0);
    // Hash lưu ở khoá 60, 120: state sau khi step khung 59 và 119.
    expect([...s.serverHashes.keys()]).toEqual([60, 120]);
    let ref = createMatch(s.setup);
    for (let i = 0; i < 60; i++) ref = stepBoth(ref, { home: NO_INPUT, away: NO_INPUT });
    expect(ref.tick).toBe(60);
    expect(s.serverHashes.get(60)).toBe(stateHash(ref));
    // rejoin: catchup.tick = tick của khung cuối trong log; khung kế tiếp là catchup.tick + 1.
    hub.onClosed(ca);
    const again = new FakeConn(ids[0]!);
    hub.handle(again, { t: 'rejoin', pvpId: s.pvpId });
    const cu = again.of('catchup')[0]!;
    expect(cu.tick).toBe(frames.length - 1);
    expect(replayToState(s.setup, cu.log).tick).toBe(cu.tick + 1);
    run(TICK_MS * 3);
    expect(again.of('f')[0]!.f[0]).toBe(cu.tick + 1);
  });

  it('kết thúc khi sim bóng tới full_time; tỉ số trong end bằng replayMatch trên input_log; cả hai nhận end', async () => {
    const { s, ca, cb } = await startPair('ranked', true);
    hub.handle(ca, { t: 'ready' });
    hub.handle(cb, { t: 'ready' });
    run(3000);
    for (let i = 0; i < 30_000 && !s.done; i++) run(TICK_MS);
    expect(s.done).toBe(true);
    await s.finish('full_time'); // idempotent: cùng promise
    const [row] = await db.select().from(pvpMatches);
    expect(row).toMatchObject({ status: 'finished', endReason: 'full_time' });
    const replay = replayMatch(s.setup, row!.inputLog!);
    expect(replay.phase).toBe('full_time');
    const end = ca.of('end')[0]!;
    expect(cb.of('end')).toHaveLength(1);
    expect([end.home, end.away]).toEqual([replay.score.home, replay.score.away]);
    expect([row!.homeGoals, row!.awayGoals]).toEqual([replay.score.home, replay.score.away]);
    expect(ca.of('f').at(-1)!.f[0]).toBe(replay.ticks - 1);
  }, 60_000);

  it('quá 30 s sau matched mà chưa đủ ready → void_not_ready, không ai bị xử thua, không thưởng', async () => {
    const { ca, cb, s } = await startPair();
    hub.handle(ca, { t: 'ready' });
    run(30_100);
    await s.finish('void_not_ready');
    const [row] = await db.select().from(pvpMatches);
    expect(row).toMatchObject({
      status: 'cancelled',
      endReason: 'void_not_ready',
      forfeitUserId: null,
    });
    const rows = await db.select().from(matches);
    expect(rows).toHaveLength(2);
    expect(
      rows.every((m) => m.status === 'expired' && m.reward === 0 && m.homeGoals === null),
    ).toBe(true);
    for (const c of [ca, cb]) {
      expect(c.of('end')[0]).toMatchObject({
        reason: 'void_not_ready',
        you: { reward: 0, rewardReason: 'void' },
      });
    }
  });

  it('quá PVP_MAX_SESSIONS → server_busy (cả createSession lẫn queue_join)', async () => {
    const extra = [(await createUser(db, 'c')).id, (await createUser(db, 'd')).id];
    await startPair();
    await hub.createSession({
      kind: 'ranked',
      seed: 1,
      home: {
        userId: extra[0]!,
        username: 'c',
        team: starterLikeTeam,
        conn: new FakeConn(extra[0]!),
      },
      away: { userId: extra[1]!, username: 'd', team: cpuHardTeam, conn: new FakeConn(extra[1]!) },
    });
    const late = [new FakeConn(ids[0]!), new FakeConn(ids[1]!)];
    expect(
      await hub.createSession({
        kind: 'ranked',
        seed: 2,
        home: player(0, late[0]),
        away: player(1, late[1]),
      }),
    ).toBeNull();
    expect(late[0]!.of('error')).toEqual([{ t: 'error', code: 'server_busy' }]);
    hub.handle(late[1]!, { t: 'queue_join' });
    expect(late[1]!.of('error')).toHaveLength(2);
  });

  it('một socket giữ mỗi user: socket thứ hai bị busy, rejoin cũng busy khi socket cũ còn sống', async () => {
    const { s, ca } = await startPair();
    const second = new FakeConn(ids[0]!);
    hub.handle(second, { t: 'queue_join' });
    hub.handle(second, { t: 'rejoin', pvpId: s.pvpId });
    expect(second.of('error')).toEqual([
      { t: 'error', code: 'busy' },
      { t: 'error', code: 'busy' },
    ]);
    expect(ca.closedWith).toBeNull(); // socket cũ không bị đóng
    hub.onClosed(ca);
    hub.handle(second, { t: 'rejoin', pvpId: s.pvpId });
    expect(second.of('catchup')).toHaveLength(1);
    hub.handle(second, { t: 'rejoin', pvpId: 999 });
    expect(second.of('error').at(-1)).toEqual({ t: 'error', code: 'not_in_match' });
  });

  it('socket đóng thì mục hàng chờ bị xoá; chủ phòng waiting đóng socket thì phòng đóng', () => {
    const q = new FakeConn(ids[0]!);
    hub.addConn(q);
    hub.handle(q, { t: 'queue_join' });
    expect(hub.queue.has(ids[0]!)).toBe(true);
    hub.onClosed(q);
    expect(hub.queue.size).toBe(0);

    const h = new FakeConn(ids[1]!);
    hub.addConn(h);
    hub.handle(h, { t: 'room_create' });
    expect(hub.rooms.size).toBe(1);
    hub.onClosed(h);
    expect(hub.rooms.size).toBe(0);
  });
});

describe('finishPvpMatch', () => {
  const finish = (pvpId: number, v: Partial<Parameters<typeof finishPvpMatch>[1]> = {}) =>
    finishPvpMatch(db, {
      pvpId,
      reason: 'full_time',
      score: { home: 2, away: 0 },
      inputLog: 'v2.',
      now: clock.now(),
      ...v,
    });
  const coins = async (i: number) =>
    (await db.select().from(users).where(eq(users.id, ids[i]!)))[0]!.coins;

  it('chạy hai lần chỉ thưởng một lần (FR-016); ranked thưởng như máy Khó', async () => {
    const { s } = await startPair();
    const [c0, c1] = [await coins(0), await coins(1)];
    const first = await finish(s.pvpId);
    const again = await finish(s.pvpId);
    expect(again.sides).toMatchObject({
      home: { outcome: 'win', reward: 120 },
      away: { outcome: 'loss', reward: 30 },
    });
    expect(first.sides.home.reward).toBe(120);
    expect(await coins(0)).toBe(c0 + 120);
    expect(await coins(1)).toBe(c1 + 30);
    expect(
      await db.select().from(coinTransactions).where(eq(coinTransactions.type, 'match_reward')),
    ).toHaveLength(2);
    expect(await db.select().from(matches)).toHaveLength(2);
  });

  it('dòng matches của đội khách đảo tỉ số/luân lưu và đủ seed, squad_snapshot, started_at, reward_day (A6)', async () => {
    const { s } = await startPair();
    await finish(s.pvpId, { score: { home: 1, away: 1 }, shootout: { home: 2, away: 4 } });
    const rows = await db.select().from(matches);
    const home = rows.find((m) => m.userId === ids[0])!;
    const away = rows.find((m) => m.userId === ids[1])!;
    expect(home).toMatchObject({
      outcome: 'shootout_loss',
      mode: 'pvp_ranked',
      opponentUserId: ids[1],
      difficulty: 'hard',
      rewardDay: gameDay(clock.now()),
      reward: 40,
    });
    expect(away).toMatchObject({
      outcome: 'shootout_win',
      homeGoals: 1,
      awayGoals: 1,
      opponentUserId: ids[0],
      seed: 7,
      reward: 90,
      status: 'finished',
    });
    expect(away.squadSnapshot).toMatchObject({
      formation: cpuHardTeam.formation,
      home: cpuHardTeam,
      away: starterLikeTeam,
    });
    expect(away.startedAt).toBeInstanceOf(Date);
  });

  it('xử thua: 3-0 cho người ở lại, kẻ bị xử thua 0 xu nhưng tốn suất trần', async () => {
    expect(forfeitScore({ home: 0, away: 1 }, 'away')).toEqual({ home: 3, away: 0 });
    expect(forfeitScore({ home: 5, away: 1 }, 'away')).toEqual({ home: 5, away: 1 });
    const { s } = await startPair();
    await finish(s.pvpId, {
      reason: 'forfeit_disconnect',
      forfeit: 'away',
      score: { home: 0, away: 1 },
    });
    const rows = await db.select().from(matches);
    expect(rows.find((m) => m.userId === ids[1])).toMatchObject({
      reward: 0,
      consumesDailyCap: true,
      homeGoals: 0,
      awayGoals: 3,
      outcome: 'loss',
    });
    expect(rows.find((m) => m.userId === ids[0])).toMatchObject({
      reward: 120,
      homeGoals: 3,
      outcome: 'win',
    });
  });

  it('friendly: reward 0, rewardReason friendly', async () => {
    const { s } = await startPair('friendly');
    const r = await finish(s.pvpId);
    expect(r.sides.home).toEqual({ outcome: 'win', reward: 0, rewardReason: 'friendly' });
    expect((await db.select().from(matches))[0]).toMatchObject({
      mode: 'pvp_friendly',
      rewardEligible: false,
    });
  });
});

describe('PvpTicker (bộ giữ nhịp)', () => {
  const make = () => {
    const t = new FakeTime();
    const skips: number[] = [];
    const ticker = new PvpTicker(t, (n) => skips.push(n));
    const seen: number[] = [];
    const s: Tickable = { done: false, onTick: (now) => void seen.push(now) };
    ticker.add(s);
    return { t, ticker, skips, seen };
  };

  it('trễ thì chạy bù tối đa 5 tick/lượt, trễ hơn thì bỏ nhịp và báo', () => {
    const { t, ticker, skips, seen } = make();
    t.t = 100; // trễ 7 tick
    ticker.pump();
    expect(seen).toHaveLength(MAX_CATCHUP_TICKS);
    expect(skips).toEqual([2]);
  });

  it('theo mốc tuyệt đối, không trôi: 1000 ms thật = 61 tick (0..60) dù pump rời rạc', () => {
    const { t, ticker, seen, skips } = make();
    for (let ms = 10; ms <= 1000; ms += 10) {
      t.t = ms;
      ticker.pump();
    }
    expect(skips).toEqual([]);
    expect(seen).toHaveLength(Math.floor(1000 / TICK_MS) + 1);
  });
});
