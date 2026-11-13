import { useQuery } from '@tanstack/react-query';
import { OnboardingStats, RetentionCohort } from '@pitch/shared';
import { z } from 'zod';
import { apiFetch } from './client';

/**
 * Khoảng thống kê: N ngày gần nhất. Client không tự tính `from`/`to` bằng giờ trình duyệt — server
 * cắt khoảng theo đồng hồ của mình (`RetentionQuery.days`).
 */
export interface AdminRangeParams {
  days: number;
}

export const adminRetentionKey = (params?: AdminRangeParams) =>
  ['admin', 'retention', params?.days ?? ''] as const;

export const adminOnboardingKey = (params?: AdminRangeParams) =>
  ['admin', 'onboarding', params?.days ?? ''] as const;

const RetentionList = z.array(RetentionCohort);

export function buildAdminQueryPath(base: `/${string}`, params?: AdminRangeParams): `/${string}` {
  return params ? `${base}?days=${params.days}` : base;
}

/**
 * Lấy danh sách cohort retention theo ngày đăng ký GMT+7 (GET /admin/retention).
 * Chỉ dành cho người dùng có quyền quản trị viên (role admin).
 */
export function useAdminRetention(params?: AdminRangeParams, enabled = true) {
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
export function useAdminOnboarding(params?: AdminRangeParams, enabled = true) {
  const path = buildAdminQueryPath('/admin/onboarding', params);

  return useQuery({
    queryKey: adminOnboardingKey(params),
    queryFn: () => apiFetch(path, OnboardingStats),
    enabled,
  });
}
