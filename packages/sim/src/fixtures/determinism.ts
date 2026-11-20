import { stateHash } from '../hash';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam } from './demoTeams';
import { playScriptedMatch } from './scriptedMatch';
import { createMatch, stepBoth } from '../match';
import { decodeInput, buildMatchSetup } from '../replay';
import { nextInt, seedRng } from '../rng';
import { NO_INPUT, type PlayerInput } from '../types';

/** Seed chia hết cho 5 đá biến thể hai người (`humans: ['home','away']`, `stepBoth`). */
export const isTwoHuman = (seed: number): boolean => seed % 5 === 0;

/** Input giả ngẫu nhiên giống `playScriptedMatch` (đổi mỗi 5–40 tick) nhưng seed RIÊNG cho từng đội. */
function inputGen(seed: number): () => PlayerInput {
  let rng = seedRng(seed);
  let input: PlayerInput = NO_INPUT;
  let hold = 0;
  return () => {
    if (hold-- <= 0) {
      let v: number;
      [v, rng] = nextInt(rng, 0, 9 * 512 - 1);
      input = decodeInput(v % 3 === 0 ? v : v % 9);
      [hold, rng] = nextInt(rng, 5, 40);
    }
    return input;
  };
}

/**
 * Trận đầy đủ theo `seed` với input giả ngẫu nhiên có seed (T005/T006). Trả `stateHash` sau mỗi
 * `every` tick (mặc định 60) và hash cuối trận. Seed lẻ bật autopilot, seed chia 3 dư 0 dùng đội Khó, seed chia hết 5 đá hai người.
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
  if (isTwoHuman(seed)) {
    const home = inputGen(seed);
    const away = inputGen(seed + 7919);
    let s = createMatch({ ...setup, humans: ['home', 'away'] });
    const maxTicks = opts.maxTicks ?? 60 * 60 * 40;
    while (s.phase !== 'full_time' && s.tick < maxTicks) {
      s = stepBoth(s, { home: home(), away: away() });
      if (s.tick % every === 0) out.push(stateHash(s));
    }
    out.push(stateHash(s));
    return out;
  }
  const { final } = playScriptedMatch(setup, seed, {
    ...opts,
    onStep: (s) => {
      if (s.tick % every === 0) out.push(stateHash(s));
    },
  });
  out.push(stateHash(final));
  return out;
}
