import { z } from 'zod';

/** Mã lỗi dùng chung cho mọi endpoint (docs/ARCHITECTURE.md §4.2). */
export const ErrorCode = z.enum([
  'validation_error',
  'unauthenticated',
  'forbidden',
  'not_found',
  'username_taken',
  'invalid_credentials',
  'login_locked',
  'insufficient_coins',
  'card_in_squad',
  'invalid_material',
  'max_level',
  'invalid_squad',
  'match_token_invalid',
  'idempotency_conflict',
  'rate_limited',
  'internal_error',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.array(z.object({ field: z.string(), message: z.string() })).optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

/** Bọc dữ liệu thành công: `{ data: T }`. */
export const dataEnvelope = <T extends z.ZodType>(schema: T) => z.object({ data: schema });

/** ID trong API luôn là chuỗi số (DB dùng bigint). */
export const Id = z.string().regex(/^\d+$/);
