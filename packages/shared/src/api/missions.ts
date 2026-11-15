import { z } from 'zod';
import { dataEnvelope } from './common';

/** Tiến độ một nhiệm vụ ngày của người chơi (ARCHITECTURE §4.3 #16–17, PRD §7.1 F12). */
export const MissionProgress = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  progress: z.number().int().min(0),
  target: z.number().int().min(1),
  reward: z.number().int().min(1),
  claimed: z.boolean(),
});
export type MissionProgress = z.infer<typeof MissionProgress>;

/** GET /api/v1/missions/today (ARCHITECTURE §4.3 #17). */
export const TodayMissionsResponse = dataEnvelope(z.array(MissionProgress));
export type TodayMissionsResponse = z.infer<typeof TodayMissionsResponse>;

/** POST /api/v1/missions/:code/claim (ARCHITECTURE §4.3 #18). */
export const ClaimMissionResult = z.object({
  reward: z.number().int().min(1),
  balance: z.number().int().min(0),
});
export type ClaimMissionResult = z.infer<typeof ClaimMissionResult>;

export const ClaimMissionResponse = dataEnvelope(ClaimMissionResult);
export type ClaimMissionResponse = z.infer<typeof ClaimMissionResponse>;

/** Một nhiệm vụ của ngày trước đã xong mà chưa nhận, server tự nhận hộ khi hết hạn. */
export const AutoClaimedMission = z.object({
  code: z.string().min(1),
  title: z.string().min(1),
  /** Ngày GMT+7 của nhiệm vụ (YYYY-MM-DD). */
  day: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  reward: z.number().int().min(1),
});
export type AutoClaimedMission = z.infer<typeof AutoClaimedMission>;

/**
 * POST /api/v1/missions/expired/claim: tự nhận thưởng các nhiệm vụ ngày cũ đã xong mà quên nhận
 * (người dùng chốt 15/11). Mỗi nhiệm vụ chỉ được trả về đúng một lần — client hiện bảng thông báo.
 */
export const ExpiredClaimResult = z.object({
  items: z.array(AutoClaimedMission),
  balance: z.number().int().min(0),
});
export type ExpiredClaimResult = z.infer<typeof ExpiredClaimResult>;

export const ExpiredClaimResponse = dataEnvelope(ExpiredClaimResult);
export type ExpiredClaimResponse = z.infer<typeof ExpiredClaimResponse>;
