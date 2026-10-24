import { z } from 'zod';
import { dataEnvelope, Id } from './common';

/** Người chơi đang đăng nhập (ARCHITECTURE §4.3 #5). */
export const Me = z.object({
  id: Id,
  username: z.string(),
  coins: z.number().int().min(0),
  freePack5Credits: z.number().int().min(0),
  /** Số trận đã nhận thưởng trong ngày GMT+7 (đếm thật từ task 7.2). */
  rewardedMatchesToday: z.number().int().min(0),
  rewardedMatchesLimit: z.number().int().min(0),
});
export type Me = z.infer<typeof Me>;

/** GET /api/v1/me, POST /auth/login, POST /auth/register. */
export const MeResponse = dataEnvelope(Me);
export type MeResponse = z.infer<typeof MeResponse>;
