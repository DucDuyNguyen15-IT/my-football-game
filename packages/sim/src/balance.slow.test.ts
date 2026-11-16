import { describe, expect, it } from 'vitest';
import { BALANCE_SEEDS, BALANCE_TARGET, PENALTY_TARGET, runBalance, runPenalties } from './balance';

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

describe('phạt đền ~75% thành bàn (B1-09)', () => {
  it('luân lưu AI gặp máy Khó, 1.000 lượt', () => {
    const r = runPenalties('hard', 1000);
    expect(r.kicks.home + r.kicks.away).toBeGreaterThanOrEqual(1000);
    expect(r.rate).toBeGreaterThanOrEqual(PENALTY_TARGET.min);
    expect(r.rate).toBeLessThanOrEqual(PENALTY_TARGET.max);
  });

  it('luân lưu AI gặp máy Dễ, 2.000 lượt: máy sút vẫn ~75%, đội người chơi dễ ghi bàn hơn (luật 4)', () => {
    const r = runPenalties('easy', 2000);
    const cpu = r.goals.away / r.kicks.away;
    // 2.000 lượt (~1.000 mỗi đội) cho sai số như phép đo 1.000 lượt cả hai đội trước đây.
    expect(cpu).toBeGreaterThanOrEqual(PENALTY_TARGET.min);
    expect(cpu).toBeLessThanOrEqual(PENALTY_TARGET.max);
    // Thủ môn máy Dễ đoán sai nhiều hơn: `penaltyGuessMult` 0,8 (từ khi thu nhỏ vòng ngắm phạt đền)
    // đo 2.000 lượt đội khởi đầu 80,4% (máy ~75%).
    expect(r.goals.home / r.kicks.home).toBeGreaterThanOrEqual(0.78);
  });
});
