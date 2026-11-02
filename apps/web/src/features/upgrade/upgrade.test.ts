import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../api/client';
import type { Card, PlayerCard, Rarity, UpgradeConfig } from '@pitch/shared';
import {
  isValidMaterial,
  materialCandidates,
  materialWarnings,
  needsHoldConfirm,
  upgradeErrorMessage,
  upgradePreview,
} from './upgrade';

// Bảng PRD §6.5 — đúng dạng server trả ở GET /config/economy.
const cfg: UpgradeConfig = {
  maxLevel: 5,
  luckPerFail: 10,
  steps: [
    { toLevel: 1, baseRate: 100, baseFee: 50 },
    { toLevel: 2, baseRate: 80, baseFee: 100 },
    { toLevel: 3, baseRate: 60, baseFee: 200 },
    { toLevel: 4, baseRate: 40, baseFee: 400 },
    { toLevel: 5, baseRate: 25, baseFee: 800 },
  ],
  rarityFeeMultiplier: { bronze: 1, silver: 2, gold: 3, legend: 5 },
};

const card = (id: string, rarity: Rarity, over: Partial<Card> = {}): Card => ({
  id,
  code: `FW-${id}`,
  name: `Cầu thủ ${id}`,
  nickname: 'Ma tốc độ',
  position: 'FW',
  rarity,
  stats: {
    pace: 80,
    shooting: 95,
    passing: 70,
    dribbling: 80,
    defending: 40,
    stamina: 70,
    reflexes: 10,
    handling: 10,
    positioning: 10,
    kicking: 10,
  },
  ovr: 80,
  avatarSeed: 'a1b2c3d4',
  ...over,
});

const pc = (id: string, cardId: string, over: Partial<PlayerCard> = {}): PlayerCard => ({
  id,
  cardId,
  level: 0,
  luck: 0,
  inSquad: false,
  effectiveStats: card(cardId, 'bronze').stats,
  ...over,
});

describe('upgradePreview — tỉ lệ, phí, chỉ số sau ép', () => {
  it('tỉ lệ = cơ bản + may mắn, phí = phí cơ bản × hệ số độ hiếm', () => {
    const p = upgradePreview(card('1', 'gold'), { level: 2, luck: 20 }, cfg);
    expect(p).toMatchObject({ toLevel: 3, baseRate: 60, luck: 20, rate: 80, fee: 600 });
  });

  it('tỉ lệ kẹp ở 100%; sau 3 lần trượt ở +5 thì lần 4 là 55%', () => {
    expect(upgradePreview(card('1', 'bronze'), { level: 1, luck: 40 }, cfg)?.rate).toBe(100);
    expect(upgradePreview(card('1', 'legend'), { level: 4, luck: 30 }, cfg)).toMatchObject({
      rate: 55,
      fee: 4000,
    });
  });

  it('chỉ số sau ép = chỉ số gốc + điểm cộng của cấp đích (không cộng dồn), tối đa 99', () => {
    // +3 cộng 3, +4 cộng 5 (không phải 3 + 5).
    const p = upgradePreview(card('1', 'gold'), { level: 3, luck: 0 }, cfg)!;
    expect(p.before.pace).toBe(83);
    expect(p.after.pace).toBe(85);
    expect(p.before.shooting).toBe(98);
    expect(p.after.shooting).toBe(99);
    expect(p.bonusBefore).toBe(3);
    expect(p.bonusAfter).toBe(5);
  });

  it('OVR trước/sau tính bằng công thức chung', () => {
    const p = upgradePreview(card('1', 'gold'), { level: 0, luck: 0 }, cfg)!;
    expect(p.ovrAfter).toBeGreaterThan(p.ovrBefore);
  });

  it('thẻ đã đạt cấp tối đa → null', () => {
    expect(upgradePreview(card('1', 'gold'), { level: 5, luck: 0 }, cfg)).toBeNull();
  });
});

describe('isValidMaterial', () => {
  it('nguyên liệu cùng độ hiếm trở lên mới hợp lệ', () => {
    expect(isValidMaterial('silver', 'silver')).toBe(true);
    expect(isValidMaterial('silver', 'legend')).toBe(true);
    expect(isValidMaterial('silver', 'bronze')).toBe(false);
    expect(isValidMaterial('legend', 'gold')).toBe(false);
  });
});

describe('materialCandidates — lọc nguyên liệu hợp lệ', () => {
  const catalog = new Map<string, Card>([
    ['b', card('b', 'bronze', { ovr: 60 })],
    ['s', card('s', 'silver', { ovr: 70 })],
    ['s2', card('s2', 'silver', { ovr: 66 })],
    ['g', card('g', 'gold', { ovr: 80 })],
  ]);
  const target = pc('10', 's');
  const owned = [
    target,
    pc('11', 'b'), // thấp độ hiếm hơn
    pc('12', 'g'),
    pc('13', 's', { level: 2 }),
    pc('14', 's2'),
    pc('15', 's', { inSquad: true }), // trong đội hình
    pc('16', 'x'), // không có trong danh mục
  ];

  it('bỏ chính thẻ được ép, thẻ thấp độ hiếm hơn, thẻ trong đội hình', () => {
    const { valid } = materialCandidates(target, owned, catalog);
    expect(valid.map((m) => m.pc.id).sort()).toEqual(['12', '13', '14']);
  });

  it('đếm số thẻ hợp lệ nhưng bị khoá vì đang trong đội hình', () => {
    expect(materialCandidates(target, owned, catalog).inSquad).toBe(1);
  });

  it('gợi ý nguyên liệu "rẻ" trước: độ hiếm thấp, chưa ép, OVR thấp', () => {
    const { valid } = materialCandidates(target, owned, catalog);
    expect(valid.map((m) => m.pc.id)).toEqual(['14', '13', '12']);
  });

  it('thẻ được ép không có trong danh mục → không có nguyên liệu', () => {
    expect(materialCandidates(pc('99', 'x'), owned, catalog).valid).toEqual([]);
  });
});

describe('cảnh báo mất nguyên liệu', () => {
  it('luôn báo mất nguyên liệu; thêm dòng khi nguyên liệu đã + hoặc hiếm hơn thẻ được ép', () => {
    const plain = materialWarnings(card('t', 'silver'), card('m', 'silver'), { level: 0 });
    expect(plain).toHaveLength(1);
    expect(plain[0]).toMatch(/mất/);

    const leveled = materialWarnings(card('t', 'silver'), card('m', 'silver'), { level: 3 });
    expect(leveled.some((w) => w.includes('+3'))).toBe(true);

    const rarer = materialWarnings(card('t', 'silver'), card('m', 'legend'), { level: 0 });
    expect(rarer.some((w) => w.includes('Huyền thoại'))).toBe(true);
  });

  it('nguyên liệu đã +, Vàng trở lên hoặc hiếm hơn → phải bấm giữ', () => {
    expect(needsHoldConfirm(card('t', 'bronze'), card('m', 'bronze'), { level: 0 })).toBe(false);
    expect(needsHoldConfirm(card('t', 'bronze'), card('m', 'bronze'), { level: 1 })).toBe(true);
    expect(needsHoldConfirm(card('t', 'bronze'), card('m', 'silver'), { level: 0 })).toBe(true);
    expect(needsHoldConfirm(card('t', 'gold'), card('m', 'gold'), { level: 0 })).toBe(true);
  });
});

describe('upgradeErrorMessage', () => {
  it('đổi mã lỗi server thành câu tiếng Việt', () => {
    const err = (code: ConstructorParameters<typeof ApiClientError>[0]) =>
      new ApiClientError(code, 409, 'x');
    expect(upgradeErrorMessage(err('insufficient_coins'))).toMatch(/xu/);
    expect(upgradeErrorMessage(err('card_in_squad'))).toMatch(/đội hình/);
    expect(upgradeErrorMessage(err('max_level'))).toMatch(/tối đa/);
    expect(upgradeErrorMessage(err('network_error'))).toMatch(/kết nối/);
    expect(upgradeErrorMessage(new Error('?'))).toMatch(/thử lại/);
  });
});
