import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam } from '../fixtures/demoTeams';
import { createMatch, step } from '../match';
import { nextFloat, seedRng } from '../rng';
import { TICK_RATE } from '../tick';
import { NO_INPUT, type MatchState, type PlayerInput } from '../types';
import { nextShooter, shooterFor, shootoutWinner, type ShootoutTally } from './shootout';

const T = true;
const F = false;
const tally = (home: boolean[], away: boolean[]): ShootoutTally => ({ home, away });

describe('shootoutWinner', () => {
  it('chưa phân định khi còn gỡ được', () => {
    expect(shootoutWinner(tally([], []))).toBeNull();
    expect(shootoutWinner(tally([T, T], [F]))).toBeNull();
    expect(shootoutWinner(tally([T, T, T, T, T], [T, T, T, T]))).toBeNull();
  });

  it('dừng sớm: 3–0 sau 3 lượt mỗi đội', () => {
    expect(shootoutWinner(tally([T, T, T], [F, F, F]))).toBe('home');
  });

  it('dừng sớm ngay giữa vòng khi đội sút sau không thể gỡ', () => {
    // Khách 4/4, nhà 1/4 + còn 1 lượt: tối đa 2 < 4.
    expect(shootoutWinner(tally([T, F, F, F], [T, T, T, T]))).toBe('away');
  });

  it('hết 5 lượt hơn nhau thì xong; hoà thì sudden death', () => {
    expect(shootoutWinner(tally([T, T, T, T, F], [T, T, T, T, T]))).toBe('away');
    expect(shootoutWinner(tally([T, T, T, T, T], [T, T, T, T, T]))).toBeNull();
  });

  it('sudden death: chỉ phân định khi đã sút bằng số lượt', () => {
    const five = [T, T, T, T, T];
    expect(shootoutWinner(tally([...five, F], five))).toBeNull();
    expect(shootoutWinner(tally([...five, F], [...five, T]))).toBe('away');
    expect(shootoutWinner(tally([...five, T, T], [...five, T, F]))).toBe('home');
  });

  it('1.000 loạt ngẫu nhiên (xác suất vào 75%) đều kết thúc', () => {
    let rng = seedRng(42);
    for (let n = 0; n < 1000; n++) {
      const t = tally([], []);
      let kicks = 0;
      while (shootoutWinner(t) === null) {
        const side = nextShooter(t, 'home');
        const [r, next] = nextFloat(rng);
        rng = next;
        t[side].push(r < 0.75);
        kicks++;
        expect(kicks).toBeLessThan(200);
      }
    }
  });
});

describe('nextShooter / shooterFor', () => {
  it('hai đội luân phiên, đội sút trước giữ nguyên mỗi vòng', () => {
    expect(nextShooter(tally([], []), 'home')).toBe('home');
    expect(nextShooter(tally([T], []), 'home')).toBe('away');
    expect(nextShooter(tally([T], [F]), 'home')).toBe('home');
  });

  it('người sút: Sút cao trước, thủ môn cuối, hết vòng lặp lại', () => {
    const { players } = createMatch({
      home: starterLikeTeam,
      away: cpuEasyTeam,
      seed: 1,
      difficulty: 'easy',
    });
    const home = players.filter((p) => p.team === 'home');
    const order = home.map((_, i) => shooterFor(players, 'home', i));
    expect(new Set(order.map((p) => p.id)).size).toBe(home.length);
    expect(order.at(-1)!.position).toBe('GK');
    for (let i = 1; i < order.length - 1; i++) {
      expect(order[i - 1]!.stats.shooting).toBeGreaterThanOrEqual(order[i]!.stats.shooting);
    }
    expect(shooterFor(players, 'home', home.length).id).toBe(order[0]!.id);
  });
});

/** Trận tự đá sắp hết hiệp 2 với tỉ số `score`. */
function endOfSecondHalf(seed: number, score: { home: number; away: number }): MatchState {
  const s = createMatch({
    home: starterLikeTeam,
    away: cpuHardTeam,
    seed,
    difficulty: 'hard',
    halfLengthSec: 1,
    autopilot: true,
  });
  return { ...s, half: 2, halfTick: TICK_RATE - 1, score, addedMinutes: 0 };
}

const runUntil = (
  s: MatchState,
  done: (s: MatchState) => boolean,
  max: number,
  input = NO_INPUT,
) => {
  let cur = s;
  for (let i = 0; i < max && !done(cur); i++) cur = step(cur, input);
  return cur;
};

describe('luân lưu trong trận', () => {
  it('hết hiệp 2 không hoà → hết trận, không luân lưu', () => {
    const s = runUntil(endOfSecondHalf(1, { home: 1, away: 0 }), (x) => x.phase !== 'kickoff', 5);
    expect(s.phase).toBe('full_time');
    expect(s.shootout).toBeNull();
  });

  it('hoà sau 2 hiệp → luân lưu; tự đá tới khi có đội thắng, tỉ số trận giữ nguyên', () => {
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const start = endOfSecondHalf(seed, { home: 2, away: 2 });
      const entered = step(start, NO_INPUT);
      expect(entered.phase).toBe('shootout');
      expect(entered.restart?.type).toBe('penalty');
      const end = runUntil(entered, (x) => x.phase === 'full_time', 60 * 60 * TICK_RATE);
      expect(end.phase).toBe('full_time');
      expect(end.score).toEqual({ home: 2, away: 2 });
      expect(shootoutWinner(end.shootout!)).not.toBeNull();
      expect(end.shootout!.home.length).toBeGreaterThanOrEqual(3);
    }
  });

  it('lượt của đội người chơi: người chơi cầm người sút, giữ-thả D để sút', () => {
    const s0 = endOfSecondHalf(3, { home: 0, away: 0 });
    const entered = step({ ...s0, autopilot: false }, NO_INPUT);
    expect(entered.restart!.team).toBe('home');
    expect(entered.controlledId).toBe(entered.restart!.takerId);
    // Chờ người sút đi tới chấm (không có lệnh nào thì người chơi chờ mãi).
    let s = runUntil(entered, (x) => x.restart === null, 10 * TICK_RATE, NO_INPUT);
    expect(s.restart).not.toBeNull();
    const D: PlayerInput = { ...NO_INPUT, shoot: true };
    for (let i = 0; i < 20; i++) s = step(s, D);
    s = step(s, NO_INPUT);
    expect(s.restart).toBeNull();
    expect(s.phase).toBe('shootout');
    // Lượt kết thúc trong vài giây và chuyển sang đội khách.
    s = runUntil(s, (x) => x.shootout!.home.length === 1, 5 * TICK_RATE);
    expect(s.shootout!.home).toHaveLength(1);
    expect(s.restart?.team).toBe('away');
  });
});
