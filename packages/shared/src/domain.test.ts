import { describe, expect, it } from 'vitest';
import { FORMATION_LINES, Formation, overall, PlayerStats, Rarity } from './domain';

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

describe('overall (PRD §6.2)', () => {
  it('chỉ số đều nhau thì OVR bằng chính giá trị đó ở mọi vị trí', () => {
    for (const pos of ['GK', 'DF', 'MF', 'FW'] as const) expect(overall(pos, flat(70))).toBe(70);
  });

  it('dùng trọng số theo vị trí', () => {
    // Tiền đạo: Sút 30% → +10 Sút = +3 OVR.
    expect(overall('FW', { ...flat(60), shooting: 70 })).toBe(63);
    // Hậu vệ: Phòng ngự 40% → +10 = +4; Sút không tính.
    expect(overall('DF', { ...flat(60), defending: 70, shooting: 99 })).toBe(64);
    // Thủ môn: Thể lực không tính vào OVR.
    expect(overall('GK', { ...flat(60), stamina: 99 })).toBe(60);
  });

  it('làm tròn tới số nguyên gần nhất', () => {
    // Tiền vệ: Sút 10% → +5 = +0.5 → 61 (làm tròn lên).
    expect(overall('MF', { ...flat(60), shooting: 65 })).toBe(61);
  });
});
