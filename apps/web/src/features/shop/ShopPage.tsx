import { useState } from 'react';
import { useNavigate } from 'react-router';
import type { OpenPackResult, PackInfo, PackPayment } from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { ApiClientError } from '../../api/client';
import { usePacks, useOpenPack } from '../../api/packs';
import { usePlayerCards } from '../../api/player-cards';
import { newCardIds } from '../collection/collection';
import { BoxMeter, onlyBronzeLeft } from './BoxMeter';
import { PackOpening } from './PackOpening';
import './shop.css';

const fmt = (n: number) => n.toLocaleString('vi-VN');

export function openErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'insufficient_coins') return 'Không đủ xu để mở gói này.';
    if (err.code === 'network_error')
      return 'Mất kết nối — bấm lại để thử tiếp (không bị trừ xu hai lần).';
    if (err.code === 'idempotency_conflict') return 'Yêu cầu bị trùng, hãy thử lại.';
    return err.message;
  }
  return 'Có lỗi xảy ra, hãy thử lại.';
}

interface Opened {
  result: OpenPackResult;
  code: string;
  payment: PackPayment;
  /** Đổi khi mở gói mới → PackOpening dựng lại từ đầu. */
  n: number;
  newIds?: ReadonlySet<string>;
}

/** Cửa hàng (DESIGN.md §6.6): hộp phiếu bên trái, gói 1/gói 5 bên phải; mua xong chuyển sang mở thẻ. */
export function ShopPage() {
  const me = useMe().data;
  const packs = usePacks();
  const catalog = useCardCatalog();
  const opener = useOpenPack();
  const owned = usePlayerCards();
  const navigate = useNavigate();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  if (!me) return null;
  if (packs.isPending || catalog.isPending) return <p className="screen-msg">Đang tải cửa hàng…</p>;
  if (packs.isError || catalog.isError) {
    return (
      <div className="screen-msg" role="alert">
        <p>Không tải được cửa hàng.</p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            void packs.refetch();
            void catalog.refetch();
          }}
        >
          Thử lại
        </button>
      </div>
    );
  }
  const { packs: list, box } = packs.data;
  const unitPrice = list.find((x) => x.size === 1)?.price ?? 0;

  async function buy(code: string, payment: PackPayment) {
    setBuying(`${code}:${payment}`);
    // Chụp kho trước khi mở (cache sẽ bị làm mới ngay sau đó) để gắn nhãn "MỚI".
    const ownedBefore = owned.data && new Set(owned.data.map((pc) => pc.cardId));
    try {
      const result = await opener.open(code, payment);
      if (result) {
        const newIds = ownedBefore && newCardIds(result.cards, ownedBefore);
        setOpened((o) => ({ result, code, payment, n: (o?.n ?? 0) + 1, newIds }));
      }
    } catch {
      /* lỗi hiện qua opener.error */
    } finally {
      setBuying(null);
    }
  }

  const buyButton = (p: PackInfo, payment: PackPayment, variant: 'primary' | 'secondary') => {
    const free = payment === 'free_credit';
    const short = free ? 0 : p.price - me.coins;
    const id = `${p.code}:${payment}`;
    return (
      <div className="buy">
        <button
          type="button"
          className={`btn btn--${variant} btn--lg`}
          disabled={opener.isPending || short > 0}
          aria-busy={buying === id}
          onClick={() => void buy(p.code, payment)}
        >
          {buying === id && <span className="spinner" aria-hidden="true" />}
          {free ? (
            'Mở miễn phí'
          ) : (
            <span className="price">
              {fmt(p.price)} <span className="coin__icon" aria-hidden="true" />
              <span className="sr-only"> xu</span>
            </span>
          )}
        </button>
        {short > 0 && <span className="buy__short">Thiếu {fmt(short)} xu</span>}
      </div>
    );
  };

  if (opened) {
    const p = list.find((x) => x.code === opened.code);
    return (
      <PackOpening
        key={opened.n}
        result={opened.result}
        catalog={catalog.data}
        newIds={opened.newIds}
        title={`Gói ${opened.result.cards.length} thẻ`}
        packNote={opened.payment === 'free_credit' ? 'Miễn phí · quà tân thủ' : 'Bấm để mở'}
        onBack={() => {
          opener.reset();
          setOpened(null);
        }}
        summaryActions={
          <>
            {p && buyButton(p, 'coins', 'primary')}
            {p &&
              p.size === 5 &&
              me.freePack5Credits > 0 &&
              buyButton(p, 'free_credit', 'secondary')}
            <button
              type="button"
              className="btn btn--secondary btn--lg"
              onClick={() => void navigate('/collection')}
            >
              Xem trong kho
            </button>
            {opener.error && (
              <p className="shop__error" role="alert">
                {openErrorMessage(opener.error)}
              </p>
            )}
          </>
        }
      />
    );
  }

  return (
    <div className="shop">
      <div className="shop__box panel">
        <BoxMeter box={box} />
      </div>
      <div className="shop__packs">
        {list.map((p) => (
          <section key={p.code} className="panel shop-pack" aria-labelledby={`pack-${p.code}`}>
            <div className="shop-pack__art" aria-hidden="true">
              <span>{p.size}</span>
            </div>
            <div className="shop-pack__info">
              <h2 id={`pack-${p.code}`} className="panel__title">
                Gói {p.size} thẻ
              </h2>
              {p.size > 1 && (
                <p className="muted">
                  ≥ 1 thẻ Bạc trở lên
                  {unitPrice > 0 &&
                    ` · rẻ hơn ${Math.round((1 - p.price / (p.size * unitPrice)) * 100)}%`}
                </p>
              )}
              {p.size > 1 && (!p.guaranteeAvailable || onlyBronzeLeft(box)) && (
                <p className="shop-pack__warn">Hộp chỉ còn thẻ Đồng — gói 5 không đảm bảo Bạc.</p>
              )}
              {buyButton(p, 'coins', p.size > 1 ? 'primary' : 'secondary')}
              {p.size === 5 && me.freePack5Credits > 0 && (
                <div className="shop-pack__free">
                  <span>★ {me.freePack5Credits} gói 5 miễn phí</span>
                  {buyButton(p, 'free_credit', 'primary')}
                </div>
              )}
            </div>
          </section>
        ))}
        {opener.error && (
          <p className="shop__error" role="alert">
            {openErrorMessage(opener.error)}
          </p>
        )}
      </div>
    </div>
  );
}
