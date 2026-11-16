import { describe, expect, it } from 'vitest';
import { vec2 } from '../math/vec2';
import { HALF_LENGTH } from '../pitch';
import { seedRng } from '../rng';
import type { BallState, PlayerState } from '../types';
import { HEADER_MAX_Z, keeperClaim, tryHeader } from './header';

// Đội nhà hiệp 1 tấn công về +x.
const player = (id: string, x: number, position = 'FW', team = 'home'): PlayerState =>
  ({
    id,
    team,
    position,
    pos: vec2(x, 0),
    vel: vec2(0, 0),
    facing: vec2(1, 0),
    stamina: 100,
    stats: { shooting: 70, passing: 70, dribbling: 70 },
  }) as PlayerState;
const ball = (x: number, z: number): BallState => ({ pos: vec2(x, 0.3), vel: vec2(0, -8), z, vz: -2 });
const all = () => true;
const none = () => null;

describe('đánh đầu', () => {
  it('trong vòng cấm đối phương: đánh đầu về khung thành, tính là cú sút', () => {
    const x = HALF_LENGTH - 8;
    const h = tryHeader([player('a', x)], ball(x, 1.8), 1, all, none, seedRng(1))!;
    expect(h.shot).toBe(true);
    expect(h.ball.vel.x).toBeGreaterThan(5);
    expect(h.ball.z).toBe(1.8);
  });

  it('ngoài vòng cấm: đánh đầu theo hướng tấn công, hoặc theo hướng người chơi bấm', () => {
    const h = tryHeader([player('a', 0)], ball(0, 1.6), 1, all, none, seedRng(2))!;
    expect(h.shot).toBe(false);
    expect(h.ball.vel.x).toBeGreaterThan(5);
    const back = tryHeader([player('a', 0)], ball(0, 1.6), 1, all, () => vec2(-1, 0), seedRng(2))!;
    expect(back.ball.vel.x).toBeLessThan(-5);
  });

  it('người gần bóng nhất đánh đầu; bóng thấp, quá cao hoặc ngoài tầm thì không ai', () => {
    const near = player('near', 0.3);
    const h = tryHeader([player('far', -0.8), near], ball(0, 1.6), 1, all, none, seedRng(3))!;
    expect(h.header.id).toBe('near');
    expect(tryHeader([near], ball(0, 0.8), 1, all, none, seedRng(3))).toBeNull();
    expect(tryHeader([near], ball(0, HEADER_MAX_Z + 0.1), 1, all, none, seedRng(3))).toBeNull();
    expect(tryHeader([player('a', 3)], ball(0, 1.6), 1, all, none, seedRng(3))).toBeNull();
    expect(tryHeader([player('gk', 0, 'GK')], ball(0, 1.6), 1, all, none, seedRng(3))).toBeNull();
  });

  it('thủ môn bắt bóng bổng trong vòng cấm nhà, ngoài vòng cấm hoặc bị cấm tay thì không', () => {
    const gk = player('gk', -HALF_LENGTH + 4, 'GK');
    expect(keeperClaim([gk], ball(-HALF_LENGTH + 4.5, 1.8), 1, null, null)?.id).toBe('gk');
    expect(keeperClaim([gk], ball(-HALF_LENGTH + 4.5, 1.8), 1, null, 'home')).toBeNull();
    const out = player('gk', -HALF_LENGTH + 25, 'GK');
    expect(keeperClaim([out], ball(-HALF_LENGTH + 25, 1.8), 1, null, null)).toBeNull();
  });
});
