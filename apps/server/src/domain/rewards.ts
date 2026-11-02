// Luật thưởng trận thuần (PRD §7.1, §7 tiêu chí match token) — không đụng DB, không đọc giờ hệ thống.
import type { Difficulty, MatchOutcome } from '@pitch/shared';
import { MATCH_MAX_GOALS, MATCH_REWARD, MATCH_REWARD_DAILY_CAP } from '../config/economy';

export interface ReportedResult {
  homeGoals: number;
  awayGoals: number;
  /** Số bàn luân lưu mỗi đội (chỉ khi hoà). */
  shootout?: { home: number; away: number } | undefined;
}

export type Judgement = { ok: true; outcome: MatchOutcome } | { ok: false; reason: string };

/**
 * Kiểm kết quả client báo lên có hợp lý không (mỗi đội ≤ 20 bàn; luân lưu chỉ khi hoà và phải phân
 * thắng thua) rồi suy ra kết quả theo góc nhìn đội nhà.
 */
export function judgeMatchResult(r: ReportedResult): Judgement {
  if (r.homeGoals > MATCH_MAX_GOALS || r.awayGoals > MATCH_MAX_GOALS) {
    return { ok: false, reason: `Tỉ số không hợp lý (tối đa ${MATCH_MAX_GOALS} bàn mỗi đội)` };
  }
  if (r.homeGoals !== r.awayGoals) {
    if (r.shootout) return { ok: false, reason: 'Chỉ đá luân lưu khi hoà' };
    return { ok: true, outcome: r.homeGoals > r.awayGoals ? 'win' : 'loss' };
  }
  if (!r.shootout) return { ok: true, outcome: 'draw' };
  if (r.shootout.home === r.shootout.away) {
    return { ok: false, reason: 'Luân lưu phải phân định thắng thua' };
  }
  return {
    ok: true,
    outcome: r.shootout.home > r.shootout.away ? 'shootout_win' : 'shootout_loss',
  };
}

/** Xu thưởng một trận; `rewardedToday` = số trận đã nhận thưởng trong ngày, đủ trần → 0. */
export function matchReward(
  difficulty: Difficulty,
  outcome: MatchOutcome,
  rewardedToday: number,
): number {
  if (rewardedToday >= MATCH_REWARD_DAILY_CAP) return 0;
  return MATCH_REWARD[difficulty][outcome];
}

const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Ngày chơi theo GMT+7 (`YYYY-MM-DD`): trần thưởng trận và nhiệm vụ ngày reset lúc 00:00 GMT+7. */
export function gameDay(now: Date): string {
  return new Date(now.getTime() + GMT7_OFFSET_MS).toISOString().slice(0, 10);
}
