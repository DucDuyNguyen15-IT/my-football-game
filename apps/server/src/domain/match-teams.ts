// Dựng hai đội vào trận vs máy (ARCHITECTURE §5.2 bước 1, PRD §5): đội người chơi từ đội hình đã
// lưu (chỉ số hiệu lực theo công thức shared), đội máy bốc từ danh mục `cards` theo OVR mục tiêu.
import {
  computeOvr,
  effectiveStats,
  Formation,
  FORMATIONS,
  slotRole,
  STARTER_SLOTS,
  SquadSlot,
  type Card,
  type Difficulty,
  type MatchPlayerSetup,
  type MatchTeamSetup,
  type Position,
} from '@pitch/shared';
import type { Rng } from './rng';

/** OVR trung bình 7 người đá chính của đội máy theo độ khó (PRD §5). */
export const CPU_TARGET_OVR: Record<Difficulty, number> = { easy: 60, hard: 78 };

/** Đội máy có 3 dự bị (một mỗi tuyến) để AI thay người. */
const CPU_BENCH: readonly [SquadSlot, Position][] = [
  ['B1', 'DF'],
  ['B2', 'MF'],
  ['B3', 'FW'],
];

/** Bù tối đa cho mỗi người khi kéo OVR trung bình về mục tiêu. */
const MAX_COMPENSATION = 6;

/** Một ô của đội hình đã lưu: thẻ mẫu + cấp ép. */
export interface SquadEntry {
  card: Card;
  level: number;
}

export type HomeTeamResult =
  { ok: true; team: MatchTeamSetup } | { ok: false; missing: (typeof STARTER_SLOTS)[number][] };

/**
 * Đội người chơi: đủ 7 ô đá chính mới được vào trận; chỉ số = `effectiveStats` (cấp ép + phạt sai
 * vị trí theo ô), dự bị không bị phạt. `cardId` là id thẻ mẫu để client tra tên.
 */
export function buildHomeTeam(
  formation: Formation,
  slots: Partial<Record<SquadSlot, SquadEntry>>,
): HomeTeamResult {
  const missing = STARTER_SLOTS.filter((s) => !slots[s]);
  if (missing.length > 0) return { ok: false, missing };
  const players: MatchPlayerSetup[] = [];
  for (const slot of SquadSlot.options) {
    const entry = slots[slot];
    if (!entry) continue;
    players.push({
      slot,
      position: entry.card.position,
      stats: effectiveStats(entry.card, entry.level, slotRole(formation, slot)),
      cardId: entry.card.id,
      level: entry.level,
    });
  }
  return { ok: true, team: { formation, players } };
}

/**
 * Bốc một thẻ đúng vị trí, chưa dùng, OVR gần `desired` nhất có thể: thử cửa sổ ±2, nới dần tới khi
 * có ứng viên rồi chọn đều trong cửa sổ đó.
 */
function pickNear(
  pool: readonly Card[],
  position: Position,
  desired: number,
  used: Set<string>,
  rng: Rng,
): Card {
  const free = pool.filter((c) => c.position === position && !used.has(c.id));
  if (free.length === 0) throw new Error(`Danh mục thiếu thẻ ${position} cho đội máy`);
  for (let w = 2; ; w++) {
    const near = free.filter((c) => Math.abs(c.ovr - desired) <= w);
    if (near.length > 0) {
      const card = near[rng(near.length)]!;
      used.add(card.id);
      return card;
    }
  }
}

const toPlayer = (slot: SquadSlot, card: Card): MatchPlayerSetup => ({
  slot,
  position: card.position,
  stats: card.stats,
  cardId: card.id,
  level: 0,
});

/**
 * Đội máy: sơ đồ ngẫu nhiên, mỗi ô một thẻ đúng vị trí (không trùng), OVR bám mục tiêu của độ
 * khó; mỗi người kế tiếp bù phần lệch tích luỹ để OVR TB 7 người đá chính sát mục tiêu.
 */
export function generateCpuTeam(
  catalog: readonly Card[],
  difficulty: Difficulty,
  rng: Rng,
): MatchTeamSetup {
  const target = CPU_TARGET_OVR[difficulty];
  const formation = Formation.options[rng(Formation.options.length)]!;
  const roles = FORMATIONS[formation];
  const used = new Set<string>();
  const players: MatchPlayerSetup[] = [];
  let sum = 0;
  for (const [i, slot] of STARTER_SLOTS.entries()) {
    const deficit = target * i - sum;
    const desired =
      target + Math.max(-MAX_COMPENSATION, Math.min(MAX_COMPENSATION, Math.round(deficit)));
    const card = pickNear(catalog, roles[slot], desired, used, rng);
    sum += card.ovr;
    players.push(toPlayer(slot, card));
  }
  for (const [slot, position] of CPU_BENCH) {
    players.push(toPlayer(slot, pickNear(catalog, position, target, used, rng)));
  }
  return { formation, players };
}

/** OVR trung bình (chưa làm tròn) của 7 người đá chính, tính từ chỉ số hiệu lực theo vị trí thẻ. */
export function startersAverageOvr(team: MatchTeamSetup): number {
  const starters = team.players.filter((p) =>
    (STARTER_SLOTS as readonly string[]).includes(p.slot),
  );
  return starters.reduce((s, p) => s + computeOvr(p.position, p.stats), 0) / starters.length;
}
