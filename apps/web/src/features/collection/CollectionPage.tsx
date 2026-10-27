import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Position, Rarity, type Card, type PlayerCard, type PlayerCardSort } from '@pitch/shared';
import { useCardCatalog } from '../../api/cards';
import { ApiClientError } from '../../api/client';
import { useEconomy, usePlayerCards, useSellCards } from '../../api/player-cards';
import { CardView } from '../../components/card/CardView';
import { POSITION_NAME, RARITY_INFO } from '../../components/card/rarity';
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

const IN_SQUAD_REASON = 'Thẻ đang trong đội hình';

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

/** Kho thẻ (DESIGN.md §6.4): lưới thẻ + bộ lọc trên URL, panel chi tiết, chọn nhiều để bán. */
export function CollectionPage() {
  const [params, setParams] = useSearchParams();
  const filter = readFilter(params);
  const list = usePlayerCards({
    position: filter.position,
    rarity: filter.rarity,
    sort: filter.sort,
  });
  const catalog = useCardCatalog();
  const economy = useEconomy();
  const seller = useSellCards();
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [detailId, setDetailId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<Item[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (list.isPending || catalog.isPending || economy.isPending) {
    return <p className="screen-msg">Đang tải kho thẻ…</p>;
  }
  if (list.isError || catalog.isError || economy.isError) {
    return (
      <div className="screen-msg" role="alert">
        <p>Không tải được kho thẻ.</p>
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
  const items: Item[] = list.data.flatMap((pc) => {
    const card = catalog.data.get(pc.cardId);
    return card && matchesQuery(card, filter.q) ? [{ pc, card }] : [];
  });
  const chosen = items.filter((it) => selected.has(it.pc.id));
  const detail = items.find((it) => it.pc.id === detailId) ?? null;
  const filtered = !!(filter.position || filter.rarity || filter.q);

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

  return (
    <div className="coll">
      <header className="coll__head">
        <h1 className="panel__title coll__title">
          Kho thẻ <span className="muted">{list.data.length}</span>
        </h1>
        <input
          type="search"
          className="field__input coll__search"
          placeholder="Tìm tên…"
          aria-label="Tìm theo tên hoặc biệt danh"
          value={filter.q}
          onChange={(e) => update({ q: e.target.value })}
        />
        <label className="coll__sort">
          <span className="muted">Sắp xếp</span>
          <select
            className="field__input"
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
      </header>

      <div className="coll__filters">
        <ChipGroup
          label="Vị trí"
          options={Position.options.map((p) => ({ value: p, label: p, title: POSITION_NAME[p] }))}
          value={filter.position}
          onChange={(position) => update({ position })}
        />
        <ChipGroup
          label="Độ hiếm"
          options={Rarity.options.map((r) => ({
            value: r,
            label: RARITY_INFO[r].label,
            title: RARITY_INFO[r].label,
          }))}
          value={filter.rarity}
          onChange={(rarity) => update({ rarity })}
        />
      </div>

      {notice && (
        <p className="coll__notice" role="status">
          {notice}
        </p>
      )}
      {seller.error && !confirming && (
        <p className="form-error" role="alert">
          {sellErrorMessage(seller.error)}
        </p>
      )}

      <div className="coll__body">
        {items.length === 0 ? (
          <div className="panel coll__empty">
            {filtered ? (
              <>
                <p>Không có thẻ khớp bộ lọc.</p>
                <button
                  type="button"
                  className="btn btn--secondary"
                  onClick={() => update({ position: undefined, rarity: undefined, q: '' })}
                >
                  Xoá lọc
                </button>
              </>
            ) : (
              <>
                <p>Kho đang trống.</p>
                <Link to="/shop" className="btn btn--primary">
                  Tới cửa hàng
                </Link>
              </>
            )}
          </div>
        ) : (
          <ul className="coll__grid">
            {items.map(({ pc, card }) => (
              <li
                key={pc.id}
                className={`coll-item${pc.id === detailId ? ' is-active' : ''}${selected.has(pc.id) ? ' is-selected' : ''}`}
              >
                <button
                  type="button"
                  className="coll-item__card"
                  aria-pressed={pc.id === detailId}
                  onClick={() => setDetailId(pc.id)}
                >
                  <CardView card={card} size="md" level={pc.level} stats={pc.effectiveStats} />
                </button>
                <div className="coll-item__foot">
                  {pc.inSquad ? (
                    <span className="coll-item__squad" title={IN_SQUAD_REASON}>
                      ● Trong đội
                    </span>
                  ) : (
                    <label className="coll-item__pick">
                      <input
                        type="checkbox"
                        checked={selected.has(pc.id)}
                        onChange={() => toggle(pc.id)}
                      />
                      Chọn bán
                    </label>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        <aside className="panel coll__detail" aria-label="Chi tiết thẻ">
          {detail ? (
            <>
              <CardView
                card={detail.card}
                size="lg"
                level={detail.pc.level}
                stats={detail.pc.effectiveStats}
              />
              <dl className="coll__facts">
                <dt>Cấp ép</dt>
                <dd>+{detail.pc.level}</dd>
                <dt>May mắn</dt>
                <dd>{detail.pc.luck}%</dd>
                <dt>Giá bán</dt>
                <dd>
                  {fmt(prices[detail.card.rarity])} <span className="coin__icon" aria-hidden />
                  <span className="sr-only"> xu</span>
                </dd>
              </dl>
              {detail.pc.inSquad && <p className="coll__reason">● {IN_SQUAD_REASON}</p>}
              <button
                type="button"
                className="btn btn--danger"
                disabled={detail.pc.inSquad || seller.isPending}
                title={detail.pc.inSquad ? IN_SQUAD_REASON : undefined}
                onClick={() => ask([detail])}
              >
                Bán {fmt(prices[detail.card.rarity])}
                <span className="coin__icon" aria-hidden />
              </button>
            </>
          ) : (
            <p className="muted">Chọn một thẻ để xem chi tiết.</p>
          )}
        </aside>
      </div>

      {chosen.length > 0 && (
        <div className="coll__bar" role="region" aria-label="Bán thẻ đã chọn">
          <span>
            Đã chọn <b>{chosen.length}</b> thẻ · nhận{' '}
            <b>
              {fmt(
                saleTotal(
                  chosen.map((c) => c.pc),
                  catalog.data,
                  prices,
                ),
              )}
            </b>{' '}
            <span className="coin__icon" aria-hidden />
          </span>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => setSelected(new Set())}
          >
            Bỏ chọn
          </button>
          <button
            type="button"
            className="btn btn--danger"
            disabled={seller.isPending || chosen.length > 50}
            onClick={() => ask(chosen)}
          >
            Bán {chosen.length} thẻ
          </button>
          {chosen.length > 50 && <span className="buy__short">Tối đa 50 thẻ mỗi lần</span>}
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

interface ChipGroupProps<T extends string> {
  label: string;
  options: { value: T; label: string; title: string }[];
  value: T | undefined;
  onChange: (v: T | undefined) => void;
}

function ChipGroup<T extends string>({ label, options, value, onChange }: ChipGroupProps<T>) {
  return (
    <div className="chips" role="group" aria-label={label}>
      <span className="muted">{label}:</span>
      <button
        type="button"
        className="chip"
        aria-pressed={value === undefined}
        onClick={() => onChange(undefined)}
      >
        Tất cả
      </button>
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
  const rare = batch.filter((it) => it.card.rarity === 'gold' || it.card.rarity === 'legend');
  const leveled = batch.filter((it) => it.pc.level > 0);
  return (
    <dialog
      ref={ref}
      className="panel sell-dialog"
      aria-labelledby="sell-title"
      onClose={onCancel}
      onCancel={(e) => {
        if (pending) e.preventDefault();
      }}
    >
      <h2 id="sell-title" className="panel__title">
        Bán {batch.length} thẻ?
      </h2>
      <p>
        Nhận <b>{fmt(total)}</b> <span className="coin__icon" aria-hidden />
        <span className="sr-only"> xu</span>. Thẻ đã bán không lấy lại được.
      </p>
      {(rare.length > 0 || leveled.length > 0) && (
        <ul className="sell-dialog__warn">
          {rare.length > 0 && <li>Có {rare.length} thẻ Vàng/Huyền thoại.</li>}
          {leveled.length > 0 && (
            <li>Có {leveled.length} thẻ đã ép +; cấp + không tăng giá bán.</li>
          )}
        </ul>
      )}
      <div className="sell-dialog__actions">
        <button type="button" className="btn btn--secondary" disabled={pending} onClick={onCancel}>
          Huỷ
        </button>
        {valuable ? (
          <HoldButton onHold={onConfirm} disabled={pending}>
            {pending && <span className="spinner" aria-hidden="true" />}
            Giữ để bán
          </HoldButton>
        ) : (
          <button
            type="button"
            className="btn btn--danger"
            disabled={pending}
            aria-busy={pending}
            onClick={onConfirm}
          >
            {pending && <span className="spinner" aria-hidden="true" />}
            Bán
          </button>
        )}
      </div>
    </dialog>
  );
}
