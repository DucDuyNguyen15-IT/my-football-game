import { describe, expect, it } from 'vitest';
import {
  computeOvr,
  effectiveStats,
  FORMATION_LINES,
  FORMATIONS,
  Formation,
  LEVEL_STAT_BONUS,
  MISPOSITION_PENALTY,
  OVR_RANGE,
  PlayerStats,
  Rarity,
} from './domain';

describe('Rarity', () => {
  it('có đúng 4 độ hiếm theo thứ tự tăng dần', () => {
    expect(Rarity.options).toEqual(['bronze', 'silver', 'gold', 'legend']);
  });
});

describe('Formation', () => {
  it('có 3 sơ đồ, mỗi sơ đồ đủ 6 cầu thủ ngoài sân (PRD §6.4)', () => {
    expect(Formation.options).toEqual(['2-3-1', '3-2-1', '2-2-2']);
    for (const f of Formation.options) {
      const [df, mf, fw] = FORMATION_LINES[f];
      expect(df + mf + fw).toBe(6);
    }
  });
});

const flat = (v: number): PlayerStats => ({
  pace: v,
  shooting: v,
  passing: v,
  dribbling: v,
  defending: v,
  stamina: v,
  reflexes: v,
  handling: v,
  positioning: v,
  kicking: v,
});

describe('PlayerStats', () => {
  it('chỉ nhận số nguyên 1–99', () => {
    expect(PlayerStats.safeParse(flat(99)).success).toBe(true);
    expect(PlayerStats.safeParse(flat(0)).success).toBe(false);
    expect(PlayerStats.safeParse(flat(100)).success).toBe(false);
    expect(PlayerStats.safeParse(flat(50.5)).success).toBe(false);
  });
});

describe('computeOvr (PRD §6.2)', () => {
  it('chỉ số đều nhau thì OVR bằng chính giá trị đó ở mọi vị trí', () => {
    for (const pos of ['GK', 'DF', 'MF', 'FW'] as const) expect(computeOvr(pos, flat(70))).toBe(70);
  });

  it('dùng trọng số theo vị trí', () => {
    // Tiền đạo: Sút 30% → +10 Sút = +3 OVR.
    expect(computeOvr('FW', { ...flat(60), shooting: 70 })).toBe(63);
    // Hậu vệ: Phòng ngự 40% → +10 = +4; Sút không tính.
    expect(computeOvr('DF', { ...flat(60), defending: 70, shooting: 99 })).toBe(64);
    // Thủ môn: Thể lực không tính vào OVR.
    expect(computeOvr('GK', { ...flat(60), stamina: 99 })).toBe(60);
  });

  it('làm tròn tới số nguyên gần nhất', () => {
    // Tiền vệ: Sút 10% → +5 = +0.5 → 61 (làm tròn lên).
    expect(computeOvr('MF', { ...flat(60), shooting: 65 })).toBe(61);
  });
});

describe('OVR_RANGE (PRD §6.1)', () => {
  it('khoảng OVR liền nhau, tăng theo độ hiếm', () => {
    expect(OVR_RANGE).toEqual({
      bronze: [50, 64],
      silver: [65, 74],
      gold: [75, 84],
      legend: [85, 94],
    });
  });
});

describe('FORMATIONS (PRD §6.4)', () => {
  it('ô P1…P6 xếp hậu vệ → tiền vệ → tiền đạo theo FORMATION_LINES', () => {
    expect(FORMATIONS['2-3-1']).toEqual({
      GK: 'GK',
      P1: 'DF',
      P2: 'DF',
      P3: 'MF',
      P4: 'MF',
      P5: 'MF',
      P6: 'FW',
    });
    for (const f of Formation.options) {
      const roles = Object.values(FORMATIONS[f]);
      const [df, mf, fw] = FORMATION_LINES[f];
      expect(roles.filter((r) => r === 'GK')).toHaveLength(1);
      expect(roles.filter((r) => r === 'DF')).toHaveLength(df);
      expect(roles.filter((r) => r === 'MF')).toHaveLength(mf);
      expect(roles.filter((r) => r === 'FW')).toHaveLength(fw);
    }
  });
});

describe('effectiveStats', () => {
  const card = { position: 'FW' as const, stats: flat(60) };

  it('bảng cộng theo cấp là tổng ở mỗi cấp (PRD §6.5)', () => {
    expect(LEVEL_STAT_BONUS).toEqual([0, 1, 2, 3, 5, 7]);
    expect(MISPOSITION_PENALTY).toBe(0.15);
  });

  it('cấp 0, đúng vị trí → giữ nguyên', () => {
    expect(effectiveStats(card, 0, 'FW')).toEqual(flat(60));
    expect(effectiveStats(card, 0)).toEqual(flat(60));
  });

  it('cộng tổng của cấp, không cộng dồn các cấp trước', () => {
    expect(effectiveStats(card, 4, 'FW')).toEqual(flat(65));
    expect(effectiveStats(card, 5, 'FW')).toEqual(flat(67));
  });

  it('sai vị trí → −15% mọi chỉ số (sau khi cộng cấp), làm tròn', () => {
    expect(effectiveStats(card, 0, 'DF')).toEqual(flat(51)); // 60 × 0,85
    expect(effectiveStats(card, 5, 'GK')).toEqual(flat(57)); // 67 × 0,85 = 56,95
  });

  it('kẹp trong 1–99', () => {
    expect(effectiveStats({ position: 'MF', stats: flat(97) }, 5)).toEqual(flat(99));
    expect(effectiveStats({ position: 'MF', stats: flat(1) }, 0, 'FW')).toEqual(flat(1));
  });

  it('không sửa object đầu vào', () => {
    const input = { position: 'FW' as const, stats: flat(60) };
    effectiveStats(input, 5, 'DF');
    expect(input.stats).toEqual(flat(60));
  });
});
