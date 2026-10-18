/**
 * `pnpm --filter @pitch/sim balance [số trận]` — chạy cân bằng độ khó (task 5.13) và in tỉ lệ thắng
 * của hồ sơ `proxy` trước máy Dễ / Khó. Mặc định 100 trận mỗi mức, seed cố định.
 */
import { BALANCE_SEEDS, BALANCE_TARGET, runBalance, type BalanceResult } from '../src/balance';

const n = Number(process.argv[2] ?? BALANCE_SEEDS.length);
const seeds = BALANCE_SEEDS.slice(0, Number.isFinite(n) && n > 0 ? n : BALANCE_SEEDS.length);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const line = (r: BalanceResult) =>
  `${r.opponent.padEnd(4)}  thắng ${pct(r.winRate).padStart(4)}  ` +
  `(T${r.wins}/H${r.draws}/B${r.losses}, bàn ${r.goalsFor}–${r.goalsAgainst})`;

for (const opponent of ['easy', 'hard'] as const) {
  console.log(line(runBalance(opponent, seeds)));
}
console.log(
  `Mục tiêu: thắng Dễ ≥ ${pct(BALANCE_TARGET.easyMinWin)}, thắng Khó ≤ ${pct(BALANCE_TARGET.hardMaxWin)}`,
);
