import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Position, Rarity, type Card, type PlayerCard, type PlayerCardSort } from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { ApiClientError } from '../../api/client';
import { useEconomy, usePlayerCards, useSellCards } from '../../api/player-cards';
import { CardView } from '../../components/card/CardView';
import { POSITION_NAME, RARITY_INFO, statsFor } from '../../components/card/rarity';
import { HoldButton } from '../../components/HoldButton';
import {
  isValuableSale,
  matchesQuery,
  readFilter,
  saleTotal,
  writeFilter,
  type CollectionFilter,
} from './collection';
import './collection.css';

const fmt = (n: number) => n.toLocaleString('vi-VN');

const SORTS: { value: PlayerCardSort; label: string }[] = [
  { value: '-ovr', label: 'OVR cao → thấp' },
  { value: 'ovr', label: 'OVR thấp → cao' },
  { value: '-acquired', label: 'Mới nhận trước' },
  { value: 'acquired', label: 'Cũ nhất trước' },
];

const IN_SQUAD_REASON = 'Thẻ đang trong đội hình — gỡ khỏi đội để bán hoặc làm nguyên liệu.';
/** Tối đa số thẻ một lần bán (server giới hạn 50). */
const SELL_MAX = 50;

export function sellErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'card_in_squad') return 'Có thẻ đang trong đội hình — gỡ khỏi đội rồi bán.';
    if (err.code === 'not_found')
      return 'Một số thẻ không còn trong kho. Danh sách đã được làm mới.';
    if (err.code === 'network_error') return 'Mất kết nối — hãy thử lại.';
    return err.message;
  }
  return 'Có lỗi xảy ra, hãy thử lại.';
}

interface Item {
  pc: PlayerCard;
  card: Card;
}

function Coin({ n }: { n: number }) {
  return (
    <span className="coin coin--sm">
      <span className="coin__icon" aria-hidden="true" />
      <span>{fmt(n)}</span>
      <span className="sr-only"> xu</span>
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
  return (
    <div className="coll" aria-busy="true">
      <span className="sr-only" role="status">
        Đang tải kho thẻ…
      </span>
      <div className="coll__main">
        <div className="coll__head">
          <h1 className="h1">Kho thẻ</h1>
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

/** Kho thẻ (docs/design/screens/collection*.html): lưới thẻ + bộ lọc trên URL, panel chi tiết, bán. */
export function CollectionPage() {
  const [params, setParams] = useSearchParams();
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
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Item[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (list.isPending || catalog.isPending || economy.isPending) return <CollectionSkeleton />;
  if (list.isError || catalog.isError || economy.isError) {
    return (
      <div className="panel empty" role="alert">
        <h1 className="empty__title">Không tải được kho thẻ</h1>
        <p className="empty__body">Kiểm tra kết nối rồi thử lại.</p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            void list.refetch();
            void catalog.refetch();
            void economy.refetch();
          }}
        >
          Thử lại
        </button>
      </div>
    );
  }

  const prices = economy.data.cardSalePrice;
  const maxLevel = economy.data.upgrade.maxLevel;
  const items: Item[] = list.data.flatMap((pc) => {
    const card = catalog.data.get(pc.cardId);
    return card && matchesQuery(card, filter.q) && (!filter.squad || pc.inSquad)
      ? [{ pc, card }]
      : [];
  });
  const chosen = items.filter((it) => selected.has(it.pc.id));
  const detail = items.find((it) => it.pc.id === detailId) ?? null;
  const filtered = !!(filter.position || filter.rarity || filter.q || filter.squad);

  const update = (patch: Partial<CollectionFilter>) => {
    setParams(writeFilter({ ...filter, ...patch }), { replace: true });
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
    const ids = batch.map((it) => it.pc.id);
    const gained = await seller.mutateAsync(ids).catch(() => null);
    setConfirming(null);
    if (!gained) return;
    setNotice(`Đã bán ${ids.length} thẻ, nhận ${fmt(gained.coinsGained)} xu.`);
    setSelected((s) => new Set([...s].filter((id) => !ids.includes(id))));
    if (detailId && ids.includes(detailId)) setDetailId(null);
  }

  const ask = (batch: Item[]) => {
    seller.reset();
    setNotice(null);
    setConfirming(batch);
  };

  const emptyState = filtered ? (
    <div className="empty coll__empty">
      <h2 className="empty__title">Không có thẻ khớp bộ lọc</h2>
      <p className="empty__body">Thử bỏ bớt điều kiện lọc, hoặc mở thêm gói để có thẻ mới.</p>
      <div className="coll__empty-actions">
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => update({ position: undefined, rarity: undefined, q: '', squad: false })}
        >
          Xoá lọc
        </button>
        <Link to="/shop" className="btn btn--ghost">
          Tới cửa hàng
        </Link>
      </div>
    </div>
  ) : (
    <div className="empty coll__empty">
      <h2 className="empty__title">Kho còn trống</h2>
      <p className="empty__body">
        {me && me.freePack5Credits > 0
          ? 'Mở gói 5 thẻ miễn phí để có thẻ đầu tiên, rồi xếp đội và ra sân.'
          : 'Mở gói ở cửa hàng để có thẻ, rồi xếp đội và ra sân.'}
      </p>
      <Link to="/shop" className="btn btn--primary">
        {me && me.freePack5Credits > 0 ? 'Mở gói miễn phí' : 'Tới cửa hàng'}
      </Link>
    </div>
  );

  return (
    <div className={`coll${detail ? ' has-detail' : ''}`}>
      <div className="coll__main">
        <div className="coll__head">
          <h1 className="h1">Kho thẻ</h1>
          <span className="display num muted coll__count">{list.data.length}</span>
          <span className="coll__spacer" />
          <label className="search coll__search">
            <span className="sr-only">Tìm tên cầu thủ</span>
            <SearchIcon />
            <input
              type="search"
              className="input"
              placeholder="Tìm tên cầu thủ…"
              value={filter.q}
              onChange={(e) => update({ q: e.target.value })}
            />
          </label>
          <label className="muted coll__sort">
            Sắp xếp
            <select
              className="input"
              value={filter.sort}
              onChange={(e) => update({ sort: e.target.value as PlayerCardSort })}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="coll__filters">
          <ChipGroup
            label="Vị trí"
            options={Position.options.map((p) => ({
              value: p,
              label: <>{p}</>,
              title: POSITION_NAME[p],
            }))}
            value={filter.position}
            onChange={(position) => update({ position })}
          />
          <ChipGroup
            label="Độ hiếm"
            all={false}
            options={Rarity.options.map((r) => ({
              value: r,
              label: (
                <>
                  <span className={`r-${r} coll__pips`} aria-hidden="true">
                    {'◆'.repeat(RARITY_INFO[r].pips)}
                  </span>
                  {RARITY_INFO[r].label}
                </>
              ),
              title: RARITY_INFO[r].label,
            }))}
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
            Trong đội hình
          </button>
          <span className="coll__spacer" />
          <button
            type="button"
            className={`btn btn--sm ${selecting ? 'btn--secondary' : 'btn--ghost'}`}
            aria-pressed={selecting}
            onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          >
            {selecting ? 'Xong' : 'Chọn để bán'}
          </button>
        </div>

        {notice && (
          <p className="toast toast--success coll__toast" role="status">
            <span className="toast__icon" aria-hidden="true">
              ✓
            </span>
            <span>{notice}</span>
          </p>
        )}
        {seller.error && !confirming && (
          <p className="banner banner--danger" role="alert">
            {sellErrorMessage(seller.error)}
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
                    title={locked ? IN_SQUAD_REASON : undefined}
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
            đang trong đội hình
          </span>
          <span>+N cấp ép</span>
          {selecting && <span>Bấm thẻ để chọn bán · thẻ trong đội hình không bán được</span>}
        </div>
      </div>

      <aside className="panel coll__detail" aria-label="Chi tiết thẻ">
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
          <p className="muted coll__hint">Chọn một thẻ để xem chỉ số, ép hoặc bán.</p>
        )}
      </aside>

      {selecting && chosen.length > 0 && (
        <div className="coll__bar" role="region" aria-label="Bán thẻ đã chọn">
          <span>
            Đã chọn <b className="num">{chosen.length}</b> thẻ · nhận{' '}
            <Coin
              n={saleTotal(
                chosen.map((c) => c.pc),
                catalog.data,
                prices,
              )}
            />
          </span>
          <button type="button" className="btn btn--ghost" onClick={() => setSelected(new Set())}>
            Bỏ chọn
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={seller.isPending || chosen.length > SELL_MAX}
            onClick={() => ask(chosen)}
          >
            Bán {chosen.length} thẻ
          </button>
          {chosen.length > SELL_MAX && (
            <span className="field__error">Tối đa {SELL_MAX} thẻ mỗi lần</span>
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
  const { pc, card } = item;
  const stats = pc.effectiveStats;
  return (
    <>
      <button
        type="button"
        className="btn btn--ghost btn--sm coll__close"
        aria-label="Đóng chi tiết"
        onClick={onClose}
      >
        ✕
      </button>
      <div className="coll__who">
        <CardView card={card} size="lg" level={pc.level} stats={stats} />
        <div className="coll__who-info">
          <span className="label">{POSITION_NAME[card.position]}</span>
          <h2 className="h2 coll__name">{card.name}</h2>
          <span className="muted coll__nick">“{card.nickname}”</span>
          <div className="coll__badges">
            <span className={`rarity r-${card.rarity}`}>
              <span className="rarity__pips" aria-hidden="true">
                {'◆'.repeat(RARITY_INFO[card.rarity].pips)}
              </span>
              {RARITY_INFO[card.rarity].label}
            </span>
            <span className={`pos pos--${card.position}`} title={POSITION_NAME[card.position]}>
              {card.position}
            </span>
          </div>
          {pc.inSquad && <span className="tag tag--info">● Đang trong đội hình</span>}
        </div>
      </div>

      <table className="table coll__stats">
        <tbody>
          {statsFor(card.position).map((s) => (
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
        <span className="label">Cấp ép</span>
        <div
          className="bar bar--segmented"
          role="img"
          aria-label={`Cấp ép ${pc.level}/${maxLevel}`}
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
              Đã +{maxLevel}
            </button>
          ) : (
            <Link to={`/upgrade?card=${pc.id}`} className="btn btn--primary">
              Ép thẻ
            </Link>
          )}
          <button
            type="button"
            className="btn btn--danger"
            disabled={pc.inSquad || selling}
            onClick={onSell}
          >
            Bán · {fmt(price)} xu
          </button>
        </div>
        {pc.inSquad && <span className="muted coll__reason">{IN_SQUAD_REASON}</span>}
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
          Tất cả
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
        {one ? `Bán ${one.card.name}?` : `Bán ${batch.length} thẻ?`}
      </h2>
      {one ? (
        <div className="sell-dialog__one">
          <CardView card={one.card} size="xs" level={one.pc.level} stats={one.pc.effectiveStats} />
          <p className="dialog__body">
            Thẻ{' '}
            <b>
              {RARITY_INFO[one.card.rarity].label} · {one.card.position} {one.card.ovr}
              {one.pc.level > 0 && ` · cấp +${one.pc.level}`}
            </b>{' '}
            sẽ bị xoá khỏi kho. Bạn nhận <Coin n={total} />.
            {one.pc.level > 0 && ' Giá bán không tính cấp ép.'} <b>Không hoàn tác được.</b>
          </p>
        </div>
      ) : (
        <div className="dialog__body">
          <p>
            Bạn nhận <Coin n={total} />. <b>Thẻ đã bán không lấy lại được.</b>
          </p>
          {(rare.length > 0 || leveled.length > 0) && (
            <ul className="sell-dialog__warn">
              {rare.length > 0 && <li>Có {rare.length} thẻ Vàng/Huyền thoại.</li>}
              {leveled.length > 0 && (
                <li>Có {leveled.length} thẻ đã ép +; cấp + không tăng giá bán.</li>
              )}
            </ul>
          )}
        </div>
      )}
      <div className="dialog__actions">
        <button type="button" className="btn btn--secondary" disabled={pending} onClick={onCancel}>
          Huỷ
        </button>
        {valuable ? (
          <HoldButton onHold={onConfirm} disabled={pending}>
            {pending && <span className="spinner" aria-hidden="true" />}
            Giữ 1 giây để bán
          </HoldButton>
        ) : (
          <button
            type="button"
            className={`btn btn--danger${pending ? ' is-loading' : ''}`}
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
          >
            <span className="btn__label">Bán</span>
          </button>
        )}
      </div>
    </dialog>
  );
}
