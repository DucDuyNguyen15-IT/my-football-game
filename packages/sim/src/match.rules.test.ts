import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, sub, vec2, ZERO, type Vec2 } from './math/vec2';
import { HALF_LENGTH, HALF_WIDTH } from './pitch';
import {
  RESTART_DELAY_TICKS,
  RESTART_SETTLE_DIST,
  RESTART_SETUP_MAX_TICKS,
} from './rules/restarts';
import { TICK_RATE } from './tick';
import {
  NO_INPUT,
  type BallState,
  type MatchState,
  type PlayerInput,
  type TeamSide,
} from './types';

/*
 * Luật trong `step` (task 5.5): bóng ra ngoài, bàn thắng, giao bóng, hiệp và đồng hồ.
 * Chưa có AI nên ngoài người chơi điều khiển, cầu thủ đứng yên — tình huống dựng tay cho dễ đoán.
 */

const setup = { home: starterLikeTeam, away: cpuEasyTeam, seed: 7, difficulty: 'easy' as const };
const HALF_TICKS = 180 * TICK_RATE;

const press = (over: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...over });
const J = press({ pass: true });
const repeat = (s: MatchState, input: PlayerInput, n: number): MatchState => {
  let cur = s;
  for (let i = 0; i < n; i++) cur = step(cur, input);
  return cur;
};
const playerOf = (s: MatchState, id: string) => s.players.find((p) => p.id === id)!;

/** Bóng sống, mọi cầu thủ dồn về một dải giữa sân (xa vạch), bóng bay theo `ball`. */
function inPlay(ball: BallState, lastTouchTeam: TeamSide, half: 1 | 2 = 1): MatchState {
  const s = createMatch(setup);
  return {
    ...s,
    half,
    phase: 'play',
    ballDead: false,
    restart: null,
    lastTouchTeam,
    players: s.players.map((p, i) => ({
      ...p,
      pos: vec2(-6 + (i % 7) * 2, i < 7 ? -3 : 3),
      vel: ZERO,
    })),
    ballOwnerId: null,
    ball,
  };
}
const rolling = (pos: Vec2, vel: Vec2): BallState => ({ pos, vel, z: 0, vz: 0 });

/** Chạy tới khi bóng chết (tối đa 5 s). */
function untilDead(s: MatchState): MatchState {
  let cur = s;
  for (let i = 0; i < 5 * TICK_RATE && cur.phase === 'play'; i++) cur = step(cur, NO_INPUT);
  return cur;
}

describe('createMatch — giao bóng đầu trận', () => {
  const s = createMatch(setup);

  it('bắt đầu ở phase kickoff, bóng chết, đội nhà giao bóng, người chơi cầm cầu thủ giao bóng', () => {
    expect(s.phase).toBe('kickoff');
    expect(s.ballDead).toBe(true);
    expect(s.restart).toMatchObject({ type: 'kickoff', team: 'home', spot: ZERO, startTick: 0 });
    expect(s.controlledId).toBe(s.restart!.takerId);
    expect(s.addedMinutes).toBeNull();
    expect(s.stoppage).toEqual({ overrunTicks: 0, goals: 0 });
  });

  it('chưa bấm thì bóng nằm yên ở chấm giữa sân; bấm J thì bóng lăn, phase play', () => {
    const waited = repeat(s, NO_INPUT, 10 * TICK_RATE);
    expect(waited.phase).toBe('kickoff');
    expect(waited.ball.pos).toEqual(ZERO);
    const kicked = step(waited, J);
    expect(kicked.phase).toBe('play');
    expect(kicked.ballDead).toBe(false);
    expect(kicked.restart).toBeNull();
    expect(length(kicked.ball.vel)).toBeGreaterThan(0);
    expect(kicked.kickLock?.playerId).toBe(s.restart!.takerId);
  });
});

describe('bóng ra ngoài — đúng đội được hưởng', () => {
  it('qua vạch biên, đội nhà chạm cuối → ném biên cho đội khách tại điểm bóng ra', () => {
    const s = untilDead(inPlay(rolling(vec2(5, 15), vec2(0, 12)), 'home'));
    expect(s.phase).toBe('dead_ball');
    expect(s.ballDead).toBe(true);
    expect(s.restart).toMatchObject({ type: 'throw_in', team: 'away' });
    expect(s.restart!.spot.y).toBe(HALF_WIDTH);
    expect(s.restart!.spot.x).toBeCloseTo(5, 0);
    expect(s.ball.pos).toEqual(s.restart!.spot);
    expect(s.ballOwnerId).toBeNull();
    expect(playerOf(s, s.restart!.takerId).team).toBe('away');
  });

  it('qua vạch cuối ngoài khung thành, đội tấn công chạm cuối → phát bóng cho đội phòng ngự', () => {
    const s = untilDead(inPlay(rolling(vec2(24, 10), vec2(14, 0)), 'home'));
    expect(s.restart).toMatchObject({ type: 'goal_kick', team: 'away' });
    expect(playerOf(s, s.restart!.takerId).slot).toBe('GK');
  });

  it('qua vạch cuối ngoài khung thành, đội phòng ngự chạm cuối → phạt góc cho đội tấn công', () => {
    const s = untilDead(inPlay(rolling(vec2(24, 10), vec2(14, 0)), 'away'));
    expect(s.restart).toMatchObject({
      type: 'corner',
      team: 'home',
      spot: vec2(HALF_LENGTH, HALF_WIDTH),
    });
    expect(s.controlledId).toBe(s.restart!.takerId);
  });

  it('hiệp 2 đổi sân: bóng ra vạch cuối phía −x do đội nhà chạm → phát bóng cho đội khách', () => {
    const s = untilDead(inPlay(rolling(vec2(-24, 10), vec2(-14, 0)), 'home', 2));
    expect(s.restart).toMatchObject({ type: 'goal_kick', team: 'away' });
  });

  it('người dẫn bóng chạy ra ngoài vạch biên → ném biên cho đối phương', () => {
    const s0 = inPlay(rolling(ZERO, ZERO), 'home');
    const me = { ...playerOf(s0, 'home-P1'), pos: vec2(0, HALF_WIDTH - 1), facing: vec2(0, 1) };
    const start: MatchState = {
      ...s0,
      players: s0.players.map((p) => (p.id === me.id ? me : p)),
      controlledId: me.id,
      ballOwnerId: me.id,
      ball: rolling(vec2(0, HALF_WIDTH - 0.4), ZERO),
    };
    let s = start;
    for (let i = 0; i < 3 * TICK_RATE && s.phase === 'play'; i++)
      s = step(s, press({ move: vec2(0, 1) }));
    expect(s.restart).toMatchObject({ type: 'throw_in', team: 'away' });
  });

  it('đội nào khống chế bóng thì đội đó là đội chạm cuối', () => {
    // Bóng lăn ngay tới chân cầu thủ đội khách đứng ở (0, 3).
    const s = step(inPlay(rolling(vec2(0, 2.5), vec2(0, 2)), 'home'), NO_INPUT);
    expect(s.ballOwnerId).not.toBeNull();
    expect(playerOf(s, s.ballOwnerId!).team).toBe('away');
    expect(s.lastTouchTeam).toBe('away');
  });
});

describe('thực hiện lại bóng', () => {
  const awayThrow = () => untilDead(inPlay(rolling(vec2(5, 15), vec2(0, 12)), 'home'));
  const homeCorner = () => untilDead(inPlay(rolling(vec2(24, 10), vec2(14, 0)), 'away'));

  it('đội máy tự thực hiện đúng sau 3 s (180 tick), không sớm hơn', () => {
    const dead = awayThrow();
    const waitedTicks = dead.tick - dead.restart!.startTick;
    const before = repeat(dead, NO_INPUT, RESTART_DELAY_TICKS - waitedTicks - 1);
    expect(before.phase).toBe('dead_ball');
    expect(before.ball.pos).toEqual(dead.restart!.spot);
    const after = step(before, NO_INPUT);
    expect(after.phase).toBe('play');
    expect(length(after.ball.vel)).toBeGreaterThan(0);
    expect(after.lastTouchTeam).toBe('away');
    // Ném biên: bóng rời tay trên đầu, không lăn từ chân.
    expect(after.ball.z).toBeGreaterThan(1.5);
  });

  it('đội người: không bấm thì chờ mãi, bấm J thì chuyền đi', () => {
    const dead = homeCorner();
    const waited = repeat(dead, NO_INPUT, 10 * TICK_RATE);
    expect(waited.phase).toBe('dead_ball');
    const taken = step(waited, J);
    expect(taken.phase).toBe('play');
    expect(taken.kickLock?.playerId).toBe(dead.restart!.takerId);
  });

  it('bóng chết: người thực hiện đi bộ tới bóng (không dịch chuyển tức thì), tới nơi mới thực hiện được', () => {
    const dead = homeCorner();
    const taker = playerOf(dead, dead.restart!.takerId);
    const far = length(sub(taker.pos, dead.restart!.spot));
    expect(far).toBeGreaterThan(2);
    // Chưa tới bóng thì bấm chuyền cũng chưa đá.
    expect(step(dead, J).phase).toBe('dead_ball');
    let s = dead;
    let maxStepM = 0;
    for (let i = 0; i < RESTART_SETUP_MAX_TICKS - 1; i++) {
      const next = step(s, NO_INPUT);
      const d = length(sub(playerOf(next, taker.id).pos, playerOf(s, taker.id).pos));
      maxStepM = Math.max(maxStepM, d);
      s = next;
    }
    // Chạy nhanh nhất ~0,15 m/tick, cộng bước đứng vào chỗ cuối cùng ≤ RESTART_SETTLE_DIST: không nhảy cóc.
    expect(maxStepM).toBeLessThan(0.15 + RESTART_SETTLE_DIST);
    expect(length(sub(playerOf(s, taker.id).pos, dead.restart!.spot))).toBeLessThan(1);
    expect(step(s, J).phase).toBe('play');
  });

  it('khi chờ, người thực hiện đứng yên tại bóng; hướng bấm chỉ xoay hướng chuyền', () => {
    const dead = repeat(homeCorner(), NO_INPUT, RESTART_SETUP_MAX_TICKS);
    const taker = playerOf(dead, dead.restart!.takerId);
    const turned = repeat(dead, press({ move: vec2(-1, 0) }), 30);
    const after = playerOf(turned, taker.id);
    expect(length(sub(after.pos, dead.restart!.spot))).toBeLessThan(1);
    expect(after.facing.x).toBeLessThan(0);
    expect(turned.ball.pos).toEqual(dead.restart!.spot);
  });

  it('bàn thắng → tăng tỉ số, đội thủng lưới giao bóng, cầu thủ về vị trí giao bóng', () => {
    const s = untilDead(inPlay(rolling(vec2(20, 0), vec2(20, 0)), 'home'));
    expect(s.score).toEqual({ home: 1, away: 0 });
    expect(s.phase).toBe('kickoff');
    expect(s.restart).toMatchObject({ type: 'kickoff', team: 'away', spot: ZERO });
    expect(s.ball.pos).toEqual(ZERO);
    for (const p of s.players) {
      if (p.team === 'home') expect(p.pos.x).toBeLessThanOrEqual(0);
      else expect(p.pos.x).toBeGreaterThanOrEqual(0);
    }
    expect(s.stoppage.goals).toBe(1);
  });
});

describe('hiệp và đồng hồ', () => {
  /** Tắt AI để không có bàn thắng/bóng chết làm thay đổi bù giờ. */
  const quiet = (): MatchState => ({ ...createMatch(setup), ai: null });
  /** Đội nhà giao bóng ngay tick đầu, sau đó không bấm gì: không có bóng chết kéo dài. */
  const firstHalf = () => repeat(step(quiet(), J), NO_INPUT, HALF_TICKS - 1);

  it('hiệp 1 kết thúc đúng 180 s (10.800 tick) khi không có bù giờ → nghỉ giữa hiệp', () => {
    const before = repeat(step(quiet(), J), NO_INPUT, HALF_TICKS - 2);
    expect(before.phase).not.toBe('half_time');
    const s = firstHalf();
    expect(s.halfTick).toBe(HALF_TICKS);
    expect(s.tick).toBe(HALF_TICKS);
    expect(s.addedMinutes).toBe(0);
    expect(s.phase).toBe('half_time');
    expect(s.ballDead).toBe(true);
  });

  it('nghỉ giữa hiệp chờ người chơi bấm J; đồng hồ không chạy', () => {
    const ht = repeat(firstHalf(), NO_INPUT, 5 * TICK_RATE);
    expect(ht.phase).toBe('half_time');
    expect(ht.half).toBe(1);
    expect(ht.halfTick).toBe(HALF_TICKS);
  });

  it("sang hiệp 2: đổi sân, đội khách giao bóng, đồng hồ về 45'", () => {
    const s2 = step(repeat(firstHalf(), NO_INPUT, 10), J);
    expect(s2.half).toBe(2);
    expect(s2.halfTick).toBe(0);
    expect(s2.phase).toBe('kickoff');
    expect(s2.restart).toMatchObject({ type: 'kickoff', team: 'away' });
    expect(s2.addedMinutes).toBeNull();
    expect(s2.stoppage).toEqual({ overrunTicks: 0, goals: 0 });
    for (const p of s2.players) {
      if (p.team === 'home') expect(p.pos.x).toBeGreaterThanOrEqual(0);
      else expect(p.pos.x).toBeLessThanOrEqual(0);
    }
    const homeGk = s2.players.find((p) => p.team === 'home' && p.slot === 'GK')!;
    expect(homeGk.pos.x).toBeGreaterThan(HALF_LENGTH - 3);
  });

  it('trận đủ 2 × 180 s: hết giờ hiệp 2 → full_time; sau đó step không đổi gì', () => {
    const s2 = step(firstHalf(), J);
    const end = repeat(s2, NO_INPUT, HALF_TICKS);
    expect(end.phase).toBe('full_time');
    expect(end.halfTick).toBe(HALF_TICKS);
    expect(end.half).toBe(2);
    expect(step(end, J)).toEqual(end);
    const almost = repeat(s2, NO_INPUT, HALF_TICKS - 1);
    expect(almost.phase).not.toBe('full_time');
  });

  it('chờ giao bóng quá 3 s bị tính bù giờ: hiệp kéo dài thêm đúng số phút bù', () => {
    const minTicks = HALF_TICKS / 45;
    // Đứng chờ 3 s + đúng 1 phút game rồi mới giao bóng → bù 1'.
    const kicked = step(repeat(quiet(), NO_INPUT, RESTART_DELAY_TICKS + minTicks), J);
    expect(kicked.stoppage.overrunTicks).toBe(minTicks);
    const atReg = repeat(kicked, NO_INPUT, HALF_TICKS - kicked.halfTick);
    expect(atReg.halfTick).toBe(HALF_TICKS);
    expect(atReg.addedMinutes).toBe(1);
    expect(atReg.phase).toBe('play');
    const beforeEnd = repeat(atReg, NO_INPUT, minTicks - 1);
    expect(beforeEnd.phase).toBe('play');
    expect(step(beforeEnd, NO_INPUT).phase).toBe('half_time');
  });

  it('state vẫn serialize được (JSON khứ hồi) ở mọi phase', () => {
    const ht = firstHalf();
    expect(JSON.parse(JSON.stringify(ht))).toEqual(ht);
    const dead = untilDead(inPlay(rolling(vec2(5, 15), vec2(0, 12)), 'home'));
    expect(JSON.parse(JSON.stringify(dead))).toEqual(dead);
  });
});
