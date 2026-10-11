import type { PlayerStats } from '@pitch/shared';
import { describe, expect, it } from 'vitest';
import { length, sub, vec2, ZERO, type Vec2 } from '../math/vec2';
import { PLAYER_RADIUS } from '../physics/player';
import { controlRadiusFor } from '../stats/params';
import type { BallState, PlayerState, TeamSide } from '../types';
import {
  CONTROL_HEIGHT,
  TURN_LOSS_MIN_SPEED,
  chooseSwitchTarget,
  dribbleBall,
  findCapturer,
  losesBallOnTurn,
} from './possession';

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
  id: string,
  pos: Vec2,
  over: Partial<Omit<PlayerState, 'stats'>> & { stats?: Partial<PlayerStats> } = {},
): PlayerState {
  const { stats, ...rest } = over;
  const [team, slot] = id.split('-') as [TeamSide, PlayerState['slot']];
  return {
    id,
    team,
    slot,
    position: slot === 'GK' ? 'GK' : 'MF',
    pos,
    vel: ZERO,
    facing: vec2(1, 0),
    stamina: 100,
    ...rest,
    stats: { ...STATS, ...stats },
  };
}

const ball = (pos: Vec2, z = 0, vel: Vec2 = ZERO): BallState => ({ pos, vel, z, vz: 0 });

describe('dribbleBall — bóng dính chân', () => {
  it('bóng nằm trước mặt cầu thủ, sát chân, chạy cùng vận tốc', () => {
    const p = player('home-P1', vec2(3, 4), { facing: vec2(0, 1), vel: vec2(0, 5) });
    const b = dribbleBall(p);
    expect(b.pos.x).toBeCloseTo(3);
    expect(b.pos.y).toBeGreaterThan(4 + PLAYER_RADIUS);
    expect(length(sub(b.pos, p.pos))).toBeLessThan(controlRadiusFor(1));
    expect(b.vel).toEqual(p.vel);
    expect(b.z).toBe(0);
    expect(b.vz).toBe(0);
  });
});

describe('findCapturer — ai khống chế bóng tự do', () => {
  it('cầu thủ gần nhất trong bán kính khống chế', () => {
    const players = [player('home-P1', vec2(0.9, 0)), player('away-P1', vec2(-0.5, 0))];
    expect(findCapturer(players, ball(ZERO), null)).toBe('away-P1');
  });

  it('ngoài bán kính khống chế thì không ai bắt được', () => {
    const r = controlRadiusFor(STATS.dribbling);
    expect(findCapturer([player('home-P1', vec2(r + 0.05, 0))], ball(ZERO), null)).toBeNull();
  });

  it('bán kính phụ thuộc Rê bóng của từng người', () => {
    const at = vec2((controlRadiusFor(1) + controlRadiusFor(99)) / 2, 0);
    expect(
      findCapturer([player('home-P1', at, { stats: { dribbling: 99 } })], ball(ZERO), null),
    ).toBe('home-P1');
    expect(
      findCapturer([player('home-P1', at, { stats: { dribbling: 1 } })], ball(ZERO), null),
    ).toBeNull();
  });

  it('bóng bay cao quá tầm thì không bắt được', () => {
    const p = player('home-P1', vec2(0.3, 0));
    expect(findCapturer([p], ball(ZERO, CONTROL_HEIGHT + 0.1), null)).toBeNull();
    expect(findCapturer([p], ball(ZERO, CONTROL_HEIGHT - 0.1), null)).toBe('home-P1');
  });

  it('bỏ qua người đang bị khoá chạm bóng (vừa chuyền/sút)', () => {
    const players = [player('home-P1', vec2(0.3, 0)), player('home-P2', vec2(0.8, 0))];
    expect(findCapturer(players, ball(ZERO), 'home-P1')).toBe('home-P2');
  });

  it('hai người cách đều thì người đứng trước trong mảng thắng (tất định)', () => {
    const players = [player('away-P1', vec2(0.5, 0)), player('home-P1', vec2(-0.5, 0))];
    expect(findCapturer(players, ball(ZERO), null)).toBe('away-P1');
  });
});

describe('losesBallOnTurn — mất bóng khi xoay gắt', () => {
  const fast = vec2(TURN_LOSS_MIN_SPEED + 1, 0);

  it('đổi hướng ngược lại khi đang chạy nhanh → mất bóng', () => {
    expect(losesBallOnTurn(player('home-P1', ZERO, { vel: fast }), vec2(-1, 0))).toBe(true);
  });

  it('chạy chậm thì xoay thế nào cũng giữ được bóng', () => {
    const slow = vec2(TURN_LOSS_MIN_SPEED - 0.5, 0);
    expect(losesBallOnTurn(player('home-P1', ZERO, { vel: slow }), vec2(-1, 0))).toBe(false);
  });

  it('không bấm hướng (phanh) hoặc chạy thẳng thì không mất bóng', () => {
    const p = player('home-P1', ZERO, { vel: fast });
    expect(losesBallOnTurn(p, ZERO)).toBe(false);
    expect(losesBallOnTurn(p, vec2(1, 0))).toBe(false);
  });

  it('cùng cú xoay 120°: Rê bóng 99 giữ được, Rê bóng 1 mất bóng', () => {
    const turn120 = vec2(-0.5, Math.sqrt(3) / 2);
    const good = player('home-P1', ZERO, { vel: fast, stats: { dribbling: 99 } });
    const bad = player('home-P1', ZERO, { vel: fast, stats: { dribbling: 1 } });
    expect(losesBallOnTurn(good, turn120)).toBe(false);
    expect(losesBallOnTurn(bad, turn120)).toBe(true);
  });
});

describe('chooseSwitchTarget — đổi người điều khiển', () => {
  const players = [
    player('home-GK', vec2(-1, 0)),
    player('home-P1', vec2(2, 0)),
    player('home-P2', vec2(5, 0)),
    player('away-P1', vec2(0.5, 0)),
  ];

  it('chọn cầu thủ cùng đội gần bóng nhất, bỏ qua thủ môn và đối phương', () => {
    expect(chooseSwitchTarget(players, 'home', ZERO, 'home-P2')).toBe('home-P1');
  });

  it('người đang điều khiển đã gần nhất thì chuyển sang người gần thứ hai', () => {
    expect(chooseSwitchTarget(players, 'home', ZERO, 'home-P1')).toBe('home-P2');
  });

  it('không còn ai khác để đổi thì giữ nguyên', () => {
    const solo = [player('home-GK', vec2(-1, 0)), player('home-P1', vec2(2, 0))];
    expect(chooseSwitchTarget(solo, 'home', ZERO, 'home-P1')).toBe('home-P1');
  });
});

it('bóng dính chân luôn nằm trong bán kính khống chế của chính người dẫn', () => {
  const p = player('home-P1', ZERO, { stats: { dribbling: 1 } });
  expect(findCapturer([p], dribbleBall(p), null)).toBe('home-P1');
});
