// In golden hash bằng sim HIỆN TẠI (T005): pnpm --filter @pitch/sim exec tsx scripts/golden-hash.ts > src/golden-hash.json
import { createMatch, step } from '../src/match';
import { stateHash } from '../src/hash';
import { cpuEasyTeam, starterLikeTeam } from '../src/fixtures/demoTeams';
import { goldenInput, GOLDEN_SEEDS, GOLDEN_TICKS } from '../src/fixtures/golden';
import { buildMatchSetup } from '../src/replay';

const out: Record<string, Record<string, number>> = {};
for (const seed of GOLDEN_SEEDS) {
  let s = createMatch(
    buildMatchSetup({ seed, difficulty: 'easy', home: starterLikeTeam, away: cpuEasyTeam }),
  );
  const r: Record<string, number> = {};
  for (let i = 0; s.phase !== 'full_time'; i++) {
    s = step(s, goldenInput(i));
    if (GOLDEN_TICKS.includes(s.tick)) r[String(s.tick)] = stateHash(s);
  }
  r.final = stateHash(s);
  r.finalTick = s.tick;
  out[String(seed)] = r;
}
console.log(JSON.stringify(out, null, 2));
