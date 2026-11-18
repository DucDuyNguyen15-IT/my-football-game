import { useRef, type PointerEvent } from 'react';
import { computeOvr, type Card, type PlayerStats } from '@pitch/shared';
import { Avatar } from './Avatar';
import { POSITION_NAME, RARITY_INFO, shortCardName, splitName, statsFor } from './rarity';
import { canHoverTilt, computeCardTilt } from './tilt';
import './card.css';

export type CardSize = 'lg' | 'md' | 'sm' | 'xs';

export interface CardViewProps {
  card: Card;
  size?: CardSize;
  /** Cấp ép 0–5; > 0 thì hiện huy hiệu `+N`. */
  level?: number;
  /** Chỉ số hiệu lực (đã áp cấp +/phạt vị trí); mặc định chỉ số gốc của mẫu thẻ. */
  stats?: PlayerStats;
  isNew?: boolean;
  /** Thẻ đã có trong kho (khi mở gói): nhãn "TRÙNG". */
  isDuplicate?: boolean;
  /** Chấm xanh: thẻ đang trong đội hình. */
  inSquad?: boolean;
  selected?: boolean;
  dim?: boolean;
  /** Nghiêng 3D nhẹ theo con trỏ trên thiết bị có hover (nguyên tắc 11). */
  tilt?: boolean;
}

/** Mô tả đọc cho trình đọc màn hình, VD "Vàng, Rafinho Duarte, Tiền đạo, OVR 81". */
export function cardLabel(card: Card, ovr = card.ovr, level = 0): string {
  const plus = level > 0 ? `, cấp +${level}` : '';
  return `${RARITY_INFO[card.rarity].label}, ${card.name}, ${POSITION_NAME[card.position]}, OVR ${ovr}${plus}`;
}

export { shortCardName, splitName };

/**
 * Thẻ cầu thủ dùng chung (DESIGN.md §4): mặt tối, khung màu độ hiếm, góc vát. Cỡ lg (mở thẻ),
 * md (kho), sm (ô đội hình — không có chỉ số). Chiều rộng lấy từ `--card-w`, chữ co theo `cqw`.
 */
export function CardView({
  card,
  size = 'md',
  level = 0,
  stats,
  isNew,
  isDuplicate,
  inSquad,
  selected,
  dim,
  tilt,
}: CardViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const shown = stats ?? card.stats;
  const ovr = stats ? computeOvr(card.position, stats) : card.ovr;
  const info = RARITY_INFO[card.rarity];
  const [last, first] = splitName(card.name);

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (!tilt || !canHoverTilt()) return;
    const el = ref.current;
    if (!el) return;
    const { rx, ry } = computeCardTilt(e.clientX, e.clientY, el.getBoundingClientRect());
    el.classList.add('is-tilting');
    el.style.setProperty('--tilt-x', `${rx}deg`);
    el.style.setProperty('--tilt-y', `${ry}deg`);
  };

  const resetTilt = () => {
    const el = ref.current;
    if (!el) return;
    el.classList.remove('is-tilting');
    el.style.removeProperty('--tilt-x');
    el.style.removeProperty('--tilt-y');
  };

  return (
    <div
      ref={ref}
      className={`card card--${size} r-${card.rarity}${selected ? ' is-selected' : ''}${dim ? ' is-dim' : ''}${tilt ? ' card--tilt' : ''}`}
      role="img"
      aria-label={cardLabel(card, ovr, level)}
      onPointerMove={tilt ? onPointerMove : undefined}
      onPointerLeave={tilt ? resetTilt : undefined}
      onPointerCancel={tilt ? resetTilt : undefined}
    >
      <div className="card__body">
        <div className="card__ovr">{ovr}</div>
        <div className="card__pos" title={POSITION_NAME[card.position]}>
          {card.position}
        </div>
        <div className="card__pips" aria-hidden="true">
          {'◆'.repeat(info.pips)}
        </div>
        {isNew && <div className="card__flag">MỚI</div>}
        {!isNew && isDuplicate && <div className="card__flag card__flag--dup">TRÙNG</div>}
        {inSquad && <div className="card__squad" title="Đang trong đội hình" />}
        <div className="card__avatar">
          <Avatar seed={card.avatarSeed} />
        </div>
        <div className="card__name">{last}</div>
        <div className="card__sub">
          {first && `${first} · `}“{card.nickname}”
        </div>
        {(size === 'lg' || size === 'md') && (
          <div className="card__stats">
            {statsFor(card.position).map((s) => (
              <div key={s.key} className="card__stat" title={s.name}>
                <b>{shown[s.key]}</b>
                <span>{s.abbr}</span>
              </div>
            ))}
          </div>
        )}
        <div className="card__tier">{info.label}</div>
        {level > 0 && <div className="card__level">+{level}</div>}
        <div className="card__sheen" />
      </div>
    </div>
  );
}
