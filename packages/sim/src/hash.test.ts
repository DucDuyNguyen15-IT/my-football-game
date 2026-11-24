import { describe, expect, it } from 'vitest';
import golden from './golden-hash.json';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { goldenInput, GOLDEN_SEEDS, GOLDEN_TICKS } from './fixtures/golden';
import { stateHash } from './hash';
import { createMatch, step } from './match';
import { buildMatchSetup } from './replay';

describe('stateHash golden (ghi lại 25/11 khi thêm rng/half/halfTick — review C1-3)', () => {
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

describe('stateHash phép chiếu', () => {
  it('lệch rng / hiệp / tick trong hiệp đều đổi hash (C1-3)', () => {
    const s = createMatch(
      buildMatchSetup({ seed: 1, difficulty: 'easy', home: starterLikeTeam, away: cpuEasyTeam }),
    );
    const h = stateHash(s);
    expect(stateHash({ ...s, rng: (s.rng + 1) >>> 0 })).not.toBe(h);
    expect(stateHash({ ...s, half: 2 })).not.toBe(h);
    expect(stateHash({ ...s, halfTick: s.halfTick + 1 })).not.toBe(h);
  });
});
