/**
 * `pnpm --filter @pitch/server balance [số trận]` — cân bằng độ khó với đội THẬT (task 6.11): 11 thẻ
 * khởi đầu (`STARTER_SQUAD`, đúng như sau đăng ký) gặp đội máy do `generateCpuTeam` sinh (mỗi seed
 * một đội, PRNG có seed để tái hiện). Bản dùng đội mẫu: `pnpm --filter @pitch/sim balance`.
 */
import { BALANCE_SEEDS, BALANCE_TARGET, runBalance, type BalanceResult } from '@pitch/sim';
import type { SquadSlot } from '@pitch/shared';
import { STARTER_SQUAD } from '../src/config/economy';
import { readSeedCards } from '../src/db/seed';
import { buildHomeTeam, generateCpuTeam, type SquadEntry } from '../src/domain/match-teams';
import { seededRng } from '../test/stats';

const catalog = readSeedCards();
const byId = new Map(catalog.map((c) => [c.id, c]));
const slots: Partial<Record<SquadSlot, SquadEntry>> = {};
for (const [slot, id] of STARTER_SQUAD.slots)
  slots[slot] = { card: byId.get(String(id))!, level: 0 };
const home = buildHomeTeam(STARTER_SQUAD.formation, slots);
if (!home.ok) throw new Error('STARTER_SQUAD thiếu người đá chính');

const n = Number(process.argv[2] ?? BALANCE_SEEDS.length);
const seeds = BALANCE_SEEDS.slice(0, Number.isFinite(n) && n > 0 ? n : BALANCE_SEEDS.length);
const pct = (x: number) => `${(x * 100).toFixed(0)}%`;
const line = (r: BalanceResult) =>
  `${r.opponent.padEnd(4)}  thắng ${pct(r.winRate).padStart(4)}  ` +
  `(T${r.wins}/H${r.draws}/B${r.losses}, bàn ${r.goalsFor}–${r.goalsAgainst})`;

const teams = {
  home: home.team,
  away: (opponent: 'easy' | 'hard', seed: number) =>
    generateCpuTeam(catalog, opponent, seededRng(seed)),
};
for (const opponent of ['easy', 'hard'] as const) {
  console.log(line(runBalance(opponent, seeds, undefined, teams)));
}
console.log(
  `Mục tiêu: thắng Dễ ≥ ${pct(BALANCE_TARGET.easyMinWin)}, thắng Khó ≤ ${pct(BALANCE_TARGET.hardMaxWin)}`,
);
