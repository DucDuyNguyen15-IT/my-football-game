import { z } from 'zod';
import { dataEnvelope } from './common';

function isValidIsoDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Ngày dương lịch dạng `YYYY-MM-DD` (GMT+7). */
export const IsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày phải có dạng YYYY-MM-DD')
  .refine(isValidIsoDate, 'Ngày không hợp lệ');
export type IsoDate = z.infer<typeof IsoDate>;

/** Query của GET /api/v1/admin/retention (ARCHITECTURE §4.3 #19). */
export const RetentionQuery = z
  .object({
    from: IsoDate.optional(),
    to: IsoDate.optional(),
    days: z.coerce.number().int().min(1).max(365).optional(),
  })
  .refine((q) => !q.from || !q.to || q.from <= q.to, {
    message: 'Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc',
    path: ['from'],
  });
export type RetentionQuery = z.infer<typeof RetentionQuery>;

/** Một nhóm ngày đăng ký (cohort GMT+7) và tỉ lệ quay lại ngày 1 / ngày 7. */
export const RetentionCohort = z.object({
  cohortDay: IsoDate,
  registered: z.number().int().min(0),
  /** `null` khi chưa đủ ngày để tính (theo ngày GMT+7 hiện tại). */
  d1: z.number().min(0).max(1).nullable(),
  /** `null` khi chưa đủ 7 ngày sau đăng ký. */
  d7: z.number().min(0).max(1).nullable(),
});
export type RetentionCohort = z.infer<typeof RetentionCohort>;

export const RetentionResponse = dataEnvelope(z.array(RetentionCohort));
export type RetentionResponse = z.infer<typeof RetentionResponse>;
