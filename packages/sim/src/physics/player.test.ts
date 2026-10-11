import type { PlayerStats } from '@pitch/shared';
import { describe, expect, it } from 'vitest';
import { TICK_DT, TICK_RATE } from '../index';
import { length, sub, vec2, ZERO, type Vec2 } from '../math/vec2';
import { accelFor, runSpeedFor } from '../stats/params';
import type { PlayerState } from '../types';
import { PLAYER_RADIUS, separatePlayers, stepPlayer } from './player';

const STATS: PlayerStats = {
  pace: 70,
  shooting: 70,
  passing: 70,
  dribbling: 70,
  defending: 70,
  stamina: 70,
  reflexes: 30,
  handling: 30,
  positioning: 30,
  kicking: 30,
};

function player(
  over: Partial<Omit<PlayerState, 'stats'>> & { stats?: Partial<PlayerStats> } = {},
): PlayerState {
  const { stats, ...rest } = over;
  return {
    id: 'home-P1',
    team: 'home',
    slot: 'P1',
    position: 'MF',
    pos: ZERO,
    vel: ZERO,
    facing: vec2(1, 0),
    stamina: 100,
    ...rest,
    stats: { ...STATS, ...stats },
  };
}

const RIGHT = vec2(1, 0);

/** Chạy `ticks` tick với cùng input. */
function run(p: PlayerState, ticks: number, move: Vec2, sprint = false): PlayerState {
  let cur = p;
  for (let i = 0; i < ticks; i++) cur = stepPlayer(cur, move, sprint);
  return cur;
}

/** Số tick để chạy hết `dist` mét về +x từ trạng thái đứng yên. */
function ticksToRun(p: PlayerState, dist: number, sprint = false): number {
  let cur = p;
  for (let t = 1; t < 100 * TICK_RATE; t++) {
    cur = stepPlayer(cur, RIGHT, sprint);
    if (cur.pos.x >= dist) return t;
  }
  throw new Error('không tới đích');
}

describe('stepPlayer — di chuyển', () => {
  it('không input thì đứng yên tại chỗ', () => {
    const p = player({ pos: vec2(3, 4) });
    const next = stepPlayer(p, ZERO, false);
    expect(next.pos).toEqual(vec2(3, 4));
    expect(next.vel).toEqual(ZERO);
  });

  it('không sửa state đầu vào', () => {
    const p = player({ vel: vec2(2, 1) });
    const copy: unknown = JSON.parse(JSON.stringify(p));
    stepPlayer(p, RIGHT, true);
    expect(p).toEqual(copy);
  });

  it('gia tốc bị giới hạn theo chỉ số Tốc độ', () => {
    const next = stepPlayer(player(), RIGHT, true);
    expect(length(next.vel)).toBeCloseTo(accelFor(STATS.pace) * TICK_DT, 9);
  });

  it('đạt và giữ tốc độ chạy thường theo chỉ số Tốc độ', () => {
    const p = run(player(), 3 * TICK_RATE, RIGHT);
    expect(length(p.vel)).toBeCloseTo(runSpeedFor(STATS.pace), 9);
  });

  it('nước rút nhanh hơn chạy thường', () => {
    const runP = run(player(), 3 * TICK_RATE, RIGHT);
    const sprintP = run(player(), 3 * TICK_RATE, RIGHT, true);
    expect(length(sprintP.vel)).toBeGreaterThan(length(runP.vel));
  });

  it('Tốc độ 90 chạy 30 m nhanh hơn Tốc độ 50', () => {
    const fast = ticksToRun(player({ stats: { pace: 90 } }), 30);
    const slow = ticksToRun(player({ stats: { pace: 50 } }), 30);
    expect(fast).toBeLessThan(slow);
  });

  it('hướng dài hơn 1 bị kẹp, không chạy nhanh hơn tốc độ tối đa', () => {
    const p = run(player(), 3 * TICK_RATE, vec2(5, 0));
    expect(length(p.vel)).toBeCloseTo(runSpeedFor(STATS.pace), 9);
  });

  it('input NaN coi như đứng yên', () => {
    const next = stepPlayer(player(), vec2(Number.NaN, 1), false);
    expect(Number.isFinite(next.pos.x) && Number.isFinite(next.pos.y)).toBe(true);
  });

  it('hướng mặt theo vận tốc, giữ nguyên khi đứng yên', () => {
    const moving = run(player({ facing: vec2(1, 0) }), 30, vec2(0, 1));
    expect(moving.facing.y).toBeCloseTo(1, 9);
    const stopped = run(moving, 3 * TICK_RATE, ZERO);
    expect(length(stopped.vel)).toBe(0);
    expect(stopped.facing.y).toBeCloseTo(1, 9);
  });
});

describe('stepPlayer — thể lực', () => {
  const TEN_SEC = 10 * TICK_RATE;

  it('nước rút liên tục tụt nhanh hơn chạy thường', () => {
    const sprint = run(player(), TEN_SEC, RIGHT, true);
    const jog = run(player(), TEN_SEC, RIGHT);
    expect(sprint.stamina).toBeLessThan(jog.stamina);
    expect(jog.stamina).toBeLessThan(100);
  });

  it('giữ nút nước rút khi không bấm hướng (đang trôi) không hao như nước rút', () => {
    const moving = player({ vel: vec2(5, 0) });
    const coastSprint = stepPlayer(moving, ZERO, true);
    const coast = stepPlayer(moving, ZERO, false);
    expect(coastSprint.stamina).toBe(coast.stamina);
  });

  it('Thể lực 90 hao chậm hơn Thể lực 50', () => {
    const fit = run(player({ stats: { stamina: 90 } }), TEN_SEC, RIGHT, true);
    const unfit = run(player({ stats: { stamina: 50 } }), TEN_SEC, RIGHT, true);
    expect(fit.stamina).toBeGreaterThan(unfit.stamina);
  });

  it('đứng yên thì hồi, không vượt 100', () => {
    expect(run(player({ stamina: 50 }), TEN_SEC, ZERO).stamina).toBeGreaterThan(50);
    expect(run(player({ stamina: 99.9 }), TEN_SEC, ZERO).stamina).toBe(100);
  });

  it('không tụt dưới 0', () => {
    expect(run(player({ stamina: 1 }), TEN_SEC, RIGHT, true).stamina).toBe(0);
  });

  it('dưới 30% thì tốc độ tối đa giảm', () => {
    const fresh = run(player({ stamina: 100 }), 3 * TICK_RATE, RIGHT);
    const tired = run(player({ stamina: 15 }), 3 * TICK_RATE, RIGHT);
    expect(length(tired.vel)).toBeLessThan(length(fresh.vel));
  });
});

describe('separatePlayers', () => {
  const at = (id: string, pos: Vec2) => player({ id, pos });
  const gap = (a: PlayerState, b: PlayerState) => length(sub(a.pos, b.pos));

  it('không chồng nhau thì giữ nguyên', () => {
    const ps = [at('a', vec2(0, 0)), at('b', vec2(3, 0))];
    expect(separatePlayers(ps)).toEqual(ps);
  });

  it('đẩy hai người chồng nhau ra đủ khoảng cách, đều hai phía', () => {
    const [a, b] = separatePlayers([at('a', vec2(0, 0)), at('b', vec2(0.3, 0))]);
    expect(gap(a!, b!)).toBeCloseTo(2 * PLAYER_RADIUS, 9);
    expect(a!.pos.x + b!.pos.x).toBeCloseTo(0.3, 9);
  });

  it('trùng toạ độ vẫn tách được, tất định', () => {
    const ps = [at('a', vec2(1, 1)), at('b', vec2(1, 1))];
    const [a, b] = separatePlayers(ps);
    expect(gap(a!, b!)).toBeCloseTo(2 * PLAYER_RADIUS, 9);
    expect(separatePlayers(ps)).toEqual([a, b]);
  });

  it('không sửa mảng đầu vào', () => {
    const ps = [at('a', vec2(0, 0)), at('b', vec2(0.3, 0))];
    const copy: unknown = JSON.parse(JSON.stringify(ps));
    separatePlayers(ps);
    expect(ps).toEqual(copy);
  });
});
