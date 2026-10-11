import { describe, expect, it } from 'vitest';
import { isFromBehind, isRough, resolveTackle } from '../actions/tackle';
import { cpuEasyTeam, starterLikeTeam } from '../fixtures/demoTeams';
import { createMatch } from '../match';
import { vec2, ZERO } from '../math/vec2';
import { HALF_LENGTH, HALF_WIDTH } from '../pitch';
import { seedRng } from '../rng';
import { tackleReachFor, tackleWinChance } from '../stats/params';
import type { PlayerState } from '../types';
import { decideCards, foulRestart, isFacingGoal, isSentOff, yellowCount } from './fouls';

const base = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed: 1, difficulty: 'easy' });
const home = base.players.find((p) => p.id === 'home-P1')!;
const away = base.players.find((p) => p.id === 'away-P4')!;
const at = (p: PlayerState, x: number, y: number, facing = vec2(1, 0)): PlayerState => ({
  ...p,
  pos: vec2(x, y),
  vel: ZERO,
  facing,
});

describe('chỉ số Phòng ngự → xoạc', () => {
  it('Phòng ngự cao: tầm xoạc xa hơn và xoạc sạch nhiều hơn', () => {
    expect(tackleReachFor(90)).toBeGreaterThan(tackleReachFor(50));
    expect(tackleWinChance(90, 60)).toBeGreaterThan(tackleWinChance(50, 60));
  });

  it('Rê bóng cao của người bị xoạc làm giảm tỉ lệ xoạc sạch; luôn nằm trong (0, 1)', () => {
    expect(tackleWinChance(70, 90)).toBeLessThan(tackleWinChance(70, 40));
    expect(tackleWinChance(1, 99)).toBeGreaterThan(0);
    expect(tackleWinChance(99, 1)).toBeLessThan(1);
  });
});

describe('isFromBehind / isRough', () => {
  const victim = at(away, 0, 0, vec2(-1, 0));
  it('sau lưng là từ phía sau, trước mặt và ngang hông thì không', () => {
    expect(isFromBehind(at(home, 1, 0), victim)).toBe(true);
    expect(isFromBehind(at(home, -1, 0), victim)).toBe(false);
    expect(isFromBehind(at(home, 0, 1), victim)).toBe(false);
  });
  it('thô bạo cần cả từ phía sau và tốc độ cao', () => {
    const fast = { ...at(home, 1, 0), vel: vec2(-6, 0) };
    expect(isRough(fast, victim)).toBe(true);
    expect(isRough({ ...fast, pos: vec2(-1, 0) }, victim)).toBe(false);
    expect(isRough(at(home, 1, 0), victim)).toBe(false);
  });
});

describe('resolveTackle', () => {
  const ball = { pos: vec2(5, 5), vel: ZERO, z: 0, vz: 0 };
  it('bóng tự do trong tầm → giành bóng; bóng quá cao → hụt', () => {
    const me = at(home, 4.5, 5);
    expect(resolveTackle([me], me, ball, null, seedRng(1)).outcome).toEqual({
      type: 'won',
      victimId: null,
    });
    const high = { ...ball, z: 2 };
    expect(resolveTackle([me], me, high, null, seedRng(1), 1).outcome.type).toBe('miss');
  });
  it('đồng đội đang dẫn bóng → hụt, không phạm lỗi', () => {
    const me = at(home, 4.5, 5);
    const mate = { ...at(home, 5.3, 5), id: 'home-P2' };
    expect(resolveTackle([me, mate], me, ball, mate.id, seedRng(1)).outcome.type).toBe('miss');
  });
});

describe('foulRestart', () => {
  it('ngoài vòng cấm → đá phạt tại chỗ cho đội bị phạm lỗi', () => {
    expect(foulRestart('home', vec2(3, -4), 1)).toEqual({
      type: 'free_kick',
      team: 'away',
      spot: vec2(3, -4),
    });
  });
  it('đá phạt sát vạch được kéo vào trong sân', () => {
    const plan = foulRestart('away', vec2(10, HALF_WIDTH + 0.3), 1);
    expect(plan.spot.y).toBeLessThan(HALF_WIDTH);
  });
  it('trong vòng cấm của đội đối phương (đội phạm lỗi đang tấn công) chỉ là đá phạt', () => {
    expect(foulRestart('home', vec2(HALF_LENGTH - 5, 0), 1).type).toBe('free_kick');
    expect(foulRestart('away', vec2(HALF_LENGTH - 5, 0), 1).type).toBe('penalty');
  });
});

describe('decideCards', () => {
  const victim = at(away, -10, 0, vec2(-1, 0));
  const behind = { fromBehind: true, rough: false };
  it('từ sau + đối mặt khung thành → vàng; đã có vàng → vàng + đỏ; không tiến PRNG', () => {
    expect(isFacingGoal(victim, 1)).toBe(true);
    const rng = seedRng(9);
    expect(decideCards(behind, home, victim, 1, [], rng)).toEqual({ cards: ['yellow'], rng });
    const booked = [{ playerId: home.id, team: 'home' as const, card: 'yellow' as const, tick: 1 }];
    expect(decideCards(behind, home, victim, 1, booked, rng).cards).toEqual(['yellow', 'red']);
    expect(yellowCount(booked, home.id)).toBe(1);
    expect(isSentOff(booked, home.id)).toBe(false);
  });
  it('xa khung thành hoặc quay lưng về khung thành thì không coi là đối mặt', () => {
    expect(isFacingGoal(at(away, 10, 0, vec2(-1, 0)), 1)).toBe(false);
    expect(isFacingGoal(at(away, -10, 0, vec2(1, 0)), 1)).toBe(false);
  });
});
