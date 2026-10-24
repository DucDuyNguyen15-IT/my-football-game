import { z } from 'zod';
import { PlayerStats, Position, Rarity } from '../domain';
import { dataEnvelope, Id } from './common';

/** Một mẫu thẻ trong danh mục (ARCHITECTURE §3.2 `cards`). */
export const Card = z.object({
  id: Id,
  code: z.string(),
  name: z.string(),
  nickname: z.string(),
  position: Position,
  rarity: Rarity,
  stats: PlayerStats,
  ovr: z.number().int().min(1).max(99),
  /** Tham số sinh ảnh đại diện (không dùng ảnh thật). */
  avatarSeed: z.string(),
});
export type Card = z.infer<typeof Card>;

/** GET /api/v1/cards — toàn bộ danh mục, có `ETag`. */
export const CardsResponse = dataEnvelope(z.array(Card));
export type CardsResponse = z.infer<typeof CardsResponse>;
