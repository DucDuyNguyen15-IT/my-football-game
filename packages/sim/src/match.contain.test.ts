import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, sub, vec2, ZERO, type Vec2 } from './math/vec2';
import { nextFloat, seedRng, type RngState } from './rng';
import { dribbleBall } from './rules/possession';
import {
  CONTAIN_DIST,
  STAND_TACKLE_COOLDOWN_TICKS,
  STAND_TACKLE_FOUL_CHANCE,
  standTackleWinChance,
} from './stats/params';
import { TICK_RATE } from './tick';
import { NO_INPUT, type MatchState, type PlayerInput } from './types';

/*
 * Giữ D khi không có bóng: áp sát + tắc bóng đứng (task 5.15). Người chơi cầm home-P1 (khung thành
 * nhà ở −x, hiệp 1), away-P4 dẫn bóng. Tắt AI để chỉ hai người này di chuyển.
 */

const setup = { home: starterLikeTeam, away: cpuEasyTeam, seed: 3, difficulty: 'easy' as const };
const press = (over: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...over });
const D = press({ shoot: true });
const repeat = (s: MatchState, input: PlayerInput, n: number): MatchState => {
  let cur = s;
  for (let i = 0; i < n; i++) cur = step(cur, input);
  return cur;
};
const ME = 'home-P1';
const OWNER = 'away-P4';
const playerOf = (s: MatchState, id: string) => s.players.find((p) => p.id === id)!;
const gap = (s: MatchState) => length(sub(playerOf(s, ME).pos, playerOf(s, OWNER).pos));

function scene(owner: Vec2, me: Vec2, ownerFacing: Vec2 = vec2(-1, 0), rng?: RngState): MatchState {
  const s = createMatch(setup);
  const players = s.players.map((p, i) => {
    const far = { ...p, pos: vec2(-12 + (i % 7) * 4, i < 7 ? -18 : 18), vel: ZERO };
    if (p.id === OWNER) return { ...far, pos: owner, facing: ownerFacing };
    if (p.id === ME) return { ...far, pos: me, facing: vec2(1, 0) };
    return far;
  });
  return {
    ...s,
    phase: 'play',
    ballDead: false,
    restart: null,
    players,
    ballOwnerId: OWNER,
    ball: dribbleBall(players.find((p) => p.id === OWNER)!),
    lastTouchTeam: 'away',
    controlledId: ME,
    rng: rng ?? s.rng,
    ai: null,
  };
}

const s0 = createMatch(setup);
const chance = standTackleWinChance(
  playerOf(s0, ME).stats.defending,
  playerOf(s0, OWNER).stats.dribbling,
);
/** Seed đầu tiên có hai lần tung kế tiếp thoả `pred`. */
function rngWhere(pred: (r1: number, r2: number) => boolean): RngState {
  for (let seed = 1; seed < 10_000; seed++) {
    const [r1, next] = nextFloat(seedRng(seed));
    if (pred(r1, nextFloat(next)[0])) return seedRng(seed);
  }
  throw new Error('không tìm được seed');
}
const winRoll = rngWhere((r1) => r1 < chance);
const failRoll = rngWhere((r1, r2) => r1 >= chance && r2 >= STAND_TACKLE_FOUL_CHANCE);
const foulRoll = rngWhere((r1, r2) => r1 >= chance && r2 < STAND_TACKLE_FOUL_CHANCE);

describe('giữ D: áp sát', () => {
  // Người dẫn bóng quay lưng (bóng ở phía +x) nên bóng không vào tầm tắc — chỉ kiểm việc áp sát.
  const away = vec2(1, 0);

  it('khoảng cách tới người dẫn bóng giảm rồi dừng quanh khoảng kèm, đứng phía khung thành nhà', () => {
    const start = scene(vec2(5, 3), vec2(-5, 3), away);
    const g0 = gap(start);
    const s1 = repeat(start, D, TICK_RATE);
    const s3 = repeat(s1, D, 2 * TICK_RATE);
    expect(gap(s1)).toBeLessThan(g0);
    expect(gap(s3)).toBeGreaterThan(CONTAIN_DIST - 0.4);
    expect(gap(s3)).toBeLessThan(CONTAIN_DIST + 0.4);
    expect(playerOf(s3, ME).pos.x).toBeLessThan(playerOf(s3, OWNER).pos.x);
    expect(length(playerOf(s3, ME).vel)).toBeLessThan(0.5);
    expect(s3.ballOwnerId).toBe(OWNER);
  });

  it('chạy vòng từ bên cạnh về chắn giữa người dẫn bóng và khung thành nhà', () => {
    const s = repeat(scene(vec2(0, 0), vec2(0, 8), away), D, 3 * TICK_RATE);
    expect(playerOf(s, ME).pos.x).toBeLessThan(-CONTAIN_DIST + 0.5);
    expect(Math.abs(playerOf(s, ME).pos.y)).toBeLessThan(0.6);
  });

  it('hướng bấm vẫn chỉnh được vị trí', () => {
    const start = scene(vec2(5, 0), vec2(-5, 0), away);
    const plain = repeat(start, D, TICK_RATE);
    const steered = repeat(start, press({ shoot: true, move: vec2(0, 1) }), TICK_RATE);
    expect(playerOf(steered, ME).pos.y).toBeGreaterThan(playerOf(plain, ME).pos.y + 0.5);
  });

  it('không giữ D thì không tự chạy', () => {
    const start = scene(vec2(5, 0), vec2(-5, 0), away);
    const s = repeat(start, NO_INPUT, TICK_RATE);
    expect(playerOf(s, ME).pos).toEqual(playerOf(start, ME).pos);
  });
});

describe('giữ D: tắc bóng đứng khi bóng vào tầm', () => {
  const front = (rng: RngState) => scene(vec2(0, 5), vec2(-CONTAIN_DIST, 5), vec2(-1, 0), rng);

  it('giành bóng; giữ tiếp D rồi thả không thành sút', () => {
    const won = step(front(winRoll), D);
    expect(won.ballOwnerId).toBe(ME);
    expect(won.kickLock?.playerId).toBe(OWNER);
    const held = repeat(won, D, 30);
    expect(held.shotChargeTicks).toBe(0);
    const released = step(held, NO_INPUT);
    expect(released.ballOwnerId).toBe(ME);
    expect(released.phase).toBe('play');
  });

  it('trượt không chạm người: người dẫn bóng giữ bóng, phải chờ hồi mới tắc lại', () => {
    const before = front(failRoll);
    const failed = step(before, D);
    expect(failed.phase).toBe('play');
    expect(failed.ballOwnerId).toBe(OWNER);
    expect(failed.rng).not.toBe(before.rng);
    // Trong thời gian hồi không tung thêm xác suất.
    const waiting = repeat(failed, D, STAND_TACKLE_COOLDOWN_TICKS - 2);
    expect(waiting.rng).toBe(failed.rng);
  });

  it('trượt chạm người: phạm lỗi, đội khách đá phạt, không thẻ', () => {
    const s = step(front(foulRoll), D);
    expect(s.phase).toBe('dead_ball');
    expect(s.restart).toMatchObject({ type: 'free_kick', team: 'away' });
    expect(s.bookings).toEqual([]);
  });
});
