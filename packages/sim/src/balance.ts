import type { Difficulty } from '@pitch/shared';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { TICK_RATE } from './tick';
import { NO_INPUT, type MatchSetup, type MatchState } from './types';

/*
 * Cân bằng độ khó (task 5.13, PRD §5): đội của người chơi do hồ sơ AI `proxy` (người chơi trung
 * bình) điều khiển, đá headless với máy Dễ / Khó trên danh sách seed cố định. Mục tiêu: thắng Dễ
 * ≥ 60%, thắng Khó ≤ 30%. Thắng/hoà/thua theo tỉ số sau 2 hiệp (luân lưu không tính).
 */

export const BALANCE_SEEDS: readonly number[] = Array.from({ length: 100 }, (_, i) => i + 1);
export const BALANCE_TARGET = { easyMinWin: 0.6, hardMaxWin: 0.3 } as const;

export interface BalanceResult {
  opponent: Difficulty;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  winRate: number;
}

export function balanceSetup(
  opponent: Difficulty,
  seed: number,
  halfLengthSec?: number,
): MatchSetup {
  return {
    home: starterLikeTeam,
    away: opponent === 'hard' ? cpuHardTeam : cpuEasyTeam,
    seed,
    difficulty: opponent,
    autopilot: true,
    homeAi: 'proxy',
    ...(halfLengthSec !== undefined && { halfLengthSec }),
  };
}

/** Đá hết 2 hiệp (dừng ngay khi vào luân lưu hoặc hết trận). */
export function playRegulation(setup: MatchSetup): MatchState {
  let s = createMatch(setup);
  const halfSec = setup.halfLengthSec ?? 180;
  // Trần an toàn: 2 hiệp + bù giờ + chờ bóng chết, gấp 3 lần thời lượng chính thức.
  const maxTicks = 3 * 2 * halfSec * TICK_RATE;
  for (let i = 0; i < maxTicks && s.phase !== 'full_time' && s.phase !== 'shootout'; i++) {
    s = step(s, NO_INPUT);
  }
  return s;
}

export function runBalance(
  opponent: Difficulty,
  seeds: readonly number[] = BALANCE_SEEDS,
  halfLengthSec?: number,
): BalanceResult {
  const r: BalanceResult = {
    opponent,
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    winRate: 0,
  };
  for (const seed of seeds) {
    const { score } = playRegulation(balanceSetup(opponent, seed, halfLengthSec));
    r.matches++;
    r.goalsFor += score.home;
    r.goalsAgainst += score.away;
    if (score.home > score.away) r.wins++;
    else if (score.home === score.away) r.draws++;
    else r.losses++;
  }
  r.winRate = r.matches === 0 ? 0 : r.wins / r.matches;
  return r;
}
