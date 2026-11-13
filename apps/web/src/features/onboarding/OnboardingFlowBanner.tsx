import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { ONBOARDING_FLOW_STEPS } from './onboarding';
import './onboarding.css';

export interface OnboardingFlowBannerProps {
  currentStep: 1 | 2 | 3 | 4;
  /** Tuỳ chọn nút hành động nhanh bên phải tiêu đề (ví dụ "Đá với máy – Dễ"). */
  action?: ReactNode;
  /** Tuỳ chọn xử lý khi người chơi bấm vào từng bước trên thanh tiến trình. */
  onStepSelect?: (step: 1 | 2 | 3 | 4, event: MouseEvent<HTMLAnchorElement>) => void;
}

/** Thanh tiến trình 4 bước tân thủ ≤ 2 phút tới trận đầu (docs/design/screens/onboarding-flow.html). */
export function OnboardingFlowBanner({
  currentStep,
  action,
  onStepSelect,
}: OnboardingFlowBannerProps) {
  const progressPct = Math.round((currentStep / ONBOARDING_FLOW_STEPS.length) * 100);
  return (
    <section className="panel ob-flow" aria-label="Luồng tân thủ 4 bước">
      <div className="ob-flow__head">
        <div className="ob-flow__title-wrap">
          <h2 className="h2">Luồng tân thủ</h2>
          <span className="tag tag--accent">Tổng ≤ 2 phút tới cú sút đầu tiên</span>
        </div>
        {action}
      </div>
      <div className="ob-flow__steps">
        {ONBOARDING_FLOW_STEPS.map((item, idx) => {
          const isDone = item.step < currentStep;
          const isCurrent = item.step === currentStep;
          const cls = `panel ob-flow__step${isDone ? ' is-done' : ''}${isCurrent ? ' is-current' : ''}`;
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
                  <span className="num">{item.time}</span>
                  {isDone && (
                    <span className="ob-flow__check" aria-label="Đã xong">
                      ✓
                    </span>
                  )}
                </span>
                <span className="display ob-flow__step-title">{item.title}</span>
                <span className="muted ob-flow__step-sub">{item.subtitle}</span>
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
        aria-label={`Bước ${currentStep}/${ONBOARDING_FLOW_STEPS.length}`}
      >
        <div className="bar__fill" />
      </div>
    </section>
  );
}
