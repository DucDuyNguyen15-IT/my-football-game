import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { Link, useSearchParams } from 'react-router';
import { Position, Rarity, type Card, type PlayerCard, type PlayerCardSort } from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { ApiClientError } from '../../api/client';
import { useEconomy, usePlayerCards, useSellCards } from '../../api/player-cards';
import { CardView } from '../../components/card/CardView';
import {
  localizedStatsFor,
  positionName,
  rarityLabel,
  rarityPips,
} from '../../components/card/rarity';
import { HoldButton } from '../../components/HoldButton';
import {
  errorMessageFor,
  formatMessage,
  formatNumber,
  getActiveLocale,
  type Locale,
  type TranslationKey,
} from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';
import {
  isValuableSale,
  loadSavedFilter,
  matchesQuery,
  readFilter,
  saleTotal,
  saveFilter,
  writeFilter,
  type CollectionFilter,
} from './collection';
import { enterSheet, SHEET_QUERY } from './sheetFocus';
import './collection.css';

const SORTS: { value: PlayerCardSort; key: TranslationKey }[] = [
  { value: '-ovr', key: 'coll.sortOvrDesc' },
  { value: 'ovr', key: 'coll.sortOvrAsc' },
  { value: '-acquired', key: 'coll.sortNewest' },
  { value: 'acquired', key: 'coll.sortOldest' },
];

/** Tối đa số thẻ một lần bán (server giới hạn 50). */
const SELL_MAX = 50;

export function sellErrorMessage(err: unknown, locale: Locale = getActiveLocale()): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'card_in_squad') return formatMessage(locale, 'coll.sellErrInSquad');
    if (err.code === 'not_found') return formatMessage(locale, 'coll.sellErrNotFound');
    if (err.code === 'network_error') return formatMessage(locale, 'coll.sellErrNetwork');
    return errorMessageFor(err, locale, 'err.genericRetry');
  }
  return formatMessage(locale, 'err.genericRetry');
}

interface Item {
  pc: PlayerCard;
  card: Card;
}

function Coin({ n }: { n: number }) {
  const { locale, t } = useI18n();
  return (
    <span className="coin coin--sm">
      <span className="coin__icon" aria-hidden="true" />
      <span>{formatNumber(n, locale)}</span>
      <span className="sr-only"> {t('common.coin')}</span>
    </span>
  );
}

function SearchIcon() {
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
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5L14 14" />
    </svg>
  );
}

function CollectionSkeleton() {
  const { t } = useI18n();
  return (
    <div className="coll" aria-busy="true">
      <span className="sr-only" role="status">
        {t('coll.loading')}
      </span>
      <div className="coll__main">
        <div className="coll__head">
          <h1 className="h1">{t('coll.title')}</h1>
        </div>
        <div className="coll__filters">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skel coll-skel__chip" />
          ))}
        </div>
        <div className="coll__grid">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="skel skel--card" />
          ))}
        </div>
      </div>
      <div className="panel coll__detail">
        <div className="skel skel--line" style={{ width: '60%' }} />
        <div className="skel skel--line" />
        <div className="skel skel--line" />
      </div>
    </div>
  );
}

function subscribeSheet(onChange: () => void) {
  const mq = window.matchMedia(SHEET_QUERY);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

/** Đang ở chế độ bảng trượt (điện thoại) hay khung cạnh lưới (desktop). */
function useSheetMode() {
  return useSyncExternalStore(
    subscribeSheet,
    () => window.matchMedia(SHEET_QUERY).matches,
    () => false,
  );
}

const safeStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

/** Kho thẻ (docs/design/screens/collection*.html): lưới thẻ + bộ lọc trên URL, panel chi tiết, bán. */
export function CollectionPage() {
  const { locale, t } = useI18n();
  const [params, setParams] = useSearchParams();
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current) return;
    restored.current = true;
    if (params.toString()) return;
    const saved = loadSavedFilter(safeStorage());
    if (!saved) return;
    const next = writeFilter({ ...readFilter(params), ...saved });
    if (next.toString()) setParams(next, { replace: true });
  }, [params, setParams]);

  const filter = readFilter(params);
  const me = useMe().data;
  const list = usePlayerCards({
    position: filter.position,
    rarity: filter.rarity,
    sort: filter.sort,
  });
  const catalog = useCardCatalog();
  const economy = useEconomy();
  const seller = useSellCards();
  // Bấm đôi "Bán": lần 2 gửi lại thẻ đã bán → not_found (B4-09).
  const selling = useRef(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Item[] | null>(null);
  // Bọc object để bán 2 lần cùng nội dung vẫn là state mới → hẹn giờ tắt chạy lại từ đầu.
  const [notice, setNotice] = useState<{ text: string } | null>(null);
  // Thông báo nổi ở góc nên tự tắt sau vài giây.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);
  const [showMoreFilters, setShowMoreFilters] = useState(false);

  const items = useMemo<Item[]>(
    () =>
      list.data && catalog.data
        ? list.data.flatMap((pc) => {
            const card = catalog.data.get(pc.cardId);
            return card && matchesQuery(card, filter.q) && (!filter.squad || pc.inSquad)
              ? [{ pc, card }]
              : [];
          })
        : [],
    [list.data, catalog.data, filter.q, filter.squad],
  );

  const detailRef = useRef<HTMLElement>(null);
  const sheetOpen = useSheetMode() && items.some((it) => it.pc.id === detailId);
  // Bảng trượt (≤720px): focus vào bảng + khoá cuộn nền; đóng thì gỡ khoá và trả focus về thẻ.
  useEffect(() => {
    if (sheetOpen && detailRef.current) return enterSheet(document, detailRef.current);
  }, [sheetOpen]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (confirming) return;
      const target = e.target as HTMLElement | null;
      const inField =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (e.key === '/' && !inField && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
        return;
      }
      if (e.key === 'Escape') {
        if (detailId) {
          setDetailId(null);
        } else if (selecting) {
          setSelecting(false);
          setSelected(new Set());
        }
        return;
      }
      if (!inField && detailId && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        const idx = items.findIndex((it) => it.pc.id === detailId);
        if (idx < 0) return;
        const nextIdx = e.key === 'ArrowRight' ? idx + 1 : idx - 1;
        const next = items[nextIdx];
        if (next) {
          e.preventDefault();
          setDetailId(next.pc.id);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [confirming, detailId, selecting, items]);

  if (list.isPending || catalog.isPending || economy.isPending) return <CollectionSkeleton />;
  if (list.isLoadingError || catalog.isLoadingError || economy.isLoadingError) {
    return (
      <div className="panel empty" role="alert">
        <h1 className="empty__title">{t('coll.loadErrorTitle')}</h1>
        <p className="empty__body">{t('coll.loadErrorBody')}</p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            void list.refetch();
            void catalog.refetch();
            void economy.refetch();
          }}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const prices = economy.data.cardSalePrice;
  const maxLevel = economy.data.upgrade.maxLevel;
  const chosen = items.filter((it) => selected.has(it.pc.id));
  const detail = items.find((it) => it.pc.id === detailId) ?? null;
  const filtered = !!(filter.position || filter.rarity || filter.q || filter.squad);

  const update = (patch: Partial<CollectionFilter>) => {
    const next = { ...filter, ...patch };
    saveFilter(safeStorage(), next);
    setParams(writeFilter(next), { replace: true });
    setSelected(new Set());
  };
  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  const stopSelecting = () => {
    setSelecting(false);
    setSelected(new Set());
  };

  async function sell(batch: Item[]) {
    if (selling.current) return;
    selling.current = true;
    const ids = batch.map((it) => it.pc.id);
    const gained = await seller.mutateAsync(ids).catch(() => null);
    selling.current = false;
    setConfirming(null);
    if (!gained) return;
    setNotice({
      text: t('coll.soldToast', {
        count: ids.length,
        coins: formatNumber(gained.coinsGained, locale),
      }),
    });
    setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
    if (detailId && ids.includes(detailId)) setDetailId(null);
  }

  const ask = (batch: Item[]) => {
    seller.reset();
    setNotice(null);
    setConfirming(batch);
  };

  const inSquadReason = t('coll.inSquadReason');

  const emptyState = filtered ? (
    <div className="empty coll__empty">
      <h2 className="empty__title">{t('coll.noMatchTitle')}</h2>
      <p className="empty__body">{t('coll.noMatchBody')}</p>
      <div className="coll__empty-actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => update({ position: undefined, rarity: undefined, q: '', squad: false })}
        >
          {t('coll.clearFilters')}
        </button>
        <Link to="/shop" className="btn btn--ghost">
          {t('coll.toShop')}
        </Link>
      </div>
    </div>
  ) : (
    <div className="empty coll__empty">
      <h2 className="empty__title">{t('coll.emptyTitle')}</h2>
      <p className="empty__body">
        {me && me.freePack5Credits > 0 ? t('coll.emptyBodyFree') : t('coll.emptyBodyPaid')}
      </p>
      <Link to="/shop" className="btn btn--primary">
        {me && me.freePack5Credits > 0 ? t('coll.openFreePack') : t('coll.toShop')}
      </Link>
    </div>
  );

  return (
    <div className={`coll${detail ? ' has-detail' : ''}`}>
      <div className="coll__main">
        <div className="coll__head">
          <h1 className="h1">{t('coll.title')}</h1>
          <span className="display num muted coll__count">{list.data.length}</span>
          <span className="coll__spacer" />
          <label className="search coll__search">
            <span className="sr-only">{t('coll.searchSr')}</span>
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              className="input"
              placeholder={t('coll.searchPlaceholder')}
              value={filter.q}
              onChange={(e) => update({ q: e.target.value })}
            />
          </label>
          <label className="muted coll__sort">
            {t('coll.sortLabel')}
            <select
              className="input"
              value={filter.sort}
              onChange={(e) => update({ sort: e.target.value as PlayerCardSort })}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {t(s.key)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="coll__filters">
          <ChipGroup
            label={t('coll.filterPosition')}
            options={Position.options.map((p) => ({
              value: p,
              label: <>{p}</>,
              title: positionName(p, locale),
            }))}
            value={filter.position}
            onChange={(position) => update({ position })}
          />
          {showMoreFilters || filter.rarity || filter.squad ? (
            <>
              <ChipGroup
                label={t('coll.filterRarity')}
                all={false}
                options={Rarity.options.map((r) => {
                  const rLabel = rarityLabel(r, locale);
                  return {
                    value: r,
                    label: (
                      <>
                        <span className={`r-${r} coll__pips`} aria-hidden="true">
                          {'◆'.repeat(rarityPips(r))}
                        </span>
                        {rLabel}
                      </>
                    ),
                    title: rLabel,
                  };
                })}
                value={filter.rarity}
                onChange={(rarity) => update({ rarity })}
              />
              <button
                type="button"
                className="chip"
                aria-pressed={filter.squad}
                onClick={() => update({ squad: !filter.squad })}
              >
                <span className="coll__dot" aria-hidden="true">
                  ●
                </span>
                {t('coll.filterInSquad')}
              </button>
              {!filter.rarity && !filter.squad && (
                <button
                  type="button"
                  className="chip chip--more"
                  aria-expanded="true"
                  onClick={() => setShowMoreFilters(false)}
                >
                  {t('coll.hideFilters')}
                </button>
              )}
            </>
          ) : (
            <button
              type="button"
              className="chip chip--more"
              aria-expanded="false"
              onClick={() => setShowMoreFilters(true)}
            >
              {t('coll.moreFilters')}
            </button>
          )}
          <button
            type="button"
            className={`btn btn--sm btn--secondary coll__sell${selecting ? ' is-on' : ''}`}
            aria-pressed={selecting}
            onClick={() => {
              if (selecting) return stopSelecting();
              // Đóng chi tiết để thanh bán ở đáy không đè lên bảng chi tiết (điện thoại)
              setDetailId(null);
              setSelecting(true);
            }}
          >
            {selecting ? t('common.done') : t('coll.selectToSell')}
          </button>
        </div>

        {notice && (
          <p className="toast toast--success coll__toast" role="status">
            <span className="toast__icon" aria-hidden="true">
              ✓
            </span>
            <span>{notice.text}</span>
          </p>
        )}
        {seller.error && !confirming && (
          <p className="banner banner--danger" role="alert">
            {sellErrorMessage(seller.error, locale)}
          </p>
        )}

        {items.length === 0 ? (
          emptyState
        ) : (
          <ul className="coll__grid">
            {items.map(({ pc, card }) => {
              const isSel = selecting ? selected.has(pc.id) : pc.id === detailId;
              const locked = selecting && pc.inSquad;
              return (
                <li key={pc.id}>
                  <button
                    type="button"
                    className="coll-item"
                    aria-pressed={isSel}
                    disabled={locked}
                    title={locked ? inSquadReason : undefined}
                    onClick={() => (selecting ? toggle(pc.id) : setDetailId(pc.id))}
                  >
                    <CardView
                      card={card}
                      size="md"
                      level={pc.level}
                      stats={pc.effectiveStats}
                      inSquad={pc.inSquad}
                      selected={isSel}
                      dim={locked}
                      tilt={!locked}
                    />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="muted coll__legend">
          <span>
            <span className="coll__dot" aria-hidden="true">
              ●
            </span>{' '}
            {t('coll.legendInSquad')}
          </span>
          <span>{t('coll.legendLevel')}</span>
          {selecting && <span>{t('coll.legendSelect')}</span>}
        </div>
      </div>

      <aside
        ref={detailRef}
        tabIndex={-1}
        className="panel coll__detail"
        aria-label={t('coll.detailAria')}
      >
        {detail ? (
          <CardDetail
            item={detail}
            maxLevel={maxLevel}
            price={prices[detail.card.rarity]}
            selling={seller.isPending}
            onSell={() => ask([detail])}
            onClose={() => setDetailId(null)}
          />
        ) : (
          <p className="muted coll__hint">{t('coll.detailHint')}</p>
        )}
      </aside>

      {selecting && chosen.length > 0 && (
        <div className="coll__bar" role="region" aria-label={t('coll.sellBarAria')}>
          <span>
            {t('coll.selectedCountBefore')} <b className="num">{chosen.length}</b>{' '}
            {t('coll.selectedCountMid')}{' '}
            <Coin
              n={saleTotal(
                chosen.map((c) => c.pc),
                catalog.data,
                prices,
              )}
            />
          </span>
          <button type="button" className="btn btn--ghost" onClick={() => setSelected(new Set())}>
            {t('coll.deselectAll')}
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={seller.isPending || chosen.length > SELL_MAX}
            onClick={() => ask(chosen)}
          >
            {t('coll.sellSelectedBtn', { count: chosen.length })}
          </button>
          {chosen.length > SELL_MAX && (
            <span className="field__error">{t('coll.sellMaxWarn', { max: SELL_MAX })}</span>
          )}
        </div>
      )}

      {confirming && (
        <SellDialog
          batch={confirming}
          total={saleTotal(
            confirming.map((c) => c.pc),
            catalog.data,
            prices,
          )}
          valuable={isValuableSale(
            confirming.map((c) => c.pc),
            catalog.data,
          )}
          pending={seller.isPending}
          onConfirm={() => void sell(confirming)}
          onCancel={() => setConfirming(null)}
        />
      )}
    </div>
  );
}

interface CardDetailProps {
  item: Item;
  maxLevel: number;
  price: number;
  selling: boolean;
  onSell: () => void;
  onClose: () => void;
}

function CardDetail({ item, maxLevel, price, selling, onSell, onClose }: CardDetailProps) {
  const { locale, t } = useI18n();
  const { pc, card } = item;
  const stats = pc.effectiveStats;
  const posTitle = positionName(card.position, locale);
  const rLabel = rarityLabel(card.rarity, locale);
  return (
    <>
      <button
        type="button"
        className="btn btn--ghost btn--sm coll__close"
        aria-label={t('coll.closeDetailAria')}
        onClick={onClose}
      >
        ✕
      </button>
      <div className="coll__who">
        <CardView card={card} size="lg" level={pc.level} stats={stats} tilt />
        <div className="coll__who-info">
          <span className="label">{posTitle}</span>
          <h2 className="h2 coll__name">{card.name}</h2>
          <span className="muted coll__nick">“{card.nickname}”</span>
          <div className="coll__badges">
            <span className={`rarity r-${card.rarity}`}>
              <span className="rarity__pips" aria-hidden="true">
                {'◆'.repeat(rarityPips(card.rarity))}
              </span>
              {rLabel}
            </span>
            <span className={`pos pos--${card.position}`} title={posTitle}>
              {card.position}
            </span>
          </div>
          {pc.inSquad && <span className="tag tag--info">{t('coll.inSquadTag')}</span>}
        </div>
      </div>

      <table className="table coll__stats">
        <tbody>
          {localizedStatsFor(card.position, locale).map((s) => (
            <tr key={s.key}>
              <td>
                <b className="display">{s.abbr}</b>
              </td>
              <td className="muted">{s.name}</td>
              <td className="coll__stat-bar">
                <div
                  className={`bar bar--thin${stats[s.key] >= 80 ? '' : ' bar--info'}`}
                  style={{ '--v': `${Math.min(100, stats[s.key])}%` } as CSSProperties}
                  aria-hidden="true"
                >
                  <div className="bar__fill" />
                </div>
              </td>
              <td className="r display coll__stat-n">{stats[s.key]}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="coll__level">
        <span className="label">{t('coll.levelLabel')}</span>
        <div
          className="bar bar--segmented"
          role="img"
          aria-label={t('coll.levelAria', { level: pc.level, max: maxLevel })}
        >
          {Array.from({ length: maxLevel }, (_, i) => (
            <i key={i} className={i < pc.level ? 'on' : undefined} />
          ))}
        </div>
        <span className="display num coll__level-n">+{pc.level}</span>
      </div>

      <div className="coll__actions">
        <div className="coll__actions-row">
          {pc.level >= maxLevel ? (
            <button type="button" className="btn btn--primary" disabled>
              {t('coll.maxedBtn', { max: maxLevel })}
            </button>
          ) : (
            <Link to={`/upgrade?card=${pc.id}`} className="btn btn--primary">
              {t('coll.upgradeBtn')}
            </Link>
          )}
          <button
            type="button"
            className="btn btn--danger"
            disabled={pc.inSquad || selling}
            onClick={onSell}
          >
            {t('coll.sellBtn', { price: formatNumber(price, locale) })}
          </button>
        </div>
        {pc.inSquad && <span className="muted coll__reason">{t('coll.inSquadReason')}</span>}
      </div>
    </>
  );
}

interface ChipGroupProps<T extends string> {
  label: string;
  options: { value: T; label: ReactNode; title: string }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
  /** Có chip "Tất cả" ở đầu. */
  all?: boolean;
}

function ChipGroup<T extends string>({
  label,
  options,
  value,
  onChange,
  all = true,
}: ChipGroupProps<T>) {
  const { t } = useI18n();
  return (
    <div className="chips" role="group" aria-label={label}>
      <span className="label">{label}</span>
      {all && (
        <button
          type="button"
          className="chip"
          aria-pressed={value === undefined}
          onClick={() => onChange(undefined)}
        >
          {t('coll.filterAll')}
        </button>
      )}
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          className="chip"
          title={o.title}
          aria-pressed={value === o.value}
          onClick={() => onChange(value === o.value ? undefined : o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

interface SellDialogProps {
  batch: Item[];
  total: number;
  /** Có Vàng+/thẻ đã + → phải bấm giữ 1 giây. */
  valuable: boolean;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function SellDialog({ batch, total, valuable, pending, onConfirm, onCancel }: SellDialogProps) {
  const { locale, t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const one = batch.length === 1 ? batch[0] : undefined;
  const rare = batch.filter((it) => it.card.rarity === 'gold' || it.card.rarity === 'legend');
  const leveled = batch.filter((it) => it.pc.level > 0);
  return (
    <dialog
      ref={ref}
      className="dialog sell-dialog"
      aria-labelledby="sell-title"
      onClose={onCancel}
      onCancel={(e) => {
        if (pending) e.preventDefault();
      }}
    >
      <h2 id="sell-title" className="dialog__title">
        {one
          ? t('coll.sellOneTitle', { name: one.card.name })
          : t('coll.sellManyTitle', { count: batch.length })}
      </h2>
      {one ? (
        <div className="sell-dialog__one">
          <CardView card={one.card} size="xs" level={one.pc.level} stats={one.pc.effectiveStats} />
          <p className="dialog__body">
            {t('coll.sellOneBefore')}{' '}
            <b>
              {rarityLabel(one.card.rarity, locale)} · {one.card.position} {one.card.ovr}
              {one.pc.level > 0 && t('coll.sellOneLevel', { level: one.pc.level })}
            </b>{' '}
            {t('coll.sellOneMid')} <Coin n={total} />.
            {one.pc.level > 0 && t('coll.sellOneLevelNote')} <b>{t('coll.sellIrreversible')}</b>
          </p>
        </div>
      ) : (
        <div className="dialog__body">
          <p>
            {t('coll.sellManyBefore')} <Coin n={total} />. <b>{t('coll.sellManyIrreversible')}</b>
          </p>
          {(rare.length > 0 || leveled.length > 0) && (
            <ul className="sell-dialog__warn">
              {rare.length > 0 && <li>{t('coll.sellWarnRare', { count: rare.length })}</li>}
              {leveled.length > 0 && (
                <li>{t('coll.sellWarnLeveled', { count: leveled.length })}</li>
              )}
            </ul>
          )}
        </div>
      )}
      <div className="dialog__actions">
        <button
          type="button"
          className="btn btn--secondary"
          autoFocus
          disabled={pending}
          onClick={onCancel}
        >
          {t('common.cancel')}
        </button>
        {valuable ? (
          <HoldButton onHold={onConfirm} disabled={pending}>
            {pending && <span className="spinner" aria-hidden="true" />}
            {t('coll.holdToSell')}
          </HoldButton>
        ) : (
          <button
            type="button"
            className={`btn btn--danger${pending ? ' is-loading' : ''}`}
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
          >
            <span className="btn__label">{t('coll.sellConfirm')}</span>
          </button>
        )}
      </div>
    </dialog>
  );
}
