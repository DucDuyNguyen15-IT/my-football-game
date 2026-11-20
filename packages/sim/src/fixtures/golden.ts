import { decodeInput } from '../replay';
import type { PlayerInput } from '../types';

/** Dùng chung cho script ghi golden và test golden (T005): một người chơi, input xác định theo chỉ số bước. */
export const GOLDEN_SEEDS = [1, 7, 42];
export const GOLDEN_TICKS = [60, 600];
export const goldenInput = (i: number): PlayerInput =>
  decodeInput((Math.imul((i >> 4) + 1, 2654435761) >>> 0) % 4608);
