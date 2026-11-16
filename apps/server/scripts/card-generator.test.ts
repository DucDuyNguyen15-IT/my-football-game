import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeOvr, OVR_RANGE, PlayerStats, Position, Rarity } from '@pitch/shared';
import { CARDS_SEED_FILE } from '../src/db/seed';
import {
  FOOT_COUNTS,
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
      const { id, code, name, nickname, position, rarity, ovr, avatarSeed, foot, weakFoot, ...stats } = c;
      expect(PlayerStats.parse(stats)).toEqual(stats);
      expect(computeOvr(position, stats)).toBe(ovr);
      const [lo, hi] = OVR_RANGE[rarity];
      expect(ovr).toBeGreaterThanOrEqual(lo);
      expect(ovr).toBeLessThanOrEqual(hi);
      expect(code).toBe(`${position}-${String(id).padStart(4, '0')}`);
      expect(name).toMatch(/^\S+ \S+$/);
      expect(nickname.length).toBeGreaterThan(0);
      expect(['right', 'left', 'both']).toContain(foot);
      expect(weakFoot).toBe(foot === 'both' ? 5 : weakFoot);
      expect([2, 3, 4, 5]).toContain(weakFoot);
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

  it('chân thuận theo hạn ngạch, hai chân ≤ 5% danh mục', () => {
    const count = (foot: string) => seedFile.filter((c) => c.foot === foot).length;
    expect(count('left')).toBe(FOOT_COUNTS.left);
    expect(count('both')).toBe(FOOT_COUNTS.both);
    expect(count('both') / seedFile.length).toBeLessThanOrEqual(0.05);
    expect(count('right')).toBe(seedFile.length - FOOT_COUNTS.left - FOOT_COUNTS.both);
  });

  it('chân nghịch: 5 sao chỉ khi hai chân, 2 sao chỉ ở thẻ đồng và ít thẻ bạc', () => {
    for (const c of seedFile) expect(c.weakFoot === 5).toBe(c.foot === 'both');
    const two = seedFile.filter((c) => c.weakFoot === 2);
    expect(two.every((c) => c.rarity === 'bronze' || c.rarity === 'silver')).toBe(true);
    const silverTwo = two.filter((c) => c.rarity === 'silver').length;
    expect(silverTwo).toBeLessThan(two.length / 3);
  });
});
