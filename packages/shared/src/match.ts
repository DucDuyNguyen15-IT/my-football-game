import { z } from 'zod';
import { Formation, PlayerStats, Position } from './domain';

/** Ô đá chính: thủ môn + P1…P6 (vai trò suy từ sơ đồ, xem `FORMATION_LINES`). */
export const STARTER_SLOTS = ['GK', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6'] as const;
/** Ô dự bị B1…B5 (tối đa 5 dự bị, PRD §6.4). */
export const BENCH_SLOTS = ['B1', 'B2', 'B3', 'B4', 'B5'] as const;

export const SquadSlot = z.enum([...STARTER_SLOTS, ...BENCH_SLOTS]);
export type SquadSlot = z.infer<typeof SquadSlot>;

export const isStarterSlot = (slot: SquadSlot): boolean =>
  (STARTER_SLOTS as readonly string[]).includes(slot);

/** Mức độ khó của máy (PRD §5). */
export const Difficulty = z.enum(['easy', 'hard']);
export type Difficulty = z.infer<typeof Difficulty>;

export const MatchPlayerSetup = z.object({
  slot: SquadSlot,
  position: Position,
  /** Chỉ số đã hiệu lực (đã áp cấp ép thẻ và phạt sai vị trí) — sim dùng thẳng. */
  stats: PlayerStats,
  /** Có khi đội đến từ server (GĐ6); dữ liệu demo không có. */
  cardId: z.string().optional(),
  level: z.number().int().min(0).max(5).optional(),
});
export type MatchPlayerSetup = z.infer<typeof MatchPlayerSetup>;

/** Một đội vào trận: 7 đá chính + tối đa 5 dự bị. Cũng là `MatchTeam` trong API (ARCHITECTURE §4.3). */
export const MatchTeamSetup = z
  .object({
    formation: Formation,
    players: z.array(MatchPlayerSetup).min(STARTER_SLOTS.length).max(12),
  })
  .superRefine((team, ctx) => {
    const slots = team.players.map((p) => p.slot);
    if (new Set(slots).size !== slots.length) {
      ctx.addIssue({ code: 'custom', path: ['players'], message: 'Trùng ô trong đội hình' });
    }
    for (const slot of STARTER_SLOTS) {
      if (!slots.includes(slot)) {
        ctx.addIssue({ code: 'custom', path: ['players'], message: `Thiếu ô đá chính ${slot}` });
      }
    }
  });
export type MatchTeamSetup = z.infer<typeof MatchTeamSetup>;
