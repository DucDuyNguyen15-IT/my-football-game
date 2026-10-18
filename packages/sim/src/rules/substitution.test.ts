import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from '../fixtures/demoTeams';
import { createMatch, step } from '../match';
import { NO_INPUT, type MatchState } from '../types';
import { AI_SUB_STAMINA, autoSubstitute, MAX_SUBS, substitute } from './substitution';

const base = () =>
  createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed: 5, difficulty: 'easy' });
const live = (s: MatchState): MatchState => ({
  ...s,
  phase: 'play',
  ballDead: false,
  restart: null,
});

describe('substitute — luật thay người (F3)', () => {
  it('bóng chết: người vào đứng chỗ người ra, giữ ô sơ đồ, thể lực đầy; dự bị bớt một', () => {
    const s0 = base();
    const out = s0.players.find((p) => p.id === 'home-P2')!;
    const tired = {
      ...s0,
      players: s0.players.map((p) => (p.id === out.id ? { ...p, stamina: 20 } : p)),
    };
    const r = substitute(tired, 'home', 'home-P2', 'B1');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const s = r.state;
    expect(s.players.some((p) => p.id === 'home-P2')).toBe(false);
    const sub = s.players.find((p) => p.id === 'home-B1')!;
    expect(sub.slot).toBe('P2');
    expect(sub.pos).toEqual(out.pos);
    expect(sub.stamina).toBe(100);
    expect(s.bench.home.some((p) => p.slot === 'B1')).toBe(false);
    expect(s.subsUsed.home).toBe(1);
    expect(s.substitutions).toEqual([
      { team: 'home', outId: 'home-P2', inId: 'home-B1', tick: s0.tick },
    ]);
  });

  it('bóng sống → từ chối', () => {
    const r = substitute(live(base()), 'home', 'home-P2', 'B1');
    expect(r).toEqual({ ok: false, reason: 'ball_live' });
  });

  it('hết giờ → từ chối', () => {
    const r = substitute({ ...base(), phase: 'full_time' }, 'home', 'home-P2', 'B1');
    expect(r.ok).toBe(false);
  });

  it(`tối đa ${MAX_SUBS} lượt: lượt thứ 4 bị từ chối`, () => {
    let s = base();
    const outs = ['home-P1', 'home-P2', 'home-P3'];
    const ins = ['B1', 'B2', 'B3'] as const;
    for (let i = 0; i < 3; i++) {
      const r = substitute(s, 'home', outs[i]!, ins[i]!);
      expect(r.ok).toBe(true);
      if (r.ok) s = r.state;
    }
    expect(substitute(s, 'home', 'home-P4', 'B4')).toEqual({ ok: false, reason: 'no_subs_left' });
  });

  it('người đã bị thẻ đỏ (rời sân) không thay được', () => {
    const s0 = base();
    const s = {
      ...s0,
      players: s0.players.filter((p) => p.id !== 'home-P3'),
      bookings: [{ playerId: 'home-P3', team: 'home' as const, card: 'red' as const, tick: 1 }],
    };
    expect(substitute(s, 'home', 'home-P3', 'B1')).toEqual({ ok: false, reason: 'not_on_pitch' });
  });

  it('người vào phải còn trên ghế dự bị; người đã ra sân không vào lại', () => {
    const s0 = base();
    const r1 = substitute(s0, 'home', 'home-P2', 'B1');
    if (!r1.ok) throw new Error('lượt 1 phải hợp lệ');
    expect(substitute(r1.state, 'home', 'home-P3', 'B1')).toEqual({
      ok: false,
      reason: 'not_on_bench',
    });
  });

  it('không thay đội khác, không thay thủ môn bằng cầu thủ ngoài sân', () => {
    const s0 = base();
    expect(substitute(s0, 'home', 'away-P2', 'B1')).toEqual({ ok: false, reason: 'not_on_pitch' });
    expect(substitute(s0, 'home', 'home-GK', 'B1')).toEqual({
      ok: false,
      reason: 'keeper_mismatch',
    });
  });

  it('người ra đang được điều khiển / đang thực hiện bóng chết → chuyển sang người vào', () => {
    const s0 = base();
    const takerId = s0.restart!.takerId;
    const r = substitute({ ...s0, controlledId: takerId }, 'home', takerId, 'B2');
    if (!r.ok) throw new Error('phải hợp lệ');
    expect(r.state.controlledId).toBe('home-B2');
    expect(r.state.restart!.takerId).toBe('home-B2');
  });

  it('sau khi thay, trận chạy tiếp bình thường', () => {
    const r = substitute(base(), 'away', 'away-P4', 'B2');
    if (!r.ok) throw new Error('phải hợp lệ');
    let s = r.state;
    for (let i = 0; i < 600; i++) s = step(s, NO_INPUT);
    expect(s.players.filter((p) => p.team === 'away')).toHaveLength(7);
  });
});

describe('autoSubstitute — đội máy tự thay', () => {
  const withStamina = (s: MatchState, id: string, stamina: number): MatchState => ({
    ...s,
    players: s.players.map((p) => (p.id === id ? { ...p, stamina } : p)),
  });

  it(`thay cầu thủ dưới ${AI_SUB_STAMINA}% thể lực, người mệt nhất trước, ưu tiên dự bị cùng vị trí`, () => {
    let s = withStamina(base(), 'away-P2', 25);
    s = withStamina(s, 'away-P5', 10);
    const next = autoSubstitute(s, 'away');
    expect(next.subsUsed.away).toBe(2);
    expect(next.substitutions[0]!.outId).toBe('away-P5');
    const p5 = s.players.find((p) => p.id === 'away-P5')!;
    const came = next.players.find((p) => p.id === next.substitutions[0]!.inId)!;
    const sameExists = s.bench.away.some((b) => b.position === p5.position);
    if (sameExists) expect(came.position).toBe(p5.position);
  });

  it('không ai dưới ngưỡng hoặc bóng sống → không thay', () => {
    const s = withStamina(base(), 'away-P2', AI_SUB_STAMINA);
    expect(autoSubstitute(s, 'away')).toBe(s);
    const tired = live(withStamina(base(), 'away-P2', 5));
    expect(autoSubstitute(tired, 'away')).toBe(tired);
  });

  it('step: bóng vừa chết thì đội máy tự thay, đội người chơi thì không', () => {
    const s0 = base();
    let s: MatchState = {
      ...live(s0),
      players: s0.players.map((p) =>
        p.id === 'away-P3' || p.id === 'home-P3' ? { ...p, stamina: 5 } : p,
      ),
      // Bóng sắp lăn qua vạch biên.
      ball: { pos: { x: 0, y: 19.9 }, vel: { x: 0, y: 8 }, z: 0, vz: 0 },
      ballOwnerId: null,
    };
    for (let i = 0; i < 60 && !s.ballDead; i++) s = step(s, NO_INPUT);
    expect(s.ballDead).toBe(true);
    expect(s.players.some((p) => p.id === 'away-P3')).toBe(false);
    expect(s.players.some((p) => p.id === 'home-P3')).toBe(true);
  });
});
