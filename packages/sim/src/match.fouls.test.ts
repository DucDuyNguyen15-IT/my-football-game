import { describe, expect, it } from 'vitest';
import { attackSign } from './actions/shoot';
import { TACKLE_RECOVERY_TICKS } from './actions/tackle';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, sub, vec2, ZERO, type Vec2 } from './math/vec2';
import { HALF_LENGTH, isInPenaltyArea, PENALTY_SPOT_DIST } from './pitch';
import { nextFloat, seedRng, type RngState } from './rng';
import { ROUGH_RED_CHANCE } from './rules/fouls';
import { dribbleBall } from './rules/possession';
import { RESTART_DELAY_TICKS } from './rules/restarts';
import { tackleWinChance } from './stats/params';
import { NO_INPUT, type Booking, type MatchState, type PlayerInput } from './types';

/*
 * Xoạc, phạm lỗi, thẻ phạt trong `step` (task 5.6). Người chơi cầm home-P1, đội khách (tấn công về −x
 * ở hiệp 1) có away-P4 dẫn bóng. Mọi cầu thủ khác đứng xa ở hai biên để không xen vào.
 */

const setup = { home: starterLikeTeam, away: cpuEasyTeam, seed: 3, difficulty: 'easy' as const };
const press = (over: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...over });
const K = press({ shoot: true });
const J = press({ pass: true });
const repeat = (s: MatchState, input: PlayerInput, n: number): MatchState => {
  let cur = s;
  for (let i = 0; i < n; i++) cur = step(cur, input);
  return cur;
};
const playerOf = (s: MatchState, id: string) => s.players.find((p) => p.id === id)!;

const ME = 'home-P1';
const OWNER = 'away-P4';

interface Scene {
  /** Vị trí người dẫn bóng đội khách. */
  owner: Vec2;
  /** Hướng mặt người dẫn bóng (mặc định −x: về khung thành đội nhà). */
  ownerFacing?: Vec2;
  me: Vec2;
  meVel?: Vec2;
  rng?: RngState;
  bookings?: Booking[];
}

function scene({
  owner,
  ownerFacing = vec2(-1, 0),
  me,
  meVel = ZERO,
  rng,
  bookings,
}: Scene): MatchState {
  const s = createMatch(setup);
  const players = s.players.map((p, i) => {
    const far = { ...p, pos: vec2(-12 + (i % 7) * 4, i < 7 ? -18 : 18), vel: ZERO };
    if (p.id === OWNER) return { ...far, pos: owner, facing: ownerFacing };
    if (p.id === ME) return { ...far, pos: me, vel: meVel, facing: vec2(1, 0) };
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
    bookings: bookings ?? [],
  };
}

/** Seed đầu tiên (thứ tự cố định) có lần tung kế tiếp thoả `pred`. */
function rngWhere(pred: (roll: number) => boolean): RngState {
  for (let seed = 1; seed < 10_000; seed++) {
    const rng = seedRng(seed);
    if (pred(nextFloat(rng)[0])) return rng;
  }
  throw new Error('không tìm được seed');
}

const s0 = createMatch(setup);
const winChance = tackleWinChance(
  playerOf(s0, ME).stats.defending,
  playerOf(s0, OWNER).stats.dribbling,
);
const missRoll = rngWhere((r) => r >= winChance);
const winRoll = rngWhere((r) => r < winChance);

/** Xoạc trực diện: người chơi đứng trước mặt người dẫn bóng, bóng nằm giữa hai người. */
const frontal = (owner: Vec2, rng: RngState) =>
  scene({ owner, me: vec2(owner.x - 1.2, owner.y), rng });

describe('xoạc trực diện', () => {
  it('trúng bóng → giành bóng, người bị xoạc không bắt lại được ngay, bóng vẫn sống', () => {
    const s = step(frontal(vec2(0, 0), winRoll), K);
    expect(s.phase).toBe('play');
    expect(s.ballOwnerId).toBe(ME);
    expect(s.kickLock?.playerId).toBe(OWNER);
    expect(s.bookings).toEqual([]);
  });

  it('giữ K sau khi giành bóng không thành nạp lực sút', () => {
    const s = repeat(frontal(vec2(0, 0), winRoll), K, 10);
    expect(s.ballOwnerId).toBe(ME);
    expect(s.shotChargeTicks).toBe(0);
  });

  it('trượt bóng (không chạm bóng trước) → phạm lỗi, đội khách đá phạt tại chỗ, không thẻ', () => {
    const before = frontal(vec2(0, 5), missRoll);
    const s = step(before, K);
    expect(s.phase).toBe('dead_ball');
    expect(s.ballDead).toBe(true);
    expect(s.restart).toMatchObject({ type: 'free_kick', team: 'away' });
    expect(length(sub(s.restart!.spot, vec2(0, 5)))).toBeLessThan(1e-9);
    expect(s.ball.pos).toEqual(s.restart!.spot);
    expect(s.bookings).toEqual([]);
    expect(s.players).toHaveLength(14);
    expect(s.rng).not.toBe(before.rng);
  });

  it('chạm người nhưng bóng ngoài tầm → phạm lỗi, không cần tung xác suất', () => {
    // Đứng sát vai người dẫn bóng, bóng ở phía trước người đó, xa hơn tầm xoạc.
    const before = scene({ owner: vec2(0, 0), ownerFacing: vec2(0, -1), me: vec2(0, 1.2) });
    const tooFar = { ...before, ball: { ...before.ball, pos: vec2(0, -3) } };
    const s = step(tooFar, K);
    expect(s.restart?.type).toBe('free_kick');
    expect(s.rng).toBe(tooFar.rng);
  });

  it('phạm lỗi trong vòng cấm đội nhà → phạt đền cho đội khách', () => {
    const owner = vec2(-HALF_LENGTH + 6, 3);
    expect(isInPenaltyArea(owner, -1)).toBe(true);
    const s = step(frontal(owner, missRoll), K);
    expect(s.restart).toMatchObject({
      type: 'penalty',
      team: 'away',
      spot: vec2(-HALF_LENGTH + PENALTY_SPOT_DIST, 0),
    });
  });

  it('hiệp 2 đổi sân: vòng cấm đội nhà ở phía +x', () => {
    const before = { ...frontal(vec2(HALF_LENGTH - 6, 0), missRoll), half: 2 as const };
    const s = step(before, K);
    expect(s.restart).toMatchObject({
      type: 'penalty',
      spot: vec2(HALF_LENGTH - PENALTY_SPOT_DIST, 0),
    });
  });
});

describe('xoạc từ phía sau', () => {
  /** Người dẫn bóng quay về −x; người chơi đứng sau lưng (phía +x). */
  const behind = (owner: Vec2, extra: Partial<Scene> = {}) =>
    scene({ owner, me: vec2(owner.x + 1, owner.y), ...extra });

  it('luôn là phạm lỗi, dù bóng trong tầm', () => {
    const s = step(behind(vec2(15, 0), { rng: winRoll }), K);
    expect(s.restart?.type).toBe('free_kick');
  });

  it('đối phương đang đối mặt khung thành → thẻ vàng, chưa rời sân', () => {
    const s = step(behind(vec2(-10, 0)), K);
    expect(s.restart).toMatchObject({ type: 'free_kick', team: 'away' });
    expect(s.bookings).toEqual([{ playerId: ME, team: 'home', card: 'yellow', tick: s.tick }]);
    expect(s.players).toHaveLength(14);
  });

  it('không đối mặt khung thành (quay lưng về khung thành) → không thẻ', () => {
    const s = step(behind(vec2(-10, 0), { ownerFacing: vec2(1, 0), me: vec2(-11, 0) }), K);
    expect(s.restart?.type).toBe('free_kick');
    expect(s.bookings).toEqual([]);
  });

  it('vàng thứ hai → đỏ, cầu thủ rời sân, đội nhà còn 6 người, người chơi được đổi sang người khác', () => {
    const first: Booking = { playerId: ME, team: 'home', card: 'yellow', tick: 100 };
    const s = step(behind(vec2(-10, 0), { bookings: [first] }), K);
    expect(s.bookings.slice(1)).toEqual([
      { playerId: ME, team: 'home', card: 'yellow', tick: s.tick },
      { playerId: ME, team: 'home', card: 'red', tick: s.tick },
    ]);
    expect(s.players.find((p) => p.id === ME)).toBeUndefined();
    expect(s.players.filter((p) => p.team === 'home')).toHaveLength(6);
    expect(s.players.filter((p) => p.team === 'away')).toHaveLength(7);
    expect(s.controlledId).not.toBe(ME);
    expect(playerOf(s, s.controlledId).team).toBe('home');
  });

  it('chơi tiếp sau thẻ đỏ: đội máy đá phạt, trận vẫn chạy và state serialize được', () => {
    const first: Booking = { playerId: ME, team: 'home', card: 'yellow', tick: 100 };
    const red = step(behind(vec2(-10, 0), { bookings: [first] }), K);
    expect(JSON.parse(JSON.stringify(red))).toEqual(red);
    const s = repeat(red, NO_INPUT, RESTART_DELAY_TICKS + 30);
    expect(s.phase).not.toBe('dead_ball');
    expect(s.players.filter((p) => p.team === 'home')).toHaveLength(6);
  });

  describe('xoạc thô bạo (lao từ sau với tốc độ cao)', () => {
    // Người dẫn bóng ở giữa sân, không đối mặt khung thành → chỉ còn xác suất đỏ trực tiếp.
    const rough = (rng: RngState) => behind(vec2(10, 0), { meVel: vec2(-6, 0), rng });
    const redRng = rngWhere((r) => r < ROUGH_RED_CHANCE);
    const noRedRng = rngWhere((r) => r >= ROUGH_RED_CHANCE);

    it('seed cố định ra thẻ đỏ trực tiếp → rời sân', () => {
      const s = step(rough(redRng), K);
      expect(s.bookings).toEqual([{ playerId: ME, team: 'home', card: 'red', tick: s.tick }]);
      expect(s.players.filter((p) => p.team === 'home')).toHaveLength(6);
    });

    it('seed cố định khác không ra thẻ', () => {
      const s = step(rough(noRedRng), K);
      expect(s.restart?.type).toBe('free_kick');
      expect(s.bookings).toEqual([]);
      expect(s.players).toHaveLength(14);
    });

    it('cùng seed thì cùng kết quả (tất định)', () => {
      expect(step(rough(redRng), K)).toEqual(step(rough(redRng), K));
    });

    it('chạy chậm từ phía sau thì không phải thô bạo: không tung xác suất đỏ', () => {
      const slow = behind(vec2(10, 0), { meVel: vec2(-2, 0), rng: redRng });
      const s = step(slow, K);
      expect(s.bookings).toEqual([]);
      expect(s.rng).toBe(slow.rng);
    });
  });
});

describe('xoạc hụt', () => {
  const far = () => scene({ owner: vec2(10, 0), me: vec2(0, 0) });

  it('không có ai trong tầm → trượt theo hướng mặt, không phạm lỗi, bóng vẫn của đối phương', () => {
    const s = step(far(), K);
    expect(s.phase).toBe('play');
    expect(s.ballOwnerId).toBe(OWNER);
    expect(s.tackleRecovery[ME]).toBe(s.tick + TACKLE_RECOVERY_TICKS);
    expect(playerOf(s, ME).vel.x).toBeGreaterThan(4);
  });

  it('đang trượt/đứng dậy thì không điều khiển được và không xoạc lại được', () => {
    const slid = repeat(step(far(), K), press({ move: vec2(0, 1) }), TACKLE_RECOVERY_TICKS - 2);
    expect(playerOf(slid, ME).pos.y).toBeCloseTo(0, 5);
    const again = step(slid, K);
    expect(again.tackleRecovery[ME]).toBe(slid.tackleRecovery[ME]);
  });

  it('hồi xong thì chạy lại bình thường', () => {
    const s = repeat(step(far(), K), press({ move: vec2(0, 1) }), TACKLE_RECOVERY_TICKS + 30);
    expect(s.tackleRecovery[ME]).toBeUndefined();
    expect(playerOf(s, ME).pos.y).toBeGreaterThan(0.5);
  });
});

describe('thực hiện đá phạt / phạt đền', () => {
  /** Đội nhà được hưởng, người chơi đứng sẵn sau bóng. */
  function homeRestart(type: 'free_kick' | 'penalty', spot: Vec2): MatchState {
    const s = createMatch(setup);
    return {
      ...s,
      phase: 'dead_ball',
      restart: { type, team: 'home', spot, takerId: ME, startTick: 0 },
      players: s.players.map((p) =>
        p.id === ME ? { ...p, pos: vec2(spot.x - 0.6, spot.y), facing: vec2(1, 0) } : p,
      ),
      ball: { pos: spot, vel: ZERO, z: 0, vz: 0 },
      controlledId: ME,
    };
  }

  it('đá phạt: đội người chờ, bấm J để chuyền', () => {
    const fk = homeRestart('free_kick', vec2(0, 0));
    expect(repeat(fk, NO_INPUT, 300).phase).toBe('dead_ball');
    const s = step(fk, J);
    expect(s.phase).toBe('play');
    expect(length(s.ball.vel)).toBeGreaterThan(0);
  });

  it('đá phạt: giữ rồi thả K để sút thẳng về khung thành', () => {
    const fk = homeRestart('free_kick', vec2(10, 0));
    const charging = repeat(fk, K, 30);
    expect(charging.phase).toBe('dead_ball');
    expect(charging.shotChargeTicks).toBe(30);
    const s = step(charging, NO_INPUT);
    expect(s.phase).toBe('play');
    expect(s.ball.vel.x).toBeGreaterThan(10);
  });

  it('phạt đền: J không làm gì, chỉ sút bằng K', () => {
    const pk = homeRestart('penalty', vec2(HALF_LENGTH - PENALTY_SPOT_DIST, 0));
    expect(step(pk, J).phase).toBe('dead_ball');
    const s = step(repeat(pk, K, 40), NO_INPUT);
    expect(s.phase).toBe('play');
    expect(s.ball.vel.x).toBeGreaterThan(10);
  });

  it('phạt đền của đội máy: thủ môn đội nhà đứng giữa khung, người khác ra ngoài vòng cấm, máy tự sút sau 3 s', () => {
    const goalSide = attackSign('away', 1);
    const pk = step(frontal(vec2(goalSide * (HALF_LENGTH - 6), 2), missRoll), K);
    expect(pk.restart?.type).toBe('penalty');
    const gk = pk.players.find((p) => p.team === 'home' && p.position === 'GK')!;
    expect(gk.pos.y).toBe(0);
    expect(Math.abs(gk.pos.x)).toBeGreaterThan(HALF_LENGTH - 1);
    for (const p of pk.players) {
      if (p.id === pk.restart!.takerId || p.id === gk.id) continue;
      expect(isInPenaltyArea(p.pos, goalSide)).toBe(false);
    }
    const waited = repeat(pk, NO_INPUT, RESTART_DELAY_TICKS - 1);
    expect(waited.phase).toBe('dead_ball');
    const shot = step(waited, NO_INPUT);
    expect(shot.phase).toBe('play');
    expect(Math.sign(shot.ball.vel.x)).toBe(goalSide);
    expect(length(shot.ball.vel)).toBeGreaterThan(15);
  });
});
