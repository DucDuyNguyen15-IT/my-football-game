import { stateHash } from '../hash';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam } from './demoTeams';
import { playScriptedMatch } from './scriptedMatch';
import { buildMatchSetup } from '../replay';

/**
 * Trận đầy đủ theo `seed` với input giả ngẫu nhiên có seed (T005/T006). Trả `stateHash` sau mỗi
 * `every` tick (mặc định 60) và hash cuối trận. Seed lẻ bật autopilot, seed chia 3 dư 0 dùng đội Khó.
 */
export function hashTrace(seed: number, every = 60, opts: { maxTicks?: number } = {}): number[] {
  const hard = seed % 3 === 0;
  const setup = buildMatchSetup(
    {
      seed,
      difficulty: hard ? 'hard' : 'easy',
      home: starterLikeTeam,
      away: hard ? cpuHardTeam : cpuEasyTeam,
    },
    { autopilot: seed % 2 === 1 },
  );
  const out: number[] = [];
  const { final } = playScriptedMatch(setup, seed, {
    ...opts,
    onStep: (s) => {
      if (s.tick % every === 0) out.push(stateHash(s));
    },
  });
  out.push(stateHash(final));
  return out;
}
