import type { CSSProperties } from 'react';
import type { MissionProgress } from '@pitch/shared';
import { translateMissionTitle } from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';
import './missions.css';

export interface DailyMissionsPanelProps {
  title?: string;
  missions: readonly MissionProgress[] | undefined;
  isLoading?: boolean;
  /** Tải nhiệm vụ thất bại: hiện báo lỗi + nút Thử lại thay vì khung xương mãi (B4-07). */
  onRetry?: () => void;
  claimingCode?: string | null;
  errorMessage?: string | null;
  onClaim?: (code: string, sourceEl?: HTMLElement | null) => void;
  showResetNote?: boolean;
}

/**
 * Bảng nhiệm vụ ngày theo mẫu `home.html` / `result.html`: tiến độ, nút nhận thưởng một lần khi đạt
 * mục tiêu, và trạng thái đã nhận.
 */
export function DailyMissionsPanel({
  title,
  missions,
  isLoading = false,
  onRetry,
  claimingCode = null,
  errorMessage = null,
  onClaim,
  showResetNote = true,
}: DailyMissionsPanelProps) {
  const { locale, t } = useI18n();
  const heading = title ?? t('missions.title');
  return (
    <section className="panel missions" aria-labelledby="missions-title">
      <h2 id="missions-title" className="panel__title missions__head">
        {heading}
        <span className="meta">{t('missions.resetMeta')}</span>
      </h2>

      {!isLoading && !missions && onRetry ? (
        <div className="banner banner--danger" role="alert">
          <span>{t('missions.loadError')}</span>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            {t('common.retry')}
          </button>
        </div>
      ) : isLoading || !missions ? (
        <div className="missions__skel" aria-busy="true" aria-label={t('missions.loadingAria')}>
          <div className="skel skel--line" />
          <div className="skel skel--line" />
          <div className="skel skel--line" />
        </div>
      ) : (
        <ul className="missions__list">
          {missions.map((m) => {
            const pct = Math.min(100, Math.round((m.progress / m.target) * 100));
            const done = m.progress >= m.target;
            const claiming = claimingCode === m.code;
            const label = translateMissionTitle(m.code, m.title, locale);
            return (
              <li key={m.code} className="missions__row">
                <div className="missions__info">
                  <span className="missions__name">{label}</span>
                  <div className="missions__prog">
                    <div
                      className="bar bar--thin missions__bar"
                      style={{ '--v': `${pct}%` } as CSSProperties}
                    >
                      <div className="bar__fill" />
                    </div>
                    <span className="num muted missions__count">
                      {m.progress}/{m.target}
                    </span>
                  </div>
                </div>

                {m.claimed ? (
                  <span className="tag tag--success">{t('missions.claimed')}</span>
                ) : done ? (
                  <button
                    type="button"
                    className={`btn btn--primary btn--sm${claiming ? ' is-loading' : ''}`}
                    disabled={claiming || claimingCode !== null || !onClaim}
                    aria-busy={claiming || undefined}
                    onClick={(e) => onClaim?.(m.code, e.currentTarget)}
                  >
                    <span className="btn__label">
                      {t('missions.claim')}{' '}
                      <span className="coin coin--sm missions__claim-coin">
                        <span className="coin__icon" aria-hidden="true" />
                        <span>+{m.reward}</span>
                        <span className="sr-only"> {t('common.coin')}</span>
                      </span>
                    </span>
                  </button>
                ) : (
                  <span className="coin coin--sm missions__pending-coin">
                    <span className="coin__icon" aria-hidden="true" />
                    <span>{m.reward}</span>
                    <span className="sr-only"> {t('common.coin')}</span>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {errorMessage && (
        <div className="banner banner--danger missions__error" role="alert">
          <span>{errorMessage}</span>
        </div>
      )}

      {showResetNote && <p className="muted missions__foot">{t('missions.foot')}</p>}
    </section>
  );
}
