import { useState, type CSSProperties } from 'react';
import { useNavigate } from 'react-router';
import type { OpenPackResult, PackInfo, PackPayment } from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { ApiClientError } from '../../api/client';
import { usePacks, useOpenPack } from '../../api/packs';
import { usePlayerCards } from '../../api/player-cards';
import { newCardIds } from '../collection/collection';
import { BoxMeter, onlyBronzeLeft, WarnIcon } from './BoxMeter';
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

/** % rẻ hơn so với mua lẻ từng thẻ; 0 nếu không rẻ hơn hoặc thiếu giá gói 1. */
export function discountPct(p: PackInfo, unitPrice: number): number {
  if (p.size <= 1 || unitPrice <= 0) return 0;
  return Math.max(0, Math.round((1 - p.price / (p.size * unitPrice)) * 100));
}

interface Opened {
  result: OpenPackResult;
  code: string;
  payment: PackPayment;
  /** Đổi khi mở gói mới → PackOpening dựng lại từ đầu. */
  n: number;
  newIds?: ReadonlySet<string>;
}

/** Hình gói trừu tượng (ui.css `.pack-art`), cỡ theo `--pw`. */
export function PackArt({ size, note, width }: { size: number; note: string; width: number }) {
  return (
    <div className="pack-art" style={{ '--pw': `${width}px` } as CSSProperties} aria-hidden="true">
      <div className="pack-art__count">
        {size}
        <small>{note}</small>
      </div>
      <div className="pack-art__stripes">
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  );
}

function ShopSkeleton() {
  return (
    <div className="shop" aria-busy="true">
      <span className="sr-only" role="status">
        Đang tải cửa hàng…
      </span>
      <div className="panel shop__box shop-skel">
        <div className="skel skel--line" style={{ width: '50%' }} />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="shop-skel__row">
            <div className="skel skel--line" />
            <div className="skel skel--line" />
            <div className="skel skel--line" />
          </div>
        ))}
      </div>
      <div className="shop__packs">
        {[0, 1].map((i) => (
          <div key={i} className="panel shop-pack">
            <div className="skel shop-skel__art" />
            <div className="shop-skel__info">
              <div className="skel skel--line" style={{ width: '60%' }} />
              <div className="skel skel--line" />
              <div className="skel shop-skel__btn" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Cửa hàng (docs/design/screens/shop*.html): hộp phiếu bên trái, quà tân thủ + gói bên phải. */
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

  const head = (
    <div className="shop__head">
      <h1 className="h1">Cửa hàng</h1>
      <span className="muted">Mua bằng xu kiếm được trong trận. Không có nạp tiền thật.</span>
    </div>
  );

  if (packs.isPending || catalog.isPending) {
    return (
      <div className="shop-page">
        {head}
        <ShopSkeleton />
      </div>
    );
  }
  if (packs.isError || catalog.isError) {
    return (
      <div className="shop-page">
        {head}
        <div className="panel empty" role="alert">
          <h2 className="empty__title">Không tải được cửa hàng</h2>
          <p className="empty__body">
            Kiểm tra kết nối rồi thử lại. Xu của bạn không bị ảnh hưởng.
          </p>
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
      </div>
    );
  }
  const { box } = packs.data;
  const list = [...packs.data.packs].sort((a, b) => b.size - a.size);
  const unitPrice = list.find((x) => x.size === 1)?.price ?? 0;
  const freePack = me.freePack5Credits > 0 ? list.find((x) => x.size === 5) : undefined;

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

  /** Nút mua: khoá + spinner khi chờ server (không đổi kích thước), báo thiếu bao nhiêu xu. */
  const buyButton = (
    p: PackInfo,
    payment: PackPayment,
    className = 'btn btn--coin',
    verb = 'Mua',
  ) => {
    const free = payment === 'free_credit';
    const short = free ? 0 : p.price - me.coins;
    const id = `${p.code}:${payment}`;
    const busy = buying === id;
    return (
      <div className="buy">
        <button
          type="button"
          className={`${className}${busy ? ' is-loading' : ''}`}
          disabled={opener.isPending || short > 0}
          aria-busy={busy}
          onClick={() => void buy(p.code, payment)}
        >
          <span className="btn__label">
            {free ? `${verb === 'Mua' ? 'Mở' : verb} miễn phí` : `${verb} · ${fmt(p.price)} xu`}
          </span>
        </button>
        {short > 0 && <span className="field__error">Thiếu {fmt(short)} xu</span>}
      </div>
    );
  };

  const errorToast = opener.error && (
    <div className="toast toast--error shop__error" role="alert">
      <span className="toast__icon" aria-hidden="true">
        !
      </span>
      <div>
        <b>Chưa mua được</b>
        <span>{openErrorMessage(opener.error)}</span>
      </div>
    </div>
  );

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
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() => void navigate('/squad')}
            >
              Xếp đội
            </button>
            {p &&
              (p.size === 5 && me.freePack5Credits > 0
                ? buyButton(p, 'free_credit', 'btn btn--coin btn--lg', 'Mở tiếp')
                : buyButton(p, 'coins', 'btn btn--coin btn--lg', 'Mở tiếp'))}
            <button
              type="button"
              className="btn btn--secondary btn--lg"
              onClick={() => void navigate('/collection')}
            >
              Về kho
            </button>
            {errorToast}
          </>
        }
      />
    );
  }

  return (
    <div className="shop-page">
      {head}
      <div className="shop">
        <div className="panel shop__box">
          <BoxMeter box={box} />
        </div>
        <div className="shop__packs">
          {freePack && (
            <section className="panel--notch shop-free" aria-labelledby="free-title">
              <div className="panel__in shop-free__in">
                <PackArt size={freePack.size} note="MIỄN PHÍ" width={96} />
                <div className="shop-pack__info">
                  <span className="label shop-free__label">
                    Quà tân thủ · còn {me.freePack5Credits} gói
                  </span>
                  <h2 id="free-title" className="h2">
                    Gói {freePack.size} thẻ miễn phí
                  </h2>
                  <p className="muted shop-pack__desc">
                    Bốc từ chính hộp của bạn
                    {freePack.guaranteeAvailable && !onlyBronzeLeft(box)
                      ? ', vẫn bảo đảm ≥ 1 thẻ Bạc.'
                      : '.'}
                  </p>
                </div>
                {buyButton(freePack, 'free_credit', 'btn btn--primary btn--lg')}
              </div>
            </section>
          )}
          {list.map((p) => {
            const off = discountPct(p, unitPrice);
            const noGuarantee = p.size > 1 && (!p.guaranteeAvailable || onlyBronzeLeft(box));
            const busy = buying === `${p.code}:coins`;
            return (
              <section
                key={p.code}
                className={`panel shop-pack${busy ? ' panel--raised' : ''}`}
                aria-labelledby={`pack-${p.code}`}
              >
                <PackArt size={p.size} note="THẺ" width={120} />
                <div className="shop-pack__info">
                  <div className="shop-pack__title">
                    <h2 id={`pack-${p.code}`} className="h2">
                      Gói {p.size} thẻ
                    </h2>
                    {off > 0 && <span className="tag tag--accent">Rẻ {off}%</span>}
                  </div>
                  <p className="muted shop-pack__desc">
                    {p.size > 1 ? (
                      <>
                        Bốc {p.size} phiếu. <b>Bảo đảm ít nhất 1 thẻ Bạc trở lên</b> nếu hộp còn
                        phiếu Bạc+.
                      </>
                    ) : (
                      'Bốc 1 phiếu từ hộp. Hợp khi cần thêm một thẻ để ép.'
                    )}
                  </p>
                  {noGuarantee && (
                    <span className="tag tag--warn">
                      <WarnIcon /> Lần này không bảo đảm Bạc
                    </span>
                  )}
                  {buyButton(p, 'coins')}
                </div>
              </section>
            );
          })}
          {errorToast}
        </div>
      </div>
    </div>
  );
}
