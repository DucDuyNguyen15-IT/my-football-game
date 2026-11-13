import { useQuery } from '@tanstack/react-query';
import { RetentionCohort } from '@pitch/shared';
import { z } from 'zod';
import { apiFetch } from './client';

export const adminRetentionKey = (params?: { from?: string; to?: string; days?: number }) =>
  ['admin', 'retention', params?.from ?? '', params?.to ?? '', params?.days ?? ''] as const;

const RetentionList = z.array(RetentionCohort);

/**
 * Lấy danh sách cohort retention theo ngày đăng ký GMT+7 (GET /admin/retention).
 * Chỉ dành cho người dùng có quyền quản trị viên (role admin).
 */
export function useAdminRetention(
  params?: { from?: string; to?: string; days?: number },
  enabled = true,
) {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.days !== undefined) query.set('days', String(params.days));
  const qs = query.toString();
  const path: `/${string}` = qs ? `/admin/retention?${qs}` : '/admin/retention';

  return useQuery({
    queryKey: adminRetentionKey(params),
    queryFn: () => apiFetch(path, RetentionList),
    enabled,
  });
}
