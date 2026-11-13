// Tiện ích chung cho các script đo hiệu năng (task 8.3) — không chạy trong `pnpm check`.

/**
 * `DATABASE_URL` cho script đo. Script đo xoá/ghi rất nhiều dữ liệu nên bắt buộc đặt tường minh và
 * tên DB phải chứa "perf" (VD `pitch_perf_b`) — không bao giờ chạy trên DB dev/production.
 */
export function perfDatabaseUrl(source: NodeJS.ProcessEnv = process.env): string {
  const url = source.DATABASE_URL;
  if (!url) throw new Error('Cần đặt DATABASE_URL trỏ tới DB đo hiệu năng (VD …/pitch_perf_b)');
  const name = new URL(url).pathname.slice(1);
  if (!name.includes('perf')) {
    throw new Error(`Từ chối chạy trên DB "${name}": tên DB đo hiệu năng phải chứa "perf"`);
  }
  return url;
}

/** Phân vị `p` (0–100) theo cách nearest-rank trên mảng số. */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return Number.NaN;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil((p / 100) * sorted.length);
  return sorted[Math.min(sorted.length, Math.max(1, rank)) - 1]!;
}
