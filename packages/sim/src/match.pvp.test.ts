import { describe, expect, it } from 'vitest';
import golden from './golden-hash.json';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam } from './fixtures/demoTeams';
import { goldenInput, GOLDEN_SEEDS, GOLDEN_TICKS } from './fixtures/golden';
import { stateHash } from './hash';
import { createMatch, step, stepBoth } from './match';
import { length, sub, vec2, ZERO } from './math/vec2';
import { HALF_LENGTH } from './pitch';
import { buildMatchSetup, decodeInput } from './replay';
import { judgeFoul } from './rules/fouls';
import {
  HALF_TIME_PVP_MAX_TICKS,
  KEEPER_HOLD_MAX_TICKS,
  SET_PIECE_MAX_TICKS,
} from './rules/limits';
import { dribbleBall } from './rules/possession';
import { regulationTicks } from './rules/clock';
import { PENALTY_RUNUP_TICKS } from './rules/setPieceAim';
import { canSubstituteNow, checkSubStructure, MAX_SUBS, substitute } from './rules/substitution';
import { seedRng } from './rng';
import { KEEPER_WINDUP_TICKS } from './stats/params';
import { TICK_RATE } from './tick';
import {
  NO_INPUT,
  type MatchSetup,
  type MatchState,
  type PlayerInput,
  type TeamInputs,
  type TeamSide,
} from './types';

const BOTH: TeamSide[] = ['home', 'away'];
const setup2 = (seed = 7, extra: Partial<MatchSetup> = {}): MatchSetup => ({
  home: starterLikeTeam,
  away: cpuEasyTeam,
  seed,
  difficulty: 'easy',
  humans: BOTH,
  ...extra,
});
const idle: TeamInputs = { home: NO_INPUT, away: NO_INPUT };
const at = (code: number) => decodeInput(code % 4608);
/** Input giả ngẫu nhiên có seed, mỗi đội một chuỗi riêng, đổi mỗi 16 tick. */
const noisy = (i: number): TeamInputs => ({
  home: at((Math.imul((i >> 4) + 1, 2654435761) >>> 0) % 4608),
  away: at((Math.imul((i >> 4) + 99, 2246822519) >>> 0) % 4608),
});
const runBoth = (s: MatchState, n: number, inputs: TeamInputs = idle): MatchState => {
  let cur = s;
  for (let i = 0; i < n; i++) cur = stepBoth(cur, inputs);
  return cur;
};

describe('một người chơi không đổi (SC-007)', () => {
  it.each(GOLDEN_SEEDS)('seed %i: golden hash khớp, và step = stepBoth(home, NO_INPUT)', (seed) => {
    const want = (golden as Record<string, Record<string, number>>)[String(seed)]!;
    const m = buildMatchSetup({
      seed,
      difficulty: 'easy',
      home: starterLikeTeam,
      away: cpuEasyTeam,
    });
    let a = createMatch(m);
    let b = createMatch(m);
    for (let i = 0; a.phase !== 'full_time'; i++) {
      a = step(a, goldenInput(i));
      b = stepBoth(b, { home: goldenInput(i), away: at(i * 7 + 3) }); // input đội máy bị bỏ qua
      if (GOLDEN_TICKS.includes(a.tick)) {
        expect(stateHash(a)).toBe(want[String(a.tick)]);
        expect(stateHash(b)).toBe(stateHash(a));
      }
    }
    expect(stateHash(a)).toBe(want.final);
    expect(a.tick).toBe(want.finalTick);
    expect(stateHash(b)).toBe(stateHash(a));
  });
});

describe('stepBoth — hai đội người', () => {
  it('đá hết trận (cả luân lưu nếu hoà), tất định giữa hai lần chạy', () => {
    const play = () => {
      let s = createMatch(setup2(3, { halfLengthSec: 15 }));
      for (let i = 0; s.phase !== 'full_time' && i < 60 * 60 * TICK_RATE; i++) {
        s = stepBoth(s, noisy(i));
      }
      return s;
    };
    const a = play();
    expect(a.phase).toBe('full_time');
    expect(stateHash(play())).toBe(stateHash(a));
  });

  it('mỗi đội có người đang cầm riêng; input của từng đội chỉ điều khiển người của đội đó', () => {
    const s0 = createMatch(setup2());
    expect(s0.controlledId.home).toBe(s0.restart!.takerId); // đội nhà giao bóng
    expect(s0.controlledId.away).toMatch(/^away-/); // đội khách: người gần bóng nhất
    expect(s0.controlledId.away).not.toBe(s0.restart!.takerId);
    const pos = (s: MatchState, id: string) => s.players.find((p) => p.id === id)!.pos;
    const up: PlayerInput = { ...NO_INPUT, move: vec2(0, -1) };
    const moved = runBoth(s0, 20, { home: NO_INPUT, away: up });
    const still = runBoth(s0, 20, idle);
    expect(pos(moved, s0.controlledId.away).y).toBeLessThan(
      pos(still, s0.controlledId.away).y - 0.3,
    );
    // Input của đội nhà không làm đội khách chạy.
    const homeOnly = runBoth(s0, 20, { home: up, away: NO_INPUT });
    expect(pos(homeOnly, s0.controlledId.away)).toEqual(pos(still, s0.controlledId.away));
  });

  it('chế độ một người: đội khách là máy, controlledId đội khách rỗng, input đội khách bị bỏ qua', () => {
    const s0 = createMatch({ ...setup2(), humans: undefined });
    expect(s0.humans).toEqual(['home']);
    expect(s0.controlledId.away).toBe('');
    const a = runBoth(s0, 300, idle);
    const b = runBoth(s0, 300, { home: NO_INPUT, away: at(12345) });
    expect(stateHash(b)).toBe(stateHash(a));
  });

  it('nearestHuman theo đội: đội khách được hưởng bóng chết thì đội nhà cầm người gần điểm đặt bóng nhất', () => {
    const base = createMatch(setup2());
    const goalKick: MatchState = {
      ...base,
      phase: 'play' as const,
      ballDead: false,
      restart: null,
      ball: { pos: vec2(HALF_LENGTH - 1, 1), vel: vec2(8, 0), z: 0, vz: 0 },
      lastTouchTeam: 'home' as const,
    };
    let s = goalKick;
    for (let i = 0; i < 120 && s.restart === null; i++) s = stepBoth(s, idle);
    expect(s.restart).not.toBeNull();
    const r = s.restart!;
    expect(s.controlledId[r.team]).toBe(r.takerId);
    const other: TeamSide = r.team === 'home' ? 'away' : 'home';
    expect(s.controlledId[other]).toMatch(new RegExp(`^${other}-`));
    const nearest = s.players
      .filter((p) => p.team === other && p.position !== 'GK')
      .reduce((a, b) => (length(sub(b.pos, r.spot)) < length(sub(a.pos, r.spot)) ? b : a));
    expect(s.controlledId[other]).toBe(nearest.id);
  });
});

describe('autopilot hai đội', () => {
  it('điều khiển cả hai đội, bỏ qua mọi input, không có hạn chót', () => {
    const s0 = createMatch(setup2(5, { halfLengthSec: 10, autopilot: true }));
    let a = s0;
    let b = s0;
    for (let i = 0; a.phase !== 'full_time' && i < 60 * 60 * TICK_RATE; i++) {
      a = stepBoth(a, idle);
      b = stepBoth(b, noisy(i));
      expect(a.actionDeadline).toEqual({ home: null, away: null });
      if (i % 200 === 0) expect(stateHash(b)).toBe(stateHash(a));
    }
    expect(a.phase).toBe('full_time');
    expect(stateHash(b)).toBe(stateHash(a));
  });
});

describe('luật thời gian cho đội khách', () => {
  const place = (s: MatchState, team: TeamSide, spot = vec2(4, 3)) => {
    const taker = s.players
      .filter((p) => p.team === team && p.position !== 'GK')
      .reduce((a, b) => (length(sub(b.pos, spot)) < length(sub(a.pos, spot)) ? b : a));
    return {
      ...s,
      phase: 'dead_ball' as const,
      ballDead: true,
      ball: { pos: spot, vel: ZERO, z: 0, vz: 0 },
      restart: {
        type: 'free_kick' as const,
        team,
        spot,
        takerId: taker.id,
        startTick: s.tick,
        readyTick: s.tick,
      },
      controlledId: { ...s.controlledId, [team]: taker.id },
    };
  };

  it('đá phạt của đội khách: hạn 15 s lộ ở actionDeadline.away, hết hạn máy đá hộ; nút của đội nhà không có tác dụng', () => {
    const s0 = place(createMatch(setup2()), 'away');
    let s = stepBoth(s0, idle);
    expect(s.actionDeadline.home).toBeNull();
    expect(s.actionDeadline.away).toEqual({
      kind: 'free_kick',
      playerId: s0.restart!.takerId,
      deadlineTick: s0.tick + SET_PIECE_MAX_TICKS,
    });
    // Chờ người đá vào vị trí (chưa tới bóng thì chưa nạp lực được).
    s = runBoth(s, 150);
    // Đội nhà bấm chuyền: không phải đội thực hiện nên không đá được.
    s = stepBoth(s, { home: { ...NO_INPUT, pass: true }, away: NO_INPUT });
    expect(s.restart).not.toBeNull();
    expect(s.passCharge.home).toBeNull();
    // Đội khách bấm chuyền: bắt đầu nạp lực (đá phạt là tình huống ngắm).
    const charging = stepBoth(s, { home: NO_INPUT, away: { ...NO_INPUT, pass: true } });
    expect(charging.passCharge.away).not.toBeNull();
    // Không ai bấm: hết hạn thì máy đá hộ.
    while (s.tick < s0.tick + SET_PIECE_MAX_TICKS - 1) s = stepBoth(s, idle);
    expect(s.restart).not.toBeNull();
    s = runBoth(s, 3);
    expect(s.restart).toBeNull();
    expect(s.lastTouchTeam).toBe('away');
  });

  function keeperHolding(): MatchState {
    const s0 = createMatch(setup2());
    const GK = 'away-GK';
    const players = s0.players.map((p) =>
      p.id === GK ? { ...p, pos: vec2(HALF_LENGTH - 4, 0), vel: ZERO, facing: vec2(-1, 0) } : p,
    );
    return {
      ...s0,
      phase: 'play',
      ballDead: false,
      restart: null,
      players,
      ballOwnerId: GK,
      ownerSinceTick: s0.tick,
      controlledId: { home: s0.controlledId.home, away: GK },
      lastTouchTeam: 'away',
      ball: dribbleBall(players.find((p) => p.id === GK)!),
    };
  }

  it('thủ môn đội khách ôm bóng tối đa 10 s rồi tự lấy đà phát bóng', () => {
    const s0 = keeperHolding();
    let s = stepBoth(s0, idle);
    expect(s.actionDeadline.home).toBeNull();
    expect(s.actionDeadline.away).toEqual({
      kind: 'keeper_hold',
      playerId: 'away-GK',
      deadlineTick: s0.ownerSinceTick + KEEPER_HOLD_MAX_TICKS,
    });
    while (s.tick < s0.ownerSinceTick + KEEPER_HOLD_MAX_TICKS - 1) {
      s = stepBoth(s, idle);
      expect(s.ballOwnerId).toBe('away-GK');
    }
    s = runBoth(s, 1);
    expect(s.windup).toMatchObject({ playerId: 'away-GK' });
    s = runBoth(s, KEEPER_WINDUP_TICKS);
    expect(s.ballOwnerId).not.toBe('away-GK');
  });

  it('thủ môn đội khách nhận tối đa một thẻ vàng, không bao giờ thẻ đỏ', () => {
    const s0 = createMatch(setup2());
    const gk = s0.players.find((p) => p.id === 'away-GK')!;
    const victim = s0.players.find((p) => p.team === 'home' && p.position !== 'GK')!;
    for (let seed = 1; seed <= 60; seed++) {
      let rng = seedRng(seed);
      let bookings: MatchState['bookings'] = [];
      for (let k = 0; k < 6; k++) {
        const j = judgeFoul({ fromBehind: true, rough: true }, gk, victim, 1, bookings, k, rng);
        ({ rng, bookings } = j);
        expect(j.sentOffId).toBeNull();
      }
      expect(bookings.filter((b) => b.card === 'red')).toHaveLength(0);
      expect(bookings.filter((b) => b.card === 'yellow').length).toBeLessThanOrEqual(1);
    }
  });

  const toHalfTime = (): MatchState => {
    const s0 = createMatch(setup2());
    const end: MatchState = {
      ...s0,
      halfTick: regulationTicks(s0.halfLengthSec) - 1,
      addedMinutes: 0,
    };
    const s = stepBoth(end, idle);
    expect(s.phase).toBe('half_time');
    return s;
  };
  const tap = (team: TeamSide): TeamInputs => ({ ...idle, [team]: { ...NO_INPUT, pass: true } });

  it('nghỉ giữa hiệp: một đội bấm chưa đủ, cả hai bấm (không cần cùng lúc) mới đá hiệp 2', () => {
    let s = toHalfTime();
    s = stepBoth(s, tap('away'));
    s = runBoth(s, 30);
    expect(s.phase).toBe('half_time');
    expect(s.halfTimeReady).toEqual(['away']);
    s = stepBoth(s, tap('home'));
    expect(s.phase).toBe('kickoff');
    expect(s.half).toBe(2);
    expect(s.halfTimeReady).toEqual([]);
  });

  it('nghỉ giữa hiệp PvP: không đủ hai người bấm thì tự đá hiệp 2 sau 15 s', () => {
    let s = stepBoth(toHalfTime(), tap('home'));
    const start = s.tick;
    while (s.phase === 'half_time') s = stepBoth(s, idle);
    expect(s.half).toBe(2);
    expect(s.tick - start).toBeLessThanOrEqual(HALF_TIME_PVP_MAX_TICKS);
    expect(s.tick - start).toBeGreaterThan(HALF_TIME_PVP_MAX_TICKS - 5);
  });
});

describe('luân lưu hai người chơi (stepShootout)', () => {
  const tied = (): MatchState => ({
    ...createMatch(setup2(3, { halfLengthSec: 1, away: cpuHardTeam, difficulty: 'hard' })),
    half: 2,
    halfTick: TICK_RATE - 1,
    score: { home: 1, away: 1 },
    addedMinutes: 0,
  });
  const D: PlayerInput = { ...NO_INPUT, shoot: true };

  /** Đợi người sút đứng vào chấm rồi giữ D 20 tick, nhả, chờ lấy đà: bóng đi. */
  function kickAs(s0: MatchState, team: TeamSide): MatchState {
    let s = s0;
    const only = (i: PlayerInput): TeamInputs => ({ ...idle, [team]: i });
    expect(s.restart!.team).toBe(team);
    for (let i = 0; i < 10 * TICK_RATE && s.restart && s.restart.penaltyRunUp === undefined; i++) {
      if (s.players.find((p) => p.id === s.restart!.takerId)!.vel.x === 0 && i > 5) break;
      s = stepBoth(s, idle);
    }
    for (let i = 0; i < 20; i++) s = stepBoth(s, only(D));
    s = stepBoth(s, only(NO_INPUT));
    expect(s.restart?.penaltyRunUp).toBeDefined();
    for (let i = 0; i < PENALTY_RUNUP_TICKS; i++) s = stepBoth(s, only(NO_INPUT));
    expect(s.restart).toBeNull();
    return s;
  }

  it('mỗi đội tự chọn người sút; hạn chót và người cầm theo đội đang sút', () => {
    let s = stepBoth(tied(), idle);
    expect(s.phase).toBe('shootout');
    // Lượt 1: đội nhà sút. Người chơi nhà cầm người sút, đội khách cầm một người đang đứng chờ.
    expect(s.restart!.team).toBe('home');
    expect(s.controlledId.home).toBe(s.restart!.takerId);
    expect(s.controlledId.away).toMatch(/^away-/);
    s = stepBoth(s, idle);
    expect(s.actionDeadline.home).toMatchObject({ kind: 'penalty', playerId: s.restart!.takerId });
    expect(s.actionDeadline.away).toBeNull();
    s = kickAs(s, 'home');
    s = runBoth(s, 5 * TICK_RATE);
    expect(s.shootout!.home).toHaveLength(1);
    // Lượt 2: đội khách sút, người chơi khách cầm người sút và có hạn chót riêng.
    expect(s.restart?.team).toBe('away');
    expect(s.controlledId.away).toBe(s.restart!.takerId);
    expect(s.controlledId.home).toMatch(/^home-/);
    s = stepBoth(s, idle);
    expect(s.actionDeadline.away).toMatchObject({ kind: 'penalty', playerId: s.restart!.takerId });
    expect(s.actionDeadline.home).toBeNull();
    // Đội nhà bấm sút trong lượt của đội khách: vô hiệu.
    const before = s.shotChargeTicks;
    s = stepBoth(s, { home: D, away: NO_INPUT });
    expect(s.shotChargeTicks.home).toBe(before.home);
    s = kickAs(s, 'away');
    s = runBoth(s, 5 * TICK_RATE);
    expect(s.shootout!.away).toHaveLength(1);
    expect(s.score).toEqual({ home: 1, away: 1 });
  });

  it('luân lưu hai người chạy tới hết trận có kết quả', () => {
    let s = tied();
    for (let i = 0; s.phase !== 'full_time' && i < 60 * 60 * TICK_RATE; i++)
      s = stepBoth(s, noisy(i));
    expect(s.phase).toBe('full_time');
    expect(s.shootout).not.toBeNull();
  });
});

describe('thay người cho cả hai đội', () => {
  const base = () => createMatch(setup2());

  it('canSubstituteNow: chỉ khi bóng chết; không phải lỗi, không luân lưu, không chờ phạt đền', () => {
    const s0 = base();
    expect(canSubstituteNow(s0)).toBe(true);
    expect(canSubstituteNow({ ...s0, phase: 'play', ballDead: false, restart: null })).toBe(false);
    expect(canSubstituteNow({ ...s0, restart: { ...s0.restart!, type: 'penalty' } })).toBe(false);
    expect(canSubstituteNow({ ...s0, phase: 'full_time' })).toBe(false);
    expect(
      canSubstituteNow({
        ...s0,
        shootout: { home: [], away: [], first: 'home', kicking: 'home', kickTick: null },
      }),
    ).toBe(false);
  });

  it.each(BOTH)('checkSubStructure đúng cho đội %s', (team) => {
    const s0 = base();
    const mine = (slot: string) => `${team}-${slot}`;
    const foe: TeamSide = team === 'home' ? 'away' : 'home';
    expect(checkSubStructure(s0, team, mine('P2'), 'B1')).toBeNull();
    // Cầu thủ không trên sân: id lạ, người đội kia, người đã ra sân.
    expect(checkSubStructure(s0, team, mine('Z9'), 'B1')).toBe('not_on_pitch');
    expect(checkSubStructure(s0, team, `${foe}-P2`, 'B1')).toBe('not_on_pitch');
    // Slot dự bị sai: ô sân đá chính, hoặc ô không có.
    expect(checkSubStructure(s0, team, mine('P2'), 'P3')).toBe('not_on_bench');
    // Thủ môn đổi cầu thủ ngoài sân.
    expect(checkSubStructure(s0, team, mine('GK'), 'B1')).toBe('keeper_mismatch');
    // Đã bị thẻ đỏ (rời sân).
    const sent = { ...s0, players: s0.players.filter((p) => p.id !== mine('P3')) };
    expect(checkSubStructure(sent, team, mine('P3'), 'B1')).toBe('not_on_pitch');
    // Hết lượt.
    expect(
      checkSubStructure(
        { ...s0, subsUsed: { ...s0.subsUsed, [team]: MAX_SUBS } },
        team,
        mine('P2'),
        'B1',
      ),
    ).toBe('no_subs_left');
  });

  it('MAX_SUBS = 3 tính riêng mỗi đội', () => {
    let s = base();
    for (const [out, bench] of [
      ['P2', 'B1'],
      ['P3', 'B2'],
      ['P4', 'B3'],
    ] as const) {
      const r = substitute(s, 'away', `away-${out}`, bench);
      if (!r.ok) throw new Error(`away ${out}: ${r.reason}`);
      s = r.state;
    }
    expect(s.subsUsed).toEqual({ home: 0, away: 3 });
    expect(checkSubStructure(s, 'away', 'away-P5', 'B1')).toBe('no_subs_left');
    expect(substitute(s, 'away', 'away-P5', 'B3')).toEqual({ ok: false, reason: 'no_subs_left' });
    // Đội nhà vẫn còn đủ 3 lượt.
    expect(checkSubStructure(s, 'home', 'home-P2', 'B1')).toBeNull();
    const h = substitute(s, 'home', 'home-P2', 'B1');
    expect(h.ok).toBe(true);
  });
});
