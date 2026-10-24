import type { PackBox, Rarity } from '@pitch/shared';
import { RARITY_INFO, RARITY_ORDER } from '../../components/card/rarity';

/** Số phiếu mỗi độ hiếm khi hộp mới (PRD §6.3) — mẫu số của thanh ngang. */
const BOX_INIT: Record<Rarity, number> = { legend: 2, gold: 10, silver: 30, bronze: 58 };

export function formatOdds(p: number): string {
  return `${(p * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
}

/** Hộp còn phiếu nhưng chỉ còn Đồng → gói 5 không bảo đảm Bạc+. */
export function onlyBronzeLeft(box: PackBox): boolean {
  return box.total > 0 && box.left.bronze === box.total;
}

/** Thanh hộp phiếu (DESIGN.md §4): còn lại theo độ hiếm + tỉ lệ lần bốc kế tiếp. */
export function BoxMeter({ box, layout = 'column' }: { box: PackBox; layout?: 'column' | 'row' }) {
  return (
    <section className={`box box--${layout}`} aria-labelledby="box-title">
      <h2 id="box-title" className="box__title">
        Hộp của bạn{' '}
        <span className="box__total">
          còn <b>{box.total}</b>/100 phiếu
        </span>
      </h2>
      <div className="box__rows">
        {RARITY_ORDER.map((r) => (
          <div key={r} className={`box__row r-${r}`}>
            <span className="box__label">
              <span aria-hidden="true">{'◆'.repeat(RARITY_INFO[r].pips)} </span>
              {RARITY_INFO[r].label}
            </span>
            <span className="box__count">{box.left[r]}</span>
            <span className="box__bar" aria-hidden="true">
              <i style={{ width: `${Math.min(100, (box.left[r] / BOX_INIT[r]) * 100)}%` }} />
            </span>
            <span className="box__odds">
              Lần bốc kế: <b>{formatOdds(box.nextOdds[r])}</b>
            </span>
          </div>
        ))}
      </div>
      <p className="box__note muted">
        Tỉ lệ = số phiếu còn / tổng còn. Hết 100 phiếu thì hộp làm mới (lần {box.cycle}).
      </p>
      {onlyBronzeLeft(box) && (
        <p className="box__warn" role="note">
          Hộp chỉ còn thẻ Đồng — gói 5 không đảm bảo Bạc.
        </p>
      )}
    </section>
  );
}
