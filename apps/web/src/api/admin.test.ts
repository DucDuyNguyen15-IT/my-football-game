import { describe, expect, it } from 'vitest';
import { RetentionQuery } from '@pitch/shared';
import { adminOnboardingKey, adminRetentionKey, buildAdminQueryPath } from './admin';

describe('buildAdminQueryPath', () => {
  it('chỉ gửi days, không gửi from/to tính bằng giờ trình duyệt', () => {
    expect(buildAdminQueryPath('/admin/retention', { days: 7 })).toBe('/admin/retention?days=7');
    expect(buildAdminQueryPath('/admin/onboarding', { days: 30 })).toBe(
      '/admin/onboarding?days=30',
    );
    expect(buildAdminQueryPath('/admin/retention')).toBe('/admin/retention');
  });

  it('query sinh ra hợp lệ với schema RetentionQuery của server', () => {
    const path = buildAdminQueryPath('/admin/retention', { days: 30 });
    const query = Object.fromEntries(new URLSearchParams(path.split('?')[1]));
    expect(RetentionQuery.parse(query)).toEqual({ days: 30 });
  });
});

describe('query key admin', () => {
  it('tách cache theo số ngày', () => {
    expect(adminRetentionKey({ days: 7 })).not.toEqual(adminRetentionKey({ days: 30 }));
    expect(adminOnboardingKey({ days: 7 })).toEqual(['admin', 'onboarding', 7]);
  });
});
