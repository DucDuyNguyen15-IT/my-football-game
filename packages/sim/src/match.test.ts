import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, sub, vec2, ZERO, type Vec2 } from './math/vec2';
import { dribbleBall, DRIBBLE_OFFSET } from './rules/possession';
import { MAX_CHARGE_TICKS } from './actions/shoot';
import { PASS_FULL_CHARGE_TICKS } from './actions/pass';
import { CENTER_CIRCLE_RADIUS, HALF_LENGTH, isInsidePitch } from './pitch';
import { nextFloat, nextInt, seedRng, type RngState } from './rng';
import { NO_INPUT, type MatchSetup, type MatchState, type PlayerInput } from './types';
import { TICK_RATE } from './index';
import { KEEPER_WINDUP_TICKS } from './stats/params';

const setup: MatchSetup = {
  home: starterLikeTeam,
  away: cpuEasyTeam,
  seed: 1234,
  difficulty: 'easy',
};

describe('createMatch', () => {
  const s = createMatch(setup);

  it('bắt đầu ở tick 0, hiệp 1, 0–0, hiệp mặc định 180 s', () => {
    expect(s.tick).toBe(0);
    expect(s.half).toBe(1);
    expect(s.halfTick).toBe(0);
    expect(s.score).toEqual({ home: 0, away: 0 });
    expect(s.halfLengthSec).toBe(180);
  });

  it('nhận halfLengthSec tuỳ chỉnh', () => {
    expect(createMatch({ ...setup, halfLengthSec: 20 }).halfLengthSec).toBe(20);
  });

  it('mỗi đội 7 cầu thủ trên sân, dự bị để riêng, thể lực 100%', () => {
    expect(s.players.filter((p) => p.team === 'home')).toHaveLength(7);
    expect(s.players.filter((p) => p.team === 'away')).toHaveLength(7);
    expect(s.bench.home).toHaveLength(starterLikeTeam.players.length - 7);
    expect(new Set(s.players.map((p) => p.id)).size).toBe(14);
    expect(s.players.every((p) => p.stamina === 100)).toBe(true);
  });

  it('bóng nằm yên ở chấm giữa sân', () => {
    expect(s.ball).toEqual({ pos: { x: 0, y: 0 }, vel: { x: 0, y: 0 }, z: 0, vz: 0 });
  });

  it('cầu thủ đứng trong sân và trong phần sân nhà (đội nhà tấn công về +x ở hiệp 1)', () => {
    for (const p of s.players) {
      expect(isInsidePitch(p.pos)).toBe(true);
      if (p.team === 'home') expect(p.pos.x).toBeLessThanOrEqual(0);
      else expect(p.pos.x).toBeGreaterThanOrEqual(0);
    }
  });

  it('thủ môn đứng gần khung thành nhà', () => {
    const homeGk = s.players.find((p) => p.team === 'home' && p.slot === 'GK')!;
    const awayGk = s.players.find((p) => p.team === 'away' && p.slot === 'GK')!;
    expect(homeGk.pos.x).toBeLessThan(-HALF_LENGTH + 3);
    expect(awayGk.pos.x).toBeGreaterThan(HALF_LENGTH - 3);
  });

  it('đội nhà giao bóng: đội khách đứng ngoài vòng tròn giữa sân', () => {
    expect(s.kickoffTeam).toBe('home');
    for (const p of s.players.filter((q) => q.team === 'away')) {
      expect(length(p.pos)).toBeGreaterThanOrEqual(CENTER_CIRCLE_RADIUS);
    }
  });

  it('người chơi điều khiển cầu thủ đội nhà gần bóng nhất', () => {
    const home = s.players.filter((p) => p.team === 'home');
    const nearest = home.reduce((a, b) => (length(b.pos) < length(a.pos) ? b : a));
    expect(s.controlledId).toBe(nearest.id);
  });

  it('PRNG lấy từ seed', () => {
    expect(s.rng).toBe(seedRng(1234));
  });

  it('từ chối đội hình không hợp lệ', () => {
    const bad = { ...starterLikeTeam, players: starterLikeTeam.players.slice(1) };
    expect(() => createMatch({ ...setup, home: bad })).toThrow();
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])('từ chối halfLengthSec = %s', (h) => {
    expect(() => createMatch({ ...setup, halfLengthSec: h })).toThrow();
  });

  it('cùng đội hình thì hai đội đối xứng tâm (lật cả x và y) — AI dùng chung hệ toạ độ theo đội', () => {
    const m = createMatch({ ...setup, away: starterLikeTeam });
    for (const slot of ['GK', 'P1', 'P2', 'P3', 'P4', 'P5'] as const) {
      const h = m.players.find((p) => p.team === 'home' && p.slot === slot)!;
      const a = m.players.find((p) => p.team === 'away' && p.slot === slot)!;
      expect(a.pos.x).toBeCloseTo(-h.pos.x);
      expect(a.pos.y).toBeCloseTo(-h.pos.y);
    }
  });

  it('vector và input mặc định bị đóng băng — không thể sửa nhầm dữ liệu dùng chung', () => {
    expect(Object.isFrozen(NO_INPUT)).toBe(true);
    expect(Object.isFrozen(NO_INPUT.move)).toBe(true);
    expect(Object.isFrozen(s.ball.pos)).toBe(true);
  });

  it('state serialize được (JSON khứ hồi không mất gì)', () => {
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });
});

describe('step', () => {
  it('tăng tick và tick trong hiệp, ghi nhớ input vừa áp dụng', () => {
    const input: PlayerInput = { ...NO_INPUT, move: { x: 1, y: 0 }, sprint: true };
    const s1 = step(createMatch(setup), input);
    expect(s1.tick).toBe(1);
    expect(s1.halfTick).toBe(1);
    expect(s1.input).toEqual(input);
  });

  it('không sửa state đầu vào', () => {
    const s0 = createMatch(setup);
    const snapshot = JSON.parse(JSON.stringify(s0));
    step(s0, NO_INPUT);
    expect(s0).toEqual(snapshot);
  });

  it('làm sạch input: giá trị không hữu hạn → 0, hướng dài hơn 1 bị kẹp về 1', () => {
    const s0 = createMatch(setup);
    const nan = step(s0, { ...NO_INPUT, move: { x: Number.NaN, y: Number.POSITIVE_INFINITY } });
    expect(nan.input.move).toEqual({ x: 0, y: 0 });
    const long = step(s0, { ...NO_INPUT, move: { x: 3, y: 4 } });
    expect(long.input.move.x).toBeCloseTo(0.6);
    expect(long.input.move.y).toBeCloseTo(0.8);
  });
});

/** Chuỗi input giả lập người chơi, sinh từ seed riêng để 2 lần chạy giống hệt nhau. */
function scriptedInputs(seed: number, n: number): PlayerInput[] {
  let r: RngState = seedRng(seed);
  const out: PlayerInput[] = [];
  for (let i = 0; i < n; i++) {
    const [dx, r1] = nextFloat(r);
    const [dy, r2] = nextFloat(r1);
    const [button, r3] = nextInt(r2, 0, 9);
    r = r3;
    out.push({
      ...NO_INPUT,
      move: { x: dx * 2 - 1, y: dy * 2 - 1 },
      pass: button === 1,
      lob: button === 2,
      shoot: button === 3,
      sprint: button >= 7,
      switch: button === 4,
    });
  }
  return out;
}

function run(inputs: PlayerInput[]): MatchState {
  return inputs.reduce(step, createMatch(setup));
}

describe('tính tất định', () => {
  it('2 lần chạy 600 tick cùng seed + cùng input → state giống hệt', () => {
    const inputs = scriptedInputs(99, 600);
    const a = run(inputs);
    const b = run(inputs);
    expect(a).toEqual(b);
    expect(a.tick).toBe(600);
    expect(a.tick / TICK_RATE).toBe(10);
  });
});

describe('createMatch — kiểm soát bóng', () => {
  it('bóng tự do, chưa ai bị khoá, chưa nạp lực sút', () => {
    const s = createMatch(setup);
    expect(s.ballOwnerId).toBeNull();
    expect(s.kickLock).toBeNull();
    expect(s.shotChargeTicks).toBe(0);
  });
});

/**
 * Tình huống dựng sẵn: cầu thủ trong `at` đứng ở vị trí cho trước, mọi người khác dồn về vạch
 * x = −28 (sau lưng, ngoài hình nón chuyền). `owner` có bóng dính chân; người chơi điều khiển `controlled`.
 */
function scenario(
  at: Record<string, Vec2>,
  owner: string | null,
  controlled = 'home-P1',
  ballPos: Vec2 = ZERO,
): MatchState {
  const s = createMatch(setup);
  const players = s.players.map((p, i) => ({
    ...p,
    pos: at[p.id] ?? vec2(-28, -18 + i * 2.7),
    vel: ZERO,
  }));
  const ownerP = players.find((p) => p.id === owner);
  return {
    ...s,
    phase: 'play',
    ballDead: false,
    restart: null,
    players,
    controlledId: controlled,
    ballOwnerId: owner,
    ball: ownerP ? dribbleBall(ownerP) : { pos: ballPos, vel: ZERO, z: 0, vz: 0 },
  };
}

const press = (over: Partial<PlayerInput>): PlayerInput => ({ ...NO_INPUT, ...over });
const repeat = (s: MatchState, input: PlayerInput, n: number): MatchState => {
  let cur = s;
  for (let i = 0; i < n; i++) cur = step(cur, input);
  return cur;
};
const playerOf = (s: MatchState, id: string) => s.players.find((p) => p.id === id)!;

describe('step — di chuyển', () => {
  it('cầu thủ được điều khiển chạy theo hướng bấm, người khác đứng yên khi tắt AI', () => {
    const s0: MatchState = {
      ...scenario({ 'home-P1': vec2(0, 5), 'home-P2': vec2(10, 10) }, null, 'home-P1', vec2(20, 0)),
      ai: null,
    };
    const s1 = repeat(s0, press({ move: vec2(1, 0) }), 30);
    expect(playerOf(s1, 'home-P1').pos.x).toBeGreaterThan(0.5);
    expect(playerOf(s1, 'home-P2').pos).toEqual(vec2(10, 10));
  });
});

describe('step — dẫn bóng và bắt bóng', () => {
  it('chạy tới bóng tự do thì khống chế được, rồi bóng dính chân khi rê', () => {
    const s0 = scenario({ 'home-P1': vec2(-3, 0) }, null, 'home-P1', ZERO);
    const s1 = repeat(s0, press({ move: vec2(1, 0) }), 60);
    expect(s1.ballOwnerId).toBe('home-P1');
    const s2 = repeat(s1, press({ move: vec2(0, 1) }), 60);
    expect(s2.ballOwnerId).toBe('home-P1');
    const p = playerOf(s2, 'home-P1');
    expect(length(sub(s2.ball.pos, p.pos))).toBeCloseTo(DRIBBLE_OFFSET);
  });

  it('cầu thủ đội khách chạm bóng thì giữ bóng, người chơi vẫn điều khiển cầu thủ cũ', () => {
    const s0 = scenario({ 'away-P1': vec2(0.5, 0), 'home-P1': vec2(-10, 0) }, null);
    const s1 = step(s0, NO_INPUT);
    expect(s1.ballOwnerId).toBe('away-P1');
    expect(s1.controlledId).toBe('home-P1');
  });

  it('chạy nhanh rồi bấm ngược hướng (xoay gắt) thì mất bóng', () => {
    const s0 = scenario({ 'home-P1': vec2(-20, 0) }, 'home-P1');
    const running = repeat(s0, press({ move: vec2(1, 0), sprint: true }), 90);
    expect(running.ballOwnerId).toBe('home-P1');
    const turned = step(running, press({ move: vec2(-1, 0), sprint: true }));
    expect(turned.ballOwnerId).toBeNull();
  });
});

describe('step — chuyền', () => {
  const at = { 'home-P1': ZERO, 'home-P2': vec2(15, 0) };
  /** Bấm nhanh: giữ 1 tick rồi nhả — chuyền xảy ra ở tick nhả (PRD §5, thanh lực chuyền). */
  const tap = (s: MatchState, input: PlayerInput) =>
    step(step(s, input), { ...input, pass: false, lob: false });

  it('hỗ trợ chuyền: bấm hướng nào chuyền người gần nhất hướng đó, kể cả có đối thủ đứng chắn', () => {
    const crowded = {
      'home-P1': ZERO,
      'home-P2': vec2(10, 0),
      'home-P3': vec2(14, 6),
      'away-P6': vec2(5, 0.3),
    };
    const s1 = tap(scenario(crowded, 'home-P1'), press({ pass: true, move: vec2(1, 0) }));
    expect(s1.controlledId).toBe('home-P2');
    expect(s1.passReceiver?.playerId).toBe('home-P2');
  });

  it('người nhận tự chạy đón bóng dù người chơi vẫn giữ hướng khác', () => {
    const running = scenario(at, 'home-P1');
    const moving = {
      ...running,
      players: running.players.map((p) => (p.id === 'home-P2' ? { ...p, vel: vec2(0, 4) } : p)),
    };
    const s1 = tap(moving, press({ pass: true, move: vec2(1, 0) }));
    const s2 = repeat(s1, press({ move: vec2(0, -1) }), 3 * 60);
    expect(s2.ballOwnerId).toBe('home-P2');
  });

  it('người nhận chạy theo đường bóng thật (bóng lệch hướng dự định) tới chỗ bóng lăn tới', () => {
    const s1 = tap(scenario(at, 'home-P1'), press({ pass: true, move: vec2(1, 0) }));
    expect(s1.passReceiver?.playerId).toBe('home-P2');
    // Bóng lệch ~25° so với đường chuyền dự định (sai số lớn).
    const v = s1.ball.vel;
    const c = Math.cos(0.45);
    const sn = Math.sin(0.45);
    const skewed = {
      ...s1,
      ball: { ...s1.ball, vel: vec2(v.x * c - v.y * sn, v.x * sn + v.y * c) },
    };
    let s = skewed;
    for (let i = 0; i < 4 * 60 && s.ballOwnerId === null; i++) s = step(s, NO_INPUT);
    expect(s.ballOwnerId).toBe('home-P2');
  });

  it('đường chuyền của máy cũng có người nhận chạy đón bóng', () => {
    // Đội máy tấn công về −x: chỉ away-P2 đứng phía trước, đồng đội khác ở sau lưng.
    const s0 = scenario(
      {
        'away-P1': ZERO,
        'away-P2': vec2(-12, 4),
        'away-P3': vec2(18, -10),
        'away-P4': vec2(18, 10),
        'away-P5': vec2(22, 0),
        'away-P6': vec2(15, -15),
        'away-GK': vec2(27, 0),
        // Đội người chơi ở xa sau lưng, không kịp áp sát.
        ...Object.fromEntries([2, 3, 4, 5, 6].map((n) => [`home-P${n}`, vec2(28, -15 + 5 * n)])),
        // Người chơi đứng chắn trước mặt: máy bị áp sát nên chuyền.
        'home-P1': vec2(-2.5, -1),
      },
      'away-P1',
      'home-P1',
    );
    let s = s0;
    for (let i = 0; i < 3 * 60 && s.ballOwnerId === 'away-P1'; i++) s = step(s, NO_INPUT);
    expect(s.ballOwnerId).toBeNull();
    const receiverId = s.passReceiver?.playerId;
    expect(receiverId?.startsWith('away-')).toBe(true);
    for (let i = 0; i < 4 * 60 && s.ballOwnerId === null; i++) s = step(s, NO_INPUT);
    expect(s.ballOwnerId).toBe(receiverId);
  });

  it('thủ môn ôm bóng chuyền: lấy đà KEEPER_WINDUP_TICKS rồi bóng mới rời tay', () => {
    const gkAt = vec2(-HALF_LENGTH + 3, 0);
    const s0 = scenario({ 'home-GK': gkAt, 'home-P2': vec2(-15, 0) }, 'home-GK', 'home-GK');
    const s1 = tap(s0, press({ pass: true, move: vec2(1, 0) }));
    expect(s1.windup?.style).toBe('throw');
    expect(s1.ballOwnerId).toBe('home-GK');
    const before = repeat(s1, NO_INPUT, KEEPER_WINDUP_TICKS - 2);
    expect(before.ballOwnerId).toBe('home-GK');
    const released = repeat(before, NO_INPUT, 2);
    expect(released.windup).toBeNull();
    expect(released.ballOwnerId).toBeNull();
    expect(released.controlledId).toBe('home-P2');
  });

  it('thủ môn ném tay: bóng rời tay ở độ cao vai và bay lên, rồi người nhận vẫn bắt được', () => {
    const gkAt = vec2(-HALF_LENGTH + 3, 0);
    const s0 = scenario({ 'home-GK': gkAt, 'home-P2': vec2(-15, 0) }, 'home-GK', 'home-GK');
    const s1 = tap(s0, press({ pass: true, move: vec2(1, 0) }));
    const released = repeat(s1, NO_INPUT, KEEPER_WINDUP_TICKS);
    expect(released.ballOwnerId).toBeNull();
    expect(released.ball.z).toBeGreaterThan(1.2);
    expect(released.ball.vz).toBeGreaterThan(0);
    let c = released;
    for (let i = 0; i < 3 * 60 && c.ballOwnerId === null; i++) c = step(c, NO_INPUT);
    expect(c.ballOwnerId).toBe('home-P2');
  });

  it('bấm J: bóng rời chân, đồng đội 15 m nhận bóng và người chơi chuyển sang điều khiển người đó', () => {
    const s1 = tap(scenario(at, 'home-P1'), press({ pass: true }));
    expect(s1.ballOwnerId).toBeNull();
    expect(s1.rng).not.toBe(scenario(at, 'home-P1').rng);
    const s2 = repeat(s1, NO_INPUT, 3 * 60);
    expect(s2.ballOwnerId).toBe('home-P2');
    expect(s2.controlledId).toBe('home-P2');
  });

  it('bấm chuyền là đổi ngay sang điều khiển người nhận, không chờ bắt bóng (5.17)', () => {
    const s1 = tap(scenario(at, 'home-P1'), press({ pass: true }));
    expect(s1.ballOwnerId).toBeNull();
    expect(s1.controlledId).toBe('home-P2');
  });

  it('giao bóng bằng S cũng đổi ngay sang người nhận (5.17)', () => {
    const s0 = createMatch(setup);
    expect(s0.phase).toBe('kickoff');
    // Giao bóng: mọi đồng đội đứng phần sân nhà, chuyền về phía sau.
    const s1 = step(s0, press({ pass: true, move: vec2(-1, 0) }));
    expect(s1.phase).toBe('play');
    expect(s1.controlledId).not.toBe(s0.controlledId);
    expect(playerOf(s1, s1.controlledId).team).toBe('home');
  });

  it('chuyền vào khoảng trống (không có người nhận) thì giữ người đang điều khiển', () => {
    const s1 = tap(scenario({ 'home-P1': ZERO }, 'home-P1'), press({ pass: true }));
    expect(s1.controlledId).toBe('home-P1');
  });

  it('chuyền xong vẫn giữ S: người nhận giữ bóng, không chuyền tiếp', () => {
    const s = repeat(
      tap(scenario(at, 'home-P1'), press({ pass: true })),
      press({ pass: true }),
      4 * 60,
    );
    expect(s.ballOwnerId).toBe('home-P2');
  });

  it('chuyền bổng (L) làm bóng bay lên', () => {
    const s1 = tap(scenario(at, 'home-P1'), press({ lob: true }));
    expect(s1.ballOwnerId).toBeNull();
    expect(s1.ball.z + s1.ball.vz).toBeGreaterThan(0);
  });

  it('chuyền vào khoảng trống: bấm hướng nhẹ (cần analog) vẫn chuyền đủ xa như bấm hết cỡ', () => {
    const s0 = scenario({ 'home-P1': ZERO }, 'home-P1');
    const light = tap(s0, press({ pass: true, move: vec2(0.05, 0) }));
    const full = tap(s0, press({ pass: true, move: vec2(1, 0) }));
    expect(light.ball.vel.x).toBeCloseTo(full.ball.vel.x);
  });

  it('người vừa chuyền không bắt lại bóng ngay lập tức', () => {
    const s0 = scenario({ 'home-P1': ZERO }, 'home-P1');
    const s1 = tap(s0, press({ pass: true }));
    expect(s1.kickLock?.playerId).toBe('home-P1');
    expect(step(s1, NO_INPUT).ballOwnerId).toBeNull();
  });
});

describe('step — lực chuyền (giữ S/A, nhả mới chuyền)', () => {
  const near = { 'home-P1': ZERO, 'home-P2': vec2(8, 0), 'home-P3': vec2(26, 1) };
  /** Giữ nút `n` tick rồi nhả (tick nhả mới chuyền). */
  const hold = (s: MatchState, btn: 'pass' | 'lob', n: number, move = vec2(1, 0)) =>
    step(repeat(s, press({ [btn]: true, move }), n), press({ move }));

  it('đang giữ S thì chưa chuyền, lực tăng theo thời gian giữ', () => {
    const s = repeat(scenario(near, 'home-P1'), press({ pass: true, move: vec2(1, 0) }), 20);
    expect(s.ballOwnerId).toBe('home-P1');
    expect(s.passCharge).toEqual({ kind: 'ground', ticks: 20, dir: vec2(1, 0) });
  });

  it('nhả S thì chuyền, hết nạp lực', () => {
    const s = hold(scenario(near, 'home-P1'), 'pass', 20);
    expect(s.ballOwnerId).toBeNull();
    expect(s.passCharge).toBeNull();
  });

  it('bấm nhanh → người nhận gần; giữ đầy thanh → người nhận xa hơn trong cùng hướng', () => {
    expect(hold(scenario(near, 'home-P1'), 'pass', 1).controlledId).toBe('home-P2');
    expect(hold(scenario(near, 'home-P1'), 'pass', PASS_FULL_CHARGE_TICKS).controlledId).toBe(
      'home-P3',
    );
  });

  it('cùng người nhận: giữ lâu thì bóng sệt đi căng hơn', () => {
    const one = { 'home-P1': ZERO, 'home-P2': vec2(15, 0) };
    const tap = hold(scenario(one, 'home-P1'), 'pass', 1);
    const full = hold(scenario(one, 'home-P1'), 'pass', PASS_FULL_CHARGE_TICKS);
    expect(full.controlledId).toBe('home-P2');
    expect(length(full.ball.vel)).toBeGreaterThan(length(tap.ball.vel) * 1.2);
  });

  it('chuyền vào khoảng trống: giữ lâu thì bóng đi xa hơn', () => {
    const alone = { 'home-P1': ZERO };
    const tap = hold(scenario(alone, 'home-P1'), 'lob', 1);
    const full = hold(scenario(alone, 'home-P1'), 'lob', PASS_FULL_CHARGE_TICKS);
    expect(length(full.ball.vel)).toBeGreaterThan(length(tap.ball.vel));
  });

  it('mất bóng khi đang nạp thì huỷ nạp', () => {
    const s0 = scenario(near, 'home-P1');
    const charging = repeat(s0, press({ pass: true, move: vec2(1, 0) }), 10);
    const lost = step({ ...charging, ballOwnerId: null }, press({ pass: true, move: vec2(1, 0) }));
    expect(lost.passCharge).toBeNull();
  });

  it('không có bóng thì S vẫn là đổi người, không nạp lực', () => {
    const s = step(scenario(near, null, 'home-P1', vec2(20, 0)), press({ pass: true }));
    expect(s.passCharge).toBeNull();
  });
});

describe('step — chọc khe (W, Q+W)', () => {
  const at = { 'home-P1': ZERO, 'home-P2': vec2(12, 5) };

  it('W: chuyền sệt tới điểm phía trước người nhận theo hướng tấn công', () => {
    const s1 = step(scenario(at, 'home-P1'), press({ through: true, move: vec2(1, 0.4) }));
    expect(s1.ballOwnerId).toBeNull();
    expect(s1.controlledId).toBe('home-P2');
    expect(s1.passReceiver?.playerId).toBe('home-P2');
    expect(s1.passReceiver!.point.x).toBeGreaterThan(12 + 3);
    expect(s1.ball.z).toBe(0);
    expect(s1.ball.vel.x).toBeGreaterThan(0);
  });

  it('Q+W: chọc khe bổng bay qua đầu hậu vệ đứng chắn', () => {
    const crowded = { ...at, 'away-P6': vec2(6, 2.5) };
    let s = step(
      scenario(crowded, 'home-P1'),
      press({ through: true, modifier: true, move: vec2(1, 0.4) }),
    );
    expect(s.passReceiver?.playerId).toBe('home-P2');
    while (s.ball.pos.x < 6) s = step(s, NO_INPUT);
    expect(s.ball.z).toBeGreaterThan(1);
    expect(s.ballOwnerId).toBeNull();
  });
});

describe('step — sút', () => {
  const at = { 'home-P1': vec2(10, 0) };

  it('giữ K thì nạp lực, bóng vẫn dính chân', () => {
    const s = repeat(scenario(at, 'home-P1'), press({ shoot: true }), 30);
    expect(s.shotChargeTicks).toBe(30);
    expect(s.ballOwnerId).toBe('home-P1');
  });

  it('thả K thì sút về khung thành đối phương; nạp lâu thì bóng nhanh hơn', () => {
    const shotAfter = (ticks: number) =>
      step(repeat(scenario(at, 'home-P1'), press({ shoot: true }), ticks), NO_INPUT);
    const tap = shotAfter(1);
    const full = shotAfter(MAX_CHARGE_TICKS);
    expect(full.ballOwnerId).toBeNull();
    expect(full.shotChargeTicks).toBe(0);
    expect(full.ball.vel.x).toBeGreaterThan(15);
    expect(length(full.ball.vel)).toBeGreaterThan(length(tap.ball.vel));
  });

  it('hiệp 2 đội nhà sút về khung thành phía −x', () => {
    const s0 = { ...scenario({ 'home-P1': vec2(-10, 0) }, 'home-P1'), half: 2 as const };
    const s = step(repeat(s0, press({ shoot: true }), 30), NO_INPUT);
    expect(s.ball.vel.x).toBeLessThan(0);
  });
});

describe('step — đổi người', () => {
  const at = { 'home-P1': vec2(-15, 0), 'home-P2': vec2(3, 0), 'home-P3': vec2(8, 0) };

  it('bấm nút đổi người khi không có bóng → cầu thủ đội nhà gần bóng nhất', () => {
    const s = step(scenario(at, null, 'home-P1', ZERO), press({ switch: true }));
    expect(s.controlledId).toBe('home-P2');
  });

  it('bấm J khi không có bóng cũng là đổi người', () => {
    const s = step(scenario(at, null, 'home-P1', ZERO), press({ pass: true }));
    expect(s.controlledId).toBe('home-P2');
    expect(s.ballOwnerId).toBeNull();
  });

  it('đối thủ dẫn bóng về khung thành nhà: S chọn người đứng chắn, không chọn tiền đạo sau bóng (5.17)', () => {
    const defending = {
      'away-P5': vec2(-10, 0),
      'home-P1': vec2(-17, 1),
      'home-P5': vec2(-8, 0.5),
      'home-P3': vec2(5, 10),
    };
    const s = step(scenario(defending, 'away-P5', 'home-P3'), press({ pass: true }));
    expect(s.controlledId).toBe('home-P1');
  });

  it('giữ nút đổi người chỉ đổi một lần', () => {
    const s = repeat(scenario(at, null, 'home-P1', ZERO), press({ switch: true }), 5);
    expect(s.controlledId).toBe('home-P2');
  });
});
