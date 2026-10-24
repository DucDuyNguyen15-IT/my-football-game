import { z } from 'zod';
import { Rarity } from '../domain';
import { dataEnvelope } from './common';
import { PlayerCard } from './player-cards';

const perRarity = <T extends z.ZodType>(v: T) =>
  z.object({ bronze: v, silver: v, gold: v, legend: v } satisfies Record<Rarity, T>);

/** Hộp 100 phiếu của người chơi (PRD §6.3): số còn lại, tỉ lệ lần bốc kế (0–1), lần làm mới. */
export const PackBox = z.object({
  left: perRarity(z.number().int().min(0)),
  total: z.number().int().min(0).max(100),
  nextOdds: perRarity(z.number().min(0).max(1)),
  cycle: z.number().int().min(1),
});
export type PackBox = z.infer<typeof PackBox>;

/** Một loại gói trong cửa hàng; giá/kích thước đọc từ config server. */
export const PackInfo = z.object({
  code: z.string(),
  size: z.number().int().min(1),
  price: z.number().int().min(0),
  /** Gói có bảo đảm Bạc+ và hộp hiện còn khả năng bảo đảm (false → UI cảnh báo). */
  guaranteeAvailable: z.boolean(),
});
export type PackInfo = z.infer<typeof PackInfo>;

/** GET /api/v1/packs (ARCHITECTURE §4.3 #11). */
export const PacksResponse = dataEnvelope(z.object({ packs: z.array(PackInfo), box: PackBox }));
export type PacksResponse = z.infer<typeof PacksResponse>;

export const PackPayment = z.enum(['coins', 'free_credit']);
export type PackPayment = z.infer<typeof PackPayment>;

/** POST /api/v1/packs/:code/open — kèm header `Idempotency-Key: <uuid>` (bắt buộc). */
export const OpenPackRequest = z.object({ payment: PackPayment });
export type OpenPackRequest = z.infer<typeof OpenPackRequest>;

export const IdempotencyKey = z.string().uuid();

export const OpenPackResult = z.object({
  cards: z.array(PlayerCard),
  box: PackBox,
  balance: z.number().int().min(0),
  freePack5Credits: z.number().int().min(0),
});
export type OpenPackResult = z.infer<typeof OpenPackResult>;

/** Response mở gói; gửi lại cùng key → trả nguyên văn kết quả lần đầu (ARCHITECTURE §4.3 #12). */
export const OpenPackResponse = dataEnvelope(OpenPackResult);
export type OpenPackResponse = z.infer<typeof OpenPackResponse>;
