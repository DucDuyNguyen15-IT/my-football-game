import { describe, expect, it } from 'vitest';
import type { Position } from '@pitch/shared';
import {
  autoFillSquad,
  changeFormation,
  emptySlots,
  placeCard,
  sameSquad,
  slotLayout,
  swapSlots,
  type SlotMap,
} from './squad';

const POS: Record<string, Position> = {
  gk: 'GK',
  d1: 'DF',
  d2: 'DF',
  d3: 'DF',
  m1: 'MF',
  m2: 'MF',
  m3: 'MF',
  f1: 'FW',
  f2: 'FW',
};
const positionOf = (id: string) => POS[id];

/** 2-3-1: P1–P2 DF, P3–P5 MF, P6 FW. */
function squad231(): SlotMap {
  return {
    ...emptySlots(),
    GK: 'gk',
    P1: 'd1',
    P2: 'd2',
    P3: 'm1',
    P4: 'm2',
    P5: 'm3',
    P6: 'f1',
  };
}

describe('placeCard', () => {
  it('thẻ từ kho thay người đang ở ô (người cũ về kho)', () => {
    const s = placeCard(squad231(), 'P6', 'f2');
    expect(s.P6).toBe('f2');
    expect(Object.values(s)).not.toContain('f1');
  });

  it('thẻ đang ở ô khác → hai ô đổi chỗ', () => {
    const s = placeCard(squad231(), 'P1', 'm1');
    expect(s.P1).toBe('m1');
    expect(s.P3).toBe('d1');
  });

  it('kéo vào ô trống thì ô cũ thành trống', () => {
    const s = placeCard(squad231(), 'B1', 'f1');
    expect(s.B1).toBe('f1');
    expect(s.P6).toBeNull();
  });

  it('swapSlots đổi được với ô trống', () => {
    const s = swapSlots(squad231(), 'P6', 'B2');
    expect(s.B2).toBe('f1');
    expect(s.P6).toBeNull();
  });
});

describe('changeFormation', () => {
  it('2-3-1 → 3-2-1: thẻ hợp vị trí giữ ô, tiền vệ thừa xuống dự bị', () => {
    // 3-2-1: P1–P3 DF, P4–P5 MF, P6 FW. m1 ở P3 không còn hợp lệ, không còn ô MF trống.
    const r = changeFormation(squad231(), '3-2-1', positionOf);
    expect(r.slots).toMatchObject({ GK: 'gk', P1: 'd1', P2: 'd2', P3: null, P4: 'm2', P5: 'm3' });
    expect(r.slots.P6).toBe('f1');
    expect(r.slots.B1).toBe('m1');
    expect(r.toBench).toEqual(['m1']);
    expect(r.toCollection).toEqual([]);
  });

  it('thẻ không hợp lệ chuyển sang ô trống đúng vị trí nếu còn', () => {
    // 2-3-1 có MF ở P3–P5; bỏ trống P4 rồi đổi sang 2-2-2 (P3–P4 MF, P5–P6 FW).
    const s = { ...squad231(), P4: null };
    const r = changeFormation(s, '2-2-2', positionOf);
    expect(r.slots.P3).toBe('m1');
    expect(r.slots.P4).toBe('m3'); // m3 rời P5 (giờ là FW) sang ô MF trống
    expect(r.slots.P5).toBeNull();
    expect(r.slots.P6).toBe('f1'); // P6 là FW ở cả hai sơ đồ
    expect(r.toBench).toEqual([]);
  });

  it('dự bị đầy → thẻ thừa về kho', () => {
    const s: SlotMap = { ...squad231(), B1: 'x1', B2: 'x2', B3: 'x3', B4: 'x4', B5: 'x5' };
    const r = changeFormation(s, '3-2-1', positionOf);
    expect(r.toCollection).toEqual(['m1']);
    expect(Object.values(r.slots)).not.toContain('m1');
  });

  it('không mất và không nhân đôi thẻ nào', () => {
    const before = squad231();
    for (const to of ['3-2-1', '2-2-2', '2-3-1'] as const) {
      const r = changeFormation(before, to, positionOf);
      const ids = Object.values(r.slots).filter(Boolean);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.length + r.toCollection.length).toBe(7);
    }
  });
});

describe('slotLayout', () => {
  it('mỗi sơ đồ có 7 ô, hàng tiền đạo ở trên hàng hậu vệ', () => {
    const l = slotLayout('2-2-2');
    expect(Object.keys(l)).toHaveLength(7);
    expect(l.P5.y).toBeLessThan(l.P3.y);
    expect(l.P3.y).toBeLessThan(l.P1.y);
    expect(l.GK.y).toBeGreaterThan(l.P1.y);
  });
});

describe('sameSquad', () => {
  it('khác sơ đồ hoặc khác ô thì là thay đổi', () => {
    const a = { formation: '2-3-1' as const, slots: squad231() };
    expect(sameSquad(a, { ...a, slots: { ...a.slots } })).toBe(true);
    expect(sameSquad(a, { ...a, formation: '3-2-1' })).toBe(false);
    expect(sameSquad(a, { ...a, slots: swapSlots(a.slots, 'P1', 'P2') })).toBe(false);
  });
});

describe('autoFillSquad', () => {
  it('chọn thẻ OVR cao nhất đúng vị trí cho từng ô, giữ 1 GK dự bị, không trùng thẻ', () => {
    const cards = [
      { id: 'gk_bronze', position: 'GK' as const, ovr: 58 },
      { id: 'gk_silver', position: 'GK' as const, ovr: 68 },
      { id: 'df1', position: 'DF' as const, ovr: 62 },
      { id: 'df2', position: 'DF' as const, ovr: 60 },
      { id: 'df3_gold', position: 'DF' as const, ovr: 76 },
      { id: 'mf1', position: 'MF' as const, ovr: 63 },
      { id: 'mf2', position: 'MF' as const, ovr: 61 },
      { id: 'mf3', position: 'MF' as const, ovr: 59 },
      { id: 'mf4_silver', position: 'MF' as const, ovr: 70 },
      { id: 'fw1', position: 'FW' as const, ovr: 62 },
      { id: 'fw2_gold', position: 'FW' as const, ovr: 78 },
      { id: 'df4_low', position: 'DF' as const, ovr: 55 },
      { id: 'mf5_low', position: 'MF' as const, ovr: 54 },
    ];
    // 2-3-1: GK, P1-P2 DF, P3-P5 MF, P6 FW
    const s = autoFillSquad('2-3-1', cards);
    expect(s.GK).toBe('gk_silver');
    expect([s.P1, s.P2]).toEqual(['df3_gold', 'df1']);
    expect([s.P3, s.P4, s.P5]).toEqual(['mf4_silver', 'mf1', 'mf2']);
    expect(s.P6).toBe('fw2_gold');
    // Dự bị B1 ưu tiên GK dự bị nếu còn, tiếp theo OVR cao nhất còn lại (fw1=62, df2=60, mf3=59, df4_low=55)
    expect(s.B1).toBe('gk_bronze');
    expect(s.B2).toBe('fw1');
    expect(s.B3).toBe('df2');
    expect(s.B4).toBe('mf3');
    expect(s.B5).toBe('df4_low');
    const assigned = Object.values(s).filter(Boolean);
    expect(assigned).toHaveLength(12);
    expect(new Set(assigned).size).toBe(12);
  });

  it('tự lấp ô đá chính bằng thẻ OVR cao nhất còn lại khi thiếu vị trí chuyên biệt', () => {
    const cards = [
      { id: 'gk1', position: 'GK' as const, ovr: 60 },
      { id: 'df1', position: 'DF' as const, ovr: 62 },
      { id: 'mf1', position: 'MF' as const, ovr: 64 },
      { id: 'mf2', position: 'MF' as const, ovr: 63 },
      { id: 'mf3', position: 'MF' as const, ovr: 61 },
      { id: 'mf4', position: 'MF' as const, ovr: 68 },
      { id: 'fw1', position: 'FW' as const, ovr: 65 },
    ];
    // 3-2-1 cần 3 DF nhưng chỉ có 1 DF -> 2 ô DF thiếu tự lấp bằng MF/FW dư mạnh nhất
    const s = autoFillSquad('3-2-1', cards);
    expect(s.GK).toBe('gk1');
    expect(s.P1).toBe('df1');
    expect(s.P4).toBe('mf4');
    expect(s.P5).toBe('mf1');
    expect(s.P6).toBe('fw1');
    expect([s.P2, s.P3]).toEqual(['mf2', 'mf3']);
  });
});
