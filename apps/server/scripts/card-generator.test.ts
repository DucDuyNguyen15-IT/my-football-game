import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeOvr, OVR_RANGE, PlayerStats, Position, Rarity } from '@pitch/shared';
import { CARDS_SEED_FILE } from '../src/db/seed';
import {
  generateCards,
  POSITION_SHARE,
  positionCounts,
  RARITY_COUNTS,
  type CardSeedRow,
} from './card-generator';

const seedFile = JSON.parse(readFileSync(CARDS_SEED_FILE, 'utf8')) as CardSeedRow[];

describe('generateCards', () => {
  it('tất định: file seed trong repo = kết quả sinh lại (chạy cards:generate nếu đổi bộ sinh)', () => {
    expect(generateCards()).toEqual(seedFile);
  });

  it('đúng số thẻ theo độ hiếm và vị trí (PRD §6.1)', () => {
    expect(seedFile).toHaveLength(150);
    for (const rarity of Rarity.options) {
      const inRarity = seedFile.filter((c) => c.rarity === rarity);
      expect(inRarity).toHaveLength(RARITY_COUNTS[rarity]);
      const expected = positionCounts(RARITY_COUNTS[rarity]);
      for (const pos of Position.options) {
        const n = inRarity.filter((c) => c.position === pos).length;
        expect(n).toBe(expected[pos]);
        // Lệch ≤ 1 thẻ so với tỉ lệ lý thuyết.
        expect(Math.abs(n - RARITY_COUNTS[rarity] * POSITION_SHARE[pos])).toBeLessThan(1);
      }
    }
  });

  it('OVR = computeOvr và nằm trong khoảng của độ hiếm; chỉ số hợp lệ', () => {
    for (const c of seedFile) {
      const { id, code, name, nickname, position, rarity, ovr, avatarSeed, ...stats } = c;
      expect(PlayerStats.parse(stats)).toEqual(stats);
      expect(computeOvr(position, stats)).toBe(ovr);
      const [lo, hi] = OVR_RANGE[rarity];
      expect(ovr).toBeGreaterThanOrEqual(lo);
      expect(ovr).toBeLessThanOrEqual(hi);
      expect(code).toBe(`${position}-${String(id).padStart(4, '0')}`);
      expect(name).toMatch(/^\S+ \S+$/);
      expect(nickname.length).toBeGreaterThan(0);
      expect(avatarSeed).toMatch(/^[0-9a-f]{8}$/);
    }
  });

  it('id, mã và tên không trùng', () => {
    for (const key of ['id', 'code', 'name'] as const) {
      expect(new Set(seedFile.map((c) => c[key])).size).toBe(seedFile.length);
    }
  });

  it('cầu thủ ngoài sân có chỉ số thủ môn thấp hơn hẳn chỉ số chính', () => {
    for (const c of seedFile.filter((x) => x.position !== 'GK')) {
      expect(Math.max(c.reflexes, c.handling, c.positioning)).toBeLessThan(c.ovr - 20);
    }
  });

  it('chia vị trí theo dư lớn nhất luôn đủ tổng', () => {
    for (const total of [1, 7, 15, 30, 45, 60, 101]) {
      const counts = positionCounts(total);
      expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(total);
    }
  });
});
