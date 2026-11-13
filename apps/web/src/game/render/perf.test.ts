import { describe, expect, it } from 'vitest';
import { formatFrameSummary, FrameStats, perfEnabled } from './perf';

describe('perfEnabled', () => {
  it('chỉ bật khi ?perf=1', () => {
    expect(perfEnabled('?perf=1')).toBe(true);
    expect(perfEnabled('?half=10&perf=1')).toBe(true);
    expect(perfEnabled('')).toBe(false);
    expect(perfEnabled('?perf=0')).toBe(false);
  });
});

describe('FrameStats', () => {
  it('chưa có khung nào thì không có tóm tắt', () => {
    expect(new FrameStats().summary()).toBeNull();
  });

  it('tính FPS trung bình và 1% thấp nhất', () => {
    const stats = new FrameStats();
    // 198 khung 10 ms + 2 khung 50 ms = 2080 ms.
    for (let i = 0; i < 198; i++) stats.record(10);
    stats.record(50);
    stats.record(50);
    const s = stats.summary()!;
    expect(s.frames).toBe(200);
    expect(s.seconds).toBeCloseTo(2.08);
    expect(s.avgFps).toBeCloseTo(200 / 2.08);
    // 1% của 200 khung = 2 khung chậm nhất (50 ms) → 20 FPS.
    expect(s.low1Fps).toBeCloseTo(20);
    expect(s.worstFrameMs).toBe(50);
  });

  it('dưới 100 khung vẫn lấy 1 khung chậm nhất', () => {
    const stats = new FrameStats();
    stats.record(16);
    stats.record(40);
    expect(stats.summary()!.low1Fps).toBeCloseTo(25);
  });

  it('bỏ khung không hợp lệ và khung lúc tab bị ẩn', () => {
    const stats = new FrameStats();
    stats.record(0);
    stats.record(-5);
    stats.record(Number.NaN);
    stats.record(5000);
    expect(stats.summary()).toBeNull();
  });

  it('in tóm tắt một dòng', () => {
    const stats = new FrameStats();
    for (let i = 0; i < 100; i++) stats.record(20);
    expect(formatFrameSummary(stats.summary()!)).toBe(
      '[perf] FPS TB 50.0 · 1% thấp nhất 50.0 · khung chậm nhất 20.0 ms · 100 khung / 2.0 s',
    );
  });
});
