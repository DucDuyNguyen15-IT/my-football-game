import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { vec2, ZERO } from './math/vec2';
import { HALF_LENGTH, PENALTY_SPOT_DIST } from './pitch';
import { runPenalties } from './balance';
import { TICK_RATE } from './tick';
import { NO_INPUT, type BallState, type MatchState } from './types';

/*
 * Phạt đền ~75% thành bàn (B1-09): sai số sút phạt đền dùng PENALTY_ERROR_MULT thay cho hệ số sai số
 * theo mức độ khó của AI. Số đo đầy đủ (≥ 1.000 lượt mỗi mức) ở `balance.slow.test.ts`.
 */

/** Quả phạt đền của đội máy (cùng đội, cùng seed) ở mức `difficulty`: bóng lúc vừa rời chân. */
function cpuPenalty(difficulty: 'easy' | 'hard'): BallState {
  const s0 = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed: 11, difficulty });
  const spot = vec2(-(HALF_LENGTH - PENALTY_SPOT_DIST), 0);
  let s: MatchState = {
    ...s0,
    phase: 'dead_ball',
    ball: { pos: spot, vel: ZERO, z: 0, vz: 0 },
    restart: { type: 'penalty', team: 'away', spot, takerId: 'away-P6', startTick: s0.tick },
  };
  for (let i = 0; i < 12 * TICK_RATE && s.restart; i++) s = step(s, NO_INPUT);
  expect(s.restart).toBeNull();
  return s.ball;
}

describe('phạt đền', () => {
  it('sai số sút không theo mức độ khó: cùng người sút, cùng seed → cùng đường bóng', () => {
    expect(cpuPenalty('easy')).toEqual(cpuPenalty('hard'));
  });

  it('luân lưu AI 200 lượt gặp máy Dễ: 65–85% thành bàn (trước khi sửa ~56%)', () => {
    const r = runPenalties('easy', 200);
    expect(r.rate).toBeGreaterThan(0.65);
    expect(r.rate).toBeLessThan(0.85);
  }, 30_000);

  it('người chơi nhắm sát góc, lực đầy (B1b-5): vẫn không vượt quá ~85% (đo 400 lượt: Dễ 72%, Khó 63%)', () => {
    const r = runPenalties('easy', 100, undefined, true);
    expect(r.kicks.home).toBeGreaterThan(40);
    expect(r.goals.home / r.kicks.home).toBeLessThan(0.85);
  }, 30_000);
});
