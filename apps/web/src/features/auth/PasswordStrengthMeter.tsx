import type { Rarity } from '@pitch/shared';
import { RARITY_INFO } from '../../components/card/rarity';
import type { PasswordHintKey, PasswordStrength } from './passwordStrength';

const RANK_LABELS: Record<Rarity, string> = {
  bronze: 'Dự bị',
  silver: 'Đá chính',
  gold: 'Ngôi sao',
  legend: 'Huyền thoại',
};

const HINT_TEXT: Record<PasswordHintKey, string> = {
  empty: 'Gợi ý: ít nhất 8 ký tự, kết hợp chữ hoa, số hoặc ký tự đặc biệt.',
  tooShort: 'Cần ít nhất 8 ký tự để vượt bậc Đồng.',
  common: 'Mật khẩu quá phổ biến — hãy đổi sang cụm từ riêng.',
  matchesUsername: 'Không dùng giống hoặc chứa tên đăng nhập.',
  repeatOrSeq: 'Tránh lặp ký tự (aaaa) hoặc chuỗi liên tiếp (1234, abcd).',
  addVariety: 'Thêm chữ hoa, số hoặc ký tự đặc biệt để tăng lực sút.',
  makeLonger: 'Tăng lên 12+ ký tự để đạt bậc Huyền thoại.',
  strong: 'Thể lực tối đa — mật khẩu rất vững chắc.',
};

export interface PasswordStrengthMeterProps {
  id: string;
  strength: PasswordStrength;
}

/**
 * Thanh đo độ mạnh mật khẩu theo 4 độ hiếm thẻ (Đồng / Bạc / Vàng / Huyền thoại),
 * kiểu thanh thể lực/lực sút 4 vạch, luôn kèm nhãn chữ + gợi ý (không chỉ dùng màu).
 */
export function PasswordStrengthMeter({ id, strength }: PasswordStrengthMeterProps) {
  const isEmpty = strength.level === 0;
  const rarityInfo = RARITY_INFO[strength.tier];
  const rank = RANK_LABELS[strength.tier];
  const statusText = isEmpty
    ? 'Chưa nhập mật khẩu'
    : strength.tier === 'legend'
      ? `${rarityInfo.label} (${strength.level}/4)`
      : strength.level === 1
        ? `${rarityInfo.label} · ${rank} (quá yếu)`
        : `${rarityInfo.label} · ${rank}`;

  return (
    <div
      id={id}
      className={`pw-meter r-${strength.tier}${isEmpty ? ' is-empty' : ''}`}
      aria-live="polite"
      aria-atomic="true"
    >
      <div className="pw-meter__head">
        <span className="pw-meter__label">Lực sút mật khẩu</span>
        <span className="pw-meter__badge">
          <span className="pw-meter__pips" aria-hidden="true">
            {isEmpty ? '◇◇◇◇' : '◆'.repeat(strength.level)}
          </span>
          <span>{statusText}</span>
        </span>
      </div>
      <div className="pw-meter__bar" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => (
          <span
            key={step}
            className={`pw-meter__seg${strength.level >= step ? ' is-on' : ''}`}
          />
        ))}
      </div>
      <p className="pw-meter__hint">{HINT_TEXT[strength.hint]}</p>
    </div>
  );
}
