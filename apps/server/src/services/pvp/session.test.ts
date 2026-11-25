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
import type { PvpClientMessage, PvpServerMessage } from '@pitch/shared';
import { FakeClock, createUser, resetTestData, testDb } from '../../../test/helpers';
import { coinTransactions, matches, pvpMatches, users } from '../../db/schema';
import { gameDay } from '../../domain/rewards';
import { cryptoRng } from '../../domain/rng';
import { clampScore, finishPvpMatch, forfeitScore } from './finish';
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
  terminated = false;
  sid?: string;
  sessionExpiresAt?: number;
  ping() {}
  terminate() {
    this.terminated = true;
  }
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
    for (let i = 0; i < 30_000 && !s.done; i++) {
      run(TICK_MS);
      const t = s.state.tick;
      if (t > 0 && t % 60 === 0) {
        const h = s.serverHashes.get(t);
        if (h !== undefined) {
          hub.handle(ca, { t: 'hash', tick: t, h });
          hub.handle(cb, { t: 'hash', tick: t, h });
        }
      }
    }
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
    await new Promise((r) => setTimeout(r, 20));
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

describe('Thay người PvP (T040, T042)', () => {
  type BenchSlot = Extract<PvpClientMessage, { t: 'sub' }>['bench'];
  const asBench = (slot: string) => slot as BenchSlot;

  async function startLivePair() {
    const { s, ca, cb } = await startPair('ranked', true);
    hub.handle(ca, { t: 'ready' });
    hub.handle(cb, { t: 'ready' });
    run(3100);
    for (let i = 0; i < 600 && s.state.ballDead; i++) run(TICK_MS);
    expect(s.state.ballDead).toBe(false);
    return { s, ca, cb };
  }

  it('bóng lăn chỉ xếp chờ tới bóng chết; lệnh thứ hai của cùng đội thay lệnh đầu', async () => {
    const { s, ca } = await startLivePair();
    const out = s.state.players.filter((p) => p.team === 'home' && p.position !== 'GK');
    const bench = s.state.bench.home.filter((b) => b.position !== 'GK');
    expect(out.length).toBeGreaterThanOrEqual(2);
    expect(bench.length).toBeGreaterThanOrEqual(2);

    hub.handle(ca, { t: 'sub', out: out[0]!.id, bench: asBench(bench[0]!.slot) });
    run(TICK_MS * 2);
    expect(ca.of('error')).toEqual([]);
    expect(s.state.subsUsed.home).toBe(0);
    expect(ca.of('f').some((m) => (m.f[3]?.length ?? 0) > 0)).toBe(false);

    // Lệnh thứ hai thay thế lệnh đầu trước khi tới bóng chết.
    hub.handle(ca, { t: 'sub', out: out[1]!.id, bench: asBench(bench[1]!.slot) });
    s.state = { ...s.state, ballDead: true, restart: null };
    run(TICK_MS);

    expect(ca.of('error')).toEqual([]);
    expect(s.state.subsUsed.home).toBe(1);
    expect(s.state.players.some((p) => p.id === out[0]!.id)).toBe(true);
    expect(s.state.players.some((p) => p.id === out[1]!.id)).toBe(false);
    const subFrames = ca.of('f').filter((m) => (m.f[3]?.length ?? 0) > 0);
    expect(subFrames).toHaveLength(1);
    expect(subFrames[0]!.f[3]).toEqual([{ team: 'home', out: out[1]!.id, bench: bench[1]!.slot }]);
  });

  it('cấu trúc sai (không trên sân, sai GK, quá số lượt, luân lưu) bị sub_rejected ngay', async () => {
    const { s, ca } = await startLivePair();
    const out = s.state.players.filter((p) => p.team === 'home' && p.position !== 'GK');
    const bench = s.state.bench.home.filter((b) => b.position !== 'GK');
    const gk = s.state.players.find((p) => p.team === 'home' && p.position === 'GK')!;

    hub.handle(ca, { t: 'sub', out: 'home-NOT-REAL', bench: asBench(bench[0]!.slot) });
    expect(ca.of('error')).toHaveLength(1);

    hub.handle(ca, { t: 'sub', out: gk.id, bench: asBench(bench[0]!.slot) });
    expect(ca.of('error')).toHaveLength(2);

    // Dùng hết 3 lượt hợp lệ.
    for (let i = 0; i < 3; i++) {
      s.state = { ...s.state, ballDead: true, restart: null };
      hub.handle(ca, { t: 'sub', out: out[i]!.id, bench: asBench(bench[i]!.slot) });
      run(TICK_MS);
    }
    expect(s.state.subsUsed.home).toBe(3);
    expect(ca.of('error')).toHaveLength(2);

    // Lượt thứ 4 bị từ chối ngay.
    hub.handle(ca, { t: 'sub', out: out[3]!.id, bench: asBench(bench[3]!.slot) });
    expect(ca.of('error')).toHaveLength(3);
    expect(ca.of('error').every((e) => e.code === 'sub_rejected')).toBe(true);

    // Trong luân lưu cũng bị từ chối ngay dù chưa hết lượt.
    s.state = {
      ...s.state,
      subsUsed: { home: 0, away: 0 },
      shootout: {
        home: [],
        away: [],
        first: 'home',
        kicking: 'home',
        kickTick: null,
      },
    };
    hub.handle(ca, { t: 'sub', out: out[3]!.id, bench: asBench(bench[3]!.slot) });
    expect(ca.of('error')).toHaveLength(4);
  });

  it('cầu thủ nhận thẻ đỏ trong lúc chờ → sub_rejected muộn ở tick bóng chết và bỏ lệnh', async () => {
    const { s, ca } = await startLivePair();
    const out = s.state.players.find((p) => p.team === 'home' && p.position !== 'GK')!;
    const bench = s.state.bench.home.find((b) => b.position !== 'GK')!;

    hub.handle(ca, { t: 'sub', out: out.id, bench: asBench(bench.slot) });
    expect(ca.of('error')).toEqual([]);

    // Giả lập cầu thủ nhận thẻ đỏ (rời sân) trước khi tới bóng chết.
    s.state = {
      ...s.state,
      players: s.state.players.filter((p) => p.id !== out.id),
      ballDead: true,
      restart: null,
    };
    const prevFrames = ca.of('f').length;
    run(TICK_MS);

    expect(ca.of('error')).toEqual([{ t: 'error', code: 'sub_rejected' }]);
    expect(s.state.subsUsed.home).toBe(0);
    const emitted = ca.of('f')[prevFrames]!.f;
    expect(emitted[3]).toBeUndefined();
  });

  it('replayMatch trên input_log có thay người hai đội khớp hoàn toàn với sim bóng', async () => {
    const { s, ca, cb } = await startLivePair();
    const hOut = s.state.players.find((p) => p.team === 'home' && p.position !== 'GK')!;
    const hBench = s.state.bench.home.find((b) => b.position !== 'GK')!;
    const aOut = s.state.players.find((p) => p.team === 'away' && p.position !== 'GK')!;
    const aBench = s.state.bench.away.find((b) => b.position !== 'GK')!;

    hub.handle(ca, { t: 'sub', out: hOut.id, bench: asBench(hBench.slot) });
    hub.handle(cb, { t: 'sub', out: aOut.id, bench: asBench(aBench.slot) });

    for (let i = 0; i < 30_000 && !s.done; i++) {
      run(TICK_MS);
      const t = s.state.tick;
      if (t > 0 && t % 60 === 0) {
        const h = s.serverHashes.get(t);
        if (h !== undefined) {
          hub.handle(ca, { t: 'hash', tick: t, h });
          hub.handle(cb, { t: 'hash', tick: t, h });
        }
      }
    }
    expect(s.done).toBe(true);
    await s.finish('full_time');

    expect(ca.of('error')).toEqual([]);
    expect(cb.of('error')).toEqual([]);
    expect(s.state.subsUsed).toEqual({ home: 1, away: 1 });

    const [row] = await db.select().from(pvpMatches);
    const replay = replayMatch(s.setup, row!.inputLog!);
    const replayState = replayToState(s.setup, row!.inputLog!);
    expect(replayState.subsUsed).toEqual({ home: 1, away: 1 });
    expect(stateHash(replayState)).toBe(stateHash(s.state));
    expect([replay.score.home, replay.score.away]).toEqual([
      s.state.score.home,
      s.state.score.away,
    ]);
  }, 60_000);
});

describe('Sửa lỗi bảo mật PvP (audit run-1)', () => {
  it('tỉ số sim vượt trần 20: kết thúc ở 20 bàn, lưu được kết quả, không kẹt live', async () => {
    const { s, ca, cb } = await startPair();
    hub.handle(ca, { t: 'ready' });
    hub.handle(cb, { t: 'ready' });
    run(3100);
    s.state = { ...s.state, score: { home: 25, away: 0 } };
    run(100);
    await s.whenEnded();
    expect(s.result).toMatchObject({ reason: 'full_time', home: 20, away: 0 });
    const [row] = await db.select().from(pvpMatches).where(eq(pvpMatches.id, s.pvpId));
    expect(row?.status).toBe('finished');
    expect(ca.of('end')[0]?.you.outcome).toBe('win');
    expect(cb.of('end')[0]?.you.outcome).toBe('loss');
  });

  it('clampScore: kéo về trần nhưng giữ người thắng và hiệu số', () => {
    expect(clampScore({ home: 3, away: 1 })).toEqual({ home: 3, away: 1 });
    expect(clampScore({ home: 25, away: 22 })).toEqual({ home: 20, away: 17 });
    expect(clampScore({ home: 30, away: 2 })).toEqual({ home: 20, away: 0 });
  });

  it('sim ném lỗi: huỷ (void) đúng phiên đó, không kẹt live, không văng khỏi pump', async () => {
    const { s, ca, cb } = await startPair();
    hub.handle(ca, { t: 'ready' });
    hub.handle(cb, { t: 'ready' });
    run(3100);
    s.state = { ...s.state, actionDeadline: undefined } as never; // làm stepBoth ném
    run(100);
    await s.whenEnded();
    expect(s.done).toBe(true);
    expect(ca.of('end')[0]?.reason).toBe('void_desync');
    const [row] = await db.select().from(pvpMatches).where(eq(pvpMatches.id, s.pvpId));
    expect(row?.status).toBe('cancelled');
  });

  it('PvpTicker: onTick ném lỗi chỉ loại phiên đó, phiên khác vẫn chạy', () => {
    const t = new FakeTime();
    const errs: unknown[] = [];
    const ticker = new PvpTicker(t, undefined, (e) => errs.push(e));
    const seen: number[] = [];
    ticker.add({
      done: false,
      onTick: () => {
        throw new Error('boom');
      },
    });
    ticker.add({ done: false, onTick: (now) => void seen.push(now) });
    t.t = 20;
    expect(() => ticker.pump()).not.toThrow();
    expect(errs).toHaveLength(1);
    expect(ticker.size).toBe(1);
    expect(seen.length).toBeGreaterThan(0);
  });

  it('sảnh: A bấm sẵn sàng rồi rớt, B sẵn sàng → A vào đồng hồ rớt mạng và B được báo', async () => {
    const { s, ca, cb } = await startPair();
    hub.handle(ca, { t: 'ready' });
    hub.onClosed(ca);
    hub.handle(cb, { t: 'ready' });
    expect(cb.of('opp_disconnected')).toEqual([{ t: 'opp_disconnected', remainingMs: 30_000 }]);
    run(3000 + 30_100);
    await s.whenEnded();
    expect(s.result?.reason).toBe('forfeit_disconnect');
    expect(s.result?.sides.away.outcome).toBe('win');
  });

  it('createSession từ chối user đã có phiên live (không ghi đè byUser)', async () => {
    const { s } = await startPair();
    const c1 = new FakeConn(ids[0]!);
    const c2 = new FakeConn(ids[1]!);
    const again = await hub.createSession({
      kind: 'friendly',
      seed: 9,
      home: player(0, c1),
      away: player(1, c2),
    });
    expect(again).toBeNull();
    expect(c1.of('error')).toEqual([{ t: 'error', code: 'busy' }]);
    expect(hub.session(s.pvpId)?.live).toBe(true);
    expect(hub.sessionCount).toBe(1);
  });

  it('pendingUsers đếm theo user: begin 2 lần, end 1 lần vẫn bận', () => {
    hub.beginPending(ids[0]!);
    hub.beginPending(ids[0]!);
    hub.endPending(ids[0]!);
    expect(hub.hasEntry(ids[0]!)).toBe(true);
    hub.endPending(ids[0]!);
    expect(hub.hasEntry(ids[0]!)).toBe(false);
  });

  it('socket đã đóng: tin sau đó bị bỏ qua (không rejoin lại), closeUser terminate', async () => {
    const { s, ca } = await startPair();
    hub.addConn(ca);
    hub.closeUser(ids[0]!);
    expect(ca.closedWith).toBe(4401);
    expect(ca.terminated).toBe(true);
    ca.msgs.length = 0;
    hub.handle(ca, { t: 'rejoin', pvpId: s.pvpId });
    expect(ca.msgs).toEqual([]);
    expect(s.sockets.home).toBeUndefined();
  });

  it('thu hồi/hết hạn phiên đăng nhập: closeSession và sweep đóng socket gắn với phiên', async () => {
    const { ca, cb } = await startPair();
    ca.sid = 'sid-a';
    cb.sid = 'sid-b';
    cb.sessionExpiresAt = clock.now().getTime() + 1000;
    hub.addConn(ca);
    hub.addConn(cb);
    hub.closeSession('sid-a');
    expect(ca.closedWith).toBe(4401);
    expect(cb.closedWith).toBeNull();
    hub.sweep();
    expect(cb.closedWith).toBeNull();
    clock.advance(1500);
    hub.sweep();
    expect(cb.closedWith).toBe(4401);
    expect(cb.terminated).toBe(true);
  });

  it('rejoin dồn dập: socket đã giữ phía đó chỉ được 1 catchup / 2 s; tra DB 1 lần / 2 s', async () => {
    const { s, ca } = await startPair();
    hub.addConn(ca);
    for (let i = 0; i < 5; i++) hub.handle(ca, { t: 'rejoin', pvpId: s.pvpId });
    expect(ca.of('catchup')).toHaveLength(1);
    time.t += 2100;
    hub.handle(ca, { t: 'rejoin', pvpId: s.pvpId });
    expect(ca.of('catchup')).toHaveLength(2);
    for (let i = 0; i < 5; i++) hub.handle(ca, { t: 'rejoin', pvpId: 999 });
    await new Promise((r) => setTimeout(r, 30));
    expect(ca.of('error').filter((e) => e.code === 'not_in_match')).toHaveLength(1);
  });
});
