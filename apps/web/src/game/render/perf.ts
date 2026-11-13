/**
 * Đo FPS cả trận (task 8.3, PRD §10: ≥ 55 FPS trung bình). Thuần (không Three.js/DOM) để test.
 * Bật bằng `?perf=1` trên `/play`; không bật thì renderer không tạo đối tượng này.
 */

export interface FrameSummary {
  /** Số khung hình đã ghi. */
  frames: number;
  /** Tổng thời gian đo (giây). */
  seconds: number;
  /** FPS trung bình = số khung / tổng thời gian. */
  avgFps: number;
  /** "1% low": FPS trung bình của 1% khung hình chậm nhất (ít nhất 1 khung). */
  low1Fps: number;
  /** Khung hình chậm nhất (ms). */
  worstFrameMs: number;
}

/** Bỏ khung dài hơn mức này (tab bị ẩn, Alt+Tab): không phản ánh tốc độ vẽ. */
export const PERF_MAX_FRAME_MS = 1000;

export function perfEnabled(search: string): boolean {
  return new URLSearchParams(search).get('perf') === '1';
}

/** Gom thời gian từng khung hình (ms) rồi tóm tắt FPS trung bình và 1% thấp nhất. */
export class FrameStats {
  private readonly frames: number[] = [];

  record(frameMs: number): void {
    if (!(frameMs > 0) || frameMs > PERF_MAX_FRAME_MS) return;
    this.frames.push(frameMs);
  }

  summary(): FrameSummary | null {
    const n = this.frames.length;
    if (n === 0) return null;
    const total = this.frames.reduce((a, b) => a + b, 0);
    const slowest = [...this.frames].sort((a, b) => b - a);
    const lowCount = Math.max(1, Math.floor(n / 100));
    const lowTotal = slowest.slice(0, lowCount).reduce((a, b) => a + b, 0);
    return {
      frames: n,
      seconds: total / 1000,
      avgFps: (n * 1000) / total,
      low1Fps: (lowCount * 1000) / lowTotal,
      worstFrameMs: slowest[0]!,
    };
  }
}

export function formatFrameSummary(s: FrameSummary): string {
  return (
    `[perf] FPS TB ${s.avgFps.toFixed(1)} · 1% thấp nhất ${s.low1Fps.toFixed(1)} · ` +
    `khung chậm nhất ${s.worstFrameMs.toFixed(1)} ms · ${s.frames} khung / ${s.seconds.toFixed(1)} s`
  );
}
