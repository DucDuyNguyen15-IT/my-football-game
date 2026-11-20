// pnpm --filter @pitch/server bench:pvp-sim — đo chi phí một `step` của sim bóng qua trận đầy đủ (T007, R11).
// Ngưỡng dùng p99 (không dùng trung bình): sim bóng ≤ 40% một lõi ở 60 tick/s → số phiên tối đa.
// Đo `stepBoth` với hai đội người đều có input (T008/T009); trước đó đo `step` một đội người.
// Không nằm trong `pnpm check`. Chạy bằng Node 24: kết quả phụ thuộc máy.
import { performance } from 'node:perf_hooks';
import os from 'node:os';
import {
  TICK_RATE,
  cpuHardTeam,
  createMatch,
  decodeInput,
  nextInt,
  seedRng,
  starterLikeTeam,
  stepBoth,
  type MatchState,
  type TeamInputs,
} from '@pitch/sim';
import { percentile } from './bench-util';

const SEEDS = Number(process.env.BENCH_SEEDS ?? 12);
const WARMUP_MATCHES = 2;
const CPU_BUDGET = 0.4;

/** Một trận đầy đủ hai đội người, input mỗi đội đổi mỗi 5–40 tick; ghi thời gian (ms) của từng `stepBoth`. */
function timeMatch(seed: number, out: number[] | null): void {
  let s: MatchState = createMatch({
    home: starterLikeTeam,
    away: cpuHardTeam,
    seed,
    difficulty: 'hard',
    humans: ['home', 'away'],
  });
  let rng = seedRng(seed * 7919 + 1);
  let inputs: TeamInputs = { home: decodeInput(0), away: decodeInput(0) };
  let hold = 0;
  while (s.phase !== 'full_time') {
    if (hold-- <= 0) {
      let v: number;
      let w: number;
      [v, rng] = nextInt(rng, 0, 9 * 512 - 1);
      [w, rng] = nextInt(rng, 0, 9 * 512 - 1);
      inputs = {
        home: decodeInput(v % 3 === 0 ? v : v % 9),
        away: decodeInput(w % 3 === 0 ? w : w % 9),
      };
      [hold, rng] = nextInt(rng, 5, 40);
    }
    const t0 = performance.now();
    s = stepBoth(s, inputs);
    const dt = performance.now() - t0;
    if (out) out.push(dt);
  }
}

for (let i = 0; i < WARMUP_MATCHES; i++) timeMatch(1000 + i, null);
const samples: number[] = [];
for (let seed = 1; seed <= SEEDS; seed++) timeMatch(seed, samples);

const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
const p99 = percentile(samples, 99);
const budgetMs = (1000 / TICK_RATE) * CPU_BUDGET; // ms CPU mỗi tick dành cho sim ở 40% một lõi
const maxSessions = (m: number) => Math.floor(budgetMs / m);
console.log(`Node ${process.version}, ${os.cpus()[0]?.model.trim()} (${os.cpus().length} luồng)`);
console.log(`${SEEDS} trận, ${samples.length} stepBoth`);
console.log(`mean ${mean.toFixed(4)} ms | p50 ${percentile(samples, 50).toFixed(4)} ms | p99 ${p99.toFixed(4)} ms | max ${percentile(samples, 100).toFixed(3)} ms`);
console.log(`Số phiên tối đa (≤ ${CPU_BUDGET * 100}% một lõi @ ${TICK_RATE} tick/s): theo p99 = ${maxSessions(p99)}, theo mean = ${maxSessions(mean)}`);
