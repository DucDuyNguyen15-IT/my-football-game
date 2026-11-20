import { describe, expect, it } from 'vitest';
import golden from './golden-hash.json';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { goldenInput, GOLDEN_SEEDS, GOLDEN_TICKS } from './fixtures/golden';
import { stateHash } from './hash';
import { createMatch, step } from './match';
import { buildMatchSetup } from './replay';

describe('stateHash golden (ghi trước refactor 2 người, T005/T008)', () => {
  it.each(GOLDEN_SEEDS)('seed %i khớp golden-hash.json ở mốc 60/600/cuối trận', (seed) => {
    const want = (golden as Record<string, Record<string, number>>)[String(seed)]!;
    let s = createMatch(
      buildMatchSetup({ seed, difficulty: 'easy', home: starterLikeTeam, away: cpuEasyTeam }),
    );
    const got: Record<string, number> = {};
    for (let i = 0; s.phase !== 'full_time'; i++) {
      s = step(s, goldenInput(i));
      if (GOLDEN_TICKS.includes(s.tick)) got[String(s.tick)] = stateHash(s);
    }
    got.final = stateHash(s);
    got.finalTick = s.tick;
    expect(got).toEqual(want);
  });
});
