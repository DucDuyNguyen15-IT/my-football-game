import { useCallback, useEffect, useState, type CSSProperties } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/vi';
import { shouldAdvanceTutorialStep, TUTORIAL_STEPS, type TutorialStep } from './onboarding';
import './onboarding.css';

export interface MatchTutorialOverlayProps {
  /** Bắt đầu từ bước nào (mặc định 0; tiện test từng bước). */
  initialStep?: number;
  /** Tạm ẩn lắng nghe phím khi đang mở PauseMenu. */
  paused?: boolean;
  onComplete: () => void;
  onSkip: () => void;
}

const TUT_KEYS: Record<
  TutorialStep['id'],
  {
    short: TranslationKey;
    label: TranslationKey;
    title: TranslationKey;
    desc: TranslationKey;
    hint: TranslationKey;
  }
> = {
  move: {
    short: 'tut.move.short',
    label: 'tut.move.label',
    title: 'tut.move.title',
    desc: 'tut.move.desc',
    hint: 'tut.move.hint',
  },
  pass: {
    short: 'tut.pass.short',
    label: 'tut.pass.label',
    title: 'tut.pass.title',
    desc: 'tut.pass.desc',
    hint: 'tut.pass.hint',
  },
  shoot: {
    short: 'tut.shoot.short',
    label: 'tut.shoot.label',
    title: 'tut.shoot.title',
    desc: 'tut.shoot.desc',
    hint: 'tut.shoot.hint',
  },
  defend: {
    short: 'tut.defend.short',
    label: 'tut.defend.label',
    title: 'tut.defend.title',
    desc: 'tut.defend.desc',
    hint: 'tut.defend.hint',
  },
  pause: {
    short: 'tut.pause.short',
    label: 'tut.pause.label',
    title: 'tut.pause.title',
    desc: 'tut.pause.desc',
    hint: 'tut.pause.hint',
  },
};

/**
 * Lớp phủ hướng dẫn phím 5 bước ở trận đầu (docs/design/screens/onboarding.html, F14):
 * không chặn điều khiển trong sân (các phím đi qua tự nhiên để người chơi thử ngay),
 * cho phép nhảy bước bằng phím tương ứng, bấm Tiếp theo / Hoàn tất, hoặc "Bỏ qua hướng dẫn".
 */
export function MatchTutorialOverlay({
  initialStep = 0,
  paused = false,
  onComplete,
  onSkip,
}: MatchTutorialOverlayProps) {
  const { t } = useI18n();
  const [stepIdx, setStepIdx] = useState(() =>
    Math.max(0, Math.min(TUTORIAL_STEPS.length - 1, initialStep)),
  );

  const advance = useCallback(() => {
    setStepIdx((cur) => {
      if (cur >= TUTORIAL_STEPS.length - 1) {
        onComplete();
        return cur;
      }
      return cur + 1;
    });
  }, [onComplete]);

  useEffect(() => {
    if (paused) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (!shouldAdvanceTutorialStep(stepIdx, e.code)) return;
      if (stepIdx >= TUTORIAL_STEPS.length - 1) onComplete();
      else setStepIdx((cur) => Math.min(TUTORIAL_STEPS.length - 1, cur + 1));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [paused, stepIdx, onComplete]);

  if (paused) return null;

  const step = TUTORIAL_STEPS[stepIdx] ?? TUTORIAL_STEPS[0]!;
  const keys = TUT_KEYS[step.id];
  const isLast = stepIdx >= TUTORIAL_STEPS.length - 1;

  return (
    <div className="tut-scrim" role="region" aria-label={t('tut.aria')}>
      <div className="tut-scrim__veil" aria-hidden="true" />

      <div className="hud-panel tut-list" aria-label={t('tut.listAria')}>
        <span className="label">{t('tut.listTitle')}</span>
        {TUTORIAL_STEPS.map((s, idx) => {
          const done = idx < stepIdx;
          const current = idx === stepIdx;
          return (
            <button
              key={s.id}
              type="button"
              className={`tut-list__item${done ? ' is-done' : ''}${current ? ' is-current' : ''}`}
              aria-current={current ? 'step' : undefined}
              onClick={() => setStepIdx(idx)}
            >
              <span className="num tut-list__badge" aria-hidden="true">
                {done ? '✓' : idx + 1}
              </span>
              <span>{t(TUT_KEYS[s.id].short)}</span>
            </button>
          );
        })}
      </div>

      <button type="button" className="btn btn--ghost tut-skip" onClick={onSkip}>
        {t('tut.skip')}
      </button>

      <div className="tut-card" role="status" aria-live="polite">
        <span className="label tut-card__kicker">{t(keys.label)}</span>
        <div className="tut-card__hero">
          <div className="tut-card__keys">
            {step.keys.map((k) => (
              <kbd key={k} className="kbd tut-card__kbd">
                {k}
              </kbd>
            ))}
          </div>
          <span className="tut-card__title">{t(keys.title)}</span>
        </div>
        {step.powerSample && (
          <div className="tut-card__power" aria-hidden="true">
            <span
              className="power"
              style={
                {
                  '--v': `${step.powerSample.pct}%`,
                  '--tone': step.powerSample.tone,
                } as CSSProperties
              }
            >
              <i />
            </span>
          </div>
        )}
        <p className="muted tut-card__desc">
          {t(keys.desc)} <b>{t(keys.hint)}</b>
        </p>
        <div className="tut-card__dots" aria-hidden="true">
          {TUTORIAL_STEPS.map((s, idx) => (
            <span key={s.id} className={`tut-card__dot${idx <= stepIdx ? ' is-on' : ''}`} />
          ))}
        </div>
        <div className="tut-card__actions">
          <button type="button" className="btn btn--primary btn--sm" onClick={advance}>
            {isLast ? t('tut.finish') : t('tut.next')}
          </button>
        </div>
      </div>
    </div>
  );
}
