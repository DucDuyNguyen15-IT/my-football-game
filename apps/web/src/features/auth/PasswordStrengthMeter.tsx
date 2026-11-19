import type { Rarity } from '@pitch/shared';
import { useI18n } from '../../i18n/I18nContext';
import type { TranslationKey } from '../../i18n/vi';
import type { PasswordHintKey, PasswordStrength } from './passwordStrength';

const RANK_KEYS: Record<Rarity, TranslationKey> = {
  bronze: 'pw.rank.bronze',
  silver: 'pw.rank.silver',
  gold: 'pw.rank.gold',
  legend: 'pw.rank.legend',
};

const HINT_KEYS: Record<PasswordHintKey, TranslationKey> = {
  empty: 'pw.hint.empty',
  tooShort: 'pw.hint.tooShort',
  common: 'pw.hint.common',
  matchesUsername: 'pw.hint.matchesUsername',
  repeatOrSeq: 'pw.hint.repeatOrSeq',
  addVariety: 'pw.hint.addVariety',
  makeLonger: 'pw.hint.makeLonger',
  strong: 'pw.hint.strong',
};

export interface PasswordStrengthMeterProps {
  id: string;
  strength: PasswordStrength;
}

/**
 * Thanh độ mạnh mật khẩu: 1 thanh liền đầy dần theo 4 mức (Yếu → Rất mạnh), màu theo độ hiếm thẻ
 * (Đồng / Bạc / Vàng / Huyền thoại); luôn kèm nhãn chữ + gợi ý (không chỉ dùng màu).
 */
export function PasswordStrengthMeter({ id, strength }: PasswordStrengthMeterProps) {
  const { t } = useI18n();
  const isEmpty = strength.level === 0;
  const statusText = isEmpty ? t('pw.emptyStatus') : t(RANK_KEYS[strength.tier]);

  return (
    <div
      id={id}
      className={`pw-meter r-${strength.tier}${isEmpty ? ' is-empty' : ''}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="pw-meter__head">
        <span className="pw-meter__label">{t('pw.label')}</span>
        <span className="pw-meter__badge">
          <span className="pw-meter__pips" aria-hidden="true">
            {isEmpty ? '◇◇◇◇' : '◆'.repeat(strength.level)}
          </span>
          <span>{statusText}</span>
        </span>
      </div>
      <div className="pw-meter__bar" aria-hidden="true">
        <span className="pw-meter__fill" style={{ width: `${strength.level * 25}%` }} />
      </div>
      <p className="pw-meter__hint">{t(HINT_KEYS[strength.hint])}</p>
    </div>
  );
}
