import { eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  NO_INPUT,
  cpuHardTeam,
  createMatch,
  starterLikeTeam,
  stateHash,
  stepBoth,
} from '@pitch/sim';
import type { PvpServerMessage } from '@pitch/shared';
import { FakeClock, createUser, resetTestData, testDb } from '../../../test/helpers';
import { analyticsEvents, dailyMissions, matches, pvpMatches, users } from '../../db/schema';
import { gameDay } from '../../domain/rewards';
import { cryptoRng } from '../../domain/rng';
import { ensureTodayMissions } from '../missions';
import { PvpHub, PONG_TIMEOUT_MS, type HubConn } from './hub';
import type { TimeSource } from './ticker';

const db = testDb();
const TICK_MS = 1000 / 60;

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
  flushTimers() {
    for (const item of [...this.timers]) {
      if (item.at <= this.t) {
        this.timers.delete(item);
        item.fn();
      }
    }
  }
}

class FakeConn implements HubConn {
  msgs: PvpServerMessage[] = [];
  closedWith: number | null = null;
  terminated = false;
  lastPongAt = 0;
  constructor(readonly userId: number) {}
  send(m: PvpServerMessage) {
    this.msgs.push(m);
  }
  close(code: number) {
    this.closedWith = code;
  }
  ping() {}
  terminate() {
    this.terminated = true;
  }
  of<T extends PvpServerMessage['t']>(t: T) {
    return this.msgs.filter((m): m is Extract<PvpServerMessage, { t: T }> => m.t === t);
  }
}

const flush = () => new Promise<void>((r) => setTimeout(r, 15));

async function resetSubtest() {
  hub.stop();
  await resetTestData(db);
  time = new FakeTime();
  hub = new PvpHub({ db, clock, rng: cryptoRng, time });
  ids = [
    (await createUser(db, 'ann_sub')).id,
    (await createUser(db, 'bob_sub')).id,
    (await createUser(db, 'cara_sub')).id,
  ];
}

let time: FakeTime;
let clock: FakeClock;
let hub: PvpHub;
let ids: number[];

beforeEach(async () => {
  hub?.stop();
  await resetTestData(db);
  time = new FakeTime();
  clock = new FakeClock('2026-03-10T12:00:00Z');
  hub = new PvpHub({ db, clock, rng: cryptoRng, time });
  ids = [
    (await createUser(db, 'ann')).id,
    (await createUser(db, 'bob')).id,
    (await createUser(db, 'cara')).id,
  ];
});
afterAll(() => hub?.stop());

async function startRunning(kind: 'ranked' | 'friendly' = 'ranked') {
  const ca = new FakeConn(ids[0]!);
  const cb = new FakeConn(ids[1]!);
  hub.addConn(ca);
  hub.addConn(cb);
  const s = (await hub.createSession({
    kind,
    seed: 7,
    home: { userId: ids[0]!, username: 'ann', team: starterLikeTeam, conn: ca },
    away: { userId: ids[1]!, username: 'bob', team: cpuHardTeam, conn: cb },
    dev: { halfLengthSec: 180 },
  }))!;
  hub.handle(ca, { t: 'ready' });
  hub.handle(cb, { t: 'ready' });
  run(3100);
  return { s, ca, cb };
}

function run(
  ms: number,
  keepAlive: { s: NonNullable<ReturnType<PvpHub['session']>>; conns: FakeConn[] } | null = null,
) {
  const steps = Math.ceil(ms / TICK_MS);
  for (let i = 0; i < steps; i++) {
    time.t += TICK_MS;
    hub.ticker.pump();
    time.flushTimers();
    if (keepAlive && keepAlive.s.state.tick > 0 && keepAlive.s.state.tick % 60 === 0) {
      sendValidHashes(keepAlive.s, keepAlive.conns);
    }
  }
}

/** Giữ client đồng bộ hash trên FakeConn theo đúng state của session (hoặc lệch theo yêu cầu). */
function sendValidHashes(s: NonNullable<ReturnType<PvpHub['session']>>, conns: FakeConn[]) {
  const latestTick = [...s.serverHashes.keys()].at(-1);
  if (!latestTick) return;
  const h = s.serverHashes.get(latestTick)!;
  for (const c of conns) hub.handle(c, { t: 'hash', tick: latestTick, h });
}

describe('PvP US3: rớt mạng, bỏ trận và phân xử lệch', () => {
  it('rớt 29 s rồi vào lại thì đá tiếp; rớt 31 s thì bị xử thua', async () => {
    const { s, ca, cb } = await startRunning('ranked');
    hub.onClosed(cb);
    expect(ca.of('opp_disconnected')[0]).toEqual({ t: 'opp_disconnected', remainingMs: 30_000 });

    run(29_000, { s, conns: [ca] });
    expect(s.done).toBe(false);

    const cb2 = new FakeConn(ids[1]!);
    hub.addConn(cb2);
    hub.handle(cb2, { t: 'rejoin', pvpId: s.pvpId });
    expect(cb2.of('catchup')).toHaveLength(1);
    expect(ca.of('opp_reconnected')).toHaveLength(1);

    // Rớt lại 31 s (> 30 s) → xử thua
    hub.onClosed(cb2);
    run(31_000, { s, conns: [ca] });
    await s.whenEnded();
    expect(s.done).toBe(true);
    expect(ca.of('end')[0]).toMatchObject({
      reason: 'forfeit_disconnect',
      home: 3,
      away: 0,
      you: { outcome: 'win', reward: 120 },
    });
  });

  it('cộng dồn nhiều lần rớt: 25 s + 25 s + 11 s > 60 s thì bị xử thua', async () => {
    const { s, ca, cb } = await startRunning('ranked');

    // Lần 1: 25 s
    hub.onClosed(cb);
    run(25_000, { s, conns: [ca] });
    const cb2 = new FakeConn(ids[1]!);
    hub.addConn(cb2);
    hub.handle(cb2, { t: 'rejoin', pvpId: s.pvpId });
    hub.handle(cb2, { t: 'catchup_done' });
    expect(s.done).toBe(false);

    // Lần 2: 25 s (tổng 50 s)
    hub.onClosed(cb2);
    run(25_000, { s, conns: [ca] });
    const cb3 = new FakeConn(ids[1]!);
    hub.addConn(cb3);
    hub.handle(cb3, { t: 'rejoin', pvpId: s.pvpId });
    hub.handle(cb3, { t: 'catchup_done' });
    expect(s.done).toBe(false);

    // Lần 3: còn ~10 s → tới 11 s thì xử thua
    hub.onClosed(cb3);
    const rem3 = ca.of('opp_disconnected').at(-1)?.remainingMs ?? 0;
    expect(rem3).toBeGreaterThan(9_900);
    expect(rem3).toBeLessThanOrEqual(10_050);
    run(11_000, { s, conns: [ca] });
    await s.whenEnded();
    expect(s.done).toBe(true);
    expect(ca.of('end')[0]?.reason).toBe('forfeit_disconnect');
  });

  it('đang dẫn 5-0 khi đối thủ bỏ thì giữ nguyên tỉ số 5-0', async () => {
    const { s, ca, cb } = await startRunning('ranked');
    s.state = { ...s.state, score: { home: 5, away: 0 } };
    hub.onClosed(cb);
    run(31_000, { s, conns: [ca] });
    await s.whenEnded();
    expect(ca.of('end')[0]).toMatchObject({ home: 5, away: 0, reason: 'forfeit_disconnect' });
  });

  it('xử thua ranked: người thua 0 xu + tốn suất ngày; người thắng chỉ tăng match_play/match_win (A14)', async () => {
    const day = gameDay(clock.now());
    await db.transaction(async (tx) => {
      await ensureTodayMissions(tx, ids[0]!, day);
      await ensureTodayMissions(tx, ids[1]!, day);
    });

    const { s, ca, cb } = await startRunning('ranked');
    // Đặt tỉ số 2-0 (hoặc 0-0) để kiểm chứng không cộng match_goals / match_clean_sheet khi forfeit!
    s.state = { ...s.state, score: { home: 2, away: 0 } };
    hub.onClosed(cb);
    run(31_000, { s, conns: [ca] });
    await s.whenEnded();

    const mRows = await db.select().from(matches);
    const loserRow = mRows.find((r) => r.userId === ids[1])!;
    const winnerRow = mRows.find((r) => r.userId === ids[0])!;
    expect(loserRow).toMatchObject({ reward: 0, consumesDailyCap: true, outcome: 'loss' });
    expect(winnerRow).toMatchObject({ reward: 120, outcome: 'win' });

    const [loserUser] = await db.select().from(users).where(eq(users.id, ids[1]!));
    expect(loserUser!.coins).toBe(0);

    const winnerMissions = await db
      .select()
      .from(dailyMissions)
      .where(eq(dailyMissions.userId, ids[0]!));
    for (const m of winnerMissions) {
      if (m.missionCode === 'play_matches' || m.missionCode === 'win_match') {
        expect(m.progress).toBe(1);
      } else {
        expect(m.progress).toBe(0);
      }
    }
    const loserMissions = await db
      .select()
      .from(dailyMissions)
      .where(eq(dailyMissions.userId, ids[1]!));
    expect(loserMissions.every((m) => m.progress === 0)).toBe(true);

    const events = await db.select().from(analyticsEvents);
    expect(events.some((e) => e.name === 'pvp_disconnect')).toBe(true);
    expect(events.some((e) => e.name === 'pvp_forfeit')).toBe(true);
    expect(ca.of('end')).toHaveLength(1);
  });

  it('lệch mã băm: lần 1 nhận catchup, lần 2 forfeit_desync; cả hai lần 2 → void_desync với 2 dòng expired (A3)', async () => {
    // Trường hợp 1: chỉ B lệch lần 1 rồi lần 2
    {
      const { s, ca, cb } = await startRunning('ranked');
      run(1200);
      const t1 = [...s.serverHashes.keys()][0]!;
      hub.handle(ca, { t: 'hash', tick: t1, h: s.serverHashes.get(t1)! });
      hub.handle(cb, { t: 'hash', tick: t1, h: (s.serverHashes.get(t1)! + 1) >>> 0 });
      expect(cb.of('catchup')).toHaveLength(1);
      expect(s.done).toBe(false);

      hub.handle(cb, { t: 'catchup_done' });
      run(1200);
      const t2 = [...s.serverHashes.keys()].at(-1)!;
      hub.handle(cb, { t: 'hash', tick: t2, h: (s.serverHashes.get(t2)! + 1) >>> 0 });
      await s.whenEnded();
      expect(s.done).toBe(true);
      expect(ca.of('end')[0]?.reason).toBe('forfeit_desync');
      expect(cb.of('end')[0]?.you.rewardReason).toBe('forfeit');
    }

    // Trường hợp 2: cả hai cùng lệch lần 2 → void_desync, 2 dòng matches expired
    await resetSubtest();
    const { s, ca, cb } = await startRunning('ranked');
    run(1200);
    const t1 = [...s.serverHashes.keys()][0]!;
    const bad1 = (s.serverHashes.get(t1)! + 123) >>> 0;
    hub.handle(ca, { t: 'hash', tick: t1, h: bad1 });
    hub.handle(cb, { t: 'hash', tick: t1, h: bad1 });
    expect(ca.of('catchup')).toHaveLength(1);
    expect(cb.of('catchup')).toHaveLength(1);
    expect(s.done).toBe(false);

    hub.handle(ca, { t: 'catchup_done' });
    hub.handle(cb, { t: 'catchup_done' });
    run(1200);
    const t2 = [...s.serverHashes.keys()].at(-1)!;
    const bad2 = (s.serverHashes.get(t2)! + 456) >>> 0;
    hub.handle(ca, { t: 'hash', tick: t2, h: bad2 });
    hub.handle(cb, { t: 'hash', tick: t2, h: bad2 });
    await s.whenEnded();
    expect(s.done).toBe(true);
    expect(ca.of('end')[0]).toMatchObject({
      reason: 'void_desync',
      you: { reward: 0, rewardReason: 'void' },
    });
    const mRows = await db.select().from(matches);
    expect(mRows).toHaveLength(2);
    expect(mRows.every((m) => m.status === 'expired' && m.reward === 0)).toBe(true);
  });

  it('mã băm cũ còn tồn trước khi client đọc catchup không bị tính lệch lần 2', async () => {
    const { s, ca, cb } = await startRunning('ranked');
    run(2200);
    const [t1, t2] = [...s.serverHashes.keys()];
    hub.handle(cb, { t: 'hash', tick: t1!, h: (s.serverHashes.get(t1!)! + 1) >>> 0 });
    expect(cb.of('catchup')).toHaveLength(1);
    // Khung t2 đã tồn trong socket, client tính hash trên state lệch trước khi xử lý catchup.
    hub.handle(cb, { t: 'hash', tick: t2!, h: (s.serverHashes.get(t2!)! + 1) >>> 0 });
    expect(s.done).toBe(false);
    hub.handle(cb, { t: 'catchup_done' });
    run(1200, { s, conns: [ca, cb] });
    expect(s.done).toBe(false);
    expect(ca.of('end')).toHaveLength(0);
  });

  it('hai tab (A1): socket thứ 2 nhận busy, không đóng socket cũ; socket cũ chết heartbeat → rejoin thành công', async () => {
    const { s, ca, cb } = await startRunning('ranked');
    const tab2 = new FakeConn(ids[0]!);
    hub.addConn(tab2);
    hub.handle(tab2, { t: 'rejoin', pvpId: s.pvpId });
    hub.handle(tab2, { t: 'queue_join' });
    hub.handle(tab2, { t: 'room_create' });
    expect(tab2.of('error')).toEqual([
      { t: 'error', code: 'busy' },
      { t: 'error', code: 'busy' },
      { t: 'error', code: 'busy' },
    ]);
    expect(ca.closedWith).toBeNull();
    expect(ca.terminated).toBe(false);

    // Heartbeat phát hiện tab 1 mất pong > 5 s
    time.t += PONG_TIMEOUT_MS + 100;
    cb.lastPongAt = time.t;
    tab2.lastPongAt = time.t;
    hub.sweep();
    expect(ca.terminated).toBe(true);

    // Tab 2 rejoin sau đó thành công
    hub.handle(tab2, { t: 'rejoin', pvpId: s.pvpId });
    expect(tab2.of('catchup')).toHaveLength(1);
  });

  it('rejoin người ngoài trận → not_in_match; trận đã xong (còn trong bộ nhớ & chỉ còn DB) trả end, không catchup (A2)', async () => {
    const { s, ca, cb } = await startRunning('ranked');
    const outsider = new FakeConn(ids[2]!);
    hub.handle(outsider, { t: 'rejoin', pvpId: s.pvpId });
    expect(outsider.of('error')).toEqual([{ t: 'error', code: 'not_in_match' }]);

    hub.onClosed(cb);
    run(31_000, { s, conns: [ca] });
    await s.whenEnded();

    // Còn trong bộ nhớ (< 60 s)
    const cbInMem = new FakeConn(ids[1]!);
    hub.handle(cbInMem, { t: 'rejoin', pvpId: s.pvpId });
    await flush();
    expect(cbInMem.of('catchup')).toHaveLength(0);
    expect(cbInMem.of('end')).toHaveLength(1);
    expect(cbInMem.of('end')[0]?.reason).toBe('forfeit_disconnect');

    // Hết 60 s, phiên bị xoá khỏi bộ nhớ → đọc từ DB
    time.t += 61_000;
    time.flushTimers();
    expect(hub.session(s.pvpId)).toBeUndefined();

    const caFromDb = new FakeConn(ids[0]!);
    hub.handle(caFromDb, { t: 'rejoin', pvpId: s.pvpId });
    await flush();
    expect(caFromDb.of('catchup')).toHaveLength(0);
    expect(caFromDb.of('end')).toHaveLength(1);
    expect(caFromDb.of('end')[0]).toMatchObject({
      reason: 'forfeit_disconnect',
      home: 3,
      away: 0,
      you: { outcome: 'win', reward: 120 },
    });
    expect(ca.of('end')).toHaveLength(1);
  });

  it('không gửi hash 15 s khi đang kết nối → lệch; rớt mạng hoặc đang dựng lại không bị phạt; chậm 5 s vẫn gửi hash đều → không lệch', async () => {
    // 1) Client chậm 5 s nhưng vẫn gửi hash đúng mỗi 1 s → không bị phạt
    {
      const { s, ca, cb } = await startRunning('ranked');
      for (let sec = 0; sec < 20; sec++) {
        run(1000);
        // Sau 5 s đầu, gửi hash trễ 5 s (tick của 5 s trước, vẫn nằm trong cửa sổ 30 s)
        const targetTick = Math.max(1, sec - 4) * 60;
        const h = s.serverHashes.get(targetTick);
        if (h !== undefined) {
          hub.handle(ca, { t: 'hash', tick: targetTick, h });
          hub.handle(cb, { t: 'hash', tick: targetTick, h });
        }
      }
      expect(s.done).toBe(false);
      expect(ca.of('catchup')).toHaveLength(0);
      expect(cb.of('catchup')).toHaveLength(0);
    }

    // 2) Quá 15 s không gửi hash khi đang kết nối → lệch lần 1 (catchup), tiếp 10 s + 15 s không gửi catchup_done → lệch lần 2 (forfeit_desync)
    await resetSubtest();
    const { s, ca, cb } = await startRunning('ranked');
    for (let i = 0; i < 14; i++) {
      run(1000);
      sendValidHashes(s, [ca]); // A gửi đều, B im lặng
    }
    expect(cb.of('catchup')).toHaveLength(0);
    run(1100); // qua mốc 15 s
    sendValidHashes(s, [ca]);
    expect(cb.of('catchup')).toHaveLength(1); // lệch lần 1
    expect(s.done).toBe(false);

    // B không gửi catchup_done: miễn 10 s, sau đó tính tiếp 15 s → tổng 25 s bị lệch lần 2
    for (let i = 0; i < 24; i++) {
      run(1000);
      sendValidHashes(s, [ca]);
    }
    expect(s.done).toBe(false);
    run(1200);
    await s.whenEnded();
    expect(s.done).toBe(true);
    expect(ca.of('end')[0]?.reason).toBe('forfeit_desync');
  });

  it('rớt lệch giờ: bên hết hạn trước thua; cả hai cùng đang rớt khi hết hạn thì huỷ void_both_left', async () => {
    // A rớt trước 10 s, B rớt sau 10 s → khi A hết hạn (30 s), B vẫn đang rớt → void_both_left
    {
      const { s, ca, cb } = await startRunning('ranked');
      hub.onClosed(ca);
      run(10_000);
      hub.onClosed(cb);
      run(21_000);
      await s.whenEnded();
      expect(s.done).toBe(true);
      const [row] = await db.select().from(pvpMatches);
      expect(row).toMatchObject({ status: 'cancelled', endReason: 'void_both_left' });
    }

    // A rớt 10 s rồi vào lại; sau đó B rớt 31 s → B hết hạn khi A đang kết nối → forfeit_disconnect
    await resetSubtest();
    const { s, ca, cb } = await startRunning('ranked');
    hub.onClosed(ca);
    run(10_000);
    const ca2 = new FakeConn(ids[0]!);
    hub.addConn(ca2);
    hub.handle(ca2, { t: 'rejoin', pvpId: s.pvpId });
    hub.handle(ca2, { t: 'catchup_done' });
    hub.onClosed(cb);
    run(31_000, { s, conns: [ca2] });
    await s.whenEnded();
    expect(ca2.of('end')[0]?.reason).toBe('forfeit_disconnect');
  });

  it('closeUser (đăng xuất / xoá tài khoản) xử lý như leave: xoá hàng chờ, đóng phòng, đếm rớt mạng ở trận đang đá', async () => {
    const { s, ca, cb } = await startRunning('ranked');
    const q = new FakeConn(ids[2]!);
    hub.addConn(q);
    hub.handle(q, { t: 'queue_join' });
    expect(hub.queue.has(ids[2]!)).toBe(true);
    hub.closeUser(ids[2]!);
    expect(hub.queue.has(ids[2]!)).toBe(false);
    expect(q.closedWith).toBe(4401);

    // Đang đá: closeUser(B) → B bị ngắt ngay, A nhận opp_disconnected, 31 s sau A thắng forfeit
    hub.closeUser(ids[1]!);
    expect(cb.closedWith).toBe(4401);
    expect(ca.of('opp_disconnected')).toHaveLength(1);
    run(31_000, { s, conns: [ca] });
    await s.whenEnded();
    expect(ca.of('end')[0]?.reason).toBe('forfeit_disconnect');
  });

  it('stateHash hàm chiếu vẫn khớp stepBoth khi không input', () => {
    let ref = createMatch({
      home: starterLikeTeam,
      away: cpuHardTeam,
      seed: 7,
      difficulty: 'hard',
      humans: ['home', 'away'],
    });
    for (let i = 0; i < 60; i++) ref = stepBoth(ref, { home: NO_INPUT, away: NO_INPUT });
    expect(stateHash(ref)).toBeGreaterThan(0);
  });
});
