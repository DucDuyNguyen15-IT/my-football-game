import { useState, type CSSProperties } from 'react';
import type { OnboardingStats, RetentionCohort } from '@pitch/shared';
import { useAdminOnboarding, useAdminRetention } from '../../api/admin';
import { ApiClientError } from '../../api/client';
import {
  errorMessageFor,
  formatDateFull,
  formatNumber,
  formatPercentValue,
  getActiveLocale,
  type Locale,
} from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';
import './admin.css';

/** Chuyển `YYYY-MM-DD` thành ngày theo locale (`DD/MM/YYYY` ở vi, `MM/DD/YYYY` ở en). */
export function formatCohortDay(iso: string, locale: Locale = getActiveLocale()): string {
  const parts = iso.split('-');
  if (parts.length === 3) {
    if (locale === 'vi') {
      const [y, m, d] = parts;
      return `${d}/${m}/${y}`;
    }
    return formatDateFull(iso, locale);
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

/** Định dạng số thực 0..1 sang chuỗi phần trăm theo locale (`43,8%` ở vi, `43.8%` ở en), hoặc `—` nếu null. */
export function formatPercent(val: number | null, locale: Locale = getActiveLocale()): string {
  if (val === null || Number.isNaN(val)) return '—';
  return formatPercentValue(val, locale, 1, 1);
}

/** Định dạng khoảng thời gian (giây) sang dạng dễ đọc (`45s`, `1p 30s`, `1m 30s`), hoặc `—`. */
export function formatDurationSeconds(
  seconds: number | null | undefined,
  locale: Locale = getActiveLocale(),
): string {
  if (seconds === null || seconds === undefined || Number.isNaN(seconds)) return '—';
  const total = Math.max(0, Math.round(seconds));
  if (total < 60) return `${total}s`;
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const minUnit = locale === 'en' ? 'm' : 'p';
  return secs > 0 ? `${mins}${minUnit} ${String(secs).padStart(2, '0')}s` : `${mins}${minUnit}`;
}

function RateCell({ value }: { value: number | null }) {
  const { locale } = useI18n();
  if (value === null) {
    return <td className="r muted">—</td>;
  }

  const pct = value * 100;
  // Thanh đầy ở mốc 60% theo thiết kế admin.html / screens2.js §14.
  const barWidthPct = Math.min(100, (pct / 60) * 100);
  const text = formatPercentValue(value, locale, 1, 1);

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
  const { locale, t } = useI18n();
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
          <h1 className="h1">{t('admin.title')}</h1>
          <span className="tag tag--warn">{t('admin.tag')}</span>
        </div>
        <div className="panel admin-forbidden" role="alert">
          <p>{t('admin.forbiddenBody')}</p>
          <a href="/" className="btn btn--secondary">
            {t('result.backHome')}
          </a>
        </div>
      </div>
    );
  }

  const header = (
    <div className="admin-head">
      <h1 className="h1">{t('admin.title')}</h1>
      <span className="tag tag--warn">{t('admin.tag')}</span>
      <span className="admin-head__spacer" />
      <div className="seg" role="group" aria-label={t('admin.rangeAria')}>
        <button
          type="button"
          className={`seg__opt${days === 7 ? ' is-on' : ''}`}
          aria-pressed={days === 7}
          onClick={() => onChangeDays?.(7)}
          disabled={isLoading}
        >
          {t('admin.days7')}
        </button>
        <button
          type="button"
          className={`seg__opt${days === 30 ? ' is-on' : ''}`}
          aria-pressed={days === 30}
          onClick={() => onChangeDays?.(30)}
          disabled={isLoading}
        >
          {t('admin.days30')}
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
            {error instanceof ApiClientError
              ? errorMessageFor(error, locale, 'admin.loadError')
              : error instanceof Error
                ? error.message
                : t('admin.loadError')}
          </span>
          {onRetry ? (
            <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
              {t('common.retry')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="admin-stats">
        <section className="panel admin-stat">
          <span className="label">{t('admin.registeredDays', { days })}</span>
          <div className="display num admin-stat__num">
            {formatNumber(totalRegistered, locale)}
          </div>
          <span className="muted admin-stat__sub" />
        </section>

        <section className="panel admin-stat">
          <span className="label">{t('admin.d1Avg')}</span>
          <div className="display num admin-stat__num">{formatPercent(d1Avg, locale)}</div>
          <span className="muted admin-stat__sub">{t('admin.d1Target')}</span>
        </section>

        <section className="panel admin-stat">
          <span className="label">{t('admin.d7Avg')}</span>
          <div className="display num admin-stat__num">{formatPercent(d7Avg, locale)}</div>
          <span className="muted admin-stat__sub">{t('admin.d7Target')}</span>
        </section>
      </div>

      {onboarding && (
        <section className="panel admin-onboarding" aria-label={t('admin.obAria')}>
          <div className="admin-onboarding__head">
            <span className="label">{t('admin.obHead')}</span>
            {onboarding.medianSeconds !== null && (
              <span
                className={`tag ${onboarding.medianSeconds <= 120 ? 'tag--success' : 'tag--warn'}`}
              >
                {onboarding.medianSeconds <= 120 ? t('admin.obOnTarget') : t('admin.obSlow')}
              </span>
            )}
          </div>
          <div className="admin-onboarding__grid">
            <div className="admin-onboarding__metric">
              <span className="label">{t('admin.obMedian')}</span>
              <span className="display num admin-onboarding__val">
                {formatDurationSeconds(onboarding.medianSeconds, locale)}
              </span>
            </div>
            <div className="admin-onboarding__metric">
              <span className="label">{t('admin.obP90')}</span>
              <span className="display num admin-onboarding__val">
                {formatDurationSeconds(onboarding.p90Seconds, locale)}
              </span>
            </div>
            <div className="admin-onboarding__metric">
              <span className="label">{t('admin.obCompleted')}</span>
              <span className="display num admin-onboarding__val">
                {onboarding.completedUsers}/{onboarding.totalRegistered}
              </span>
            </div>
            <div className="admin-onboarding__metric">
              <span className="label">{t('admin.obWithin')}</span>
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
            {t('admin.empty')}
          </p>
        ) : (
          <>
            <table className="table">
              <thead>
                <tr>
                  <th>{t('admin.colDay')}</th>
                  <th className="r">{t('admin.colUsers')}</th>
                  <th className="r">{t('admin.colD1')}</th>
                  <th className="r">{t('admin.colD7')}</th>
                </tr>
              </thead>
              <tbody>
                {cohorts.map((c) => (
                  <tr key={c.cohortDay}>
                    <td>{formatCohortDay(c.cohortDay, locale)}</td>
                    <td className="r">{formatNumber(c.registered, locale)}</td>
                    <RateCell value={c.d1} />
                    <RateCell value={c.d7} />
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="muted admin-table-note">{t('admin.tableNote')}</p>
          </>
        )}
      </section>
    </div>
  );
}

/**
 * Trang quản trị retention nối API (GET /admin/retention & /admin/onboarding). Chỉ gửi `days`:
 * server tự cắt khoảng ngày GMT+7 theo đồng hồ của mình, không phụ thuộc giờ máy người xem.
 */
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
