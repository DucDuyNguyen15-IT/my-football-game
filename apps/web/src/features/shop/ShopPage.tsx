import { useState, type CSSProperties } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { OpenPackResult, PackInfo, PackPayment } from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { ApiClientError } from '../../api/client';
import { usePacks, useOpenPack } from '../../api/packs';
import { usePlayerCards } from '../../api/player-cards';
import { errorMessageFor, formatMessage, formatNumber, getActiveLocale, type Locale } from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';
import { newCardIds } from '../collection/collection';
import { OnboardingFlowBanner } from '../onboarding/OnboardingFlowBanner';
import { BoxMeter, onlyBronzeLeft, WarnIcon } from './BoxMeter';
import { PackOpening } from './PackOpening';
import './shop.css';

export function openErrorMessage(err: unknown, locale: Locale = getActiveLocale()): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'insufficient_coins') return formatMessage(locale, 'shop.errInsufficientCoins');
    if (err.code === 'network_error') return formatMessage(locale, 'shop.errNetwork');
    return errorMessageFor(err, locale, 'err.genericRetry');
  }
  return formatMessage(locale, 'err.genericRetry');
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

/** Hình gói trừu tượng (ui.css `.pack-art` + shop.css `.shop-page .pack-art`), cỡ theo `--pw`. */
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
  const { t } = useI18n();
  return (
    <div className="shop" aria-busy="true">
      <span className="sr-only" role="status">
        {t('shop.loading')}
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
  const { locale, t } = useI18n();
  const me = useMe().data;
  const packs = usePacks();
  const catalog = useCardCatalog();
  const opener = useOpenPack();
  const owned = usePlayerCards();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [opened, setOpened] = useState<Opened | null>(null);
  const [buying, setBuying] = useState<string | null>(null);

  if (!me) return null;

  const isOnboarding =
    searchParams.get('onboarding') === '1' ||
    (me.freePack5Credits > 0 && me.rewardedMatchesToday === 0);
  const squadDest = isOnboarding ? '/squad?onboarding=1' : '/squad';

  const head = (
    <div className="shop__head">
      <h1 className="h1">{t('shop.title')}</h1>
      <span className="muted">{t('shop.sub')}</span>
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
  if (packs.isLoadingError || catalog.isLoadingError) {
    return (
      <div className="shop-page">
        {head}
        <div className="panel empty" role="alert">
          <h2 className="empty__title">{t('shop.loadErrorTitle')}</h2>
          <p className="empty__body">{t('shop.loadErrorBody')}</p>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => {
              void packs.refetch();
              void catalog.refetch();
            }}
          >
            {t('common.retry')}
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
    let result;
    try {
      result = await opener.open(code, payment);
    } catch {
      /* lỗi hiện qua opener.error */
      setBuying(null);
      return;
    }
    // null = bấm đôi, lần mở trước vẫn đang chạy: để lần đó tự tắt spinner (B4-08).
    if (result === null) return;
    setBuying(null);
    const newIds = ownedBefore && newCardIds(result.cards, ownedBefore);
    setOpened((o) => ({ result, code, payment, n: (o?.n ?? 0) + 1, newIds }));
  }

  /** Nút mua: khoá + spinner khi chờ server (không đổi kích thước), báo thiếu bao nhiêu xu. */
  const buyButton = (
    p: PackInfo,
    payment: PackPayment,
    className = 'btn btn--coin',
    again = false,
  ) => {
    const free = payment === 'free_credit';
    const short = free ? 0 : p.price - me.coins;
    const id = `${p.code}:${payment}`;
    const busy = buying === id;
    const verb = again ? t('shop.openNextVerb') : t('shop.buyVerb');
    const freeLabel = again ? t('shop.openNextFree') : t('shop.openFree');
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
            {free
              ? freeLabel
              : t('shop.buyPrice', { verb, price: formatNumber(p.price, locale) })}
          </span>
        </button>
        {short > 0 && (
          <span className="field__error">
            {t('shop.shortCoins', { short: formatNumber(short, locale) })}
          </span>
        )}
      </div>
    );
  };

  const errorToast = opener.error && (
    <div className="toast toast--error shop__error" role="alert">
      <span className="toast__icon" aria-hidden="true">
        !
      </span>
      <div>
        <b>{t('shop.buyErrorTitle')}</b>
        <span>{openErrorMessage(opener.error, locale)}</span>
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
        title={t('shop.packTitle', { size: opened.result.cards.length })}
        packNote={
          opened.payment === 'free_credit' ? t('shop.packNoteFree') : t('shop.packNoteClick')
        }
        onBack={() => {
          opener.reset();
          setOpened(null);
        }}
        summaryActions={
          <>
            <button
              type="button"
              className="btn btn--primary btn--lg"
              onClick={() =>
                void navigate(opened.payment === 'free_credit' ? '/squad?onboarding=1' : squadDest)
              }
            >
              {t('shop.toSquad')}
            </button>
            {p &&
              (p.size === 5 && me.freePack5Credits > 0
                ? buyButton(p, 'free_credit', 'btn btn--coin btn--lg', true)
                : buyButton(p, 'coins', 'btn btn--coin btn--lg', true))}
            <button
              type="button"
              className="btn btn--secondary btn--lg"
              onClick={() => void navigate('/collection')}
            >
              {t('shop.toCollection')}
            </button>
            {errorToast}
          </>
        }
      />
    );
  }

  return (
    <div className="shop-page">
      {isOnboarding && <OnboardingFlowBanner currentStep={2} />}
      {head}
      <div className="shop">
        <div className="panel shop__box">
          <BoxMeter box={box} />
        </div>
        <div className="shop__packs">
          {freePack && (
            <section className="panel--notch shop-free" aria-labelledby="free-title">
              <div className="panel__in shop-free__in">
                <PackArt size={freePack.size} note={t('shop.freeBadge')} width={96} />
                <div className="shop-pack__info">
                  <span className="label shop-free__label">
                    {t('shop.freeKicker', { count: me.freePack5Credits })}
                  </span>
                  <h2 id="free-title" className="h2">
                    {t('shop.freeTitle', { size: freePack.size })}
                  </h2>
                  <p className="muted shop-pack__desc">
                    {t('shop.freeDescBase')}
                    {freePack.guaranteeAvailable && !onlyBronzeLeft(box)
                      ? t('shop.freeDescSilver')
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
                <PackArt size={p.size} note={t('shop.cardBadge')} width={120} />
                <div className="shop-pack__info">
                  <div className="shop-pack__title">
                    <h2 id={`pack-${p.code}`} className="h2">
                      {t('shop.packTitle', { size: p.size })}
                    </h2>
                    {off > 0 && (
                      <span className="tag tag--accent">{t('shop.discountTag', { pct: off })}</span>
                    )}
                  </div>
                  <p className="muted shop-pack__desc">
                    {p.size > 1 ? (
                      <>
                        {t('shop.packMultiDescBefore', { size: p.size })}{' '}
                        <b>{t('shop.packMultiDescBold')}</b> {t('shop.packMultiDescAfter')}
                      </>
                    ) : (
                      t('shop.packSingleDesc')
                    )}
                  </p>
                  {noGuarantee && (
                    <span className="tag tag--warn">
                      <WarnIcon /> {t('shop.noSilverGuarantee')}
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
