import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, sub, vec2, ZERO, type Vec2 } from './math/vec2';
import { HALF_LENGTH, PENALTY_SPOT_DIST } from './pitch';
import { matchClock, regulationTicks } from './rules/clock';
import {
  HALF_TIME_MAX_TICKS,
  KEEPER_HOLD_MAX_TICKS,
  SET_PIECE_MAX_TICKS,
  WHISTLE_PENALTY_WAIT_TICKS,
  WHISTLE_SHOT_WAIT_TICKS,
} from './rules/limits';
import { dribbleBall } from './rules/possession';
import { KEEPER_WINDUP_TICKS } from './stats/params';
import { TICK_RATE } from './tick';
import { NO_INPUT, type MatchState, type PlayerInput, type TeamSide } from './types';

/*
 * Giới hạn thời gian (quyết định 2026-11-14, PRD §5): thủ môn đội người chơi ôm bóng tối đa 6 s, đá
 * phạt / phạt đền / lượt luân lưu của người chơi tối đa 15 s, nghỉ giữa hiệp tối đa 30 s — hết hạn
 * thì máy tự thực hiện. Còi hết hiệp chờ phạt đền và cú sút đang bay.
 */

const setup = { home: starterLikeTeam, away: cpuEasyTeam, seed: 7, difficulty: 'easy' as const };
const GK = 'home-GK';

function run(s: MatchState, ticks: number, input: PlayerInput = NO_INPUT): MatchState {
  let cur = s;
  for (let i = 0; i < ticks; i++) cur = step(cur, input);
  return cur;
}

/** Thủ môn đội nhà (người chơi cầm) đang ôm bóng trong vòng cấm nhà, mọi người khác ở xa. */
function keeperHolding(): MatchState {
  const s0 = createMatch(setup);
  const players = s0.players.map((p) =>
    p.id === GK ? { ...p, pos: vec2(-HALF_LENGTH + 4, 0), vel: ZERO, facing: vec2(1, 0) } : p,
  );
  const gk = players.find((p) => p.id === GK)!;
  return {
    ...s0,
    phase: 'play',
    ballDead: false,
    restart: null,
    players,
    ballOwnerId: GK,
    ownerSinceTick: s0.tick,
    controlledId: GK,
    lastTouchTeam: 'home',
    ball: dribbleBall(gk),
  };
}

/** Đá phạt / phạt đền của `team`, mọi người đứng ở vị trí giao bóng. */
function setPiece(type: 'free_kick' | 'penalty', team: TeamSide, half: 1 | 2 = 1): MatchState {
  const s0 = createMatch(setup);
  const sign = (team === 'home') === (half === 1) ? 1 : -1;
  const spot: Vec2 =
    type === 'penalty' ? vec2(sign * (HALF_LENGTH - PENALTY_SPOT_DIST), 0) : vec2(sign * 4, 3);
  const dist = (p: { pos: Vec2 }) => length(sub(p.pos, spot));
  const taker = s0.players
    .filter((p) => p.team === team && p.position !== 'GK')
    .reduce((a, b) => (dist(b) < dist(a) ? b : a));
  return {
    ...s0,
    half,
    phase: 'dead_ball',
    ballDead: true,
    ball: { pos: spot, vel: ZERO, z: 0, vz: 0 },
    restart: { type, team, spot, takerId: taker.id, startTick: s0.tick },
    controlledId: team === 'home' ? taker.id : s0.controlledId,
  };
}

/** Còn đúng 1 tick là hết hiệp (không bù giờ). */
const atHalfEnd = (s: MatchState): MatchState => ({
  ...s,
  halfTick: regulationTicks(s.halfLengthSec) - 1,
  addedMinutes: 0,
});

describe('thủ môn đội người chơi ôm bóng tối đa 6 s (B1-05)', () => {
  it('lộ hạn chót trong state; hết 6 s thì tự lấy đà phát bóng như AI', () => {
    const s0 = keeperHolding();
    let s = step(s0, NO_INPUT);
    expect(s.actionDeadline).toEqual({
      kind: 'keeper_hold',
      playerId: GK,
      startTick: s.tick,
      deadlineTick: s.tick + KEEPER_HOLD_MAX_TICKS,
    });
    const deadline = s.actionDeadline!.deadlineTick;
    while (s.tick < deadline - 1) {
      s = step(s, NO_INPUT);
      expect(s.ballOwnerId).toBe(GK);
      expect(s.windup).toBeNull();
    }
    s = run(s, 1);
    expect(s.windup).toMatchObject({ playerId: GK });
    s = run(s, KEEPER_WINDUP_TICKS);
    expect(s.ballOwnerId).not.toBe(GK);
    expect(length(s.ball.vel)).toBeGreaterThan(3);
    expect(s.actionDeadline).toBeNull();
  });

  it('người chơi tự phát bóng trước hạn thì hạn chót biến mất', () => {
    let s = run(keeperHolding(), 60);
    s = step(s, { ...NO_INPUT, pass: true });
    s = run(s, KEEPER_WINDUP_TICKS + 2);
    expect(s.ballOwnerId).not.toBe(GK);
    expect(s.actionDeadline).toBeNull();
    expect(s.tick).toBeLessThan(keeperHolding().tick + KEEPER_HOLD_MAX_TICKS);
  });

  it('autopilot (AI cầm cả đội) không có hạn chót', () => {
    const s = step({ ...keeperHolding(), autopilot: true }, NO_INPUT);
    expect(s.actionDeadline).toBeNull();
  });
});

describe('thủ môn người chơi ôm bóng không tuột bóng khi xoay gắt (B1-13)', () => {
  it('đang chạy nhanh rồi bấm ngược hướng: bóng vẫn trong tay', () => {
    const s0 = keeperHolding();
    const fast: MatchState = {
      ...s0,
      players: s0.players.map((p) => (p.id === GK ? { ...p, vel: vec2(6, 0) } : p)),
    };
    const s = step(fast, { ...NO_INPUT, move: vec2(-1, 0) });
    expect(s.ballOwnerId).toBe(GK);
    expect(s.kickLock).toBeNull();
  });
});

describe('đá phạt của người chơi tối đa 15 s', () => {
  it('đá phạt: chờ tới 15 s vẫn chưa đá, hết hạn thì máy đá hộ', () => {
    const s0 = setPiece('free_kick', 'home');
    let s = step(s0, NO_INPUT);
    expect(s.actionDeadline).toEqual({
      kind: 'free_kick',
      playerId: s0.restart!.takerId,
      startTick: s0.tick,
      deadlineTick: s0.tick + SET_PIECE_MAX_TICKS,
    });
    s = run(s, SET_PIECE_MAX_TICKS - 2);
    expect(s.restart).not.toBeNull();
    s = run(s, 1);
    expect(s.restart).toBeNull();
    expect(s.phase).toBe('play');
    expect(length(s.ball.vel)).toBeGreaterThan(3);
    expect(s.actionDeadline).toBeNull();
  });

  it('phạt đền: hết 15 s thì tự sút', () => {
    const s0 = setPiece('penalty', 'home');
    let s = run(s0, SET_PIECE_MAX_TICKS - 1);
    expect(s.restart).not.toBeNull();
    expect(s.actionDeadline).toMatchObject({ kind: 'penalty' });
    s = run(s, 1);
    expect(s.restart).toBeNull();
    expect(s.shots.home).toBe(1);
  });

  it('đang giữ nút sút lúc hết hạn: sút luôn với lực đang nạp', () => {
    let s = run(setPiece('free_kick', 'home'), SET_PIECE_MAX_TICKS - 20);
    s = run(s, 19, { ...NO_INPUT, shoot: true });
    expect(s.restart).not.toBeNull();
    s = step(s, { ...NO_INPUT, shoot: true });
    expect(s.restart).toBeNull();
    expect(s.shots.home).toBe(1);
  });

  it('đội máy vẫn tự đá sau 3 s, không có hạn chót hiển thị', () => {
    const s = run(setPiece('free_kick', 'away'), 2 * TICK_RATE);
    expect(s.restart).not.toBeNull();
    expect(s.actionDeadline).toBeNull();
  });

  it('lượt luân lưu của người chơi: hết 15 s thì tự sút (B1-10)', () => {
    const s0 = createMatch(setup);
    let s = step(atHalfEnd({ ...s0, half: 2 }), NO_INPUT);
    expect(s.phase).toBe('shootout');
    expect(s.shootout!.kicking).toBe('home');
    const start = s.restart!.startTick;
    s = run(s, SET_PIECE_MAX_TICKS - 2);
    expect(s.shootout!.kickTick).toBeNull();
    expect(s.actionDeadline).toMatchObject({
      kind: 'penalty',
      deadlineTick: start + SET_PIECE_MAX_TICKS,
    });
    s = run(s, 2);
    expect(s.shootout!.kickTick).not.toBeNull();
    // Không ai bấm gì cả trận luân lưu vẫn kết thúc.
    for (let i = 0; i < 40 * 20 * TICK_RATE && s.phase !== 'full_time'; i++) s = step(s, NO_INPUT);
    expect(s.phase).toBe('full_time');
  });
});

describe('nghỉ giữa hiệp tối đa 30 s (B1-10)', () => {
  it('không bấm gì thì hết 30 s tự đá hiệp 2', () => {
    let s = step(atHalfEnd(createMatch(setup)), NO_INPUT);
    expect(s.phase).toBe('half_time');
    expect(s.halfTimeEndTick).toBe(s.tick + HALF_TIME_MAX_TICKS);
    s = run(s, HALF_TIME_MAX_TICKS - 1);
    expect(s.phase).toBe('half_time');
    s = run(s, 1);
    expect(s.phase).toBe('kickoff');
    expect(s.half).toBe(2);
    expect(s.halfTimeEndTick).toBeNull();
  });
});

describe('còi hết hiệp chờ phạt đền / cú sút xong (B1-07)', () => {
  it('đang chờ phạt đền của đội máy: phạt đền vẫn được đá rồi mới hết hiệp, đồng hồ đứng', () => {
    let s = atHalfEnd(setPiece('penalty', 'away'));
    s = step(s, NO_INPUT);
    expect(s.phase).toBe('dead_ball');
    let kicked = false;
    for (let i = 0; i < 30 * TICK_RATE && s.phase !== 'half_time'; i++) {
      s = step(s, NO_INPUT);
      kicked ||= s.shots.away === 1;
      expect(matchClock(s).addedMinute).toBe(0);
    }
    expect(kicked).toBe(true);
    expect(s.phase).toBe('half_time');
  });

  it('phạt đền của người chơi không ai đá: tự sút sau 15 s, trận vẫn hết hiệp', () => {
    let s = atHalfEnd(setPiece('penalty', 'home'));
    const start = s.tick;
    for (let i = 0; i < 60 * TICK_RATE && s.phase !== 'half_time'; i++) s = step(s, NO_INPUT);
    expect(s.phase).toBe('half_time');
    expect(s.shots.home).toBe(1);
    expect(s.tick - start).toBeLessThanOrEqual(
      WHISTLE_PENALTY_WAIT_TICKS + WHISTLE_SHOT_WAIT_TICKS,
    );
  });

  it('cú sút đang bay vào lưới lúc hết giờ: bàn thắng được tính rồi mới thổi còi', () => {
    const s0 = createMatch(setup);
    // Thủ môn đội nhà đứng ngoài khung thành; bóng đội khách sút đang bay vào giữa khung thành.
    const players = s0.players.map((p) =>
      p.id === GK ? { ...p, pos: vec2(-HALF_LENGTH + 1, 9.5), vel: ZERO } : p,
    );
    let s: MatchState = atHalfEnd({
      ...s0,
      phase: 'play',
      ballDead: false,
      restart: null,
      players,
      ball: { pos: vec2(-HALF_LENGTH + 5, 0), vel: vec2(-22, 0), z: 0.3, vz: 0 },
      ballOwnerId: null,
      lastTouchTeam: 'away',
      lastShot: { team: 'away', tick: s0.tick },
      shotInFlight: { team: 'away', tick: s0.tick },
    });
    s = step(s, NO_INPUT);
    expect(s.phase).toBe('play');
    for (let i = 0; i < 2 * TICK_RATE && s.phase !== 'half_time'; i++) s = step(s, NO_INPUT);
    expect(s.phase).toBe('half_time');
    expect(s.score.away).toBe(1);
    expect(s.shotInFlight).toBeNull();
  });

  it('cú sút lăn mãi không tới đâu: quá 3 s thì thổi còi (giới hạn an toàn)', () => {
    const s0 = createMatch(setup);
    let s: MatchState = atHalfEnd({
      ...s0,
      phase: 'play',
      ballDead: false,
      restart: null,
      ai: null,
      ball: { pos: vec2(2, 12), vel: vec2(0.5, 0), z: 0, vz: 0 },
      ballOwnerId: null,
      lastTouchTeam: 'away',
      shotInFlight: { team: 'away', tick: s0.tick },
    });
    s = run(s, WHISTLE_SHOT_WAIT_TICKS - 1);
    expect(s.phase).toBe('play');
    s = run(s, 1);
    expect(s.phase).toBe('half_time');
  });

  it('không có phạt đền hay cú sút: thổi còi đúng giờ như cũ', () => {
    const s = step(atHalfEnd(setPiece('free_kick', 'away')), NO_INPUT);
    expect(s.phase).toBe('half_time');
  });
});
