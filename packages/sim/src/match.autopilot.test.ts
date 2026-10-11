import { describe, expect, it } from 'vitest';
import { PRESSURE_DIST } from './ai/player';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, sub, vec2, ZERO } from './math/vec2';
import { dribbleBall } from './rules/possession';
import { TICK_RATE } from './tick';
import { NO_INPUT, type MatchSetup, type MatchState } from './types';

/*
 * AI tầng cầu thủ trong trận (task 5.8a): `autopilot` cho AI điều khiển cả đội người chơi.
 * Trận đủ 2 × 180 s (PRD §5), xen kẽ máy Dễ/Khó.
 */

const setupFor = (seed: number): MatchSetup => ({
  home: starterLikeTeam,
  away: seed % 2 === 0 ? cpuHardTeam : cpuEasyTeam,
  seed,
  difficulty: seed % 2 === 0 ? 'hard' : 'easy',
  autopilot: true,
});

interface Report {
  final: MatchState;
  /** Lâu nhất (tick) một người giữ bóng liên tục trong lúc bị áp sát. */
  worstPressuredHold: number;
}

function play(setup: MatchSetup): Report {
  let s = createMatch(setup);
  let pressured = 0;
  let worst = 0;
  for (let i = 0; i < 30_000 && s.phase !== 'full_time'; i++) {
    const prevOwner = s.ballOwnerId;
    s = step(s, NO_INPUT);
    const owner = s.players.find((p) => p.id === s.ballOwnerId);
    const underPressure =
      s.phase === 'play' &&
      owner !== undefined &&
      s.players.some((o) => o.team !== owner.team && length(sub(o.pos, owner.pos)) < PRESSURE_DIST);
    pressured = underPressure ? (owner!.id === prevOwner ? pressured + 1 : 1) : 0;
    worst = Math.max(worst, pressured);
  }
  return { final: s, worstPressuredHold: worst };
}

describe('autopilot: AI-vs-AI 20 trận', () => {
  const reports = Array.from({ length: 20 }, (_, i) => play(setupFor(i + 1)));

  it('trận nào cũng đá hết và có ít nhất 1 cú sút', () => {
    for (const { final } of reports) {
      expect(final.phase).toBe('full_time');
      expect(final.shots.home + final.shots.away).toBeGreaterThanOrEqual(1);
    }
  });

  it('người có bóng bị áp sát sát người thì chuyền/sút trong ≤ 2 s', () => {
    for (const r of reports) expect(r.worstPressuredHold).toBeLessThanOrEqual(2 * TICK_RATE);
  });

  it('cả hai đội đều tạo được cú sút', () => {
    expect(reports.some((r) => r.final.shots.away > 0)).toBe(true);
    expect(reports.some((r) => r.final.shots.home > 0)).toBe(true);
  });
});

describe('autopilot', () => {
  it('bỏ qua input của người chơi (kể cả lúc nghỉ giữa hiệp)', () => {
    const a = play(setupFor(3)).final;
    let b = createMatch(setupFor(3));
    for (let i = 0; i < 30_000 && b.phase !== 'full_time'; i++) {
      b = step(b, { ...NO_INPUT, move: vec2(1, 0), pass: i % 7 === 0, shoot: i % 11 < 5 });
    }
    expect(b).toEqual(a);
  });

  it('mặc định tắt: đội nhà chờ người chơi giao bóng', () => {
    let s = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed: 1, difficulty: 'easy' });
    for (let i = 0; i < 5 * TICK_RATE; i++) s = step(s, NO_INPUT);
    expect(s.phase).toBe('kickoff');
    expect(s.autopilot).toBe(false);
  });
});

describe('đếm cú sút', () => {
  it('người chơi giữ-thả D khi có bóng → shots của đội nhà tăng 1', () => {
    const s0 = createMatch({ ...setupFor(1), autopilot: false });
    const players = s0.players.map((p) =>
      p.id === 'home-P3' ? { ...p, pos: vec2(5, 0), vel: ZERO } : p,
    );
    const s: MatchState = {
      ...s0,
      phase: 'play',
      ballDead: false,
      restart: null,
      players,
      ballOwnerId: 'home-P3',
      controlledId: 'home-P3',
      ball: dribbleBall(players.find((p) => p.id === 'home-P3')!),
      ai: null,
    };
    const shot = step(step(s, { ...NO_INPUT, shoot: true }), NO_INPUT);
    expect(shot.shots).toEqual({ home: 1, away: 0 });
    expect(shot.ballOwnerId).toBeNull();
  });
});
