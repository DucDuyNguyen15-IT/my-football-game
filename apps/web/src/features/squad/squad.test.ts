import { describe, expect, it } from 'vitest';
import type { Position } from '@pitch/shared';
import {
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
