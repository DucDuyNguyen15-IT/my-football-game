import { describe, expect, it } from 'vitest';
import {
  analyzeMotion,
  clipWindows,
  compareMotion,
  MotionRecorder,
  type MotionFrame,
} from './motionLog';

/** Log giả 60 FPS: `player(i)` trả [x, z, rot, clip] của cầu thủ "p" ở khung i. */
function makeLog(
  n: number,
  player: (i: number) => [number, number, number, string],
  extra: (i: number) => Partial<MotionFrame> = () => ({}),
): { frames: MotionFrame[] } {
  const frames: MotionFrame[] = [];
  for (let i = 0; i < n; i++) {
    frames.push({
      t: 1000 + i * (1000 / 60),
      ms: 1000 / 60,
      tick: i,
      phase: 'play',
      mode: 'live',
      covered: false,
      cam: [0, 20, 30 + i * 0.05],
      look: [0, 0, 0],
      ball: [i * 0.1, 0.11, 0],
      players: { p: player(i) },
      ...extra(i),
    });
  }
  return { frames };
}

const kinds = (log: { frames: MotionFrame[] }) => analyzeMotion(log).map((x) => x.kind);

describe('analyzeMotion', () => {
  it('chạy thẳng đều, xoay đều → không có lỗi', () => {
    expect(kinds(makeLog(240, (i) => [i * 0.1, 0, i * 0.01, 'run']))).toEqual([]);
  });

  it('nhảy cóc 3 m trong một khung → teleport; bị màn chuyển cảnh che thì bỏ qua', () => {
    const jump = (i: number): [number, number, number, string] => [i < 60 ? 0 : 3, 0, 0, 'idle'];
    expect(kinds(makeLog(120, jump))).toEqual(['teleport']);
    expect(kinds(makeLog(120, jump, (i) => ({ covered: i === 60 })))).toEqual([]);
  });

  it('chạy qua lại liên tục (đổi chiều mỗi 6 khung ở 6 m/s) → zigzag', () => {
    const zig = (i: number): [number, number, number, string] => {
      const k = i % 12;
      return [(k < 6 ? k : 12 - k) * 0.1, 0, 0, 'run'];
    };
    expect(kinds(makeLog(120, zig))).toContain('zigzag');
  });

  it('đứng xoay qua lại ±0,5 rad → spin; rung nhỏ 0,05 rad thì không', () => {
    const wobble =
      (amp: number) =>
      (i: number): [number, number, number, string] => [0, 0, amp * Math.sin(i / 3), 'idle'];
    expect(kinds(makeLog(180, wobble(0.5)))).toContain('spin');
    expect(kinds(makeLog(180, wobble(0.05)))).toEqual([]);
  });

  it('clip idle → run → idle trong 100 ms → clip_flicker', () => {
    const flick = (i: number): [number, number, number, string] => [
      0,
      0,
      0,
      i >= 30 && i < 36 ? 'run' : 'idle',
    ];
    expect(kinds(makeLog(90, flick))).toEqual(['clip_flicker']);
  });

  it('camera dao động qua lại → camera_shake; khung 120 ms → hitch', () => {
    const shake = makeLog(
      120,
      () => [0, 0, 0, 'idle'],
      (i) => ({
        cam: [0.2 * Math.sin(i * 1.5), 20, 30],
      }),
    );
    expect(kinds(shake)).toContain('camera_shake');
    // Khung dài trong 3 s đầu (tải model) bỏ qua; sau đó thì báo.
    const hitch = makeLog(
      300,
      () => [0, 0, 0, 'idle'],
      (i) => (i === 30 || i === 240 ? { ms: 120 } : {}),
    );
    expect(analyzeMotion(hitch).map((x) => [x.kind, x.tick])).toEqual([['hitch', 240]]);
  });
});

describe('clipWindows', () => {
  it('gộp đoạn nghi gần nhau thành một clip, tách đoạn xa', () => {
    const at = (t: number) => ({
      kind: 'hitch' as const,
      who: 'frame',
      from: t,
      to: t,
      tick: 0,
      phase: 'play',
      value: 0,
      detail: '',
    });
    const w = clipWindows([at(10_000), at(11_000), at(30_000)], 1500, 1000);
    expect(w.map((x) => [x.from, x.to, x.issues.length])).toEqual([
      [8_500, 12_500, 2],
      [28_500, 31_500, 1],
    ]);
  });
});

describe('MotionRecorder', () => {
  it('làm tròn 3 chữ số và dừng ghi khi đủ max khung', () => {
    const rec = new MotionRecorder(2);
    const frame = makeLog(3, () => [1.23456, 0, 0, 'run']).frames;
    for (const f of frame) rec.record(f);
    expect(rec.frames).toHaveLength(2);
    expect(rec.frames[0]!.players.p![0]).toBe(1.235);
  });
});

describe('compareMotion', () => {
  const fr = (tick: number, x: number, camX: number, camZ = 30): MotionFrame => ({
    t: tick,
    ms: 16,
    tick,
    phase: 'first_half',
    mode: 'live',
    covered: false,
    cam: [camX, 20, camZ],
    look: [5, 0, 0],
    ball: [5, 0.1, 0],
    players: { p: [x, 0, 0, 'run'] },
  });
  it('khớp khi camera lật quanh bóng và vị trí trùng', () => {
    const r = compareMotion({ frames: [fr(1, 1, 0)] }, { frames: [fr(1, 1.1, 10, -30)] });
    expect(r.ticks).toBe(1);
    expect(r.pos.over).toBe(0);
    expect(r.cam.flipOk).toBe(true);
  });
  it('báo lệch vị trí và camera không lật', () => {
    const r = compareMotion({ frames: [fr(1, 1, 0)] }, { frames: [fr(1, 3, 80, -30)] });
    expect(r.pos.over).toBe(1);
    expect(r.cam.flipOk).toBe(false);
  });
});
