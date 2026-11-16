import type { Difficulty, MatchTeamSetup } from '@pitch/shared';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam } from './fixtures/demoTeams';
import { MAX_CHARGE_TICKS, MIN_SHOT_POWER } from './actions/shoot';
import { PENALTY_OVERPOWER_FROM } from './rules/setPieceAim';
import { createMatch, step } from './match';
import { TICK_RATE } from './tick';
import { NO_INPUT, type MatchSetup, type MatchState, type PlayerInput } from './types';

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

/**
 * Đội dùng khi chạy cân bằng. Mặc định là đội mẫu trong `fixtures/`; server truyền đội thật
 * (11 thẻ khởi đầu + bộ sinh đội máy, task 6.11) qua `pnpm --filter @pitch/server balance`.
 */
export interface BalanceTeams {
  home: MatchTeamSetup;
  away: (opponent: Difficulty, seed: number) => MatchTeamSetup;
}

export const FIXTURE_BALANCE_TEAMS: BalanceTeams = {
  home: starterLikeTeam,
  away: (opponent) => (opponent === 'hard' ? cpuHardTeam : cpuEasyTeam),
};

export function balanceSetup(
  opponent: Difficulty,
  seed: number,
  halfLengthSec?: number,
  teams: BalanceTeams = FIXTURE_BALANCE_TEAMS,
): MatchSetup {
  return {
    home: teams.home,
    away: teams.away(opponent, seed),
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
  teams: BalanceTeams = FIXTURE_BALANCE_TEAMS,
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
    const { score } = playRegulation(balanceSetup(opponent, seed, halfLengthSec, teams));
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

/** Phạt đền thành bàn ~75% (PRD §5); test chậm chấp nhận lệch trong khoảng này (đo 1.000 lượt, sai số ~±3 điểm %). */
export const PENALTY_TARGET = { rate: 0.75, min: 0.7, max: 0.8 } as const;

export interface PenaltyResult {
  opponent: Difficulty;
  /** Số lượt sút / số lượt vào của từng đội (nhà = đội người chơi, khách = máy). */
  kicks: Record<'home' | 'away', number>;
  goals: Record<'home' | 'away', number>;
  /** Tỉ lệ vào chung cả hai đội. */
  rate: number;
}

/**
 * Đo tỉ lệ phạt đền thành bàn bằng luân lưu AI-vs-AI: mỗi seed một trận nhảy thẳng tới cuối hiệp 2
 * (hoà 0–0) rồi sút luân lưu tới khi phân định; lặp seed 1, 2, … tới khi đủ `minKicks` lượt.
 * Tham số liên quan: `PENALTY_ERROR_MULT`, `GK_PENALTY_GUESS_RANGE` (`stats/params.ts`).
 * `humanAim`: đội nhà do "người chơi" sút — nhắm sát góc (xen kẽ trái/phải) với lực đầy, đội khách
 * vẫn là máy. Dùng để biết người chơi giỏi vào bao nhiêu % (review B1b-5).
 */
export function runPenalties(
  opponent: Difficulty,
  minKicks = 1000,
  teams: BalanceTeams = FIXTURE_BALANCE_TEAMS,
  humanAim = false,
): PenaltyResult {
  const kicks = { home: 0, away: 0 };
  const goals = { home: 0, away: 0 };
  for (let seed = 1; kicks.home + kicks.away < minKicks; seed++) {
    const s0 = createMatch({
      home: teams.home,
      away: teams.away(opponent, seed),
      seed,
      difficulty: opponent,
      halfLengthSec: 1,
      autopilot: !humanAim,
    });
    let s: MatchState = { ...s0, half: 2, halfTick: TICK_RATE - 1, addedMinutes: 0 };
    for (let i = 0; i < 60 * 60 * TICK_RATE && s.phase !== 'full_time'; i++) {
      s = step(s, humanAim ? aimedPenaltyInput(s) : NO_INPUT);
    }
    for (const team of ['home', 'away'] as const) {
      kicks[team] += s.shootout?.[team].length ?? 0;
      goals[team] += s.shootout?.[team].filter(Boolean).length ?? 0;
    }
  }
  const all = kicks.home + kicks.away;
  return { opponent, kicks, goals, rate: all === 0 ? 0 : (goals.home + goals.away) / all };
}

/**
 * Người chơi sút phạt đền "giỏi": giữ sút tới lực vừa đủ không làm vòng ngắm nở (PENALTY_OVERPOWER_FROM)
 * rồi thả, lúc lấy đà dời vòng tới PENALTY_GOOD_AIM_Y (trái/phải xen kẽ).
 */
function aimedPenaltyInput(s: MatchState): PlayerInput {
  if (s.phase !== 'shootout' || s.restart?.team !== 'home') return NO_INPUT;
  const runUp = s.restart.penaltyRunUp;
  if (runUp) {
    const side = (s.shootout?.home.length ?? 0) % 2 === 0 ? 1 : -1;
    // move.x đổi sang y sân theo chiều tấn công (`movePenaltyAim`).
    const x = Math.abs(runUp.y) < PENALTY_GOOD_AIM_Y ? side * Math.sign(s.restart.spot.x) : 0;
    return { ...NO_INPUT, move: { x, y: 0 } };
  }
  // Chưa nạp thì nhấn/nhả luân phiên (sim cần một lần nhấn mới, sau khi người sút vào vị trí).
  const shoot = s.shotChargeTicks > 0 ? s.shotChargeTicks < GOOD_CHARGE_TICKS : !s.input.shoot;
  return { ...NO_INPUT, shoot };
}

/** Tâm vòng ngắm người chơi giỏi nhắm (m khỏi giữa khung thành) và số tick nạp lực. */
const PENALTY_GOOD_AIM_Y = 1.6;
const GOOD_CHARGE_TICKS = Math.round(
  ((PENALTY_OVERPOWER_FROM - MIN_SHOT_POWER) / (1 - MIN_SHOT_POWER)) * MAX_CHARGE_TICKS,
);
