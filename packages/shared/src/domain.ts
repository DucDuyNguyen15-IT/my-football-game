import { z } from 'zod';

/** Nhóm vị trí (PRD §6.1). */
export const Position = z.enum(['GK', 'DF', 'MF', 'FW']);
export type Position = z.infer<typeof Position>;

/** Độ hiếm thẻ, từ thấp tới cao (PRD §6.1). */
export const Rarity = z.enum(['bronze', 'silver', 'gold', 'legend']);
export type Rarity = z.infer<typeof Rarity>;
