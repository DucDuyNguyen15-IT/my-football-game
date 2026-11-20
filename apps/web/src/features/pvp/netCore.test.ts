import { describe, expect, it } from 'vitest';
import { createMatch, starterLikeTeam, cpuHardTeam, NO_INPUT, stepBoth, stateHash, InputRecorder2 } from '@pitch/sim';
import {
  DisplayCursor, FrameGate, JitterEstimator, StateHistory, displayPair, hashDue, shouldSendInput, FRAME_MS,
} from './netCore';
import { createNetMatch, type NetSocket } from './useNetMatch';

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
    g.resumeAfter(100); expect(g.classify(100)).toBe('drop'); expect(g.classify(101)).toBe('apply');
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
});
