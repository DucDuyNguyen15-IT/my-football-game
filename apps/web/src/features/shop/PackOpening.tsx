import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Card, OpenPackResult, PackBox } from '@pitch/shared';
import { CardView, cardLabel } from '../../components/card/CardView';
import { RARITY_ORDER, rarityLabel, rarityPips } from '../../components/card/rarity';
import { useI18n } from '../../i18n/I18nContext';
import { formatOdds } from './BoxMeter';
import { hintsRarity, PackRevealer } from './reveal';

type Phase = 'pack' | 'reveal' | 'done';

export interface PackOpeningProps {
  result: OpenPackResult;
  catalog: ReadonlyMap<string, Card>;
  title: string;
  /** "Miễn phí · quà tân thủ" hoặc "Bấm để mở". */
  packNote: string;
  onBack: () => void;
  /** Nút ở bước tổng kết (Xếp đội, Mở tiếp, Về kho). */
  summaryActions: ReactNode;
  /** `PlayerCard.id` của thẻ mẫu chưa từng có trong kho → nhãn "MỚI". */
  newIds?: ReadonlySet<string>;
}

/**
 * Màn mở thẻ (DESIGN.md §6.3): gói thở → xé → thẻ úp bay ra → lật từng thẻ (bấm/Space) hoặc
 * "Lật hết"/Esc → tổng kết. Kết quả đã chốt ở server; đây chỉ là trình diễn.
 */
export function PackOpening({
  result,
  catalog,
  title,
  packNote,
  onBack,
  summaryActions,
  newIds,
}: PackOpeningProps) {
  const { locale, t } = useI18n();
  const cards = result.cards.map((pc) => ({ pc, card: catalog.get(pc.cardId) }));
  const [phase, setPhase] = useState<Phase>('pack');
  const [announce, setAnnounce] = useState('');
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(() => new Set());
  const packRef = useRef<HTMLButtonElement>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLElement>(null);
  const scrimRef = useRef<HTMLDivElement>(null);
  const packRect = useRef<DOMRect | null>(null);
  const tearing = useRef(false);
  const localeRef = useRef(locale);
  const tRef = useRef(t);
  useEffect(() => {
    localeRef.current = locale;
    tRef.current = t;
  }, [locale, t]);

  // Một revealer cho mỗi lần mở gói (ShopPage đổi `key` khi mở gói mới).
  const [rv] = useState(
    () =>
      new PackRevealer({
        rarities: cards.map((c) => c.card?.rarity ?? 'bronze'),
        scrim: scrimRef,
        stage: stageRef,
        onRevealed: (i) => {
          setRevealed((prev) => new Set(prev).add(i));
          const c = cards[i];
          if (c?.card) {
            setAnnounce(
              tRef.current('pack.announce', {
                index: i + 1,
                label: cardLabel(c.card, undefined, c.pc.level, localeRef.current),
              }),
            );
          }
        },
        onAllRevealed: () => setPhase('done'),
      }),
  );

  useEffect(() => {
    rv.attach();
    return () => rv.dispose();
  }, [rv]);
  // Animation lặp vô hạn (foil, hào quang, gói thở) dừng khi tab ẩn (DESIGN.md §5).
  useEffect(() => {
    const sync = () => document.documentElement.classList.toggle('tab-hidden', document.hidden);
    document.addEventListener('visibilitychange', sync);
    return () => {
      document.removeEventListener('visibilitychange', sync);
      document.documentElement.classList.remove('tab-hidden');
    };
  }, []);
  useEffect(() => {
    if (phase === 'pack') packRef.current?.focus({ preventScroll: true });
    if (phase === 'reveal' && rowRef.current) void rv.layout(rowRef.current, packRect.current);
  }, [phase, rv]);

  async function tear() {
    if (phase !== 'pack' || !packRef.current) return;
    if (tearing.current) {
      rv.skipCurrent();
      return;
    }
    tearing.current = true;
    packRect.current = await rv.tear(packRef.current);
    setPhase('reveal');
  }

  // Bàn phím (DESIGN.md §6.3): Space/Enter xé gói, tua nhanh hiệu ứng đang chạy hoặc lật thẻ kế; Esc lật hết.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'reveal') void rv.revealAll();
        return;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (phase === 'pack') {
        if (e.target instanceof HTMLButtonElement && !tearing.current) return;
        e.preventDefault();
        void tear();
        return;
      }
      if (phase === 'reveal') {
        if (rv.isBusy()) {
          if (
            e.target instanceof HTMLButtonElement &&
            !e.target.classList.contains('reveal-back')
          ) {
            return;
          }
          e.preventDefault();
          rv.skipCurrent();
          return;
        }
        if (e.target instanceof HTMLButtonElement) return; // nút tự xử lý Space/Enter
        e.preventDefault();
        const i = rv.nextHidden();
        if (i >= 0) void rv.reveal(i);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  });

  const revealedCount = revealed.size;
  const nNew = newIds ? cards.filter(({ pc }) => newIds.has(pc.id)).length : 0;
  const nDup = newIds ? cards.length - nNew : 0;

  return (
    <div className="opening">
      <div className="opening__bar">
        <button type="button" className="btn btn--ghost btn--sm opening__back" onClick={onBack}>
          {t('pack.backToShop')}
        </button>
        <h1 className="h2 opening__title">{title}</h1>
        <span className="label num opening__count">
          {phase === 'pack'
            ? ''
            : t('pack.revealedCount', { revealed: revealedCount, total: cards.length })}
        </span>
      </div>

      <section
        className="stage"
        ref={stageRef}
        aria-label={t('pack.stageAria')}
        onClick={() => {
          if (phase === 'pack' && tearing.current) rv.skipCurrent();
          else if (phase === 'reveal' && rv.isBusy()) rv.skipCurrent();
        }}
      >
        <svg
          className="stage__lines"
          viewBox="0 0 1280 500"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <line x1="0" y1="250" x2="1280" y2="250" />
          <ellipse cx="640" cy="250" rx="560" ry="220" />
        </svg>
        <div className="stage__inner">
          {phase === 'pack' ? (
            <button
              ref={packRef}
              type="button"
              className="pack"
              aria-label={t('pack.tearAria', { title: title.toLowerCase() })}
              onClick={() => void tear()}
            >
              <span className="pack__half pack__top" />
              <span className="pack__half pack__bot" />
              <span className="pack__brand">MFG</span>
              <span className="pack__label">
                <span className="pack__size">{t('pack.sizeLabel', { count: cards.length })}</span>
                <span className="pack__note">{packNote}</span>
              </span>
            </button>
          ) : (
            <div className="reveal-row" ref={rowRef}>
              {cards.map(({ pc, card }, i) => {
                const rarity = card?.rarity ?? 'bronze';
                const hot = card !== undefined && hintsRarity(rarity);
                const isOpen = revealed.has(i);
                const isNew = newIds?.has(pc.id);
                const isDup = newIds !== undefined && !isNew;
                let tag: ReactNode = null;
                if (!isOpen) {
                  tag = hot ? (
                    <span className="label po-slot__hint">
                      {rarity === 'legend' ? t('pack.hintLegend') : t('pack.hintGold')}
                    </span>
                  ) : (
                    <span className="label">{t('pack.slotLabel', { index: i + 1 })}</span>
                  );
                } else if (isNew) tag = <span className="tag tag--accent">{t('pack.tagNew')}</span>;
                else if (isDup) tag = <span className="tag">{t('pack.tagDup')}</span>;
                return (
                  <div key={pc.id} className="po-slot">
                    <div data-i={i} className={`reveal-slot r-${rarity}${hot ? ' hint' : ''}`}>
                      <div className="reveal-mover">
                        <div className="reveal-aura" />
                        <div className="reveal-shaker">
                          <div className="reveal-flipper">
                            <button
                              type="button"
                              className="reveal-face reveal-back"
                              aria-label={t('pack.flipAria', { index: i + 1 })}
                              onClick={(e) => {
                                e.stopPropagation();
                                if (rv.isBusy()) rv.skipCurrent();
                                void rv.reveal(i);
                              }}
                            >
                              <span className="reveal-mark">MFG</span>
                            </button>
                            <div className="reveal-face reveal-front">
                              {card ? (
                                <CardView
                                  card={card}
                                  size="lg"
                                  level={pc.level}
                                  isNew={isNew}
                                  isDuplicate={isDup}
                                  tilt={isOpen}
                                />
                              ) : (
                                <p className="muted">
                                  {t('pack.unknownCard', { cardId: pc.cardId })}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <span className={`po-slot__tag r-${rarity}`}>{tag}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>

      <div className="opening__controls">
        {phase === 'pack' && (
          <span className="muted opening__hint">
            {t('pack.hintTearPrefix')} <span className="kbd">Space</span> {t('pack.hintTearSuffix')}
          </span>
        )}
        {phase === 'reveal' && (
          <>
            <span className="muted opening__hint">
              {t('pack.hintFlip1')} <span className="kbd">Space</span> {t('pack.hintFlip2')}{' '}
              <span className="kbd">Esc</span> {t('pack.hintFlip3')}
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void rv.revealAll()}
            >
              {t('pack.revealAll')}
            </button>
          </>
        )}
        {phase === 'done' && (
          <div className="opening__summary">
            <p className="h3 opening__summary-text" role="status">
              {t('pack.receivedCount', { count: cards.length })}
              {newIds && (
                <span className="muted num">
                  {t('pack.receivedBreakdown', { newCount: nNew, dupCount: nDup })}
                </span>
              )}
            </p>
            <div className="opening__actions">{summaryActions}</div>
          </div>
        )}
      </div>

      <BoxStrip box={result.box} onDetails={onBack} />
      <div className="reveal-scrim" ref={scrimRef} />
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}

/** Dải hộp phiếu gọn dưới màn mở gói (packopening.html). */
function BoxStrip({ box, onDetails }: { box: PackBox; onDetails: () => void }) {
  const { locale, t } = useI18n();
  return (
    <div className="box-strip">
      <span className="label num">
        {t('pack.stripLeft', { total: box.total, size: box.size })}
      </span>
      {RARITY_ORDER.map((r) => (
        <span key={r} className={`box-strip__item r-${r}`}>
          <b>
            <span aria-hidden="true">{'◆'.repeat(rarityPips(r))} </span>
            {rarityLabel(r, locale)}
          </b>
          <span className="display num box-strip__n">{box.left[r]}</span>
          <span className="muted num">{formatOdds(box.nextOdds[r], locale)}</span>
        </span>
      ))}
      <button type="button" className="btn btn--ghost btn--sm box-strip__more" onClick={onDetails}>
        {t('pack.stripDetails')}
      </button>
    </div>
  );
}
