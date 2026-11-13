import { useState, type CSSProperties } from 'react';
import type { OnboardingStats, RetentionCohort } from '@pitch/shared';
import { useAdminOnboarding, useAdminRetention } from '../../api/admin';
import { ApiClientError } from '../../api/client';
import './admin.css';

const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Tính khoảng ngày [from, to] GMT+7 cho N ngày gần nhất (kết thúc ở ngày hôm nay). */
export function getGmt7DateRange(
  days: number,
  now: Date = new Date(),
): { from: string; to: string } {
  const toMs = now.getTime() + GMT7_OFFSET_MS;
  const to = new Date(toMs).toISOString().slice(0, 10);
  const fromMs = new Date(`${to}T00:00:00.000Z`).getTime() - (days - 1) * DAY_MS;
  const from = new Date(fromMs).toISOString().slice(0, 10);
  return { from, to };
}

/** Chuyển `YYYY-MM-DD` thành `DD/MM/YYYY`. */
export function formatCohortDay(iso: string): string {
  const parts = iso.split('-');
  if (parts.length === 3) {
    const [y, m, d] = parts;
    return `${d}/${m}/${y}`;
  }
  return iso;
}

/** Tính trung bình có trọng số theo `registered` của các cohort có giá trị khác `null`. */
export function calculateWeightedAverage(
  cohorts: readonly RetentionCohort[],
  key: 'd1' | 'd7',
): number | null {
  let totalRegistered = 0;
  let weightedSum = 0;

  for (const c of cohorts) {
    const rate = c[key];
    if (rate !== null && typeof rate === 'number' && !Number.isNaN(rate)) {
      totalRegistered += c.registered;
      weightedSum += c.registered * rate;
    }
  }

  if (totalRegistered === 0) return null;
  return weightedSum / totalRegistered;
}

/** Định dạng số thực 0..1 sang chuỗi phần trăm tiếng Việt `43,8%`, hoặc `—` nếu null. */
export function formatPercent(val: number | null): string {
  if (val === null || Number.isNaN(val)) return '—';
  return `${(val * 100).toFixed(1).replace('.', ',')}%`;
}

/** Định dạng khoảng thời gian (giây) sang dạng dễ đọc (`45s`, `1p 30s`, `2p`), hoặc `—`. */
export function formatDurationSeconds(seconds: number | null | undefined): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return secs > 0 ? `${mins}p ${String(secs).padStart(2, '0')}s` : `${mins}p`;
}

function RateCell({ value }: { value: number | null }) {
  if (value === null) {
    return <td className="r muted">—</td>;
  }

  const pct = value * 100;
  // Thanh đầy ở mốc 60% theo thiết kế admin.html / screens2.js §14.
  const barWidthPct = Math.min(100, (pct / 60) * 100);
  const text = `${pct.toFixed(1).replace('.', ',')}%`;

  return (
    <td>
      <div className="admin-rate-cell">
        <div
          className="bar bar--thin bar--info admin-rate-bar"
          style={{ '--v': `${barWidthPct}%` } as CSSProperties}
        >
          <div className="bar__fill" />
        </div>
        <span className="num admin-rate-val">{text}</span>
      </div>
    </td>
  );
}

export interface AdminRetentionViewProps {
  cohorts: readonly RetentionCohort[] | undefined;
  onboarding?: OnboardingStats | null;
  days: 7 | 30;
  onChangeDays?: (days: 7 | 30) => void;
  isLoading?: boolean;
  error?: unknown;
  onRetry?: () => void;
}

/** Component thuần hiển thị bảng thống kê retention quản trị. */
export function AdminRetentionView({
  cohorts,
  onboarding,
  days,
  onChangeDays,
  isLoading = false,
  error,
  onRetry,
}: AdminRetentionViewProps) {
  const isForbidden =
    (error instanceof ApiClientError && error.code === 'forbidden') ||
    (typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === 'forbidden');

  if (isForbidden) {
    return (
      <div className="admin-page">
        <div className="admin-head">
          <h1 className="h1">Retention theo ngày đăng ký</h1>
          <span className="tag tag--warn">Chỉ admin</span>
        </div>
        <div className="panel admin-forbidden" role="alert">
          <p>Trang này chỉ dành cho quản trị viên.</p>
          <a href="/" className="btn btn--secondary">
            Về trang chủ
          </a>
        </div>
      </div>
    );
  }

  const header = (
    <div className="admin-head">
      <h1 className="h1">Retention theo ngày đăng ký</h1>
      <span className="tag tag--warn">Chỉ admin</span>
      <span className="admin-head__spacer" />
      <div className="seg" role="group" aria-label="Khoảng thời gian">
        <button
          type="button"
          className={`seg__opt${days === 7 ? ' is-on' : ''}`}
          aria-pressed={days === 7}
          onClick={() => onChangeDays?.(7)}
          disabled={isLoading}
        >
          7 ngày
        </button>
        <button
          type="button"
          className={`seg__opt${days === 30 ? ' is-on' : ''}`}
          aria-pressed={days === 30}
          onClick={() => onChangeDays?.(30)}
          disabled={isLoading}
        >
          30 ngày
        </button>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="admin-page" aria-busy="true">
        {header}
        <div className="admin-stats">
          {[0, 1, 2].map((i) => (
            <section key={i} className="panel admin-stat">
              <div className="skel skel--line" style={{ width: '80px' }} />
              <div className="skel" style={{ height: '40px', width: '100px', margin: '4px 0' }} />
              <div className="skel skel--line" style={{ width: '60px' }} />
            </section>
          ))}
        </div>
        <section className="panel admin-table-panel">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', padding: '12px' }}>
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="skel skel--line" style={{ height: '24px' }} />
            ))}
          </div>
        </section>
      </div>
    );
  }

  const totalRegistered = cohorts?.reduce((acc, c) => acc + c.registered, 0) ?? 0;
  const d1Avg = cohorts ? calculateWeightedAverage(cohorts, 'd1') : null;
  const d7Avg = cohorts ? calculateWeightedAverage(cohorts, 'd7') : null;

  return (
    <div className="admin-page">
      {header}

      {error ? (
        <div className="banner banner--danger admin-error" role="alert">
          <span>
            {error instanceof Error
              ? error.message
              : 'Đã có lỗi xảy ra khi tải dữ liệu retention.'}
          </span>
          {onRetry ? (
            <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
              Thử lại
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="admin-stats">
        <section className="panel admin-stat">
          <span className="label">Đăng ký {days} ngày</span>
          <div className="display num admin-stat__num">
            {totalRegistered.toLocaleString('vi-VN')}
          </div>
          <span className="muted admin-stat__sub" />
        </section>

        <section className="panel admin-stat">
          <span className="label">D1 trung bình</span>
          <div className="display num admin-stat__num">{formatPercent(d1Avg)}</div>
          <span className="muted admin-stat__sub">mục tiêu ≥ 40%</span>
        </section>

        <section className="panel admin-stat">
          <span className="label">D7 trung bình</span>
          <div className="display num admin-stat__num">{formatPercent(d7Avg)}</div>
          <span className="muted admin-stat__sub">mục tiêu ≥ 15%</span>
        </section>
      </div>

      {onboarding && (
        <section className="panel admin-onboarding" aria-label="Thời gian tới trận đầu">
          <div className="admin-onboarding__head">
            <span className="label">Phễu tân thủ · register → match_start</span>
            {onboarding.medianSeconds !== null && (
              <span
                className={`tag ${onboarding.medianSeconds <= 120 ? 'tag--success' : 'tag--warn'}`}
              >
                {onboarding.medianSeconds <= 120
                  ? 'Đạt mục tiêu ≤ 2 phút'
                  : 'Chậm hơn mục tiêu 2 phút'}
              </span>
            )}
          </div>
          <div className="admin-onboarding__grid">
            <div className="admin-onboarding__metric">
              <span className="label">Thời gian trung vị</span>
              <span className="display num admin-onboarding__val">
                {formatDurationSeconds(onboarding.medianSeconds)}
              </span>
            </div>
            <div className="admin-onboarding__metric">
              <span className="label">Phân vị P90</span>
              <span className="display num admin-onboarding__val">
                {formatDurationSeconds(onboarding.p90Seconds)}
              </span>
            </div>
            <div className="admin-onboarding__metric">
              <span className="label">Đã vào trận đầu</span>
              <span className="display num admin-onboarding__val">
                {onboarding.completedUsers}/{onboarding.totalRegistered}
              </span>
            </div>
            <div className="admin-onboarding__metric">
              <span className="label">Trong ≤ 2 phút</span>
              <span className="display num admin-onboarding__val">
                {onboarding.withinTargetUsers}/{onboarding.totalRegistered}
              </span>
            </div>
          </div>
        </section>
      )}

      <section className="panel admin-table-panel">
        {!cohorts || cohorts.length === 0 ? (
          <p className="muted admin-empty" role="status">
            Chưa có dữ liệu đăng ký trong khoảng thời gian này.
          </p>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>Ngày đăng ký</th>
                  <th className="r">Người chơi mới</th>
                  <th className="r">D1</th>
                  <th className="r">D7</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohortDay}>
                    <td>{formatCohortDay(c.cohortDay)}</td>
                    <td className="r">{c.registered.toLocaleString('vi-VN')}</td>
                    <RateCell value={c.d1} />
                    <RateCell value={c.d7} />
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted admin-table-note">
              D1 = quay lại vào ngày thứ 2 sau đăng ký. &quot;—&quot; = chưa đủ ngày để tính.
            </p>
          </>
        )}
      </section>
    </div>
  );
}

/** Trang quản trị retention nối API (GET /admin/retention & /admin/onboarding). */
export function AdminPage() {
  const [days, setDays] = useState<7 | 30>(7);
  const { data: cohorts, isLoading, error, refetch } = useAdminRetention({ days });
  const onboarding = useAdminOnboarding({ days });

  return (
    <AdminRetentionView
      cohorts={cohorts}
      onboarding={onboarding.data ?? null}
      days={days}
      onChangeDays={setDays}
      isLoading={isLoading || onboarding.isLoading}
      error={error ?? onboarding.error}
      onRetry={() => {
        void refetch();
        void onboarding.refetch();
      }}
    />
  );
}
