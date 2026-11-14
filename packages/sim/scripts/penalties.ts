/**
 * `pnpm --filter @pitch/sim penalties [số lượt tối thiểu]` — đo tỉ lệ phạt đền thành bàn bằng luân
 * lưu AI-vs-AI (đội khởi đầu gặp máy Dễ / Khó), seed cố định. Mặc định ≥ 1000 lượt mỗi mức.
 * Mục tiêu ~75% (PRD §5); tham số: `PENALTY_ERROR_MULT` và `GK_PENALTY_GUESS_RANGE`.
 */
import { PENALTY_TARGET, runPenalties } from '../src/balance';

const minKicks = Number(process.argv[2] ?? 1000);
const pct = (a: number, b: number) => `${((100 * a) / Math.max(1, b)).toFixed(1)}%`;

for (const difficulty of ['easy', 'hard'] as const) {
  const { kicks, goals } = runPenalties(difficulty, minKicks);
  const all = kicks.home + kicks.away;
  console.log(
    `${difficulty.padEnd(4)}  ${goals.home + goals.away}/${all} vào = ${pct(goals.home + goals.away, all)}  ` +
      `(đội khởi đầu ${pct(goals.home, kicks.home)}, máy ${pct(goals.away, kicks.away)})`,
  );
}
console.log(`Mục tiêu: ~${PENALTY_TARGET.rate * 100}%`);
