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
export function overall(position: Position, stats: PlayerStats): number {
  let sum = 0;
  for (const [stat, weight] of Object.entries(OVR_WEIGHTS[position])) {
    sum += stats[stat as keyof PlayerStats] * weight;
  }
  return Math.round(sum / 100);
}
