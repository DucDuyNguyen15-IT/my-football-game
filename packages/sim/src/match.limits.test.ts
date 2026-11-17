import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, sub, vec2, ZERO, type Vec2 } from './math/vec2';
import { HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_DEPTH, PENALTY_SPOT_DIST } from './pitch';
import { matchClock, regulationTicks } from './rules/clock';
import {
  HALF_TIME_MAX_TICKS,
  KEEPER_HOLD_MAX_TICKS,
  SET_PIECE_MAX_TICKS,
  WHISTLE_PENALTY_WAIT_TICKS,
  WHISTLE_SHOT_WAIT_TICKS,
} from './rules/limits';
import { dribbleBall } from './rules/possession';
import {
  FOUL_HOLD_TICKS,
  GOAL_HOLD_TICKS,
  OUT_HOLD_TICKS,
  PENALTY_RUNUP_TICKS,
  PENALTY_STANDOFF,
  RESTART_REVEAL_TICKS,
  SHOOTOUT_HOLD_TICKS,
} from './rules/restarts';
import { KEEPER_WINDUP_TICKS } from './stats/params';
import { TICK_RATE } from './tick';
import { NO_INPUT, type MatchState, type PlayerInput, type TeamSide } from './types';

/*
 * Giới hạn thời gian (quyết định 2026-11-14, PRD §5): thủ môn đội người chơi ôm bóng tối đa 10 s, đá
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
    restart: { type, team, spot, takerId: taker.id, startTick: s0.tick, readyTick: s0.tick },
    controlledId: team === 'home' ? taker.id : s0.controlledId,
  };
}

/** Còn đúng 1 tick là hết hiệp (không bù giờ). */
const atHalfEnd = (s: MatchState): MatchState => ({
  ...s,
  halfTick: regulationTicks(s.halfLengthSec) - 1,
  addedMinutes: 0,
});

describe('thủ môn đội người chơi ôm bóng tối đa 10 s (B1-05)', () => {
  it('lộ hạn chót trong state; hết 10 s thì tự lấy đà phát bóng như AI', () => {
    const s0 = keeperHolding();
    let s = step(s0, NO_INPUT);
    expect(s.actionDeadline).toEqual({
      kind: 'keeper_hold',
      playerId: GK,
      deadlineTick: s0.ownerSinceTick + KEEPER_HOLD_MAX_TICKS,
    });
    expect(KEEPER_HOLD_MAX_TICKS).toBe(10 * TICK_RATE);
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

  it('bước ra/vào vòng cấm không đặt lại hạn: vào lại sau 10 s thì phát bóng ngay', () => {
    const s0 = keeperHolding();
    const edge = -HALF_LENGTH + PENALTY_AREA_DEPTH;
    let s: MatchState = {
      ...s0,
      players: s0.players.map((p) => (p.id === GK ? { ...p, pos: vec2(edge - 0.3, 0) } : p)),
    };
    const deadline = s0.ownerSinceTick + KEEPER_HOLD_MAX_TICKS;
    // Chạy qua lại vạch vòng cấm tới quá hạn.
    for (let i = 0; s.tick < deadline + 30 && s.windup === null; i++) {
      const gk = s.players.find((p) => p.id === GK)!;
      const dir = gk.pos.x < edge ? 1 : -1;
      s = step(s, { ...NO_INPUT, move: vec2(dir, 0) });
      if (s.actionDeadline) expect(s.actionDeadline.deadlineTick).toBe(deadline);
    }
    expect(s.windup).toMatchObject({ playerId: GK });
    expect(s.tick).toBeLessThanOrEqual(deadline + 30);
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
    // Lượt đầu không giữ hình: hạn tính từ lúc màn mở xong (luật 3).
    const ready = s.restart!.readyTick;
    expect(ready).toBe(s.restart!.startTick + RESTART_REVEAL_TICKS);
    s = run(s, ready + SET_PIECE_MAX_TICKS - s.tick - 1);
    expect(s.shootout!.kickTick).toBeNull();
    expect(s.actionDeadline).toMatchObject({
      kind: 'penalty',
      deadlineTick: ready + SET_PIECE_MAX_TICKS,
    });
    s = run(s, 1);
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

  it('thủ môn chạm nhẹ mà bóng vẫn đi vào lưới lúc hết giờ: bàn được tính rồi mới thổi còi', () => {
    const s0 = createMatch(setup);
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
      // Đội nhà vừa chạm (đổi hướng) nhưng bóng vẫn bay về khung thành nhà.
      lastTouchTeam: 'home',
      lastShot: { team: 'away', tick: s0.tick },
      shotInFlight: { team: 'away', tick: s0.tick },
    });
    s = step(s, NO_INPUT);
    expect(s.phase).toBe('play');
    for (let i = 0; i < 2 * TICK_RATE && s.phase !== 'half_time'; i++) s = step(s, NO_INPUT);
    expect(s.score.away).toBe(1);
  });

  it('thủ môn cản bóng bật ra xa khung thành lúc hết giờ: thổi còi ngay', () => {
    const s0 = createMatch(setup);
    const s = step(
      atHalfEnd({
        ...s0,
        phase: 'play',
        ballDead: false,
        restart: null,
        ball: { pos: vec2(-HALF_LENGTH + 5, 0), vel: vec2(10, 3), z: 0.3, vz: 0 },
        ballOwnerId: null,
        lastTouchTeam: 'home',
        shotInFlight: { team: 'away', tick: s0.tick },
      }),
      NO_INPUT,
    );
    expect(s.phase).toBe('half_time');
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

  it('đá phạt giữa sân, không có cú sút: thổi còi đúng giờ (đồng hồ chậm nên trễ tối đa 1 tick)', () => {
    let s = step(atHalfEnd(setPiece('free_kick', 'away')), NO_INPUT);
    if (s.phase === 'dead_ball') s = step(s, NO_INPUT);
    expect(s.phase).toBe('half_time');
  });
});

describe('hạn 15 s cho mọi tình huống cố định, tính từ lúc chuyển cảnh xong (luật 3)', () => {
  /** Bóng sống đang lăn (đội khách chạm cuối) tới khi bóng chết. */
  function untilDead(pos: Vec2, vel: Vec2): MatchState {
    const s0 = createMatch(setup);
    let s: MatchState = {
      ...s0,
      phase: 'play',
      ballDead: false,
      restart: null,
      lastTouchTeam: 'away',
      ball: { pos, vel, z: 0, vz: 0 },
    };
    for (let i = 0; i < 5 * TICK_RATE && !s.restart; i++) s = step(s, NO_INPUT);
    return s;
  }

  it.each([
    ['throw_in', vec2(5, HALF_WIDTH - 0.5), vec2(0, 10)],
    ['corner', vec2(HALF_LENGTH - 0.5, 10), vec2(10, 0)],
    ['goal_kick', vec2(-HALF_LENGTH + 0.5, 10), vec2(-10, 0)],
  ] as const)(
    '%s của người chơi: hạn = tick bóng chết + giữ hình 0,6 s + mở màn + 15 s; hết hạn máy làm hộ',
    (type, pos, vel) => {
      let s = untilDead(pos, vel);
      const r = s.restart!;
      expect(r).toMatchObject({ type, team: 'home' });
      expect(r.readyTick).toBe(r.startTick + OUT_HOLD_TICKS + RESTART_REVEAL_TICKS);
      s = step(s, NO_INPUT);
      const deadlineTick = r.readyTick + SET_PIECE_MAX_TICKS;
      expect(s.actionDeadline).toEqual({ kind: type, playerId: r.takerId, deadlineTick });
      // Tới sát hạn vẫn chờ người chơi (trước đây các tình huống này chờ vô hạn).
      s = run(s, deadlineTick - s.tick - 1);
      expect(s.restart).not.toBeNull();
      expect(s.windup).toBeNull();
      // Hết hạn: máy thực hiện hộ (phát bóng thì thủ môn lấy đà rồi bóng mới đi).
      s = run(s, 1 + (type === 'goal_kick' ? KEEPER_WINDUP_TICKS : 0));
      expect(s.restart).toBeNull();
      expect(s.phase).toBe('play');
      expect(length(s.ball.vel)).toBeGreaterThan(3);
      expect(s.actionDeadline).toBeNull();
    },
  );

  it('giao bóng của người chơi: đầu trận hạn = mở màn + 15 s, hết hạn máy giao bóng hộ', () => {
    let s = step(createMatch(setup), NO_INPUT);
    const r = s.restart!;
    expect(r.readyTick).toBe(RESTART_REVEAL_TICKS);
    const deadlineTick = RESTART_REVEAL_TICKS + SET_PIECE_MAX_TICKS;
    expect(s.actionDeadline).toEqual({ kind: 'kickoff', playerId: r.takerId, deadlineTick });
    s = run(s, deadlineTick - s.tick - 1);
    expect(s.phase).toBe('kickoff');
    s = step(s, NO_INPUT);
    expect(s.phase).toBe('play');
  });

  it('bấm chuyền trước hạn thì người chơi tự thực hiện, hạn chót mất', () => {
    let s = run(untilDead(vec2(5, HALF_WIDTH - 0.5), vec2(0, 10)), 5 * TICK_RATE);
    expect(s.actionDeadline).not.toBeNull();
    s = step(s, { ...NO_INPUT, pass: true });
    expect(s.phase).toBe('play');
    expect(s.actionDeadline).toBeNull();
  });

  it('giao bóng sau bàn thắng giữ hình GOAL_HOLD_TICKS; đội máy được hưởng thì không có hạn chót', () => {
    // Bóng lăn vào lưới đội khách (hiệp 1 đội nhà tấn công về +x): đội khách giao bóng.
    const scored = untilDead(vec2(HALF_LENGTH - 0.5, 0), vec2(10, 0));
    expect(scored.score.home).toBe(1);
    const r = scored.restart!;
    expect(r).toMatchObject({ type: 'kickoff', team: 'away' });
    expect(r.readyTick).toBe(r.startTick + GOAL_HOLD_TICKS + RESTART_REVEAL_TICKS);
    expect(step(scored, NO_INPUT).actionDeadline).toBeNull();
  });

  it('các mốc giữ hình khớp phần hiển thị: phạm lỗi 1,25 s, bóng ra biên 0,6 s, luân lưu 1 s', () => {
    expect(FOUL_HOLD_TICKS).toBe(1.25 * TICK_RATE);
    expect(OUT_HOLD_TICKS).toBe(0.6 * TICK_RATE);
    expect(SHOOTOUT_HOLD_TICKS).toBe(TICK_RATE);
  });
});

describe('tình huống cố định: đồng hồ chậm, lấy đà phạt đền, chờ hết pha tấn công', () => {
  it('chờ thực hiện đá phạt: đồng hồ trận chạy nửa tốc độ', () => {
    const s0 = setPiece('free_kick', 'away');
    const s = run(s0, 20);
    expect(s.halfTick - s0.halfTick).toBe(10);
  });

  it('máy đá phạt đền: đứng lùi lấy đà, chạy vào bóng trong PENALTY_RUNUP_TICKS rồi mới sút', () => {
    let s = setPiece('penalty', 'away');
    const gap = (x: MatchState) => {
      const t = x.players.find((p) => p.id === x.restart!.takerId)!;
      return length(sub(t.pos, x.restart!.spot));
    };
    for (let i = 0; i < 20 * TICK_RATE && !s.restart?.penaltyRunUp; i++) s = step(s, NO_INPUT);
    const run0 = s.restart!.penaltyRunUp!;
    expect(gap(s)).toBeGreaterThan(PENALTY_STANDOFF - 0.3);
    let ticks = 0;
    let moving = false;
    while (s.restart) {
      const g = gap(s);
      s = step(s, NO_INPUT);
      if (s.restart) moving ||= gap(s) < g;
      ticks++;
    }
    expect(moving).toBe(true);
    expect(s.tick).toBe(run0.releaseTick);
    expect(ticks).toBeLessThanOrEqual(PENALTY_RUNUP_TICKS);
    expect(PENALTY_RUNUP_TICKS).toBeGreaterThan(TICK_RATE);
  });

  it('đá phạt gần khung thành vừa đá đi thì bắt đầu theo dõi pha tấn công', () => {
    const base = setPiece('free_kick', 'away');
    const spot = vec2(-(HALF_LENGTH - 15), 0);
    let s: MatchState = {
      ...base,
      ball: { pos: spot, vel: ZERO, z: 0, vz: 0 },
      restart: { ...base.restart!, spot },
    };
    for (let i = 0; i < 20 * TICK_RATE && s.restart; i++) s = step(s, NO_INPUT);
    expect(s.restart).toBeNull();
    expect(s.setPieceThreat?.team).toBe('away');
  });

  /** Hết giờ, bóng đang tranh chấp trong vòng cấm đội khách sau phạt góc của đội nhà. */
  function scramble(): MatchState {
    const s0 = createMatch(setup);
    return atHalfEnd({
      ...s0,
      phase: 'play',
      ballDead: false,
      restart: null,
      ai: null,
      ball: { pos: vec2(HALF_LENGTH - 9, 4), vel: vec2(0, 0.5), z: 0, vz: 0 },
      ballOwnerId: null,
      lastTouchTeam: 'home',
      setPieceThreat: { team: 'home', untilTick: s0.tick + 10 * TICK_RATE },
    });
  }

  it('bóng còn tranh chấp gần khung thành: chưa thổi còi hết hiệp', () => {
    expect(run(scramble(), 5).phase).toBe('play');
  });

  it('đội phòng ngự phá bóng ra xa: thổi còi', () => {
    const s = scramble();
    const cleared = step(
      { ...s, ball: { ...s.ball, pos: vec2(5, 0), vel: vec2(-20, 0) } },
      NO_INPUT,
    );
    expect(cleared.phase).toBe('half_time');
  });

  it('đội phòng ngự giành bóng: thổi còi', () => {
    const s = scramble();
    const defender = s.players.find((p) => p.team === 'away' && p.position !== 'GK')!;
    const players = s.players.map((p) =>
      p.id === defender.id ? { ...p, pos: vec2(HALF_LENGTH - 10, 4), vel: ZERO } : p,
    );
    const won = {
      ...s,
      players,
      ballOwnerId: defender.id,
      ball: dribbleBall(players.find((p) => p.id === defender.id)!),
    };
    expect(step(won, NO_INPUT).phase).toBe('half_time');
  });

  it('pha tấn công kéo dài: quá hạn thì vẫn thổi còi', () => {
    const s = scramble();
    const due = run({ ...s, setPieceThreat: { team: 'home', untilTick: s.tick + 3 } }, 6);
    expect(due.phase).toBe('half_time');
  });
});
