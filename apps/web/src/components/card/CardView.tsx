import { computeOvr, type Card, type PlayerStats } from '@pitch/shared';
import { Avatar } from './Avatar';
import { POSITION_NAME, RARITY_INFO, statsFor } from './rarity';
import './card.css';

export type CardSize = 'lg' | 'md' | 'sm';

export interface CardViewProps {
  card: Card;
  size?: CardSize;
  /** Cấp ép 0–5; > 0 thì hiện huy hiệu `+N`. */
  level?: number;
  /** Chỉ số hiệu lực (đã áp cấp +/phạt vị trí); mặc định chỉ số gốc của mẫu thẻ. */
  stats?: PlayerStats;
  isNew?: boolean;
}

/** Mô tả đọc cho trình đọc màn hình, VD "Vàng, Rafinho Duarte, Tiền đạo, OVR 81". */
export function cardLabel(card: Card, ovr = card.ovr, level = 0): string {
  const plus = level > 0 ? `, cấp +${level}` : '';
  return `${RARITY_INFO[card.rarity].label}, ${card.name}, ${POSITION_NAME[card.position]}, OVR ${ovr}${plus}`;
}

/** Họ (từ cuối) in to; phần còn lại cùng biệt danh ở dòng phụ. */
function splitName(name: string): [string, string] {
  const i = name.lastIndexOf(' ');
  return i < 0 ? [name, ''] : [name.slice(i + 1), name.slice(0, i)];
}

/**
 * Thẻ cầu thủ dùng chung (DESIGN.md §4): mặt tối, khung màu độ hiếm, góc vát. Cỡ lg (mở thẻ),
 * md (kho), sm (ô đội hình — không có chỉ số). Chiều rộng lấy từ `--card-w`, chữ co theo `cqw`.
 */
export function CardView({ card, size = 'md', level = 0, stats, isNew }: CardViewProps) {
  const shown = stats ?? card.stats;
  const ovr = stats ? computeOvr(card.position, stats) : card.ovr;
  const info = RARITY_INFO[card.rarity];
  const [last, first] = splitName(card.name);
  return (
    <div
      className={`card card--${size} r-${card.rarity}`}
      role="img"
      aria-label={cardLabel(card, ovr, level)}
    >
      <div className="card__body">
        <div className="card__ovr">{ovr}</div>
        <div className="card__pos" title={POSITION_NAME[card.position]}>
          {card.position}
        </div>
        <div className="card__pips" aria-hidden="true">
          {'◆'.repeat(info.pips)}
        </div>
        {isNew && <div className="card__new">MỚI</div>}
        <div className="card__avatar">
          <Avatar seed={card.avatarSeed} />
        </div>
        <div className="card__name">{last}</div>
        <div className="card__sub">
          {first && `${first} · `}“{card.nickname}”
        </div>
        {size !== 'sm' && (
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
