import { z } from 'zod';
import { Difficulty, MatchOutcome, MatchTeamSetup } from '../match';
import { dataEnvelope, Id } from './common';

/** POST /api/v1/matches — bắt đầu trận vs máy (ARCHITECTURE §4.3 #15, §5.2). */
export const StartMatchRequest = z.object({ difficulty: Difficulty });
export type StartMatchRequest = z.infer<typeof StartMatchRequest>;

export const StartedMatch = z.object({
  matchId: Id,
  /** Match token (32 byte, base64url) — chỉ trả một lần, nộp lại khi gửi kết quả. */
  token: z.string().min(32),
  /** Seed PRNG của sim (uint32). */
  seed: z.number().int().min(0).max(0xffff_ffff),
  /**
   * Lúc bắt đầu còn trong 15 trận có thưởng/ngày (GMT+7) không — để UI báo trước. Thưởng thật do
   * server đếm lại lúc nộp kết quả.
   */
  rewardEligible: z.boolean(),
  /** Đội người chơi dựng từ đội hình đã lưu, chỉ số hiệu lực (sim dùng thẳng). */
  home: MatchTeamSetup,
  /** Đội máy sinh ở server theo độ khó. */
  away: MatchTeamSetup,
});
export type StartedMatch = z.infer<typeof StartedMatch>;

export const StartMatchResponse = dataEnvelope(StartedMatch);
export type StartMatchResponse = z.infer<typeof StartMatchResponse>;

/** Số bàn client báo lên. Trần hợp lý 20 (PRD §7) do server kiểm → 422 `match_token_invalid`. */
const Goals = z.number().int().min(0).max(999);

/**
 * POST /api/v1/matches/:id/result (ARCHITECTURE §4.3 #16, §5.2 bước 3). `shootout` = số bàn luân
 * lưu mỗi đội, chỉ hợp lệ khi tỉ số chính hoà và hai số khác nhau. Nộp lại cùng token cho trận đã
 * xong → trả kết quả cũ (client retry an toàn).
 */
export const SubmitMatchResultRequest = z.object({
  token: z.string().min(1).max(128),
  homeGoals: Goals,
  awayGoals: Goals,
  shootout: z.object({ home: Goals, away: Goals }).optional(),
});
export type SubmitMatchResultRequest = z.infer<typeof SubmitMatchResultRequest>;

export const MatchResult = z.object({
  outcome: MatchOutcome,
  /** Xu nhận từ trận này; 0 khi đã hết trận có thưởng trong ngày. */
  reward: z.number().int().min(0),
  /** Số dư xu hiện tại. */
  balance: z.number().int().min(0),
  /** Tiến độ nhiệm vụ ngày — luôn rỗng tới task 7.4. */
  missions: z.array(z.never()),
});
export type MatchResult = z.infer<typeof MatchResult>;

export const MatchResultResponse = dataEnvelope(MatchResult);
export type MatchResultResponse = z.infer<typeof MatchResultResponse>;
