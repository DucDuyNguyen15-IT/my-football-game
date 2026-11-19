import type { CSSProperties } from 'react';
import type { PackBox } from '@pitch/shared';
import { RARITY_ORDER, rarityLabel, rarityPips } from '../../components/card/rarity';
import { formatPercentValue, getActiveLocale, type Locale } from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';

export function formatOdds(p: number, locale: Locale = getActiveLocale()): string {
  return formatPercentValue(p, locale, 0, 1);
}

/** Hộp còn phiếu nhưng chỉ còn Đồng → gói 5 không bảo đảm Bạc+. */
export function onlyBronzeLeft(box: PackBox): boolean {
  return box.total > 0 && box.left.bronze === box.total;
}

/** "2 Huyền thoại · 10 Vàng · …" — thành phần hộp mới do server trả (B4-11). */
const composition = (box: PackBox, locale: Locale) =>
  RARITY_ORDER.map((r) => `${box.initial[r]} ${rarityLabel(r, locale)}`).join(' · ');

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
  const { locale, t } = useI18n();
  const empty = box.total === 0;
  const comp = composition(box, locale);
  return (
    <section className="box" aria-labelledby="box-title">
      <h2 id="box-title" className="panel__title box__title">
        {t('home.yourBox')}{' '}
        <span className="meta num">
          {t('box.ticketsLeftPrefix')}{' '}
          <b>{box.total}</b>/{box.size} {t('box.ticketsLeftRatio', { total: box.total, size: box.size }).replace(`${box.total}/${box.size} `, '')}
        </span>
      </h2>
      <p className="muted box__lead">
        {t('box.leadBefore', { size: box.size })} <b>{comp}</b>
        {t('box.leadAfter')}
      </p>
      {onlyBronzeLeft(box) && (
        <p className="banner" role="note">
          <WarnIcon />
          <span>
            {t('box.onlyBronzeWarn')} <b>{t('box.onlyBronzeWarnBold')}</b>
          </span>
        </p>
      )}
      <div className="label box__head" aria-hidden="true">
        <span>{t('box.colRarity')}</span>
        <span>{t('box.colOdds')}</span>
      </div>
      <div className="box__rows">
        {RARITY_ORDER.map((r) => {
          const label = rarityLabel(r, locale);
          const odds = formatOdds(box.nextOdds[r], locale);
          return (
            <div
              key={r}
              className={`meter r-${r}${box.left[r] === 0 ? ' is-empty' : ''}`}
              aria-label={t('box.rowAria', { rarity: label, left: box.left[r], odds })}
              role="group"
            >
              <span className="meter__name">
                <span className="rarity__pips" aria-hidden="true">
                  {'◆'.repeat(rarityPips(r))}
                </span>
                {label}
              </span>
              <div
                className="bar bar--rarity"
                aria-hidden="true"
                style={
                  {
                    '--v': `${Math.min(100, (box.left[r] / Math.max(1, box.initial[r])) * 100)}%`,
                  } as CSSProperties
                }
              >
                <div className="bar__fill" />
              </div>
              <span className="meter__count">{box.left[r]}</span>
              <span className="meter__pct">{odds}</span>
            </div>
          );
        })}
      </div>
      {empty ? (
        <div className="box__empty">
          <b className="h3">{t('box.emptyTitle', { size: box.size })}</b>
          <p className="muted">{t('box.emptyBody', { comp })}</p>
        </div>
      ) : (
        <p className="box__note muted">{t('box.note', { size: box.size, cycle: box.cycle })}</p>
      )}
    </section>
  );
}
