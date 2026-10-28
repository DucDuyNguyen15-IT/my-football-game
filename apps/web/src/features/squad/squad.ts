import {
  BENCH_SLOTS,
  FORMATION_LINES,
  FORMATIONS,
  SquadSlot,
  STARTER_SLOTS,
  type Formation,
  type Position,
} from '@pitch/shared';

/** Bản nháp đội hình trên màn: ô → id thẻ (`PlayerCard.id`) hoặc trống. */
export type SlotMap = Record<SquadSlot, string | null>;

export const emptySlots = (): SlotMap =>
  Object.fromEntries(SquadSlot.options.map((s) => [s, null])) as SlotMap;

export function slotOf(slots: SlotMap, cardId: string): SquadSlot | undefined {
  return SquadSlot.options.find((s) => slots[s] === cardId);
}

/**
 * Đặt thẻ vào ô. Thẻ đang ở ô khác → hai ô đổi chỗ cho nhau; thẻ từ kho → người đang ở ô đó về kho.
 */
export function placeCard(slots: SlotMap, target: SquadSlot, cardId: string): SlotMap {
  const next = { ...slots };
  const from = slotOf(slots, cardId);
  if (from) next[from] = slots[target];
  next[target] = cardId;
  return next;
}

/** Đổi chỗ hai ô (một trong hai có thể trống). */
export function swapSlots(slots: SlotMap, a: SquadSlot, b: SquadSlot): SlotMap {
  return { ...slots, [a]: slots[b], [b]: slots[a] };
}

export function clearSlot(slots: SlotMap, slot: SquadSlot): SlotMap {
  return { ...slots, [slot]: null };
}

export interface FormationChange {
  slots: SlotMap;
  /** Thẻ chuyển xuống dự bị / về kho vì không còn ô hợp vị trí. */
  toBench: string[];
  toCollection: string[];
}

/**
 * Đổi sơ đồ (PRD F6): thẻ đá chính vẫn hợp vị trí ở ô cũ thì giữ nguyên; thẻ khác tìm ô trống đúng
 * vị trí; không còn ô thì xuống dự bị, dự bị đầy thì về kho. Thủ môn không đổi.
 */
export function changeFormation(
  slots: SlotMap,
  to: Formation,
  positionOf: (cardId: string) => Position | undefined,
): FormationChange {
  const roles = FORMATIONS[to];
  const next = { ...slots };
  const homeless: string[] = [];
  for (const slot of STARTER_SLOTS) {
    if (slot === 'GK') continue;
    const id = slots[slot];
    if (id && positionOf(id) !== roles[slot]) {
      homeless.push(id);
      next[slot] = null;
    }
  }
  const toBench: string[] = [];
  const toCollection: string[] = [];
  for (const id of homeless) {
    const free = STARTER_SLOTS.find((s) => s !== 'GK' && !next[s] && roles[s] === positionOf(id));
    const bench = BENCH_SLOTS.find((s) => !next[s]);
    if (free) next[free] = id;
    else if (bench) {
      next[bench] = id;
      toBench.push(id);
    } else toCollection.push(id);
  }
  return { slots: next, toBench, toCollection };
}

/** Toạ độ ô đá chính trên nửa sân dọc (%, gốc trên-trái, tấn công lên trên). */
export function slotLayout(
  formation: Formation,
): Record<(typeof STARTER_SLOTS)[number], { x: number; y: number }> {
  const [df, mf, fw] = FORMATION_LINES[formation];
  const rows: { count: number; y: number }[] = [
    { count: df, y: 68 },
    { count: mf, y: 44 },
    { count: fw, y: 18 },
  ];
  const out = { GK: { x: 50, y: 88 } } as Record<
    (typeof STARTER_SLOTS)[number],
    { x: number; y: number }
  >;
  let i = 1;
  for (const row of rows) {
    for (let k = 0; k < row.count; k++) {
      out[`P${i}` as (typeof STARTER_SLOTS)[number]] = {
        x: Math.round(((k + 1) / (row.count + 1)) * 100),
        y: row.y,
      };
      i += 1;
    }
  }
  return out;
}

/** So hai bản đội hình để biết còn thay đổi chưa lưu. */
export function sameSquad(
  a: { formation: Formation; slots: SlotMap },
  b: { formation: Formation; slots: SlotMap },
): boolean {
  return a.formation === b.formation && SquadSlot.options.every((s) => a.slots[s] === b.slots[s]);
}
