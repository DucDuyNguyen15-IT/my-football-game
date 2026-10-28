import { z } from 'zod';
import { Difficulty, MatchTeamSetup } from '../match';
import { dataEnvelope, Id } from './common';

/** POST /api/v1/matches — bắt đầu trận vs máy (ARCHITECTURE §4.3 #15, §5.2). */
export const StartMatchRequest = z.object({ difficulty: Difficulty });
export type StartMatchRequest = z.infer<typeof StartMatchRequest>;

export const StartedMatch = z.object({
  matchId: Id,
  /** Match token (32 byte, base64url) — chỉ trả một lần, nộp lại khi gửi kết quả (task 7.2). */
  token: z.string().min(32),
  /** Seed PRNG của sim (uint32). */
  seed: z.number().int().min(0).max(0xffff_ffff),
  rewardEligible: z.boolean(),
  /** Đội người chơi dựng từ đội hình đã lưu, chỉ số hiệu lực (sim dùng thẳng). */
  home: MatchTeamSetup,
  /** Đội máy sinh ở server theo độ khó. */
  away: MatchTeamSetup,
});
export type StartedMatch = z.infer<typeof StartedMatch>;

export const StartMatchResponse = dataEnvelope(StartedMatch);
export type StartMatchResponse = z.infer<typeof StartMatchResponse>;
