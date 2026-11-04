import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useBlocker, type Blocker } from 'react-router';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  BENCH_SLOTS,
  computeOvr,
  evaluateSquad,
  Formation,
  slotRole,
  STARTER_SLOTS,
  type Card,
  type PlayerCard,
  type PlayerStats,
  type Squad,
  type SquadMember,
  type SquadSlot,
} from '@pitch/shared';
import { MAX_SUBS } from '@pitch/sim';
import { useCardCatalog } from '../../api/cards';
import { ApiClientError } from '../../api/client';
import { usePlayerCards } from '../../api/player-cards';
import { useSaveSquad, useSquad } from '../../api/squad';
import { CardView } from '../../components/card/CardView';
import { ChalkPitch } from '../../components/ChalkPitch';
import { POSITION_NAME } from '../../components/card/rarity';
import {
  changeFormation,
  clearSlot,
  placeCard,
  sameSquad,
  slotLayout,
  slotOf,
  swapSlots,
  type SlotMap,
} from './squad';
import './squad.css';

interface Item {
  pc: PlayerCard;
  card: Card;
}

interface Draft {
  formation: Formation;
  slots: SlotMap;
}

const KHO = 'kho';
/** OVR hiệu lực của thẻ (đã tính cấp ép, chưa tính phạt vị trí). */
const ovrOf = (it: Item) => computeOvr(it.card.position, it.pc.effectiveStats);
const cardDragId = (pcId: string) => `card:${pcId}`;

export function saveErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'not_found') return 'Có thẻ không còn trong kho. Danh sách đã được làm mới.';
    if (err.code === 'invalid_squad') return 'Đội hình không hợp lệ: ' + err.message;
    if (err.code === 'network_error') return 'Mất kết nối — hãy thử lại.';
    return err.message;
  }
  return 'Có lỗi xảy ra, hãy thử lại.';
}

/** Xếp đội hình (DESIGN.md §6.5, PRD F6). */
export function SquadPage() {
  const squad = useSquad();
  const list = usePlayerCards({ sort: '-ovr' });
  const catalog = useCardCatalog();

  if (squad.isPending || list.isPending || catalog.isPending) {
    return (
      <div className="sq" aria-busy="true">
        <p className="sr-only">Đang tải đội hình…</p>
        <div className="skel sq-skel__head" />
        <div className="sq__body">
          <div className="skel sq-skel__pitch" />
          <div className="skel sq-skel__side" />
        </div>
      </div>
    );
  }
  if (squad.isError || list.isError || catalog.isError) {
    return (
      <div className="screen-msg" role="alert">
        <p>Không tải được đội hình.</p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            void squad.refetch();
            void list.refetch();
            void catalog.refetch();
          }}
        >
          Thử lại
        </button>
      </div>
    );
  }
  const items = new Map<string, Item>();
  for (const pc of list.data) {
    const card = catalog.data.get(pc.cardId);
    if (card) items.set(pc.id, { pc, card });
  }
  return <SquadEditor saved={squad.data} items={items} />;
}

/** Mô tả sơ đồ (PRD §5: 2-3-1 cân bằng, 3-2-1 phòng ngự, 2-2-2 tấn công). */
const FORMATION_HINT: Record<Formation, string> = {
  '2-3-1': 'Cân bằng',
  '3-2-1': 'Phòng ngự',
  '2-2-2': 'Tấn công',
};

type Filter = 'all' | 'role' | 'other';

interface Notice {
  tone: 'success' | 'warn';
  title: string;
  body?: string;
}

const WarnIcon = () => (
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

/** Số ô (kể cả sơ đồ) khác giữa bản nháp và bản đã lưu. */
function changeCount(a: Draft, b: Draft): number {
  let n = a.formation === b.formation ? 0 : 1;
  for (const s of [...STARTER_SLOTS, ...BENCH_SLOTS]) if (a.slots[s] !== b.slots[s]) n += 1;
  return n;
}

function SquadEditor({ saved, items }: { saved: Squad; items: ReadonlyMap<string, Item> }) {
  const [draft, setDraft] = useState<Draft>(() => ({
    formation: saved.formation,
    slots: { ...saved.slots },
  }));
  const [selected, setSelected] = useState<SquadSlot | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [filter, setFilter] = useState<Filter>('role');
  const saver = useSaveSquad();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dirty = !sameSquad(draft, saved);
  const blocker = useLeaveGuard(dirty);

  const members: Partial<Record<SquadSlot, SquadMember>> = {};
  for (const [slot, id] of Object.entries(draft.slots) as [SquadSlot, string | null][]) {
    const it = id ? items.get(id) : undefined;
    if (it) {
      members[slot] = {
        id: it.pc.id,
        position: it.card.position,
        stats: it.card.stats,
        level: it.pc.level,
      };
    }
  }
  const evaluation = evaluateSquad(draft.formation, members);
  const itemAt = (slot: SquadSlot) => {
    const id = draft.slots[slot];
    return id ? items.get(id) : undefined;
  };
  const selectedRole = selected ? slotRole(draft.formation, selected) : undefined;
  const pool = [...items.values()].filter((it) => !slotOf(draft.slots, it.pc.id));
  const shown = !selectedRole
    ? pool
    : filter === 'role'
      ? pool.filter((it) => it.card.position === selectedRole)
      : filter === 'other'
        ? pool.filter((it) => it.card.position !== selectedRole)
        : pool;
  const layout = slotLayout(draft.formation);
  const benchUsed = BENCH_SLOTS.filter((s) => draft.slots[s]).length;
  const selectedItem = selected ? itemAt(selected) : undefined;

  const update = (slots: SlotMap) => {
    setDraft((d) => ({ ...d, slots }));
    setNotice(null);
    saver.reset();
  };

  function pickFromPool(pcId: string) {
    const it = items.get(pcId);
    if (!it) return;
    let target = selected;
    if (!target) {
      // Không chọn ô: xếp vào ô trống đúng vị trí, hết thì xuống dự bị.
      target =
        STARTER_SLOTS.find(
          (s) => !draft.slots[s] && slotRole(draft.formation, s) === it.card.position,
        ) ??
        BENCH_SLOTS.find((s) => !draft.slots[s]) ??
        null;
      if (!target) {
        setNotice({
          tone: 'warn',
          title: 'Không còn ô trống đúng vị trí',
          body: 'Chọn một ô để thay người.',
        });
        return;
      }
    }
    update(placeCard(draft.slots, target, pcId));
    setSelected(null);
  }

  function clickSlot(slot: SquadSlot) {
    if (selected === slot) return setSelected(null);
    if (selected && (draft.slots[slot] || draft.slots[selected])) {
      update(swapSlots(draft.slots, selected, slot));
      return setSelected(null);
    }
    setSelected(slot);
    setFilter('role');
  }

  function pickFormation(f: Formation) {
    if (f === draft.formation) return;
    const r = changeFormation(draft.slots, f, (id) => items.get(id)?.card.position);
    setDraft({ formation: f, slots: r.slots });
    setSelected(null);
    saver.reset();
    const names = (ids: string[]) => ids.map((id) => items.get(id)?.card.name ?? '?').join(', ');
    const moved = r.toBench.length + r.toCollection.length;
    const parts = [
      r.toBench.length > 0 && `${names(r.toBench)} xuống dự bị`,
      r.toCollection.length > 0 && `${names(r.toCollection)} về kho`,
    ].filter(Boolean);
    setNotice(
      moved > 0
        ? {
            tone: 'warn',
            title: `${moved} thẻ không còn chỗ trong sơ đồ ${f}`,
            body: `${parts.join('; ')}.`,
          }
        : null,
    );
  }

  function onDragEnd(e: DragEndEvent) {
    setDragging(null);
    const pcId = String(e.active.id).replace(/^card:/, '');
    const over = e.over ? String(e.over.id) : null;
    if (!over) return;
    if (over === KHO) {
      const from = slotOf(draft.slots, pcId);
      if (from) update(clearSlot(draft.slots, from));
    } else {
      update(placeCard(draft.slots, over.replace(/^slot:/, '') as SquadSlot, pcId));
    }
    setSelected(null);
  }

  // Thẻ đã bán ở nơi khác (kho làm mới sau lỗi `not_found`) thì bỏ khỏi ô trước khi gửi.
  const save = (after?: () => void) =>
    saver.mutate(
      {
        formation: draft.formation,
        slots: Object.fromEntries(
          Object.entries(draft.slots).map(([s, id]) => [s, id && items.has(id) ? id : null]),
        ) as SlotMap,
      },
      {
        onSuccess: () => {
          setNotice({
            tone: 'success',
            title: 'Đã lưu đội hình',
            body: `OVR đội ${evaluation.teamRating} · ${draft.formation}`,
          });
          after?.();
        },
      },
    );

  const misplaced = new Set(
    evaluation.warnings.filter((w) => w.code === 'misposition').map((w) => w.slot),
  );
  const missing = evaluation.warnings.filter((w) => w.code !== 'misposition');
  const dragItem = dragging ? items.get(dragging) : undefined;

  const slotProps = (slot: SquadSlot) => ({
    slot,
    role: slotRole(draft.formation, slot),
    item: itemAt(slot),
    stats: evaluation.effective[slot],
    selected: selected === slot,
    warn: misplaced.has(slot),
    onClick: () => clickSlot(slot),
  });

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={(e) => setDragging(String(e.active.id).replace(/^card:/, ''))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(null)}
    >
      <div
        className="sq"
        onKeyDown={(e) => {
          if (e.key === 'Escape') setSelected(null);
        }}
      >
        <header className="sq__head">
          <h1 className="h1">Đội hình</h1>
          <div className="seg" role="radiogroup" aria-label="Sơ đồ">
            {Formation.options.map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                className={`seg__opt${draft.formation === f ? ' is-on' : ''}`}
                aria-checked={draft.formation === f}
                onClick={() => pickFormation(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <span className="muted sq__formation">{FORMATION_HINT[draft.formation]}</span>
          <span className="sq__rating">
            <span className="label">OVR đội</span>
            <span className="display num sq__ovr" aria-live="polite">
              {evaluation.teamRating}
            </span>
          </span>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!dirty || saver.isPending}
            aria-busy={saver.isPending}
            onClick={() => save()}
          >
            {saver.isPending && <span className="spinner" aria-hidden="true" />}
            Lưu
            {dirty && <span className="sq__dirty" role="img" aria-label="có thay đổi chưa lưu" />}
          </button>
        </header>

        <div className="sq__body">
          <section className="sq__pitch-wrap" aria-label="Sân">
            <ChalkPitch />
            <ul className="sq__pitch">
              {STARTER_SLOTS.map((slot) => (
                <SlotCell
                  key={slot}
                  {...slotProps(slot)}
                  style={{ left: `${layout[slot].x}%`, top: `${layout[slot].y}%` }}
                />
              ))}
            </ul>
          </section>

          <div className="sq__side">
            {missing.length > 0 && (
              <div className="banner banner--danger" role="alert">
                <WarnIcon />
                <span>
                  <b>{missing.map((w) => w.message).join(' · ')}.</b> Cần đủ {STARTER_SLOTS.length}{' '}
                  người, có 1 GK, để vào trận.
                </span>
              </div>
            )}
            {evaluation.warnings
              .filter((w) => w.code === 'misposition' && w.slot)
              .map((w) => (
                <MispositionBanner
                  key={w.slot}
                  item={itemAt(w.slot!)}
                  role={slotRole(draft.formation, w.slot!)}
                  base={itemAt(w.slot!)?.pc.effectiveStats}
                  stats={evaluation.effective[w.slot!]}
                  fallback={w.message}
                />
              ))}
            {notice && (
              <div className={`toast toast--${notice.tone} sq__toast`} role="status">
                <span className="toast__icon" aria-hidden="true">
                  {notice.tone === 'success' ? '✓' : '!'}
                </span>
                <div>
                  <b>{notice.title}</b>
                  {notice.body && <span>{notice.body}</span>}
                </div>
              </div>
            )}
            {saver.error && (
              <p className="banner banner--danger" role="alert">
                {saveErrorMessage(saver.error)}
              </p>
            )}

            <section className="panel sq__panel" aria-labelledby="sq-bench-title">
              <h2 className="panel__title" id="sq-bench-title">
                Dự bị{' '}
                <span className="meta">
                  {benchUsed}/{BENCH_SLOTS.length} · thay người tối đa {MAX_SUBS} lượt/trận
                </span>
              </h2>
              <ul className="sq__bench">
                {BENCH_SLOTS.map((slot) => (
                  <SlotCell key={slot} {...slotProps(slot)} bench />
                ))}
              </ul>
            </section>

            <PoolPanel
              items={shown}
              total={pool.length}
              selected={selected}
              role={selectedRole}
              filter={filter}
              onFilter={setFilter}
              compareOvr={selectedItem ? ovrOf(selectedItem) : undefined}
              onPick={pickFromPool}
              onClearSlot={
                selected && draft.slots[selected]
                  ? () => {
                      update(clearSlot(draft.slots, selected));
                      setSelected(null);
                    }
                  : undefined
              }
            />
            <p className="muted sq__hint">
              {selected
                ? `Đang chọn ô ${selected} — bấm thẻ để xếp, bấm ô khác để đổi chỗ, Esc để bỏ chọn.`
                : 'Kéo-thả thẻ vào ô, hoặc bấm ô → bấm thẻ (dùng được bằng bàn phím). Kéo một thẻ lên thẻ khác để đổi chỗ, kéo về Kho để gỡ.'}
            </p>
          </div>
        </div>
      </div>
      <DragOverlay>
        {dragItem && <CardView card={dragItem.card} size="sm" level={dragItem.pc.level} />}
      </DragOverlay>
      {blocker.state === 'blocked' && (
        <LeaveDialog
          changes={changeCount(draft, { formation: saved.formation, slots: saved.slots })}
          saving={saver.isPending}
          onDiscard={() => blocker.proceed()}
          onSave={() => save(() => blocker.proceed?.())}
          onStay={() => blocker.reset()}
        />
      )}
    </DndContext>
  );
}

function MispositionBanner({
  item,
  role,
  base,
  stats,
  fallback,
}: {
  item: Item | undefined;
  role: SquadMember['position'] | undefined;
  base: PlayerStats | undefined;
  stats: PlayerStats | undefined;
  fallback: string;
}) {
  if (!item || !role) {
    return (
      <div className="banner banner--danger" role="alert">
        <WarnIcon />
        <span>{fallback}</span>
      </div>
    );
  }
  const after = stats ? computeOvr(item.card.position, stats) : undefined;
  return (
    <div className="banner banner--danger" role="alert">
      <WarnIcon />
      <span>
        <b>
          {item.card.name} ({item.card.position}) đang đá {role}:
        </b>{' '}
        mọi chỉ số −15%
        {base && after !== undefined && ` (OVR ${ovrOf(item)} → ${after})`}. Kéo một{' '}
        {POSITION_NAME[role].toLowerCase()} vào ô này để bỏ phạt.
      </span>
    </div>
  );
}

interface SlotCellProps {
  slot: SquadSlot;
  role: SquadMember['position'] | undefined;
  item: Item | undefined;
  stats: PlayerStats | undefined;
  selected: boolean;
  warn: boolean;
  bench?: boolean;
  style?: CSSProperties;
  onClick: () => void;
}

function SlotCell({
  slot,
  role,
  item,
  stats,
  selected,
  warn,
  bench,
  style,
  onClick,
}: SlotCellProps) {
  const drop = useDroppable({ id: `slot:${slot}` });
  const drag = useDraggable({ id: cardDragId(item?.pc.id ?? `empty-${slot}`), disabled: !item });
  const label = `Ô ${slot}${role ? ` (${POSITION_NAME[role]})` : ' (dự bị)'}${
    item ? `: ${item.card.name}` : ': trống'
  }${warn ? ', sai vị trí −15%' : ''}`;
  return (
    <li
      className={`slot sq-slot${selected ? ' is-selected' : ''}${warn ? ' is-wrong' : ''}${
        drop.isOver ? ' is-over' : ''
      }${drag.isDragging ? ' is-dragging' : ''}`}
      style={style}
    >
      <button
        ref={(el) => {
          // Droppable gắn vào nút, không vào <li>: dnd-kit đo ô bỏ qua `transform` của chính nó.
          drop.setNodeRef(el);
          drag.setNodeRef(el);
        }}
        type="button"
        className="sq-slot__btn"
        aria-pressed={selected}
        aria-label={label}
        onClick={onClick}
        {...drag.listeners}
      >
        {item ? (
          <CardView
            card={item.card}
            size="sm"
            level={item.pc.level}
            stats={stats}
            selected={selected}
          />
        ) : (
          <span className={`slot__empty${selected ? ' is-selected' : ''}`}>
            {bench ? '+' : role}
          </span>
        )}
      </button>
      {!bench &&
        (warn ? (
          <span className="slot__penalty" aria-hidden="true">
            <WarnIcon /> {role} −15%
          </span>
        ) : (
          <span className="slot__role" aria-hidden="true">
            {role}
          </span>
        ))}
    </li>
  );
}

interface PoolPanelProps {
  items: Item[];
  total: number;
  selected: SquadSlot | null;
  role: SquadMember['position'] | undefined;
  filter: Filter;
  onFilter: (f: Filter) => void;
  /** OVR thẻ đang ở ô được chọn — để hiện "+N OVR" nếu thẻ trong kho mạnh hơn. */
  compareOvr: number | undefined;
  onPick: (pcId: string) => void;
  onClearSlot?: () => void;
}

function PoolPanel({
  items,
  total,
  selected,
  role,
  filter,
  onFilter,
  compareOvr,
  onPick,
  onClearSlot,
}: PoolPanelProps) {
  const { setNodeRef, isOver } = useDroppable({ id: KHO });
  const chips: [Filter, string][] = role
    ? [
        ['all', 'Tất cả'],
        ['role', role],
        ['other', 'Khác vị trí (−15%)'],
      ]
    : [];
  return (
    <section
      ref={setNodeRef}
      className={`panel sq__panel sq__pool${isOver ? ' is-over' : ''}`}
      aria-labelledby="sq-pool-title"
    >
      <h2 className="panel__title" id="sq-pool-title">
        Kho{' '}
        <span className="meta">
          {selected && role ? `Đang chọn ô ${selected} · lọc theo ${role}` : `${total} thẻ`}
        </span>
      </h2>
      {(chips.length > 0 || onClearSlot) && (
        <div className="chips">
          {chips.map(([f, text]) => (
            <button
              key={f}
              type="button"
              className={`chip${filter === f ? ' is-on' : ''}`}
              aria-pressed={filter === f}
              onClick={() => onFilter(f)}
            >
              {text}
            </button>
          ))}
          {onClearSlot && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={onClearSlot}>
              Gỡ thẻ ở ô {selected} về kho
            </button>
          )}
        </div>
      )}
      {items.length === 0 ? (
        <p className="muted">
          {role && filter === 'role' ? `Không còn thẻ ${role} trong kho.` : 'Kho không còn thẻ.'}
        </p>
      ) : (
        <ul className="sq__pool-grid">
          {items.map((it) => {
            const penalty = !!role && it.card.position !== role;
            const gain = !penalty && compareOvr !== undefined ? ovrOf(it) - compareOvr : 0;
            return (
              <PoolCard
                key={it.pc.id}
                item={it}
                tag={
                  penalty ? (
                    <span className="tag tag--warn">−15%</span>
                  ) : gain > 0 ? (
                    <span className="tag tag--success">+{gain} OVR</span>
                  ) : null
                }
                onPick={() => onPick(it.pc.id)}
              />
            );
          })}
        </ul>
      )}
    </section>
  );
}

interface PoolCardProps {
  item: Item;
  tag: ReactNode;
  onPick: () => void;
}

function PoolCard({ item, tag, onPick }: PoolCardProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: cardDragId(item.pc.id) });
  return (
    <li className={`sq-pool__item${isDragging ? ' is-dragging' : ''}`}>
      <button
        ref={setNodeRef}
        type="button"
        className="sq-pool__card"
        onClick={onPick}
        {...listeners}
      >
        <CardView card={item.card} size="sm" level={item.pc.level} stats={item.pc.effectiveStats} />
      </button>
      {tag}
    </li>
  );
}

function LeaveDialog({
  changes,
  saving,
  onDiscard,
  onSave,
  onStay,
}: {
  changes: number;
  saving: boolean;
  onDiscard: () => void;
  onSave: () => void;
  onStay: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className="dialog sq-leave"
      aria-labelledby="sq-leave-title"
      onCancel={(e) => {
        e.preventDefault();
        onStay();
      }}
    >
      <h2 className="dialog__title" id="sq-leave-title">
        Lưu đội hình?
      </h2>
      <p className="dialog__body">
        Bạn có {changes} thay đổi chưa lưu. Rời trang bây giờ sẽ bỏ các thay đổi này.
      </p>
      <div className="dialog__actions">
        <button type="button" className="btn btn--ghost" onClick={onStay}>
          Ở lại
        </button>
        <button type="button" className="btn btn--secondary" onClick={onDiscard}>
          Bỏ thay đổi
        </button>
        <button
          type="button"
          className="btn btn--primary"
          autoFocus
          disabled={saving}
          aria-busy={saving}
          onClick={onSave}
        >
          {saving && <span className="spinner" aria-hidden="true" />}
          Lưu &amp; rời
        </button>
      </div>
    </dialog>
  );
}

/** Còn thay đổi chưa lưu → hỏi trước khi rời trang (đổi route: hộp thoại; đóng tab: trình duyệt). */
function useLeaveGuard(dirty: boolean): Blocker {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
  return blocker;
}
