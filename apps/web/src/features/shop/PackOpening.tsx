import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Card, OpenPackResult } from '@pitch/shared';
import { CardView, cardLabel } from '../../components/card/CardView';
import { BoxMeter } from './BoxMeter';
import { hintsRarity, PackRevealer } from './reveal';

type Phase = 'pack' | 'reveal' | 'done';

export interface PackOpeningProps {
  result: OpenPackResult;
  catalog: ReadonlyMap<string, Card>;
  title: string;
  /** "Miễn phí · quà tân thủ" hoặc "Bấm để mở". */
  packNote: string;
  onBack: () => void;
  /** Nút ở bước tổng kết (Mở thêm, Xem trong kho). */
  summaryActions: ReactNode;
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
}: PackOpeningProps) {
  const cards = result.cards.map((pc) => ({ pc, card: catalog.get(pc.cardId) }));
  const [phase, setPhase] = useState<Phase>('pack');
  const [announce, setAnnounce] = useState('');
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

  return (
    <div className="opening">
      <div className="opening__bar">
        <button type="button" className="opening__back" onClick={onBack}>
          ← Cửa hàng
        </button>
        <h2 className="opening__title">{title}</h2>
      </div>

      <section className="stage" ref={stageRef} aria-label="Mở gói">
        <div className="stage__halfway" aria-hidden="true" />
        <div className="stage__circle" aria-hidden="true" />
        <div className="stage__spot" aria-hidden="true" />
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
              {cards.map(({ pc, card }, i) => (
                <div
                  key={pc.id}
                  data-i={i}
                  className={`reveal-slot r-${card?.rarity ?? 'bronze'}${card && hintsRarity(card.rarity) ? ' hint' : ''}`}
                >
                  <div className="reveal-mover">
                    <div className="reveal-aura" />
                    <div className="reveal-shaker">
                      <div className="reveal-flipper">
                        <button
                          type="button"
                          className="reveal-face reveal-back"
                          aria-label={`Thẻ ${i + 1} — lật`}
                          onClick={() => void rv.reveal(i)}
                        >
                          <span className="reveal-mark">MFG</span>
                        </button>
                        <div className="reveal-face reveal-front">
                          {card ? (
                            <CardView card={card} size="lg" level={pc.level} />
                          ) : (
                            <p className="muted">Thẻ #{pc.cardId}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <div className="opening__controls">
        {phase === 'pack' && (
          <span className="opening__hint">
            <kbd>Space</kbd> hoặc bấm vào gói để xé
          </span>
        )}
        {phase === 'reveal' && (
          <>
            <span className="opening__hint">
              <kbd>Space</kbd> lật thẻ tiếp · <kbd>Esc</kbd> bỏ qua
            </span>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void rv.revealAll()}
            >
              Lật hết
            </button>
          </>
        )}
        {phase === 'done' && (
          <>
            <p className="opening__summary">Đã nhận {cards.length} thẻ</p>
            {summaryActions}
          </>
        )}
      </div>

      <BoxMeter box={result.box} layout="row" />
      <div className="reveal-scrim" ref={scrimRef} />
      <div className="sr-only" aria-live="polite">
        {announce}
      </div>
    </div>
  );
}
