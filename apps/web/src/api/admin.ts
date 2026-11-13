import { useQuery } from '@tanstack/react-query';
import { OnboardingStats, RetentionCohort } from '@pitch/shared';
import { z } from 'zod';
import { apiFetch } from './client';

export const adminRetentionKey = (params?: { from?: string; to?: string; days?: number }) =>
  ['admin', 'retention', params?.from ?? '', params?.to ?? '', params?.days ?? ''] as const;

export const adminOnboardingKey = (params?: { from?: string; to?: string; days?: number }) =>
  ['admin', 'onboarding', params?.from ?? '', params?.to ?? '', params?.days ?? ''] as const;

const RetentionList = z.array(RetentionCohort);

function buildAdminQueryPath(
  base: `/${string}`,
  params?: { from?: string; to?: string; days?: number },
): `/${string}` {
  const query = new URLSearchParams();
  if (params?.from) query.set('from', params.from);
  if (params?.to) query.set('to', params.to);
  if (params?.days !== undefined) query.set('days', String(params.days));
  const qs = query.toString();
  return qs ? (`${base}?${qs}` as `/${string}`) : base;
}

/**
 * Lấy danh sách cohort retention theo ngày đăng ký GMT+7 (GET /admin/retention).
 * Chỉ dành cho người dùng có quyền quản trị viên (role admin).
 */
export function useAdminRetention(
  params?: { from?: string; to?: string; days?: number },
  enabled = true,
) {
  const path = buildAdminQueryPath('/admin/retention', params);

  return useQuery({
    queryKey: adminRetentionKey(params),
    queryFn: () => apiFetch(path, RetentionList),
    enabled,
  });
}

/**
 * Thống kê phễu `register -> match_start` (GET /admin/onboarding): thời gian trung vị từ đăng ký tới
 * trận đầu tiên, P90 và tỉ lệ đạt mục tiêu ≤ 2 phút.
 */
export function useAdminOnboarding(
  params?: { from?: string; to?: string; days?: number },
  enabled = true,
) {
  const path = buildAdminQueryPath('/admin/onboarding', params);

  return useQuery({
    queryKey: adminOnboardingKey(params),
    queryFn: () => apiFetch(path, OnboardingStats),
    enabled,
  });
}
