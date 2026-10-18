import { describe, expect, it } from 'vitest';
import { attackSign } from './actions/shoot';
import {
  TACKLE_POKE_SPEED,
  TACKLE_RECOVERY_TICKS,
  VICTIM_FALL_TICKS,
  VICTIM_STUMBLE_TICKS,
} from './actions/tackle';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, sub, vec2, ZERO, type Vec2 } from './math/vec2';
import { HALF_LENGTH, isInPenaltyArea, PENALTY_SPOT_DIST } from './pitch';
import { nextFloat, seedRng, type RngState } from './rng';
import { isKeeperHandling, ROUGH_RED_CHANCE } from './rules/fouls';
import { dribbleBall } from './rules/possession';
import { holdRestart, RESTART_DELAY_TICKS, RESTART_SETUP_MAX_TICKS } from './rules/restarts';
import { tackleWinChance } from './stats/params';
import { NO_INPUT, type Booking, type MatchState, type PlayerInput } from './types';

/*
 * Xoạc, phạm lỗi, thẻ phạt trong `step` (task 5.6). Người chơi cầm home-P1, đội khách (tấn công về −x
 * ở hiệp 1) có away-P4 dẫn bóng. Mọi cầu thủ khác đứng xa ở hai biên để không xen vào.
 */

const setup = { home: starterLikeTeam, away: cpuEasyTeam, seed: 3, difficulty: 'easy' as const };
const press = (over: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...over });
/** A: chuyền bổng, khi không có bóng = xoạc. D: sút. */
const A = press({ lob: true });
const D = press({ shoot: true });
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
  it('trúng bóng → bóng bật ra theo hướng xoạc, người xoạc nằm trượt, bóng vẫn sống, không thẻ', () => {
    const s = step(frontal(vec2(0, 0), winRoll), A);
    expect(s.phase).toBe('play');
    expect(s.ballOwnerId).toBeNull();
    expect(s.ball.vel.x).toBeGreaterThan(TACKLE_POKE_SPEED - 1);
    expect(s.tackleRecovery[ME]).toBe(s.tick + TACKLE_RECOVERY_TICKS);
    expect(s.kickLock?.playerId).toBe(OWNER);
    expect(s.bookings).toEqual([]);
    expect(s.lastTackle).toMatchObject({
      tick: s.tick,
      tacklerId: ME,
      victimId: OWNER,
      outcome: 'won',
    });
  });

  it('trúng bóng → người bị xoạc ngã hoặc vấp (tất định theo seed), không ai trong hai người bắt lại bóng ngay', () => {
    const s = step(frontal(vec2(0, 0), winRoll), A);
    const reaction = s.lastTackle?.victimReaction;
    expect(['fall', 'stumble']).toContain(reaction);
    const ticks = reaction === 'fall' ? VICTIM_FALL_TICKS : VICTIM_STUMBLE_TICKS;
    expect(s.tackleRecovery[OWNER]).toBe(s.tick + ticks);
    const later = repeat(s, NO_INPUT, 10);
    expect(later.ballOwnerId === ME || later.ballOwnerId === OWNER).toBe(false);
    expect(step(frontal(vec2(0, 0), winRoll), A).lastTackle).toEqual(s.lastTackle);
  });

  it('trúng bóng: có seed làm người bị xoạc ngã, có seed chỉ vấp', () => {
    const reactions = new Set<string | null | undefined>();
    for (let seed = 1; seed < 400 && reactions.size < 2; seed++) {
      const rng = seedRng(seed);
      if (nextFloat(rng)[0] >= winChance) continue;
      reactions.add(step(frontal(vec2(0, 0), rng), A).lastTackle?.victimReaction);
    }
    expect(reactions).toEqual(new Set(['fall', 'stumble']));
  });

  it('giữ nút sút từ trước khi có bóng không thành nạp lực sút', () => {
    const s = repeat(frontal(vec2(0, 0), winRoll), press({ lob: true, shoot: true }), 10);
    expect(s.shotChargeTicks).toBe(0);
  });

  it('trượt bóng (không chạm bóng trước) → phạm lỗi, đội khách đá phạt tại chỗ, không thẻ', () => {
    const before = frontal(vec2(0, 5), missRoll);
    const s = step(before, A);
    expect(s.phase).toBe('dead_ball');
    expect(s.ballDead).toBe(true);
    expect(s.restart).toMatchObject({ type: 'free_kick', team: 'away' });
    expect(length(sub(s.restart!.spot, vec2(0, 5)))).toBeLessThan(1e-9);
    expect(s.ball.pos).toEqual(s.restart!.spot);
    expect(s.bookings).toEqual([]);
    expect(s.players).toHaveLength(14);
    expect(s.rng).not.toBe(before.rng);
    expect(s.lastTackle).toMatchObject({ tacklerId: ME, victimId: OWNER, outcome: 'foul' });
  });

  it('chạm người nhưng bóng ngoài tầm → phạm lỗi, không cần tung xác suất', () => {
    // Đứng sát vai người dẫn bóng, bóng ở phía trước người đó, xa hơn tầm xoạc.
    const before = scene({ owner: vec2(0, 0), ownerFacing: vec2(0, -1), me: vec2(0, 1.2) });
    const tooFar = { ...before, ball: { ...before.ball, pos: vec2(0, -3) } };
    const s = step(tooFar, A);
    expect(s.restart?.type).toBe('free_kick');
    expect(s.rng).toBe(tooFar.rng);
  });

  it('phạm lỗi trong vòng cấm đội nhà → phạt đền cho đội khách', () => {
    const owner = vec2(-HALF_LENGTH + 6, 3);
    expect(isInPenaltyArea(owner, -1)).toBe(true);
    const s = step(frontal(owner, missRoll), A);
    expect(s.restart).toMatchObject({
      type: 'penalty',
      team: 'away',
      spot: vec2(-HALF_LENGTH + PENALTY_SPOT_DIST, 0),
    });
  });

  it('hiệp 2 đổi sân: vòng cấm đội nhà ở phía +x', () => {
    const before = { ...frontal(vec2(HALF_LENGTH - 6, 0), missRoll), half: 2 as const };
    const s = step(before, A);
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
    const s = step(behind(vec2(15, 0), { rng: winRoll }), A);
    expect(s.restart?.type).toBe('free_kick');
  });

  it('đối phương đang đối mặt khung thành → thẻ vàng, chưa rời sân', () => {
    const s = step(behind(vec2(-10, 0)), A);
    expect(s.restart).toMatchObject({ type: 'free_kick', team: 'away' });
    expect(s.bookings).toEqual([{ playerId: ME, team: 'home', card: 'yellow', tick: s.tick }]);
    expect(s.players).toHaveLength(14);
  });

  it('không đối mặt khung thành (quay lưng về khung thành) → không thẻ', () => {
    const s = step(behind(vec2(-10, 0), { ownerFacing: vec2(1, 0), me: vec2(-11, 0) }), A);
    expect(s.restart?.type).toBe('free_kick');
    expect(s.bookings).toEqual([]);
  });

  it('vàng thứ hai → đỏ, cầu thủ rời sân, đội nhà còn 6 người, người chơi được đổi sang người khác', () => {
    const first: Booking = { playerId: ME, team: 'home', card: 'yellow', tick: 100 };
    const s = step(behind(vec2(-10, 0), { bookings: [first] }), A);
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
    const red = step(behind(vec2(-10, 0), { bookings: [first] }), A);
    expect(JSON.parse(JSON.stringify(red))).toEqual(red);
    // Mọi người đi về vị trí (tối đa RESTART_SETUP_MAX_TICKS) rồi máy mới đá.
    const s = repeat(red, NO_INPUT, RESTART_SETUP_MAX_TICKS + RESTART_DELAY_TICKS);
    expect(s.phase).not.toBe('dead_ball');
    expect(s.players.filter((p) => p.team === 'home')).toHaveLength(6);
  });

  describe('xoạc thô bạo (lao từ sau với tốc độ cao)', () => {
    // Người dẫn bóng ở giữa sân, không đối mặt khung thành → chỉ còn xác suất đỏ trực tiếp.
    const rough = (rng: RngState) => behind(vec2(10, 0), { meVel: vec2(-6, 0), rng });
    const redRng = rngWhere((r) => r < ROUGH_RED_CHANCE);
    const noRedRng = rngWhere((r) => r >= ROUGH_RED_CHANCE);

    it('seed cố định ra thẻ đỏ trực tiếp → rời sân', () => {
      const s = step(rough(redRng), A);
      expect(s.bookings).toEqual([{ playerId: ME, team: 'home', card: 'red', tick: s.tick }]);
      expect(s.players.filter((p) => p.team === 'home')).toHaveLength(6);
    });

    it('seed cố định khác không ra thẻ', () => {
      const s = step(rough(noRedRng), A);
      expect(s.restart?.type).toBe('free_kick');
      expect(s.bookings).toEqual([]);
      expect(s.players).toHaveLength(14);
    });

    it('cùng seed thì cùng kết quả (tất định)', () => {
      expect(step(rough(redRng), A)).toEqual(step(rough(redRng), A));
    });

    it('chạy chậm từ phía sau thì không phải thô bạo: không tung xác suất đỏ', () => {
      const slow = behind(vec2(10, 0), { meVel: vec2(-2, 0), rng: redRng });
      const s = step(slow, A);
      expect(s.bookings).toEqual([]);
      expect(s.rng).toBe(slow.rng);
    });
  });
});

describe('xoạc hụt', () => {
  const far = () => scene({ owner: vec2(10, 0), me: vec2(0, 0) });

  it('không có ai trong tầm → trượt theo hướng mặt, không phạm lỗi, bóng vẫn của đối phương', () => {
    const s = step(far(), A);
    expect(s.phase).toBe('play');
    expect(s.ballOwnerId).toBe(OWNER);
    expect(s.tackleRecovery[ME]).toBe(s.tick + TACKLE_RECOVERY_TICKS);
    expect(playerOf(s, ME).vel.x).toBeGreaterThan(4);
    expect(s.lastTackle).toMatchObject({ tacklerId: ME, victimId: null, outcome: 'miss' });
    expect(s.tackleRecovery[OWNER]).toBeUndefined();
  });

  it('trượt đi một đoạn (2,5–5 m) theo hướng mặt rồi dừng', () => {
    const s = repeat(step(far(), A), NO_INPUT, TACKLE_RECOVERY_TICKS - 2);
    expect(playerOf(s, ME).pos.x).toBeGreaterThan(2.5);
    expect(playerOf(s, ME).pos.x).toBeLessThan(5);
    expect(length(playerOf(s, ME).vel)).toBeLessThan(0.01);
  });

  it('chạy nước rút rồi xoạc cũng không trượt quá xa', () => {
    const sprinting = scene({ owner: vec2(20, 0), me: vec2(0, 0), meVel: vec2(9, 0) });
    const s = repeat(step(sprinting, A), NO_INPUT, TACKLE_RECOVERY_TICKS - 2);
    expect(playerOf(s, ME).pos.x).toBeLessThan(5.5);
  });

  it('đang trượt/đứng dậy thì không điều khiển được và không xoạc lại được', () => {
    const slid = repeat(step(far(), A), press({ move: vec2(0, 1) }), TACKLE_RECOVERY_TICKS - 2);
    expect(playerOf(slid, ME).pos.y).toBeCloseTo(0, 5);
    const again = step(slid, A);
    expect(again.tackleRecovery[ME]).toBe(slid.tackleRecovery[ME]);
  });

  it('hồi xong thì chạy lại bình thường', () => {
    const s = repeat(step(far(), A), press({ move: vec2(0, 1) }), TACKLE_RECOVERY_TICKS + 30);
    expect(s.tackleRecovery[ME]).toBeUndefined();
    expect(playerOf(s, ME).pos.y).toBeGreaterThan(0.5);
  });
});

describe('thực hiện đá phạt / phạt đền', () => {
  /** Đội nhà được hưởng, mọi người đã đứng sẵn vào vị trí (người chơi sau bóng). */
  function homeRestart(type: 'free_kick' | 'penalty', spot: Vec2): MatchState {
    const s = createMatch(setup);
    const restart = { type, team: 'home' as const, spot, takerId: ME, startTick: 0 };
    const facing = s.players.map((p) => (p.id === ME ? { ...p, facing: vec2(1, 0) } : p));
    return {
      ...s,
      phase: 'dead_ball',
      restart,
      players: holdRestart(facing, restart, 1),
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

  it('đá phạt: giữ rồi thả D để sút thẳng về khung thành', () => {
    const fk = homeRestart('free_kick', vec2(10, 0));
    const charging = repeat(fk, D, 30);
    expect(charging.phase).toBe('dead_ball');
    expect(charging.shotChargeTicks).toBe(30);
    const s = step(charging, NO_INPUT);
    expect(s.phase).toBe('play');
    expect(s.ball.vel.x).toBeGreaterThan(10);
  });

  it('phạt đền: S không làm gì, chỉ sút bằng D', () => {
    const pk = homeRestart('penalty', vec2(HALF_LENGTH - PENALTY_SPOT_DIST, 0));
    expect(step(pk, J).phase).toBe('dead_ball');
    const s = step(repeat(pk, D, 40), NO_INPUT);
    expect(s.phase).toBe('play');
    expect(s.ball.vel.x).toBeGreaterThan(10);
  });

  it('phạt đền của đội máy: thủ môn đội nhà đứng giữa khung, người khác ra ngoài vòng cấm, máy tự sút sau 3 s', () => {
    const goalSide = attackSign('away', 1);
    const pk = step(frontal(vec2(goalSide * (HALF_LENGTH - 6), 2), missRoll), A);
    expect(pk.restart?.type).toBe('penalty');
    // Mọi người tự đi về vị trí; xong và đủ 3 s thì máy mới sút.
    let waited = pk;
    while (step(waited, NO_INPUT).phase === 'dead_ball') waited = step(waited, NO_INPUT);
    expect(waited.tick - pk.restart!.startTick).toBeGreaterThanOrEqual(RESTART_DELAY_TICKS - 1);
    // Lúc bóng đi: thủ môn đứng giữa khung, người khác ngoài vòng cấm.
    const shot = step(waited, NO_INPUT);
    const gk = shot.players.find((p) => p.team === 'home' && p.position === 'GK')!;
    expect(gk.pos.y).toBe(0);
    expect(Math.abs(gk.pos.x)).toBeGreaterThan(HALF_LENGTH - 1);
    for (const p of shot.players) {
      if (p.id === pk.restart!.takerId || p.id === gk.id) continue;
      expect(isInPenaltyArea(p.pos, goalSide)).toBe(false);
    }
    expect(shot.phase).toBe('play');
    expect(Math.sign(shot.ball.vel.x)).toBe(goalSide);
    expect(length(shot.ball.vel)).toBeGreaterThan(15);
  });
});

describe('thủ môn ôm bóng trong vòng cấm', () => {
  const KEEPER = 'away-GK';
  /** Thủ môn khách ôm bóng trong vòng cấm nhà mình (đội khách giữ khung +x ở hiệp 1). */
  const keeperScene = (keeperPos: Vec2, rng: RngState): MatchState => {
    const s = scene({ owner: vec2(0, 0), me: vec2(keeperPos.x - 1.1, keeperPos.y), rng });
    const players = s.players.map((p) =>
      p.id === KEEPER ? { ...p, pos: keeperPos, facing: vec2(-1, 0) } : p,
    );
    return {
      ...s,
      players,
      ballOwnerId: KEEPER,
      ball: dribbleBall(players.find((p) => p.id === KEEPER)!),
    };
  };
  const inBox = vec2(HALF_LENGTH - 3, 0);

  it.each([
    ['xoạc (A)', A],
    ['giữ D tắc bóng', D],
  ])('%s vào thủ môn → không tranh được bóng, không phạm lỗi', (_name, input) => {
    for (const rng of [winRoll, missRoll]) {
      const s = repeat(keeperScene(inBox, rng), input, 20);
      expect(s.restart).toBeNull();
      expect(s.bookings).toEqual([]);
      expect(s.ballOwnerId === ME).toBe(false);
    }
  });

  it('thủ môn dẫn bóng ngoài vòng cấm vẫn bị tắc như cầu thủ thường', () => {
    const s = step(keeperScene(vec2(HALF_LENGTH - 16, 0), winRoll), A);
    expect(s.lastTackle?.outcome).toBe('won');
    expect(s.ballOwnerId).toBeNull();
  });

  it('bóng đồng đội chuyền về: thủ môn giữ bằng chân trong vòng cấm, bị tắc như cầu thủ thường', () => {
    const s = step({ ...keeperScene(inBox, winRoll), backPass: 'away' }, A);
    expect(s.lastTackle?.outcome).toBe('won');
    expect(s.ballOwnerId).toBeNull();
  });
});

describe('luật chuyền về', () => {
  const GK = 'home-GK';
  /** ME (đội nhà, giữ khung −x ở hiệp 1) dẫn bóng trước vòng cấm nhà, quay về khung thành nhà. */
  const backPassScene = (): MatchState => {
    const s = scene({ owner: vec2(0, 18), me: vec2(-HALF_LENGTH + 18, 0) });
    const players = s.players.map((p) => {
      if (p.id === GK) return { ...p, pos: vec2(-HALF_LENGTH + 2, 0), facing: vec2(1, 0) };
      if (p.id === ME) return { ...p, facing: vec2(-1, 0) };
      return p;
    });
    return {
      ...s,
      players,
      ballOwnerId: ME,
      ball: dribbleBall(players.find((p) => p.id === ME)!),
      lastTouchTeam: 'home',
    };
  };
  const back = vec2(-1, 0);

  it('chuyền về thủ môn → thủ môn nhận bằng chân, không ôm bóng; đá đi thì hết', () => {
    let s = step(backPassScene(), press({ pass: true, move: back }));
    s = step(s, press({ move: back }));
    expect(s.ballOwnerId).toBeNull();
    expect(s.backPass).toBe('home');
    for (let i = 0; i < 5 * 60 && s.ballOwnerId !== GK; i++) s = step(s, NO_INPUT);
    expect(s.ballOwnerId).toBe(GK);
    expect(s.backPass).toBe('home');
    const gk = playerOf(s, GK);
    expect(isInPenaltyArea(gk.pos, -1)).toBe(true);
    expect(isKeeperHandling(gk, 1, s.backPass)).toBe(false);
    // Thủ môn chuyền đi bằng chân (không lấy đà ném), luật chuyền về hết hiệu lực.
    s = step(s, press({ pass: true, move: vec2(1, 0) }));
    s = step(s, press({ move: vec2(1, 0) }));
    expect(s.windup).toBeNull();
    expect(s.ballOwnerId).toBeNull();
    expect(s.backPass).toBeNull();
  });

  it('thủ môn tự bắt bóng đối phương sút → vẫn ôm bằng tay', () => {
    const s = { ...backPassScene(), backPass: 'away' as const };
    const gk = playerOf(s, GK);
    expect(isKeeperHandling(gk, 1, s.backPass)).toBe(true);
  });
});

describe('đá phạt trong vòng cấm nhà', () => {
  it('chờ đá phạt: thủ môn đội được hưởng không lên nhặt bóng', () => {
    const s0 = scene({ owner: vec2(0, 18), me: vec2(-HALF_LENGTH + 10, 3) });
    const spot = vec2(-HALF_LENGTH + 8, 3);
    const players = s0.players.map((p) =>
      p.id === 'home-GK' ? { ...p, pos: vec2(-HALF_LENGTH + 1, 0) } : p,
    );
    let s: MatchState = {
      ...s0,
      players,
      phase: 'dead_ball',
      ballDead: true,
      ballOwnerId: null,
      ball: { pos: spot, vel: ZERO, z: 0, vz: 0 },
      restart: { type: 'free_kick', team: 'home', spot, takerId: ME, startTick: s0.tick },
    };
    for (let i = 0; i < 3 * 60; i++) {
      s = step(s, NO_INPUT);
      expect(length(sub(playerOf(s, 'home-GK').pos, spot))).toBeGreaterThan(3);
    }
    expect(s.restart?.type).toBe('free_kick');
  });
});
