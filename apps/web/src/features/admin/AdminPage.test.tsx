import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { OnboardingStats, RetentionCohort } from '@pitch/shared';
import { ApiClientError } from '../../api/client';
import {
  AdminRetentionView,
  calculateWeightedAverage,
  formatCohortDay,
  formatDurationSeconds,
  formatPercent,
} from './AdminPage';

const SAMPLE_COHORTS: RetentionCohort[] = [
  { cohortDay: '2026-10-27', registered: 100, d1: 0.5, d7: 0.2 },
  { cohortDay: '2026-10-28', registered: 200, d1: 0.4, d7: null },
  { cohortDay: '2026-10-29', registered: 50, d1: null, d7: null },
];

describe('<AdminRetentionView>', () => {
  it('render đầy đủ dữ liệu mẫu: tổng đăng ký, D1/D7 trung bình, ngày DD/MM/YYYY, %, và —', () => {
    const html = renderToStaticMarkup(
      <AdminRetentionView cohorts={SAMPLE_COHORTS} days={7} onChangeDays={() => {}} />,
    );

    // Tiêu đề & tag
    expect(html).toContain('Retention theo ngày đăng ký');
    expect(html).toContain('Chỉ admin');
    expect(html).toContain('7 ngày');
    expect(html).toContain('30 ngày');

    // 3 ô tổng quan
    // Tổng đăng ký: 100 + 200 + 50 = 350
    expect(html).toContain('Đăng ký 7 ngày');
    expect(html).toContain('350');

    // D1 trung bình: (100 * 0.5 + 200 * 0.4) / (100 + 200) = 130 / 300 = 43.333% -> 43,3%
    expect(html).toContain('D1 trung bình');
    expect(html).toContain('43,3%');
    expect(html).toContain('mục tiêu ≥ 40%');

    // D7 trung bình: (100 * 0.2) / 100 = 20.0% -> 20,0%
    expect(html).toContain('D7 trung bình');
    expect(html).toContain('20,0%');
    expect(html).toContain('mục tiêu ≥ 15%');

    // Bảng: ngày DD/MM/YYYY
    expect(html).toContain('27/10/2026');
    expect(html).toContain('28/10/2026');
    expect(html).toContain('29/10/2026');

    // Số đăng ký từng hàng
    expect(html).toContain('100');
    expect(html).toContain('200');
    expect(html).toContain('50');

    // % D1 / D7 và —
    expect(html).toContain('50,0%');
    expect(html).toContain('40,0%');
    expect(html).toContain('—');

    // Chú thích chân bảng
    expect(html).toContain(
      'D1 = quay lại vào ngày thứ 2 sau đăng ký. &quot;—&quot; = chưa đủ ngày để tính.',
    );
  });

  it('hiển thị thông báo khi lỗi 403 forbidden', () => {
    const forbiddenError = new ApiClientError('forbidden', 403, 'Forbidden');
    const html = renderToStaticMarkup(
      <AdminRetentionView cohorts={undefined} days={7} error={forbiddenError} />,
    );

    expect(html).toContain('Trang này chỉ dành cho quản trị viên.');
    expect(html).toContain('href="/"');
    expect(html).toContain('Về trang chủ');
  });

  it('hiển thị skeleton khi đang tải (aria-busy="true")', () => {
    const html = renderToStaticMarkup(
      <AdminRetentionView cohorts={undefined} days={7} isLoading />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('skel');
    expect(html).not.toContain('Chưa có dữ liệu');
  });

  it('hiển thị thông báo khi danh sách rỗng', () => {
    const html = renderToStaticMarkup(<AdminRetentionView cohorts={[]} days={7} />);

    expect(html).toContain('Chưa có dữ liệu đăng ký trong khoảng thời gian này.');
    expect(html).toContain('0'); // 0 người đăng ký
    expect(html).toContain('—'); // D1 và D7 là —
  });

  it('hiển thị banner lỗi chung và nút thử lại', () => {
    const netErr = new ApiClientError('network_error', 0, 'Không kết nối được máy chủ');
    const html = renderToStaticMarkup(
      <AdminRetentionView cohorts={undefined} days={7} error={netErr} onRetry={() => {}} />,
    );

    expect(html).toContain('Không kết nối được máy chủ');
    expect(html).toContain('banner--danger');
    expect(html).toContain('Thử lại');
  });
});

describe('calculateWeightedAverage & formatPercent & formatCohortDay', () => {
  it('tính trung bình có trọng số chính xác, bỏ qua cohort null', () => {
    const cohorts: RetentionCohort[] = [
      { cohortDay: '2026-10-01', registered: 40, d1: 0.5, d7: 0.25 },
      { cohortDay: '2026-10-02', registered: 60, d1: 0.7, d7: null },
    ];
    // (40 * 0.5 + 60 * 0.7) / (40 + 60) = (20 + 42) / 100 = 0.62
    expect(calculateWeightedAverage(cohorts, 'd1')).toBeCloseTo(0.62);
    // (40 * 0.25) / 40 = 0.25
    expect(calculateWeightedAverage(cohorts, 'd7')).toBeCloseTo(0.25);
  });

  it('trả về null nếu không có cohort nào có số', () => {
    const cohorts: RetentionCohort[] = [
      { cohortDay: '2026-10-01', registered: 40, d1: null, d7: null },
    ];
    expect(calculateWeightedAverage(cohorts, 'd1')).toBeNull();
    expect(calculateWeightedAverage([], 'd1')).toBeNull();
  });

  it('formatPercent & formatCohortDay & formatDurationSeconds', () => {
    expect(formatPercent(0.438)).toBe('43,8%');
    expect(formatPercent(null)).toBe('—');
    expect(formatCohortDay('2026-10-27')).toBe('27/10/2026');
    expect(formatDurationSeconds(null)).toBe('—');
    expect(formatDurationSeconds(45)).toBe('45s');
    expect(formatDurationSeconds(90)).toBe('1p 30s');
    expect(formatDurationSeconds(120)).toBe('2p');
  });

  it('hiển thị thẻ phễu tân thủ register -> match_start khi có onboarding', () => {
    const onboarding: OnboardingStats = {
      from: '2026-10-23',
      to: '2026-10-29',
      totalRegistered: 50,
      completedUsers: 42,
      withinTargetUsers: 36,
      medianSeconds: 88,
      p90Seconds: 135,
    };
    const html = renderToStaticMarkup(
      <AdminRetentionView cohorts={SAMPLE_COHORTS} onboarding={onboarding} days={7} />,
    );
    expect(html).toContain('Phễu tân thủ · register → match_start');
    expect(html).toContain('Đạt mục tiêu ≤ 2 phút');
    expect(html).toContain('1p 28s');
    expect(html).toContain('2p 15s');
    expect(html).toContain('42/50');
    expect(html).toContain('36/50');
  });
});
