import { z } from 'zod';
import { Formation } from '../domain';
import { SquadSlot } from '../match';
import { dataEnvelope, Id } from './common';

/** Ô → id thẻ (`PlayerCard.id`) hoặc trống. Request có thể bỏ ô trống; response luôn đủ 12 ô. */
const slotsShape = Object.fromEntries(
  SquadSlot.options.map((s) => [s, Id.nullable().optional()]),
) as Record<SquadSlot, z.ZodOptional<z.ZodNullable<typeof Id>>>;
export const SquadSlots = z.object(slotsShape).strict();
export type SquadSlots = z.infer<typeof SquadSlots>;

export const SquadWarningSchema = z.object({
  code: z.enum(['missing_gk', 'missing_starters', 'misposition']),
  slot: SquadSlot.optional(),
  message: z.string(),
});

/** Đội hình (ARCHITECTURE §4.3 #13–14). */
export const Squad = z.object({
  formation: Formation,
  slots: z.record(SquadSlot, Id.nullable()),
  /** TB OVR hiệu lực 7 người đá chính (ô trống tính 0). */
  teamRating: z.number().int().min(0).max(99),
  warnings: z.array(SquadWarningSchema),
});
export type Squad = z.infer<typeof Squad>;

export const SquadResponse = dataEnvelope(Squad);
export type SquadResponse = z.infer<typeof SquadResponse>;

/** PUT /api/v1/squad — thay toàn bộ đội hình (idempotent). */
export const PutSquadRequest = z.object({ formation: Formation, slots: SquadSlots });
export type PutSquadRequest = z.infer<typeof PutSquadRequest>;
