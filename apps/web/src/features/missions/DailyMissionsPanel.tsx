import type { CSSProperties } from 'react';
import type { MissionProgress } from '@pitch/shared';
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
  title = 'Nhiệm vụ ngày',
  missions,
  isLoading = false,
  onRetry,
  claimingCode = null,
  errorMessage = null,
  onClaim,
  showResetNote = true,
}: DailyMissionsPanelProps) {
  return (
    <section className="panel missions" aria-labelledby="missions-title">
      <h2 id="missions-title" className="panel__title missions__head">
        {title}
        <span className="meta">Reset 00:00 GMT+7</span>
      </h2>

      {!isLoading && !missions && onRetry ? (
        <div className="banner banner--danger" role="alert">
          <span>Không tải được nhiệm vụ.</span>
          <button type="button" className="btn btn--secondary btn--sm" onClick={onRetry}>
            Thử lại
          </button>
        </div>
      ) : isLoading || !missions ? (
        <div className="missions__skel" aria-busy="true" aria-label="Đang tải nhiệm vụ">
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
            return (
              <li key={m.code} className="missions__row">
                <div className="missions__info">
                  <span className="missions__name">{m.title}</span>
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
                  <span className="tag tag--success">Đã nhận</span>
                ) : done ? (
                  <button
                    type="button"
                    className={`btn btn--primary btn--sm${claiming ? ' is-loading' : ''}`}
                    disabled={claiming || claimingCode !== null || !onClaim}
                    aria-busy={claiming || undefined}
                    onClick={(e) => onClaim?.(m.code, e.currentTarget)}
                  >
                    <span className="btn__label">
                      Nhận{' '}
                      <span className="coin coin--sm missions__claim-coin">
                        <span className="coin__icon" aria-hidden="true" />
                        <span>+{m.reward}</span>
                        <span className="sr-only"> xu</span>
                      </span>
                    </span>
                  </button>
                ) : (
                  <span className="coin coin--sm missions__pending-coin">
                    <span className="coin__icon" aria-hidden="true" />
                    <span>{m.reward}</span>
                    <span className="sr-only"> xu</span>
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

      {showResetNote && (
        <p className="muted missions__foot">3 nhiệm vụ mỗi ngày · reset lúc 00:00</p>
      )}
    </section>
  );
}
