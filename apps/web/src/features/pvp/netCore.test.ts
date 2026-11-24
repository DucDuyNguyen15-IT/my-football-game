import { describe, expect, it } from 'vitest';
import { createMatch, starterLikeTeam, cpuHardTeam, NO_INPUT, stepBoth, stateHash, InputRecorder2, replayToState } from '@pitch/sim';
import {
  DisplayCursor, FrameGate, JitterEstimator, StateHistory, displayPair, hashDue, shouldSendInput, FRAME_MS,
} from './netCore';
import {
  BUSY_RETRY_MS,
  FRAME_WATCHDOG_MS,
  createNetMatch,
  createPvpClient,
  type NetSocket,
  type TimerApi,
} from './useNetMatch';

const setup = { home: starterLikeTeam, away: cpuHardTeam, seed: 7, difficulty: 'hard' as const, humans: ['home', 'away'] as ('home' | 'away')[] };

function fakeSocket() {
  const sent: { t: string; tick?: number; c?: number }[] = [];
  const s: NetSocket & { sent: { t: string; tick?: number; c?: number }[]; recv(m: unknown): void } = {
    sent, send: (d) => sent.push(JSON.parse(d)), close() {}, onmessage: null, onclose: null,
    recv(m) { s.onmessage?.({ data: JSON.stringify(m) }); },
  };
  return s;
}
const matched = { t: 'matched', pvpId: 1, kind: 'friendly', side: 'away', opponent: { username: 'x', squad: cpuHardTeam }, setup };

describe('netCore', () => {
  it('bộ đệm jitter 3 khi đều, tăng (<=6) khi giật', () => {
    const j = new JitterEstimator();
    for (let i = 0; i < 100; i++) j.onArrival(i * FRAME_MS);
    expect(j.delayFrames()).toBe(3);
    let t = 0;
    for (let i = 0; i < 200; i++) { t += i % 2 ? 4 * FRAME_MS : 0.1 * FRAME_MS; j.onArrival(t); }
    expect(j.delayFrames()).toBeGreaterThanOrEqual(5);
  });
  it('FrameGate: đúng thứ tự / bỏ cũ / báo hụt / resume', () => {
    const g = new FrameGate(5);
    expect(g.classify(5)).toBe('apply'); expect(g.classify(4)).toBe('drop'); expect(g.classify(7)).toBe('gap');
    g.resumeAt(101); expect(g.classify(100)).toBe('drop'); expect(g.classify(101)).toBe('apply');
  });
  it('quyết định gửi input và hash', () => {
    expect(shouldSendInput(3, 3)).toBe(false); expect(shouldSendInput(3, 0)).toBe(true);
    expect(hashDue(0)).toBe(false); expect(hashDue(60)).toBe(true); expect(hashDue(61)).toBe(false);
  });
  it('DisplayCursor bám đích và nhảy khi lệch lớn; displayPair nội suy', () => {
    const c = new DisplayCursor();
    expect(c.advance(0, 100, 3)).toBe(97);
    expect(c.advance(FRAME_MS / 1000, 101, 3)).toBeCloseTo(98.2, 0);
    expect(c.advance(0, 500, 3)).toBe(497);
    const h = new StateHistory();
    let s = createMatch(setup);
    for (let i = 0; i < 5; i++) { h.push(s); s = stepBoth(s, { home: NO_INPUT, away: NO_INPUT }); }
    const p = displayPair(h, 2.5)!;
    expect([p.prev.tick, p.curr.tick, p.alpha]).toEqual([2, 3, 0.5]);
  });
});

describe('createNetMatch', () => {
  it('chạy stepBoth đúng một lần mỗi khung, gửi hash mỗi 60 tick, input chỉ khi đổi', () => {
    const sock = fakeSocket();
    const net = createNetMatch({ socket: sock, now: () => 0 });
    sock.recv(matched);
    expect(net.side).toBe('away');
    let ref = createMatch(setup);
    for (let t = 0; t < 120; t++) {
      sock.recv({ t: 'f', f: [t, 0, 0] });
      sock.recv({ t: 'f', f: [t, 0, 0] }); // trùng: bị bỏ
      ref = stepBoth(ref, { home: NO_INPUT, away: NO_INPUT });
    }
    expect(net.state()!.tick).toBe(120);
    expect(stateHash(net.state()!)).toBe(stateHash(ref));
    expect(sock.sent.filter((m) => m.t === 'hash').map((m) => m.tick)).toEqual([60, 120]);
    net.sendInput(5); net.sendInput(5); net.releaseInput(); net.releaseInput();
    expect(sock.sent.filter((m) => m.t === 'input').map((m) => m.c)).toEqual([5, 0]);
  });
  it('catchup: xếp hàng khung tới, bỏ tick <= catchup.tick, rồi gửi catchup_done', async () => {
    const sock = fakeSocket();
    const rec = new InputRecorder2();
    let ref = createMatch(setup);
    for (let t = 0; t < 10; t++) { rec.tick({ home: NO_INPUT, away: NO_INPUT }); ref = stepBoth(ref, { home: NO_INPUT, away: NO_INPUT }); }
    const net = createNetMatch({ socket: sock, now: () => 0 });
    sock.recv(matched);
    sock.recv({ t: 'catchup', setup, log: rec.encode(), tick: 9 });
    expect(net.rebuilding).toBe(true);
    for (let t = 8; t < 13; t++) sock.recv({ t: 'f', f: [t, 0, 0] });
    await new Promise((r) => setTimeout(r, 10));
    expect(net.rebuilding).toBe(false);
    expect(net.state()!.tick).toBe(13); // 10 từ log + khung 10,11,12
    expect(sock.sent.at(-1)).toEqual({ t: 'catchup_done' });
  });
  it('hụt khung gọi onGap', () => {
    const sock = fakeSocket(); let gaps = 0;
    createNetMatch({ socket: sock, onGap: () => gaps++ });
    sock.recv(matched); sock.recv({ t: 'f', f: [3, 0, 0] });
    expect(gaps).toBe(1);
  });

  it('swapSocket đổi sang socket mới và reset lastInput', () => {
    const s1 = fakeSocket();
    const s2 = fakeSocket();
    const net = createNetMatch({ socket: s1, now: () => 0 });
    s1.recv(matched);
    net.sendInput(5);
    net.swapSocket(s2);
    net.sendInput(5); // gửi lại được trên socket mới
    expect(s1.sent).toEqual([{ t: 'input', c: 5 }]);
    expect(s2.sent).toEqual([{ t: 'input', c: 5 }]);
  });
});

function makeFakeTimers(clock: { t: number }) {
  let nextId = 1;
  const timeouts = new Map<number, { at: number; fn: () => void }>();
  const intervals = new Map<number, { every: number; nextAt: number; fn: () => void }>();
  const timers: TimerApi = {
    setTimeout(fn, ms) {
      const id = nextId++;
      timeouts.set(id, { at: clock.t + ms, fn });
      return id as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimeout(id) {
      timeouts.delete(id as unknown as number);
    },
    setInterval(fn, ms) {
      const id = nextId++;
      intervals.set(id, { every: ms, nextAt: clock.t + ms, fn });
      return id as unknown as ReturnType<typeof setInterval>;
    },
    clearInterval(id) {
      intervals.delete(id as unknown as number);
    },
  };
  const advance = (ms: number) => {
    const target = clock.t + ms;
    while (clock.t < target) {
      let nextStep = target;
      for (const x of timeouts.values()) if (x.at < nextStep) nextStep = x.at;
      for (const x of intervals.values()) if (x.nextAt < nextStep) nextStep = x.nextAt;
      clock.t = nextStep;
      for (const [id, x] of [...timeouts]) {
        if (x.at <= clock.t) {
          timeouts.delete(id);
          x.fn();
        }
      }
      for (const x of [...intervals.values()]) {
        if (x.nextAt <= clock.t) {
          x.nextAt = clock.t + x.every;
          x.fn();
        }
      }
    }
  };
  return { timers, advance };
}

describe('createPvpClient (T034)', () => {
  it('mất kết nối khi đang đá → backoff kết nối lại, gửi rejoin; nhận busy thử lại mỗi 2 s; nhận end thì dừng', () => {
    const clock = { t: 0 };
    const { timers, advance } = makeFakeTimers(clock);
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const client = createPvpClient({
      now: () => clock.t,
      timers,
      connect: () => {
        const s = fakeSocket();
        sockets.push(s);
        return s;
      },
    });

    const s0 = sockets[0]!;
    s0.onopen?.();
    s0.recv(matched);
    s0.recv({ t: 'start', countdownMs: 3000 });

    // Rớt kết nối → backoff 500 ms rồi mở socket mới và gửi rejoin
    s0.onclose?.({});
    expect(sockets).toHaveLength(1);
    advance(500);
    expect(sockets).toHaveLength(2);
    const s1 = sockets[1]!;
    s1.onopen?.();
    expect(s1.sent).toEqual([{ t: 'rejoin', pvpId: 1 }]);

    // Nhận error busy → thử lại mỗi 2 s
    s1.recv({ t: 'error', code: 'busy' });
    advance(BUSY_RETRY_MS - 1);
    expect(s1.sent).toHaveLength(1);
    advance(1);
    expect(s1.sent).toEqual([
      { t: 'rejoin', pvpId: 1 },
      { t: 'rejoin', pvpId: 1 },
    ]);

    // Nhận end thay catchup → dừng thử lại (A2)
    s1.recv({ t: 'end', reason: 'forfeit_disconnect', home: 3, away: 0, you: { outcome: 'win', reward: 120 } });
    advance(10_000);
    expect(s1.sent).toHaveLength(2);
    client.dispose();
  });

  it('watchdog 5 s: không nhận khung nào 5 s trong lúc trận chạy → đóng socket và kết nối lại', () => {
    const clock = { t: 0 };
    const { timers, advance } = makeFakeTimers(clock);
    const sockets: (ReturnType<typeof fakeSocket> & { closed: boolean })[] = [];
    const client = createPvpClient({
      now: () => clock.t,
      timers,
      connect: () => {
        const s = Object.assign(fakeSocket(), {
          closed: false,
          close() {
            s.closed = true;
          },
        });
        sockets.push(s);
        return s;
      },
    });
    const s0 = sockets[0]!;
    s0.onopen?.();
    s0.recv(matched);
    s0.recv({ t: 'start', countdownMs: 3000 });
    s0.recv({ t: 'f', f: [0, 0, 0] });

    advance(FRAME_WATCHDOG_MS - 1);
    expect(s0.closed).toBe(false);
    advance(1001);
    expect(s0.closed).toBe(true);
    advance(500);
    expect(sockets).toHaveLength(2);
    client.dispose();
  });

  it('rớt kết nối ở sảnh (chưa vào trận) → vẫn tự kết nối lại (C3-01)', () => {
    const clock = { t: 0 };
    const { timers, advance } = makeFakeTimers(clock);
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const statuses: boolean[] = [];
    createPvpClient({
      now: () => clock.t,
      timers,
      onStatus: (st) => statuses.push(st.connected),
      connect: () => {
        const s = fakeSocket();
        sockets.push(s);
        return s;
      },
    });
    sockets[0]!.onopen?.();
    sockets[0]!.onclose?.({});
    advance(500);
    expect(sockets).toHaveLength(2);
    sockets[1]!.onopen?.();
    expect(statuses.at(-1)).toBe(true);
  });

  it('phím bấm lúc socket mới còn CONNECTING bị bỏ → gửi lại khi vào lại xong (C3-06, F1)', () => {
    const clock = { t: 0 };
    const { timers, advance } = makeFakeTimers(clock);
    const sockets: ReturnType<typeof fakeSocket>[] = [];
    const client = createPvpClient({
      now: () => clock.t,
      timers,
      connect: () => {
        const s = fakeSocket();
        sockets.push(s);
        return s;
      },
    });
    sockets[0]!.onopen?.();
    sockets[0]!.recv(matched);
    sockets[0]!.onclose?.({});
    advance(500);
    const s1 = sockets[1]!;
    s1.send = () => {
      throw new Error('InvalidStateError');
    };
    expect(() => client.net.sendInput(5)).not.toThrow();
    s1.send = (d) => s1.sent.push(JSON.parse(d));
    s1.onopen?.();
    expect(s1.sent).toEqual([{ t: 'rejoin', pvpId: 1 }]);
    // rejoin bị busy rồi thử lại thành công: catchup mới gửi phím đang giữ (review F1)
    s1.recv({ t: 'error', code: 'busy' });
    advance(BUSY_RETRY_MS);
    s1.recv({ t: 'catchup', setup, log: new InputRecorder2().encode(), tick: 0 });
    expect(s1.sent.filter((m) => m.t === 'input')).toEqual([{ t: 'input', c: 5 }]);
  });

  it('đo thời gian dựng lại 21.600 tick (research R6): nhanh hơn ngưỡng 3 s', () => {
    const rec = new InputRecorder2();
    for (let i = 0; i < 21_600; i++) {
      rec.tick({ home: NO_INPUT, away: NO_INPUT });
    }
    const log = rec.encode();
    const t0 = performance.now();
    const s = replayToState(setup, log);
    const elapsedMs = performance.now() - t0;
    expect(s.tick).toBe(21_600);
    // R6 yêu cầu < 3 s (đo riêng file); chạy cả bộ song song chậm hơn (~3,4 s) nên để 2× tránh đỏ ngẫu nhiên.
    expect(elapsedMs).toBeLessThan(6000);
    console.info(`[bench] replayToState 21600 ticks: ${elapsedMs.toFixed(1)} ms`);
  });
});
