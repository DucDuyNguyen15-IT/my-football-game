import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Card, OpenPackResult, PackBox } from '@pitch/shared';
import { CardView, cardLabel } from '../../components/card/CardView';
import { RARITY_INFO, RARITY_ORDER } from '../../components/card/rarity';
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
          if (c?.card) setAnnounce(`Thẻ ${i + 1}: ${cardLabel(c.card, undefined, c.pc.level)}`);
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
    if (phase !== 'pack' || tearing.current || !packRef.current) return;
    tearing.current = true;
    packRect.current = await rv.tear(packRef.current);
    setPhase('reveal');
  }

  // Bàn phím (DESIGN.md §6.3): Space/Enter xé gói hoặc lật thẻ kế; Esc lật hết.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (phase === 'reveal') void rv.revealAll();
        return;
      }
      if (e.key !== ' ' && e.key !== 'Enter') return;
      if (e.target instanceof HTMLButtonElement) return; // nút tự xử lý Space/Enter
      e.preventDefault();
      if (phase === 'pack') void tear();
      else if (phase === 'reveal') {
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
          ← Cửa hàng
        </button>
        <h1 className="h2 opening__title">{title}</h1>
        <span className="label num opening__count">
          {phase === 'pack' ? '' : `Đã lật ${revealedCount}/${cards.length}`}
        </span>
      </div>

      <section className="stage" ref={stageRef} aria-label="Mở gói">
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
              aria-label={`Xé ${title.toLowerCase()}`}
              onClick={() => void tear()}
            >
              <span className="pack__half pack__top" />
              <span className="pack__half pack__bot" />
              <span className="pack__brand">MFG</span>
              <span className="pack__label">
                <span className="pack__size">{cards.length} THẺ</span>
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
                      {rarity === 'legend' ? 'Sáng tím…' : 'Sáng vàng…'}
                    </span>
                  ) : (
                    <span className="label">Thẻ {i + 1}</span>
                  );
                } else if (isNew) tag = <span className="tag tag--accent">Mới</span>;
                else if (isDup) tag = <span className="tag">Trùng</span>;
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
                              aria-label={`Lật thẻ ${i + 1}`}
                              onClick={() => void rv.reveal(i)}
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
                                />
                              ) : (
                                <p className="muted">Thẻ #{pc.cardId}</p>
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
            Bấm vào gói hoặc <span className="kbd">Space</span> để xé
          </span>
        )}
        {phase === 'reveal' && (
          <>
            <span className="muted opening__hint">
              Bấm thẻ hoặc <span className="kbd">Space</span> để lật ·{' '}
              <span className="kbd">Esc</span> bỏ qua hiệu ứng
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void rv.revealAll()}
            >
              Lật tất cả
            </button>
          </>
        )}
        {phase === 'done' && (
          <div className="opening__summary">
            <p className="h3 opening__summary-text" role="status">
              Đã nhận {cards.length} thẻ
              {newIds && (
                <span className="muted num">
                  {' '}
                  · {nNew} mới · {nDup} trùng
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
  return (
    <div className="box-strip">
      <span className="label num">Hộp còn {box.total}/100</span>
      {RARITY_ORDER.map((r) => (
        <span key={r} className={`box-strip__item r-${r}`}>
          <b>
            <span aria-hidden="true">{'◆'.repeat(RARITY_INFO[r].pips)} </span>
            {RARITY_INFO[r].label}
          </b>
          <span className="display num box-strip__n">{box.left[r]}</span>
          <span className="muted num">{formatOdds(box.nextOdds[r])}</span>
        </span>
      ))}
      <button type="button" className="btn btn--ghost btn--sm box-strip__more" onClick={onDetails}>
        Chi tiết hộp
      </button>
    </div>
  );
}
