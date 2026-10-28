import { describe, expect, it } from 'vitest';
import { seededRng } from '../../test/stats';
import { UPGRADE } from '../config/economy';
import { isValidMaterial, rollUpgrade, upgradeFee, upgradeRate } from './upgrade';

describe('cấu hình ép thẻ', () => {
  it('khớp bảng PRD §6.5', () => {
    expect(UPGRADE.steps.map((s) => s.baseRate)).toEqual([100, 80, 60, 40, 25]);
    expect(UPGRADE.steps.map((s) => s.baseFee)).toEqual([50, 100, 200, 400, 800]);
    expect(UPGRADE.steps.map((s) => s.toLevel)).toEqual([1, 2, 3, 4, 5]);
    expect(UPGRADE.rarityFeeMultiplier).toEqual({ bronze: 1, silver: 2, gold: 3, legend: 5 });
    expect(UPGRADE.maxLevel).toBe(5);
    expect(UPGRADE.luckPerFail).toBe(10);
  });
});

describe('upgradeRate / upgradeFee', () => {
  it('tỉ lệ = cơ bản + may mắn, kẹp 100', () => {
    expect(upgradeRate(0, 0)).toBe(100);
    expect(upgradeRate(1, 0)).toBe(80);
    expect(upgradeRate(4, 30)).toBe(55);
    expect(upgradeRate(1, 50)).toBe(100);
    expect(upgradeRate(4, 100)).toBe(100);
  });

  it('phí = phí cơ bản × hệ số độ hiếm', () => {
    expect(upgradeFee(0, 'bronze')).toBe(50);
    expect(upgradeFee(2, 'silver')).toBe(400);
    expect(upgradeFee(3, 'gold')).toBe(1200);
    expect(upgradeFee(4, 'legend')).toBe(4000);
  });

  it('cấp đã tối đa → ném lỗi', () => {
    expect(() => upgradeRate(5, 0)).toThrow();
    expect(() => upgradeFee(5, 'bronze')).toThrow();
  });
});

describe('isValidMaterial', () => {
  it('nguyên liệu cùng độ hiếm trở lên', () => {
    expect(isValidMaterial('bronze', 'bronze')).toBe(true);
    expect(isValidMaterial('silver', 'legend')).toBe(true);
    expect(isValidMaterial('gold', 'silver')).toBe(false);
    expect(isValidMaterial('legend', 'gold')).toBe(false);
  });
});

describe('rollUpgrade', () => {
  it('thành công: lên cấp, may mắn về 0', () => {
    expect(rollUpgrade({ level: 4, luck: 30 }, () => 54)).toEqual({
      success: true,
      rate: 55,
      level: 5,
      luck: 0,
    });
  });

  it('thất bại: giữ cấp, +10 may mắn', () => {
    expect(rollUpgrade({ level: 4, luck: 30 }, () => 55)).toEqual({
      success: false,
      rate: 55,
      level: 4,
      luck: 40,
    });
  });

  it('quay bằng rng(100)', () => {
    const calls: number[] = [];
    rollUpgrade({ level: 1, luck: 0 }, (max) => {
      calls.push(max);
      return 0;
    });
    expect(calls).toEqual([100]);
  });

  it('3 lần trượt liên tiếp ở +5 → lần thứ 4 tỉ lệ 55%', () => {
    let card = { level: 4, luck: 0 };
    const rates: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = rollUpgrade(card, () => 99);
      rates.push(r.rate);
      card = { level: r.level, luck: r.luck };
    }
    expect(rates).toEqual([25, 35, 45]);
    expect(rollUpgrade(card, () => 99).rate).toBe(55);
  });

  it('may mắn không vượt 100; tỉ lệ 100% không thể trượt', () => {
    expect(rollUpgrade({ level: 1, luck: 95 }, () => 99)).toMatchObject({ success: true, luck: 0 });
    expect(rollUpgrade({ level: 1, luck: 0 }, () => 99)).toMatchObject({
      success: false,
      luck: 10,
    });
    expect(rollUpgrade({ level: 4, luck: 75 }, () => 99).success).toBe(true);
  });

  it('10.000 lần ép mỗi cấp (may mắn 0) lệch ≤ ±1,5 điểm % so với bảng', () => {
    const rng = seededRng(20261028);
    UPGRADE.steps.forEach((step, level) => {
      let ok = 0;
      for (let i = 0; i < 10_000; i++) if (rollUpgrade({ level, luck: 0 }, rng).success) ok++;
      expect(Math.abs(ok / 100 - step.baseRate)).toBeLessThanOrEqual(1.5);
    });
  });
});
