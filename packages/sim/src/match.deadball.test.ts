import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, sub, vec2, ZERO } from './math/vec2';
import { TICK_DT } from './tick';
import { NO_INPUT, type MatchState, type TeamSide } from './types';

/*
 * Chờ thực hiện bóng chết không được giật: cầu thủ AI không chạy vào vùng cấm rồi bị luật đẩy ra
 * mỗi tick (vị trí nhảy lệch khỏi vận tốc).
 */

/** Trận đã chạy một lúc (AI đã lập kế hoạch), rồi đặt đá phạt cho `team` tại `spot`. */
function freeKick(seed: number, team: TeamSide): MatchState {
  let s = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed, difficulty: 'easy' });
  for (let i = 0; i < 400 + seed * 50; i++) s = step(s, NO_INPUT);
  const spot = vec2(-3 + seed, -2 + seed);
  const dist = (p: { pos: typeof spot }) => length(sub(p.pos, spot));
  const taker = s.players
    .filter((p) => p.team === team && p.position !== 'GK')
    .reduce((a, b) => (dist(b) < dist(a) ? b : a));
  return {
    ...s,
    phase: 'dead_ball',
    ballDead: true,
    ballOwnerId: null,
    lastShot: null,
    ball: { pos: spot, vel: ZERO, z: 0, vz: 0 },
    restart: { type: 'free_kick', team, spot, takerId: taker.id, startTick: s.tick },
    controlledId: team === 'home' ? taker.id : s.controlledId,
  };
}

describe('chờ đá phạt không giật', () => {
  it.each([3, 4, 5].flatMap((seed) => (['home', 'away'] as const).map((t) => [seed, t] as const)))(
    'seed %i, đội %s được hưởng: không ai bị đẩy lệch vận tốc quá 2 tick',
    (seed, team) => {
      let s = freeKick(seed, team);
      const jumps: Record<string, number> = {};
      for (let i = 0; i < 170 && s.restart; i++) {
        const prev = s;
        s = step(s, NO_INPUT);
        for (const p of s.players) {
          const q = prev.players.find((x) => x.id === p.id)!;
          const off = sub(sub(p.pos, q.pos), vec2(p.vel.x * TICK_DT, p.vel.y * TICK_DT));
          if (length(off) > 0.01) jumps[p.id] = (jumps[p.id] ?? 0) + 1;
        }
      }
      for (const n of Object.values(jumps)) expect(n).toBeLessThanOrEqual(2);
    },
  );
});
