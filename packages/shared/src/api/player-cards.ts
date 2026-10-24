import { z } from 'zod';
import { PlayerStats } from '../domain';
import { Id } from './common';

/** Thẻ người chơi sở hữu (ARCHITECTURE §4.3 #7). `effectiveStats` đã áp cấp + (và phạt sai vị trí nếu đang đá chính). */
export const PlayerCard = z.object({
  id: Id,
  cardId: Id,
  level: z.number().int().min(0).max(5),
  luck: z.number().int().min(0).max(100),
  inSquad: z.boolean(),
  effectiveStats: PlayerStats,
});
export type PlayerCard = z.infer<typeof PlayerCard>;
