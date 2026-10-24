import { MatchTeamSetup, isStarterSlot, computeOvr, type Position } from '@pitch/shared';
import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam } from './demoTeams';

const ovrs = (team: MatchTeamSetup, starters = true) =>
  team.players
    .filter((p) => isStarterSlot(p.slot) === starters)
    .map((p) => computeOvr(p.position, p.stats));
const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const countPositions = (team: MatchTeamSetup) => {
  const c: Record<Position, number> = { GK: 0, DF: 0, MF: 0, FW: 0 };
  for (const p of team.players) c[p.position]++;
  return c;
};

describe('demoTeams', () => {
  it.each([
    ['starterLikeTeam', starterLikeTeam],
    ['cpuEasyTeam', cpuEasyTeam],
    ['cpuHardTeam', cpuHardTeam],
  ])('%s là đội hình hợp lệ', (_, team) => {
    expect(MatchTeamSetup.safeParse(team).success).toBe(true);
  });

  it('starterLikeTeam mô phỏng quà tân thủ: 11 thẻ Đồng, 1 TM / 3 HV / 4 TV / 3 TĐ, sơ đồ 2-3-1 (PRD §7.1)', () => {
    expect(starterLikeTeam.players).toHaveLength(11);
    expect(starterLikeTeam.formation).toBe('2-3-1');
    expect(countPositions(starterLikeTeam)).toEqual({ GK: 1, DF: 3, MF: 4, FW: 3 });
    for (const o of [...ovrs(starterLikeTeam), ...ovrs(starterLikeTeam, false)]) {
      expect(o).toBeGreaterThanOrEqual(50);
      expect(o).toBeLessThanOrEqual(64);
    }
  });

  it.each([
    ['starterLikeTeam', starterLikeTeam, 57],
    ['cpuEasyTeam', cpuEasyTeam, 60],
    ['cpuHardTeam', cpuHardTeam, 78],
  ])('%s có OVR trung bình đá chính ~%i', (_, team, target) => {
    expect(Math.abs(avg(ovrs(team)) - target)).toBeLessThanOrEqual(1);
  });

  it('đội máy có dự bị để AI thay người khi mệt (5.11)', () => {
    expect(cpuEasyTeam.players.length).toBeGreaterThan(7);
    expect(cpuHardTeam.players.length).toBeGreaterThan(7);
  });

  it('cầu thủ ngồi đúng ô theo sơ đồ (không bị phạt sai vị trí)', () => {
    for (const team of [starterLikeTeam, cpuEasyTeam, cpuHardTeam]) {
      const bySlot = Object.fromEntries(team.players.map((p) => [p.slot, p.position]));
      expect(bySlot.GK).toBe('GK');
    }
    // 2-3-1: P1–P2 HV, P3–P5 TV, P6 TĐ.
    const s = Object.fromEntries(starterLikeTeam.players.map((p) => [p.slot, p.position]));
    expect([s.P1, s.P2, s.P3, s.P4, s.P5, s.P6]).toEqual(['DF', 'DF', 'MF', 'MF', 'MF', 'FW']);
  });
});
