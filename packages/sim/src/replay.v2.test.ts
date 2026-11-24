import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { playScriptedMatch } from './fixtures/scriptedMatch';
import { stateHash } from './hash';
import { createMatch, stepBoth } from './match';
import { nextInt, seedRng } from './rng';
import { substitute } from './rules/substitution';
import {
  buildMatchSetup,
  decodeInput,
  decodeLog,
  decodeLog2,
  encodeLog,
  encodeLog2,
  InputRecorder2,
  LOG_V2_PREFIX,
  replayMatch,
  replayToState,
  ReplayLogError,
  type InputLog2,
} from './replay';
import type { MatchSetup, MatchState, TeamInputs } from './types';

const setup2 = (seed: number): MatchSetup => ({
  ...buildMatchSetup({ seed, difficulty: 'easy', home: starterLikeTeam, away: cpuEasyTeam }),
  humans: ['home', 'away'],
});

/**
 * Đá trực tiếp hai đội người bằng `stepBoth` với input giả ngẫu nhiên (mỗi đội một chuỗi), thay người
 * cho cả hai đội khi bóng chết, ghi bằng InputRecorder2. Dừng ở hết trận hoặc `stopAt` tick.
 */
function playTwoHumans(setup: MatchSetup, seed: number, stopAt = Infinity) {
  const rec = new InputRecorder2();
  let s = createMatch(setup);
  let rng = seedRng(seed);
  let inputs: TeamInputs = { home: decodeInput(0), away: decodeInput(0) };
  let hold = 0;
  const subAt = { home: 2500, away: 3200 };
  while (s.phase !== 'full_time' && s.tick < stopAt) {
    for (const team of ['home', 'away'] as const) {
      const bench = s.bench[team][0];
      if (s.tick >= subAt[team] && s.ballDead && s.subsUsed[team] === 0 && bench) {
        const out = s.players.find((p) => p.team === team && p.position !== 'GK')!;
        const r = substitute(s, team, out.id, bench.slot);
        if (r.ok) {
          rec.sub(s.tick, team, out.id, bench.slot);
          s = r.state;
        }
      }
    }
    if (hold-- <= 0) {
      let a: number;
      let b: number;
      [a, rng] = nextInt(rng, 0, 9 * 512 - 1);
      [b, rng] = nextInt(rng, 0, 9 * 512 - 1);
      inputs = {
        home: decodeInput(a % 3 === 0 ? a : a % 9),
        away: decodeInput(b % 3 === 0 ? b : b % 9),
      };
      [hold, rng] = nextInt(rng, 5, 40);
    }
    rec.tick(inputs);
    s = stepBoth(s, inputs);
  }
  return { log: rec.encode(), final: s as MatchState };
}

describe('nhật ký v2', () => {
  const log: InputLog2 = {
    runs: [
      [5, 0, 0],
      [3, 20, 7],
    ],
    subs: [
      { tick: 2, team: 'home', out: 'P1', bench: 'B1' },
      { tick: 4, team: 'away', out: 'P2', bench: 'B2' },
    ],
  };

  it('có tiền tố v2., khứ hồi, nhận ra đúng v1/v2', () => {
    const text = encodeLog2(log);
    expect(text.startsWith(LOG_V2_PREFIX)).toBe(true);
    const { totalTicks, ...back } = decodeLog2(text);
    expect(back).toEqual(log);
    expect(totalTicks).toBe(8);
    // v1 không bao giờ chứa dấu '.', nên v1 không bị nhận nhầm thành v2 và ngược lại.
    const v1 = encodeLog({ runs: [[5, 0]], subs: [] });
    expect(v1.includes('.')).toBe(false);
    expect(() => decodeLog2(v1)).toThrow(ReplayLogError);
    expect(() => decodeLog(text)).toThrow(ReplayLogError);
  });

  it('chặn log hỏng; thay người tối đa 3 mỗi đội (không phải 3 cả hai)', () => {
    const good = encodeLog2(log);
    expect(() => decodeLog2(good.slice(0, -2))).toThrow(ReplayLogError);
    expect(() => decodeLog2(good + 'AA')).toThrow(ReplayLogError);
    expect(() => decodeLog2(encodeLog2({ runs: [[0, 0, 0]], subs: [] }))).toThrow(ReplayLogError);
    expect(() => decodeLog2(encodeLog2({ runs: [[1, 0, 9 * 512]], subs: [] }))).toThrow(
      ReplayLogError,
    );
    const sub = (team: 'home' | 'away', i: number) => ({
      tick: i,
      team,
      out: 'P2' as const,
      bench: 'B1' as const,
    });
    const three = (team: 'home' | 'away') => [1, 2, 3].map((i) => sub(team, i));
    const ok = {
      runs: [[10, 0, 0]] as [number, number, number][],
      subs: [...three('home'), ...three('away')].sort((a, b) => a.tick - b.tick),
    };
    expect(decodeLog2(encodeLog2(ok)).subs).toHaveLength(6);
    const bad = { ...ok, subs: [...three('home'), sub('home', 4)] };
    expect(() => decodeLog2(encodeLog2(bad))).toThrow(ReplayLogError);
  });

  it('InputRecorder2 gộp đoạn theo cặp (home, away) và bỏ qua id thay người lạ', () => {
    const rec = new InputRecorder2();
    const a = decodeInput(20);
    const b = decodeInput(7);
    rec.tick({ home: a, away: b });
    rec.tick({ home: a, away: b });
    rec.tick({ home: a, away: a });
    rec.sub(1, 'away', 'away-P3', 'B2');
    rec.sub(1, 'away', 'xxx', 'B2');
    const back = decodeLog2(rec.encode());
    expect(back.runs).toEqual([
      [2, 20, 7],
      [1, 20, 20],
    ]);
    expect(back.subs).toEqual([{ tick: 1, team: 'away', out: 'P3', bench: 'B2' }]);
  });
});

describe('replayMatch / replayToState với v2', () => {
  it.each([3, 11])('seed %i: khớp chạy trực tiếp stepBoth (thay người cả hai đội)', (seed) => {
    const setup = setup2(seed);
    const { log, final } = playTwoHumans(setup, seed + 100);
    expect(log.startsWith(LOG_V2_PREFIX)).toBe(true);
    expect(final.phase).toBe('full_time');
    expect(final.substitutions.map((x) => x.team).sort()).toEqual(['away', 'home']);
    const r = replayMatch(setup, log);
    expect(r.phase).toBe('full_time');
    expect(r.score).toEqual(final.score);
    expect(r.ticks).toBe(final.tick);
    expect(stateHash(replayToState(setup, log))).toBe(stateHash(final));
  });

  it('replayToState: log cụt cho đúng state tại tick đó (client vào lại giữa trận)', () => {
    const setup = setup2(5);
    for (const stopAt of [1, 600, 3000]) {
      const { log, final } = playTwoHumans(setup, 77, stopAt);
      expect(final.tick).toBe(stopAt);
      expect(stateHash(replayToState(setup, log))).toBe(stateHash(final));
    }
  });
});

describe('nhật ký v1 cũ vẫn đọc được', () => {
  it('replayMatch(v1) ra cùng kết quả như chạy trực tiếp, replayToState khớp hash', () => {
    for (const seed of [3, 4]) {
      const setup = buildMatchSetup({
        seed,
        difficulty: 'easy',
        home: starterLikeTeam,
        away: cpuEasyTeam,
      });
      const { log, final } = playScriptedMatch(setup, seed, { subAtTick: 3000 });
      expect(log.startsWith(LOG_V2_PREFIX)).toBe(false);
      const r = replayMatch(setup, log);
      expect(r.score).toEqual(final.score);
      expect(r.ticks).toBe(final.tick);
      expect(stateHash(replayToState(setup, log))).toBe(stateHash(final));
    }
  });
});

describe('runLog: thay người ở biên và đội máy (C1-2)', () => {
  it('thay người ở tick đúng bằng tổng tick vẫn được áp, hash khớp live', () => {
    const setup = setup2(7);
    const rec = new InputRecorder2();
    let s = createMatch(setup);
    const idle = { home: decodeInput(0), away: decodeInput(0) };
    for (let i = 0; i < 5; i++) {
      rec.tick(idle);
      s = stepBoth(s, idle);
    }
    const out = s.players.find((p) => p.team === 'home' && p.position !== 'GK')!;
    const r = substitute(s, 'home', out.id, 'B1');
    if (!r.ok) throw new Error(r.reason);
    s = r.state;
    rec.sub(s.tick, 'home', out.id, 'B1');
    const replayed = replayToState(setup, rec.encode());
    expect(replayed.substitutions.length).toBe(1);
    expect(stateHash(replayed)).toBe(stateHash(s));
  });

  it('log v2 có thay người của đội máy bị từ chối khi replay trận một người', () => {
    const setup = buildMatchSetup({ seed: 3, difficulty: 'easy', home: starterLikeTeam, away: cpuEasyTeam });
    const rec = new InputRecorder2();
    rec.tick({ home: decodeInput(0), away: decodeInput(0) });
    rec.sub(1, 'away', 'away-P3', 'B2');
    expect(() => replayToState(setup, rec.encode())).toThrow(ReplayLogError);
  });
});
