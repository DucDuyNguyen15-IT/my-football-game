// Bốc phiếu từ hộp 100 phiếu không hoàn lại (PRD §6.3, ARCHITECTURE §5.1). Thuần: không DB, random qua `rng`.
import type { Rarity } from '@pitch/shared';
import { BOX_COMPOSITION } from '../config/economy';
import type { Rng } from './rng';

export type BoxLeft = Record<Rarity, number>;
export interface Box {
  left: BoxLeft;
  /** Lần làm mới hộp thứ mấy (bắt đầu 1). */
  cycle: number;
}

/** Thứ tự cộng dồn khi bốc: hiếm nhất trước. */
const DRAW_ORDER: readonly Rarity[] = ['legend', 'gold', 'silver', 'bronze'];
const SILVER_PLUS: readonly Rarity[] = ['legend', 'gold', 'silver'];

export const freshLeft = (): BoxLeft => ({ ...BOX_COMPOSITION });
export const boxTotal = (left: BoxLeft): number =>
  left.bronze + left.silver + left.gold + left.legend;
const silverPlusLeft = (left: BoxLeft): number => left.silver + left.gold + left.legend;

function drawFrom(left: BoxLeft, pool: readonly Rarity[], rng: Rng): Rarity {
  const total = pool.reduce((s, r) => s + left[r], 0);
  let x = rng(total);
  for (const r of pool) {
    if (x < left[r]) return r;
    x -= left[r];
  }
  throw new Error('rng trả giá trị ngoài khoảng');
}

/**
 * Bốc `size` phiếu. Hết phiếu thì làm mới hộp (kể cả giữa gói). Với `guarantee`: lượt cuối, nếu mọi
 * lượt trước đều Đồng và hộp còn Bạc+, chỉ bốc trong nhóm Bạc+ (theo tỉ lệ số còn lại).
 */
export function drawTickets(
  box: Box,
  size: number,
  opts: { guarantee: boolean },
  rng: Rng,
): { rarities: Rarity[]; box: Box } {
  const left = { ...box.left };
  let cycle = box.cycle;
  const rarities: Rarity[] = [];
  for (let i = 0; i < size; i++) {
    if (boxTotal(left) === 0) {
      Object.assign(left, freshLeft());
      cycle += 1;
    }
    const guaranteed =
      opts.guarantee &&
      i === size - 1 &&
      rarities.every((r) => r === 'bronze') &&
      silverPlusLeft(left) > 0;
    const r = drawFrom(left, guaranteed ? SILVER_PLUS : DRAW_ORDER, rng);
    left[r] -= 1;
    rarities.push(r);
  }
  return { rarities, box: { left, cycle } };
}

/** Tỉ lệ của lần bốc kế tiếp = số còn lại / tổng còn lại (hộp rỗng → tỉ lệ hộp mới). */
export function nextOdds(box: Box): Record<Rarity, number> {
  const left = boxTotal(box.left) === 0 ? freshLeft() : box.left;
  const total = boxTotal(left);
  return {
    bronze: left.bronze / total,
    silver: left.silver / total,
    gold: left.gold / total,
    legend: left.legend / total,
  };
}

/**
 * Gói `size` có được bảo đảm Bạc+ không: hộp còn Bạc+, hoặc hộp sẽ làm mới giữa gói (hộp mới luôn có).
 * `false` → UI báo trước khi mua (PRD §6.3).
 */
export function guaranteeAvailable(box: Box, size: number): boolean {
  return silverPlusLeft(box.left) > 0 || boxTotal(box.left) < size;
}

/** Chọn đều một mẫu thẻ trong độ hiếm. */
export function pickCard<T>(
  cardsByRarity: Readonly<Record<Rarity, readonly T[]>>,
  rarity: Rarity,
  rng: Rng,
): T {
  const pool = cardsByRarity[rarity];
  if (pool.length === 0) throw new Error(`Danh mục không có thẻ ${rarity}`);
  return pool[rng(pool.length)]!;
}
