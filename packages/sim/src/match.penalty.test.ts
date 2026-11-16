import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { vec2, ZERO } from './math/vec2';
import { HALF_LENGTH, PENALTY_SPOT_DIST } from './pitch';
import { AI_PROFILES } from './ai/difficulty';
import { penaltyGuess } from './ai/goalkeeper';
import { runPenalties } from './balance';
import { seedRng } from './rng';
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
    restart: {
      type: 'penalty',
      team: 'away',
      spot,
      takerId: 'away-P6',
      startTick: s0.tick,
      readyTick: s0.tick,
    },
  };
  for (let i = 0; i < 12 * TICK_RATE && s.restart; i++) s = step(s, NO_INPUT);
  expect(s.restart).toBeNull();
  return s.ball;
}

describe('phạt đền', () => {
  it('sai số sút không theo mức độ khó: cùng người sút, cùng seed → cùng đường bóng', () => {
    expect(cpuPenalty('easy')).toEqual(cpuPenalty('hard'));
  });

  it('luân lưu AI 200 lượt gặp máy Dễ: cú sút của máy vẫn 65–85% thành bàn (trước khi sửa ~56%)', () => {
    const r = runPenalties('easy', 200);
    const rate = r.goals.away / r.kicks.away;
    expect(rate).toBeGreaterThan(0.65);
    expect(rate).toBeLessThan(0.85);
  }, 30_000);

  it('người chơi nhắm vòng tròn sát góc (B1b-5, đợt 6): vẫn không vượt quá ~85%', () => {
    // 1.000 lượt (trước 100): mẫu ~50 quả của đội nhà dao động ±6 điểm %, sát trần sau luật 4.
    const r = runPenalties('easy', 1000, undefined, true);
    expect(r.kicks.home).toBeGreaterThan(400);
    expect(r.goals.home / r.kicks.home).toBeLessThan(0.85);
  }, 30_000);
});

/*
 * Luật 4 (2026-11-15): thủ môn máy Dễ cản phạt đền kém hơn — đoán đúng hướng chỉ bằng nửa bình thường
 * (`AiProfile.penaltyGuessMult`). Cú sút phạt đền của máy và mức Khó không đổi.
 */
describe('máy Dễ: thủ môn bắt phạt đền kém hơn (luật 4)', () => {
  it('chỉ hồ sơ máy Dễ giảm xác suất đoán đúng hướng', () => {
    expect(AI_PROFILES.easy.penaltyGuessMult).toBeLessThan(1);
    expect(AI_PROFILES.hard.penaltyGuessMult).toBe(1);
    expect(AI_PROFILES.teammate.penaltyGuessMult).toBe(1);
    expect(AI_PROFILES.proxy.penaltyGuessMult).toBe(1);
  });

  it('penaltyGuess: hệ số càng nhỏ thủ môn càng hay đoán sai, 0 thì luôn sai; PRNG tiến như nhau', () => {
    const gk = createMatch({
      home: starterLikeTeam,
      away: cpuEasyTeam,
      seed: 1,
      difficulty: 'easy',
    }).players.find((p) => p.id === 'away-GK')!;
    const ball: BallState = { pos: ZERO, vel: vec2(20, 5), z: 0, vz: 0 };
    const right = (mult: number): number => {
      let n = 0;
      for (let seed = 1; seed <= 400; seed++) {
        const full = penaltyGuess(gk, ball, seedRng(seed));
        const g = penaltyGuess(gk, ball, seedRng(seed), mult);
        // Bóng lệch hẳn một phía: luôn đúng 1 lần gieo, không phụ thuộc hệ số.
        expect(g.rng).toEqual(full.rng);
        if (g.guess === null) n++;
      }
      return n;
    };
    expect(right(0)).toBe(0);
    expect(right(0.5)).toBeGreaterThan(0);
    expect(right(0.5)).toBeLessThan(right(1));
  });

  it('thống kê nhiều seed, cùng đội máy, chỉ đổi mức: người chơi ghi phạt đền trước máy Dễ nhiều hơn rõ rệt; cú sút của máy không đổi', () => {
    // Cùng một đội khách (cùng thủ môn, cùng người sút) ở cả hai mức → chênh lệch chỉ do hồ sơ AI.
    const teams = { home: starterLikeTeam, away: () => cpuEasyTeam };
    const rate = (r: ReturnType<typeof runPenalties>, team: 'home' | 'away') =>
      r.goals[team] / r.kicks[team];
    // Người chơi nhắm vòng tròn sát góc, lực vừa (đợt 6). Đo 6.400 lượt: Dễ 80,0% — Khó 68,4%
    // (máy sút 77,0% / 77,0%).
    const easy = runPenalties('easy', 2000, teams, true);
    const hard = runPenalties('hard', 2000, teams, true);
    expect(easy.kicks.home).toBeGreaterThan(800);
    expect(hard.kicks.home).toBeGreaterThan(800);
    expect(rate(easy, 'home')).toBeGreaterThan(rate(hard, 'home') + 0.04);
    expect(Math.abs(rate(easy, 'away') - rate(hard, 'away'))).toBeLessThan(0.04);
  }, 60_000);
});
