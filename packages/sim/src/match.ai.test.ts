import { describe, expect, it } from 'vitest';
import { AI_PROFILES } from './ai/difficulty';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, normalize, sub, vec2, ZERO, type Vec2 } from './math/vec2';
import { isInsidePitch } from './pitch';
import { dribbleBall } from './rules/possession';
import { TICK_RATE } from './tick';
import {
  NO_INPUT,
  type MatchSetup,
  type MatchState,
  type PlayerInput,
  type TeamSide,
} from './types';

const setup: MatchSetup = {
  home: starterLikeTeam,
  away: cpuEasyTeam,
  seed: 99,
  difficulty: 'easy',
};

/**
 * Người chơi giả: chạy về phía bóng, cứ 45 tick bấm chuyền một lần (có bóng thì chuyền, không có
 * thì đổi người, bóng chết/nghỉ giữa hiệp thì thực hiện tiếp).
 */
function botInput(s: MatchState): PlayerInput {
  const me = s.players.find((p) => p.id === s.controlledId);
  const move = me ? normalize(sub(s.ball.pos, me.pos)) : ZERO;
  return { ...NO_INPUT, move, pass: s.tick % 45 === 0 };
}

const pressCount = (s: MatchState, team: TeamSide): number =>
  Object.values(s.ai?.[team]?.plan.roles ?? {}).filter((r) => r === 'press').length;

describe('AI đội trong trận', () => {
  it('trận AI-vs-AI chạy hết không lỗi, không ai ra ngoài sân quá 2 s, luôn đúng 1 người áp sát', () => {
    let s = createMatch({ ...setup, halfLengthSec: 60 });
    const outside = new Map<string, number>();
    let worstOutside = 0;
    let pressChecks = 0;
    for (let i = 0; i < 20_000 && s.phase !== 'full_time'; i++) {
      s = step(s, botInput(s));
      for (const p of s.players) {
        const n = isInsidePitch(p.pos) ? 0 : (outside.get(p.id) ?? 0) + 1;
        outside.set(p.id, n);
        worstOutside = Math.max(worstOutside, n);
      }
      if (s.phase !== 'play') continue;
      for (const team of ['home', 'away'] as const) {
        // Tick vừa thực hiện bóng chết: kế hoạch lập lại ở tick sau.
        const plan = s.ai?.[team]?.plan;
        if (!plan || plan.deadBall) continue;
        const n = pressCount(s, team);
        if (plan.mode === 'attack') {
          expect(n).toBe(0);
        } else {
          expect(n).toBe(1);
          pressChecks++;
        }
      }
    }
    expect(s.phase).toBe('full_time');
    expect(worstOutside).toBeLessThanOrEqual(2 * TICK_RATE);
    expect(pressChecks).toBeGreaterThan(0);
  });

  it('cầu thủ không do người chơi điều khiển tự di chuyển', () => {
    let s = createMatch(setup);
    s = step(s, { ...NO_INPUT, pass: true }); // giao bóng
    const before = new Map(s.players.map((p) => [p.id, p.pos]));
    for (let i = 0; i < 2 * TICK_RATE; i++) s = step(s, NO_INPUT);
    const moved = s.players.filter(
      (p) => p.id !== s.controlledId && length(sub(p.pos, before.get(p.id)!)) > 1,
    );
    expect(moved.length).toBeGreaterThanOrEqual(6);
  });

  it('đội phòng ngự lùi về khi đối phương dẫn bóng ở 1/3 sân nhà', () => {
    const avgHomeX = (carrierAt: Vec2): number => {
      const s0 = createMatch(setup);
      const players = s0.players.map((p) => (p.id === 'away-P6' ? { ...p, pos: carrierAt } : p));
      let s: MatchState = {
        ...s0,
        phase: 'play',
        ballDead: false,
        restart: null,
        players,
        ballOwnerId: 'away-P6',
        ball: dribbleBall(players.find((p) => p.id === 'away-P6')!),
      };
      for (let i = 0; i < 3 * TICK_RATE; i++) s = step(s, NO_INPUT);
      const home = s.players.filter((p) => p.team === 'home' && p.id !== s.controlledId);
      return home.reduce((sum, p) => sum + p.pos.x, 0) / home.length;
    };
    expect(avgHomeX(vec2(-18, 4))).toBeLessThan(avgHomeX(vec2(10, 4)) - 3);
  });

  it('đội máy lập lại kế hoạch theo độ trễ phản ứng của mức độ khó', () => {
    for (const [difficulty, team] of [
      ['easy', cpuEasyTeam],
      ['hard', cpuHardTeam],
    ] as const) {
      let s = createMatch({ ...setup, away: team, difficulty });
      s = step(s, { ...NO_INPUT, pass: true });
      const thinks: number[] = [];
      for (let i = 0; i < 200; i++) {
        const prev = s.ai?.away?.nextThinkTick;
        s = step(s, NO_INPUT);
        if (s.ai?.away?.nextThinkTick !== prev) thinks.push(s.tick);
      }
      const gaps = thinks.slice(1).map((t, i) => t - thinks[i]!);
      expect(Math.min(...gaps)).toBe(AI_PROFILES[difficulty].reactionDelayTicks);
    }
  });

  it('cùng seed + cùng input cho kết quả y hệt, kể cả sau JSON khứ hồi (AI tất định)', () => {
    const run = () => {
      let s = createMatch({ ...setup, halfLengthSec: 20 });
      for (let i = 0; i < 1500; i++) s = step(s, botInput(s));
      return s;
    };
    const a = run();
    expect(a).toEqual(run());
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});
