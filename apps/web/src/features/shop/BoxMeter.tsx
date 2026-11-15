import type { CSSProperties } from 'react';
import type { PackBox } from '@pitch/shared';
import { RARITY_INFO, RARITY_ORDER } from '../../components/card/rarity';

export function formatOdds(p: number): string {
  return `${(p * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}

/** Hộp còn phiếu nhưng chỉ còn Đồng → gói 5 không bảo đảm Bạc+. */
export function onlyBronzeLeft(box: PackBox): boolean {
  return box.total > 0 && box.left.bronze === box.total;
}

/** "2 Huyền thoại · 10 Vàng · …" — thành phần hộp mới do server trả (B4-11). */
const composition = (box: PackBox) =>
  RARITY_ORDER.map((r) => `${box.initial[r]} ${RARITY_INFO[r].label}`).join(' · ');

export function WarnIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
    >
      <path d="M8 2l6.5 12h-13z" />
      <path d="M8 7v3M8 12v.5" />
    </svg>
  );
}

/** Hộp phiếu (docs/design/screens/shop.html): còn lại theo độ hiếm + tỉ lệ lần bốc kế tiếp. */
export function BoxMeter({ box }: { box: PackBox }) {
  const empty = box.total === 0;
  return (
    <section className="box" aria-labelledby="box-title">
      <h2 id="box-title" className="panel__title box__title">
        Hộp thẻ của bạn{' '}
        <span className="meta num">
          còn <b>{box.total}</b>/{box.size} phiếu
        </span>
      </h2>
      <p className="muted box__lead">
        Hộp riêng {box.size} phiếu: <b>{composition(box)}</b>. Bốc phiếu nào, phiếu đó ra khỏi hộp — tỉ lệ đổi
        sau mỗi lần mở.
      </p>
      {onlyBronzeLeft(box) && (
        <p className="banner" role="note">
          <WarnIcon />
          <span>
            Hộp chỉ còn thẻ Đồng. <b>Gói 5 không còn bảo đảm Bạc.</b>
          </span>
        </p>
      )}
      <div className="label box__head" aria-hidden="true">
        <span>Độ hiếm</span>
        <span>Còn · Tỉ lệ lần bốc kế tiếp</span>
      </div>
      <div className="box__rows">
        {RARITY_ORDER.map((r) => (
          <div
            key={r}
            className={`meter r-${r}${box.left[r] === 0 ? ' is-empty' : ''}`}
            aria-label={`${RARITY_INFO[r].label}: còn ${box.left[r]} phiếu, lần bốc kế ${formatOdds(box.nextOdds[r])}`}
            role="group"
          >
            <span className="meter__name">
              <span className="rarity__pips" aria-hidden="true">
                {'◆'.repeat(RARITY_INFO[r].pips)}
              </span>
              {RARITY_INFO[r].label}
            </span>
            <div
              className="bar bar--rarity"
              aria-hidden="true"
              style={
                { '--v': `${Math.min(100, (box.left[r] / Math.max(1, box.initial[r])) * 100)}%` } as CSSProperties
              }
            >
              <div className="bar__fill" />
            </div>
            <span className="meter__count">{box.left[r]}</span>
            <span className="meter__pct">{formatOdds(box.nextOdds[r])}</span>
          </div>
        ))}
      </div>
      {empty ? (
        <div className="box__empty">
          <b className="h3">Đã bốc hết {box.size} phiếu</b>
          <p className="muted">Lần mở tiếp theo tự làm mới hộp: {composition(box)}.</p>
        </div>
      ) : (
        <p className="box__note muted">
          Tỉ lệ = số phiếu còn / tổng còn. Hết {box.size} phiếu thì hộp tự làm mới (đang dùng hộp thứ{' '}
          {box.cycle}).
        </p>
      )}
    </section>
  );
}
