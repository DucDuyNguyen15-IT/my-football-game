import { describe, expect, it } from 'vitest';
import { computeOvr, effectiveStats, type PlayerStats, type Position } from './domain';
import type { SquadSlot } from './match';
import { evaluateSquad, slotRole, type SquadMember } from './squad';

const stats: PlayerStats = {
  pace: 70,
  shooting: 70,
  passing: 70,
  dribbling: 70,
  defending: 70,
  stamina: 70,
  reflexes: 70,
  handling: 70,
  positioning: 70,
  kicking: 70,
};
const m = (id: string, position: Position, level = 0): SquadMember => ({
  id,
  position,
  stats,
  level,
});

/** Đội 2-3-1 đủ, đúng vị trí. */
const full = (): Partial<Record<SquadSlot, SquadMember>> => ({
  GK: m('1', 'GK'),
  P1: m('2', 'DF'),
  P2: m('3', 'DF'),
  P3: m('4', 'MF'),
  P4: m('5', 'MF'),
  P5: m('6', 'MF'),
  P6: m('7', 'FW'),
  B1: m('8', 'FW'),
});

describe('slotRole', () => {
  it('theo sơ đồ; dự bị không có vai trò', () => {
    expect(slotRole('2-3-1', 'P3')).toBe('MF');
    expect(slotRole('3-2-1', 'P3')).toBe('DF');
    expect(slotRole('2-2-2', 'P5')).toBe('FW');
    expect(slotRole('2-3-1', 'GK')).toBe('GK');
    expect(slotRole('2-3-1', 'B2')).toBeUndefined();
  });
});

describe('evaluateSquad', () => {
  it('đội đủ, đúng vị trí: không cảnh báo, rating = TB OVR 7 người', () => {
    const ev = evaluateSquad('2-3-1', full());
    expect(ev.duplicates).toEqual([]);
    expect(ev.warnings).toEqual([]);
    expect(ev.teamRating).toBe(70);
    expect(ev.effective.B1).toEqual(stats);
  });

  it('sai vị trí → cảnh báo + chỉ số người đó −15%, rating giảm theo', () => {
    const slots = { ...full(), P1: m('2', 'FW') };
    const ev = evaluateSquad('2-3-1', slots);
    expect(ev.warnings).toEqual([expect.objectContaining({ code: 'misposition', slot: 'P1' })]);
    expect(ev.effective.P1).toEqual(effectiveStats({ position: 'FW', stats }, 0, 'DF'));
    expect(ev.effective.P1!.pace).toBe(Math.round(70 * 0.85));
    const p1Ovr = computeOvr('FW', ev.effective.P1!);
    expect(ev.teamRating).toBe(Math.round((70 * 6 + p1Ovr) / 7));
    expect(ev.teamRating).toBeLessThan(70);
  });

  it('cấp + cộng vào chỉ số hiệu lực', () => {
    const ev = evaluateSquad('2-3-1', { ...full(), P6: m('7', 'FW', 5) });
    expect(ev.effective.P6!.shooting).toBe(77);
  });

  it('thiếu thủ môn / thiếu người đá chính → cảnh báo, ô trống tính 0 vào rating', () => {
    const rest = full();
    delete rest.GK;
    delete rest.P6;
    const ev = evaluateSquad('2-3-1', rest);
    expect(ev.warnings.map((w) => w.code)).toEqual(['missing_starters', 'missing_gk']);
    expect(ev.teamRating).toBe(Math.round((70 * 5) / 7));
  });

  it('một thẻ ở hai ô → duplicates', () => {
    const ev = evaluateSquad('2-3-1', { ...full(), B2: m('3', 'DF') });
    expect(ev.duplicates).toEqual(['3']);
  });
});
