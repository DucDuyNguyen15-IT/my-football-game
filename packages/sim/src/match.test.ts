import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length } from './math/vec2';
import { CENTER_CIRCLE_RADIUS, HALF_LENGTH, isInsidePitch } from './pitch';
import { nextFloat, nextInt, seedRng, type RngState } from './rng';
import { NO_INPUT, type MatchSetup, type MatchState, type PlayerInput } from './types';
import { TICK_RATE } from './index';

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
