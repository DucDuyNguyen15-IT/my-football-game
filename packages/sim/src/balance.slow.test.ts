import { describe, expect, it } from 'vitest';
import { BALANCE_SEEDS, BALANCE_TARGET, runBalance } from './balance';

/*
 * Ngưỡng cân bằng độ khó (task 5.13, PRD §5): 100 trận đủ 2 × 180 s mỗi mức, seed cố định.
 * Chậm (vài phút) — chạy bằng `pnpm --filter @pitch/sim test:slow`.
 */
describe('cân bằng độ khó', () => {
  it(`người chơi trung bình thắng máy Dễ ≥ ${BALANCE_TARGET.easyMinWin * 100}%`, () => {
    const r = runBalance('easy', BALANCE_SEEDS);
    expect(r.matches).toBe(BALANCE_SEEDS.length);
    expect(r.winRate).toBeGreaterThanOrEqual(BALANCE_TARGET.easyMinWin);
  });

  it(`người chơi trung bình thắng máy Khó ≤ ${BALANCE_TARGET.hardMaxWin * 100}%`, () => {
    const r = runBalance('hard', BALANCE_SEEDS);
    expect(r.winRate).toBeLessThanOrEqual(BALANCE_TARGET.hardMaxWin);
  });
});
