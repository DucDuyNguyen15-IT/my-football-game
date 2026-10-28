import { useEffect, useState, type CSSProperties } from 'react';
import { useBlocker } from 'react-router';
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
import { useCardCatalog } from '../../api/cards';
import { ApiClientError } from '../../api/client';
import { usePlayerCards } from '../../api/player-cards';
import { useSaveSquad, useSquad } from '../../api/squad';
import { CardView } from '../../components/card/CardView';
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
    return <p className="screen-msg">Đang tải đội hình…</p>;
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

function SquadEditor({ saved, items }: { saved: Squad; items: ReadonlyMap<string, Item> }) {
  const [draft, setDraft] = useState<Draft>(() => ({
    formation: saved.formation,
    slots: { ...saved.slots },
  }));
  const [selected, setSelected] = useState<SquadSlot | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [anyPosition, setAnyPosition] = useState(false);
  const saver = useSaveSquad();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const dirty = !sameSquad(draft, saved);
  useLeaveGuard(dirty);

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
  const shown =
    selectedRole && !anyPosition ? pool.filter((it) => it.card.position === selectedRole) : pool;
  const layout = slotLayout(draft.formation);

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
        setNotice('Không còn ô trống đúng vị trí — chọn một ô để thay người.');
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
  }

  function pickFormation(f: Formation) {
    if (f === draft.formation) return;
    const r = changeFormation(draft.slots, f, (id) => items.get(id)?.card.position);
    setDraft({ formation: f, slots: r.slots });
    setSelected(null);
    saver.reset();
    const names = (ids: string[]) => ids.map((id) => items.get(id)?.card.name ?? '?').join(', ');
    const parts = [
      r.toBench.length > 0 && `${names(r.toBench)} xuống dự bị`,
      r.toCollection.length > 0 && `${names(r.toCollection)} về kho`,
    ].filter(Boolean);
    setNotice(parts.length > 0 ? `Sơ đồ ${f}: ${parts.join('; ')}.` : null);
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
  const save = () =>
    saver.mutate(
      {
        formation: draft.formation,
        slots: Object.fromEntries(
          Object.entries(draft.slots).map(([s, id]) => [s, id && items.has(id) ? id : null]),
        ) as SlotMap,
      },
      { onSuccess: () => setNotice('Đã lưu đội hình.') },
    );

  const misplaced = new Set(
    evaluation.warnings.filter((w) => w.code === 'misposition').map((w) => w.slot),
  );
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
          <h1 className="panel__title sq__title">Đội hình</h1>
          <div className="chips" role="group" aria-label="Sơ đồ">
            <span className="muted">Sơ đồ:</span>
            {Formation.options.map((f) => (
              <button
                key={f}
                type="button"
                className="chip"
                aria-pressed={draft.formation === f}
                onClick={() => pickFormation(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <p className="sq__rating">
            <span className="muted">Chỉ số đội</span>
            <b aria-live="polite">{evaluation.teamRating}</b>
          </p>
          <button
            type="button"
            className="btn btn--primary"
            disabled={!dirty || saver.isPending}
            aria-busy={saver.isPending}
            onClick={save}
          >
            {saver.isPending && <span className="spinner" aria-hidden="true" />}
            Lưu
          </button>
        </header>

        {notice && (
          <p className="sq__notice" role="status">
            {notice}
          </p>
        )}
        {saver.error && (
          <p className="form-error" role="alert">
            {saveErrorMessage(saver.error)}
          </p>
        )}

        <div className="sq__body">
          <section className="panel sq__field" aria-label="Sân">
            <ul className="sq__pitch">
              {STARTER_SLOTS.map((slot) => (
                <SlotCell
                  key={slot}
                  {...slotProps(slot)}
                  style={{ left: `${layout[slot].x}%`, top: `${layout[slot].y}%` }}
                />
              ))}
            </ul>
            <ul className="sq__warnings">
              {evaluation.warnings.map((w, i) => (
                <li key={i} className={w.code === 'misposition' ? 'is-danger' : undefined}>
                  ⚠ {warningText(w, draft.formation, itemAt)}
                </li>
              ))}
            </ul>
          </section>

          <aside className="sq__side">
            <PoolPanel
              items={shown}
              total={pool.length}
              selected={selected}
              role={selectedRole}
              anyPosition={anyPosition}
              onAnyPosition={setAnyPosition}
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
            <section className="panel" aria-label="Dự bị">
              <h2 className="panel__title">Dự bị ({BENCH_SLOTS.length})</h2>
              <ul className="sq__bench">
                {BENCH_SLOTS.map((slot) => (
                  <SlotCell key={slot} {...slotProps(slot)} />
                ))}
              </ul>
            </section>
          </aside>
        </div>
      </div>
      <DragOverlay>
        {dragItem && <CardView card={dragItem.card} size="sm" level={dragItem.pc.level} />}
      </DragOverlay>
    </DndContext>
  );
}

function warningText(
  w: Squad['warnings'][number],
  formation: Formation,
  itemAt: (slot: SquadSlot) => Item | undefined,
): string {
  if (w.code !== 'misposition' || !w.slot) return w.message;
  const it = itemAt(w.slot);
  const role = slotRole(formation, w.slot);
  return it && role ? `${it.card.name} (${it.card.position}) đá ${role}: −15% chỉ số` : w.message;
}

interface SlotCellProps {
  slot: SquadSlot;
  role: SquadMember['position'] | undefined;
  item: Item | undefined;
  stats: PlayerStats | undefined;
  selected: boolean;
  warn: boolean;
  style?: CSSProperties;
  onClick: () => void;
}

function SlotCell({ slot, role, item, stats, selected, warn, style, onClick }: SlotCellProps) {
  const drop = useDroppable({ id: `slot:${slot}` });
  const drag = useDraggable({ id: cardDragId(item?.pc.id ?? `empty-${slot}`), disabled: !item });
  const label = `Ô ${slot}${role ? ` (${POSITION_NAME[role]})` : ' (dự bị)'}${
    item ? `: ${item.card.name}` : ': trống'
  }${warn ? ', sai vị trí' : ''}`;
  return (
    <li
      className={`sq-slot${selected ? ' is-selected' : ''}${warn ? ' is-warn' : ''}${
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
          <CardView card={item.card} size="sm" level={item.pc.level} stats={stats} />
        ) : (
          <span className="sq-slot__empty">{role ?? slot}</span>
        )}
      </button>
      {warn && (
        <span className="sq-slot__warn" aria-hidden="true">
          ⚠
        </span>
      )}
    </li>
  );
}

interface PoolPanelProps {
  items: Item[];
  total: number;
  selected: SquadSlot | null;
  role: SquadMember['position'] | undefined;
  anyPosition: boolean;
  onAnyPosition: (v: boolean) => void;
  onPick: (pcId: string) => void;
  onClearSlot?: () => void;
}

function PoolPanel({
  items,
  total,
  selected,
  role,
  anyPosition,
  onAnyPosition,
  onPick,
  onClearSlot,
}: PoolPanelProps) {
  const { setNodeRef, isOver } = useDroppable({ id: KHO });
  return (
    <section
      ref={setNodeRef}
      className={`panel sq__pool${isOver ? ' is-over' : ''}`}
      aria-label="Kho"
    >
      <h2 className="panel__title">
        Kho{' '}
        {role && !anyPosition ? (
          `(lọc theo ô đang chọn: ${role})`
        ) : (
          <span className="muted">{total}</span>
        )}
      </h2>
      {role && (
        <label className="sq__any">
          <input
            type="checkbox"
            checked={anyPosition}
            onChange={(e) => onAnyPosition(e.target.checked)}
          />
          Hiện mọi vị trí (khác vị trí bị −15%)
        </label>
      )}
      <p className="muted sq__hint">
        {selected
          ? `Đang chọn ô ${selected} — bấm thẻ để xếp, bấm ô khác để đổi chỗ, Esc để bỏ chọn.`
          : 'Bấm một ô rồi bấm thẻ, hoặc kéo thẻ vào ô. Kéo thẻ về đây để gỡ khỏi đội.'}
      </p>
      {onClearSlot && (
        <button type="button" className="btn btn--secondary" onClick={onClearSlot}>
          Gỡ thẻ ở ô {selected} về kho
        </button>
      )}
      {items.length === 0 ? (
        <p className="muted">{role ? `Không còn thẻ ${role} trong kho.` : 'Kho không còn thẻ.'}</p>
      ) : (
        <ul className="sq__pool-grid">
          {items.map((it) => (
            <PoolCard
              key={it.pc.id}
              item={it}
              penalty={!!role && it.card.position !== role}
              onPick={() => onPick(it.pc.id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

interface PoolCardProps {
  item: Item;
  /** Khác nhóm vị trí của ô đang chọn → hiện "−15%". */
  penalty: boolean;
  onPick: () => void;
}

function PoolCard({ item, penalty, onPick }: PoolCardProps) {
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: cardDragId(item.pc.id) });
  return (
    <li className={isDragging ? 'is-dragging' : undefined}>
      <button
        ref={setNodeRef}
        type="button"
        className="sq-pool__card"
        onClick={onPick}
        {...listeners}
      >
        <CardView card={item.card} size="sm" level={item.pc.level} stats={item.pc.effectiveStats} />
        {penalty && <span className="sq-pool__penalty">−15%</span>}
      </button>
    </li>
  );
}

/** Còn thay đổi chưa lưu → hỏi trước khi rời trang (đổi route hoặc đóng tab). */
function useLeaveGuard(dirty: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm('Đội hình chưa lưu. Rời trang và bỏ thay đổi?')) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);
}
