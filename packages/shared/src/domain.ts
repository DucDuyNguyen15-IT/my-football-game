import { z } from 'zod';

/** Nhóm vị trí (PRD §6.1). */
export const Position = z.enum(['GK', 'DF', 'MF', 'FW']);
export type Position = z.infer<typeof Position>;

/** Độ hiếm thẻ, từ thấp tới cao (PRD §6.1). */
export const Rarity = z.enum(['bronze', 'silver', 'gold', 'legend']);
export type Rarity = z.infer<typeof Rarity>;

/** Sơ đồ chiến thuật, không tính thủ môn (PRD §6.4). */
export const Formation = z.enum(['2-3-1', '3-2-1', '2-2-2']);
export type Formation = z.infer<typeof Formation>;

/** Số cầu thủ mỗi tuyến [hậu vệ, tiền vệ, tiền đạo] — ô P1…P6 xếp theo thứ tự này. */
export const FORMATION_LINES: Record<Formation, readonly [number, number, number]> = {
  '2-3-1': [2, 3, 1],
  '3-2-1': [3, 2, 1],
  '2-2-2': [2, 2, 2],
};

const statValue = z.number().int().min(1).max(99);

/** Chỉ số cầu thủ thang 1–99 (PRD §6.2). Mọi thẻ đều có đủ 10 chỉ số; chỉ số thủ môn của cầu thủ ngoài sân thường thấp. */
export const PlayerStats = z.object({
  pace: statValue,
  shooting: statValue,
  passing: statValue,
  dribbling: statValue,
  defending: statValue,
  stamina: statValue,
  reflexes: statValue,
  handling: statValue,
  positioning: statValue,
  kicking: statValue,
});
export type PlayerStats = z.infer<typeof PlayerStats>;

/** Trọng số OVR theo vị trí, tổng = 100 (PRD §6.2). */
const OVR_WEIGHTS: Record<Position, Partial<Record<keyof PlayerStats, number>>> = {
  FW: { shooting: 30, pace: 25, dribbling: 20, passing: 10, stamina: 10, defending: 5 },
  MF: { passing: 30, dribbling: 20, stamina: 20, shooting: 10, pace: 10, defending: 10 },
  DF: { defending: 40, pace: 20, stamina: 20, passing: 15, dribbling: 5 },
  GK: { reflexes: 35, handling: 30, positioning: 25, kicking: 10 },
};

/** OVR = trung bình có trọng số theo vị trí, làm tròn (PRD §6.2). */
export function computeOvr(position: Position, stats: PlayerStats): number {
  let sum = 0;
  for (const [stat, weight] of Object.entries(OVR_WEIGHTS[position])) {
    sum += stats[stat as keyof PlayerStats] * weight;
  }
  return Math.round(sum / 100);
}

/** Khoảng OVR [min, max] của từng độ hiếm (PRD §6.1). */
export const OVR_RANGE: Record<Rarity, readonly [number, number]> = {
  bronze: [50, 64],
  silver: [65, 74],
  gold: [75, 84],
  legend: [85, 94],
};

type StarterSlotKey = 'GK' | 'P1' | 'P2' | 'P3' | 'P4' | 'P5' | 'P6';

function slotRoles(lines: readonly [number, number, number]): Record<StarterSlotKey, Position> {
  const roles: Position[] = [
    ...Array<Position>(lines[0]).fill('DF'),
    ...Array<Position>(lines[1]).fill('MF'),
    ...Array<Position>(lines[2]).fill('FW'),
  ];
  return {
    GK: 'GK',
    P1: roles[0]!,
    P2: roles[1]!,
    P3: roles[2]!,
    P4: roles[3]!,
    P5: roles[4]!,
    P6: roles[5]!,
  };
}

/** Nhóm vị trí của từng ô đá chính theo sơ đồ (PRD §6.4). Ô dự bị không có vai trò. */
export const FORMATIONS: Record<Formation, Readonly<Record<StarterSlotKey, Position>>> = {
  '2-3-1': slotRoles(FORMATION_LINES['2-3-1']),
  '3-2-1': slotRoles(FORMATION_LINES['3-2-1']),
  '2-2-2': slotRoles(FORMATION_LINES['2-2-2']),
};

/** Xếp thẻ vào ô khác nhóm vị trí → −15% mọi chỉ số (PRD §6.4). */
export const MISPOSITION_PENALTY = 0.15;

/** Tổng điểm cộng vào mọi chỉ số ở cấp +0…+5 (PRD §6.5) — không cộng dồn các cấp trước. */
export const LEVEL_STAT_BONUS = [0, 1, 2, 3, 5, 7] as const;

/**
 * Chỉ số hiệu lực trong trận: cộng theo cấp ép, rồi trừ 15% nếu `slotRole` khác vị trí thẻ;
 * làm tròn, kẹp 1–99. Không có `slotRole` (dự bị, kho) → không phạt.
 */
export function effectiveStats(
  card: { position: Position; stats: PlayerStats },
  level: number,
  slotRole?: Position,
): PlayerStats {
  const bonus = LEVEL_STAT_BONUS[level] ?? 0;
  const factor = slotRole && slotRole !== card.position ? 1 - MISPOSITION_PENALTY : 1;
  const out = {} as PlayerStats;
  for (const [stat, value] of Object.entries(card.stats)) {
    const v = Math.round((value + bonus) * factor);
    out[stat as keyof PlayerStats] = Math.min(99, Math.max(1, v));
  }
  return out;
}
