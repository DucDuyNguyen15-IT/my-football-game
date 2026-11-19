import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/vi';
import { ONBOARDING_FLOW_STEPS } from './onboarding';
import './onboarding.css';

export interface OnboardingFlowBannerProps {
  currentStep: 1 | 2 | 3 | 4;
  /** Tuỳ chọn nút hành động nhanh bên phải tiêu đề (ví dụ "Đá với máy – Dễ"). */
  action?: ReactNode;
  /** Tuỳ chọn xử lý khi người chơi bấm vào từng bước trên thanh tiến trình. */
  onStepSelect?: (step: 1 | 2 | 3 | 4, event: MouseEvent<HTMLAnchorElement>) => void;
}

const STEP_KEYS: Record<
  1 | 2 | 3 | 4,
  { time: TranslationKey; title: TranslationKey; sub: TranslationKey }
> = {
  1: { time: 'ob.step1.time', title: 'ob.step1.title', sub: 'ob.step1.sub' },
  2: { time: 'ob.step2.time', title: 'ob.step2.title', sub: 'ob.step2.sub' },
  3: { time: 'ob.step3.time', title: 'ob.step3.title', sub: 'ob.step3.sub' },
  4: { time: 'ob.step4.time', title: 'ob.step4.title', sub: 'ob.step4.sub' },
};

/** Thanh tiến trình 4 bước tân thủ ≤ 2 phút tới trận đầu (docs/design/screens/onboarding-flow.html). */
export function OnboardingFlowBanner({
  currentStep,
  action,
  onStepSelect,
}: OnboardingFlowBannerProps) {
  const { t } = useI18n();
  const progressPct = Math.round((currentStep / ONBOARDING_FLOW_STEPS.length) * 100);
  return (
    <section className="panel ob-flow" aria-label={t('ob.aria')}>
      <div className="ob-flow__head">
        <div className="ob-flow__title-wrap">
          <h2 className="h2">{t('ob.title')}</h2>
          <span className="tag tag--accent">{t('ob.badge')}</span>
        </div>
        {action}
      </div>
      <div className="ob-flow__steps">
        {ONBOARDING_FLOW_STEPS.map((item, idx) => {
          const isDone = item.step < currentStep;
          const isCurrent = item.step === currentStep;
          const cls = `panel ob-flow__step${isDone ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`;
          const keys = STEP_KEYS[item.step];
          return (
            <div key={item.step} style={{ display: 'contents' }}>
              {idx > 0 && (
                <span className="ob-flow__arrow" aria-hidden="true">
                  →
                </span>
              )}
              <Link
                to={item.href}
                className={cls}
                aria-current={isCurrent ? 'step' : undefined}
                onClick={(e) => onStepSelect?.(item.step, e)}
              >
                <span className="label ob-flow__time">
                  <span className="num">{t(keys.time)}</span>
                  {isDone && (
                    <>
                      <span className="ob-flow__check" aria-hidden="true">
                        ✓
                      </span>
                      <span className="sr-only">{t('ob.doneSr')}</span>
                    </>
                  )}
                </span>
                <span className="display ob-flow__step-title">{t(keys.title)}</span>
                <span className="muted ob-flow__step-sub">{t(keys.sub)}</span>
              </Link>
            </div>
          );
        })}
      </div>
      <div
        className="bar bar--thin"
        style={{ '--v': `${progressPct}%` } as CSSProperties}
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={1}
        aria-valuemax={ONBOARDING_FLOW_STEPS.length}
        aria-label={t('ob.progressAria', {
          current: currentStep,
          total: ONBOARDING_FLOW_STEPS.length,
        })}
      >
        <div className="bar__fill" />
      </div>
    </section>
  );
}
