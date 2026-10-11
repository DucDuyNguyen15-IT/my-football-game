import { describe, expect, it } from 'vitest';
import type { PlayerStats } from './domain';
import { MatchTeamSetup, isStarterSlot } from './match';

const stats: PlayerStats = {
  pace: 60,
  shooting: 60,
  passing: 60,
  dribbling: 60,
  defending: 60,
  stamina: 60,
  reflexes: 60,
  handling: 60,
  positioning: 60,
  kicking: 60,
};

const starters = [
  { slot: 'GK', position: 'GK' },
  { slot: 'P1', position: 'DF' },
  { slot: 'P2', position: 'DF' },
  { slot: 'P3', position: 'MF' },
  { slot: 'P4', position: 'MF' },
  { slot: 'P5', position: 'MF' },
  { slot: 'P6', position: 'FW' },
].map((p) => ({ ...p, stats }));

const bench = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ slot: `B${i + 1}`, position: 'MF', stats }));

describe('MatchTeamSetup', () => {
  it('nhận 7 đá chính, có hoặc không có dự bị (tối đa 5)', () => {
    expect(MatchTeamSetup.safeParse({ formation: '2-3-1', players: starters }).success).toBe(true);
    expect(
      MatchTeamSetup.safeParse({ formation: '2-3-1', players: [...starters, ...bench(5)] }).success,
    ).toBe(true);
  });

  it('từ chối khi thiếu một ô đá chính', () => {
    const r = MatchTeamSetup.safeParse({ formation: '2-3-1', players: starters.slice(0, 6) });
    expect(r.success).toBe(false);
  });

  it('từ chối ô trùng nhau', () => {
    const r = MatchTeamSetup.safeParse({
      formation: '2-3-1',
      players: [...starters, { slot: 'P1', position: 'DF', stats }],
    });
    expect(r.success).toBe(false);
  });

  it('từ chối ô không tồn tại (B6 = dự bị thứ 6)', () => {
    const r = MatchTeamSetup.safeParse({ formation: '2-3-1', players: [...starters, ...bench(6)] });
    expect(r.success).toBe(false);
  });
});

describe('isStarterSlot', () => {
  it('GK và P1–P6 là đá chính, B1–B5 là dự bị', () => {
    expect(isStarterSlot('GK')).toBe(true);
    expect(isStarterSlot('P6')).toBe(true);
    expect(isStarterSlot('B1')).toBe(false);
  });
});
