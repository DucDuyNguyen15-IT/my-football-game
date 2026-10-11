import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from '../fixtures/demoTeams';
import { createMatch } from '../match';
import { length, sub, vec2 } from '../math/vec2';
import { CENTER_CIRCLE_RADIUS, HALF_LENGTH, HALF_WIDTH } from '../pitch';
import type { PlayerState } from '../types';
import {
  decideRestart,
  GOAL_KICK_DIST,
  kickoffPlayers,
  RESTART_CLEARANCE,
  setupRestart,
} from './restarts';

describe('decideRestart — bóng ra ngoài', () => {
  it('qua vạch biên dọc → ném biên cho đội không chạm bóng cuối, tại điểm bóng ra', () => {
    const r = decideRestart({ line: 'touch', point: vec2(12, HALF_WIDTH) }, 'home', 1);
    expect(r).toEqual({ type: 'throw_in', team: 'away', spot: vec2(12, HALF_WIDTH) });
    const r2 = decideRestart({ line: 'touch', point: vec2(-5, -HALF_WIDTH) }, 'away', 2);
    expect(r2).toEqual({ type: 'throw_in', team: 'home', spot: vec2(-5, -HALF_WIDTH) });
  });

  it('ném biên sát góc sân được kéo vào trong vạch cuối', () => {
    const r = decideRestart(
      { line: 'touch', point: vec2(HALF_LENGTH + 0.05, HALF_WIDTH) },
      'home',
      1,
    );
    expect(Math.abs(r.spot.x)).toBeLessThan(HALF_LENGTH);
  });

  it('hiệp 1, vạch cuối phía +x (khung thành đội khách): đội nhà chạm cuối → phát bóng cho đội khách', () => {
    const r = decideRestart({ line: 'goal', point: vec2(HALF_LENGTH, 8) }, 'home', 1);
    expect(r).toEqual({
      type: 'goal_kick',
      team: 'away',
      spot: vec2(HALF_LENGTH - GOAL_KICK_DIST, 0),
    });
  });

  it('hiệp 1, vạch cuối phía +x: đội khách (đội phòng ngự) chạm cuối → phạt góc cho đội nhà, ở góc phía bóng ra', () => {
    const r = decideRestart({ line: 'goal', point: vec2(HALF_LENGTH, -8) }, 'away', 1);
    expect(r).toEqual({ type: 'corner', team: 'home', spot: vec2(HALF_LENGTH, -HALF_WIDTH) });
  });

  it('hiệp 2 đổi sân: vạch cuối phía +x là khung thành đội nhà', () => {
    const kick = decideRestart({ line: 'goal', point: vec2(HALF_LENGTH, 3) }, 'away', 2);
    expect(kick.type).toBe('goal_kick');
    expect(kick.team).toBe('home');
    // Phía −x là khung thành đội khách: đội khách chạm cuối → phạt góc cho đội nhà.
    const corner = decideRestart({ line: 'goal', point: vec2(-HALF_LENGTH, 3) }, 'away', 2);
    expect(corner).toEqual({ type: 'corner', team: 'home', spot: vec2(-HALF_LENGTH, HALF_WIDTH) });
    const goalKick = decideRestart({ line: 'goal', point: vec2(-HALF_LENGTH, 3) }, 'home', 2);
    expect(goalKick.type).toBe('goal_kick');
    expect(goalKick.team).toBe('away');
  });
});

const match = () =>
  createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed: 1, difficulty: 'easy' });
const byId = (ps: PlayerState[], id: string) => ps.find((p) => p.id === id)!;

describe('setupRestart', () => {
  it('ném biên: cầu thủ ngoài sân gần nhất của đội được hưởng đứng sau bóng, mặt hướng vào sân', () => {
    const s = match();
    const plan = decideRestart({ line: 'touch', point: vec2(10, HALF_WIDTH) }, 'home', 1);
    const { players, restart } = setupRestart(s.players, plan, 1, 500);
    expect(restart.team).toBe('away');
    expect(restart.startTick).toBe(500);
    const taker = byId(players, restart.takerId);
    expect(taker.team).toBe('away');
    expect(taker.position).not.toBe('GK');
    expect(taker.facing).toEqual(vec2(0, -1));
    expect(length(sub(taker.pos, plan.spot))).toBeLessThan(1);
    expect(taker.vel).toEqual(vec2(0, 0));
  });

  it('phát bóng do thủ môn thực hiện', () => {
    const s = match();
    const plan = decideRestart({ line: 'goal', point: vec2(-HALF_LENGTH, 6) }, 'away', 1);
    const { players, restart } = setupRestart(s.players, plan, 1, 0);
    expect(restart.type).toBe('goal_kick');
    expect(byId(players, restart.takerId).slot).toBe('GK');
    expect(byId(players, restart.takerId).team).toBe('home');
  });

  it('đối phương đứng gần bóng bị đẩy ra ngoài khoảng cách tối thiểu', () => {
    const s = match();
    const spot = vec2(HALF_LENGTH, HALF_WIDTH);
    const crowded = s.players.map((p) =>
      p.id === 'away-P1' ? { ...p, pos: vec2(HALF_LENGTH - 1, HALF_WIDTH - 1) } : p,
    );
    const { players } = setupRestart(crowded, { type: 'corner', team: 'home', spot }, 1, 0);
    expect(length(sub(byId(players, 'away-P1').pos, spot))).toBeGreaterThanOrEqual(
      RESTART_CLEARANCE - 1e-9,
    );
  });
});

describe('kickoffPlayers', () => {
  it('hiệp 2 đổi sân: đội nhà đứng phần sân +x, đội khách phần sân −x, giữ nguyên thể lực', () => {
    const s = match();
    const tired = s.players.map((p) => ({ ...p, stamina: 40, pos: vec2(25, 15) }));
    const ps = kickoffPlayers(tired, s.formations, 'away', 2);
    for (const p of ps) {
      if (p.team === 'home') expect(p.pos.x).toBeGreaterThanOrEqual(0);
      else expect(p.pos.x).toBeLessThanOrEqual(0);
      expect(p.stamina).toBe(40);
      expect(p.vel).toEqual(vec2(0, 0));
    }
    for (const p of ps.filter((q) => q.team === 'home')) {
      expect(length(p.pos)).toBeGreaterThanOrEqual(CENTER_CIRCLE_RADIUS);
    }
  });
});
