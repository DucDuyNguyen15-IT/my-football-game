import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from '../fixtures/demoTeams';
import { createMatch } from '../match';
import { vec2, ZERO, type Vec2 } from '../math/vec2';
import { seedRng } from '../rng';
import { dribbleBall } from '../rules/possession';
import { standTackleReachFor, standTackleWinChance, tackleReachFor } from '../stats/params';
import type { PlayerState } from '../types';
import { resolveStandTackle, resolveTackle } from './tackle';

/*
 * Tắc bóng đứng (giữ D khi không có bóng, task 5.15) so với xoạc (task 5.6).
 * home-P1 đứng trước mặt away-P4 đang dẫn bóng về −x, bóng nằm giữa hai người.
 */

const base = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed: 1, difficulty: 'easy' });
const pick = (id: string) => base.players.find((p) => p.id === id)!;

function duel(opts: { me?: Vec2; defending?: number; ownerFacing?: Vec2 } = {}) {
  const owner: PlayerState = {
    ...pick('away-P4'),
    pos: vec2(0, 0),
    vel: ZERO,
    facing: opts.ownerFacing ?? vec2(-1, 0),
  };
  const meBase = pick('home-P1');
  const me: PlayerState = {
    ...meBase,
    pos: opts.me ?? vec2(-1.2, 0),
    vel: ZERO,
    facing: vec2(1, 0),
    stats: { ...meBase.stats, defending: opts.defending ?? meBase.stats.defending },
  };
  return { me, owner, players: [me, owner], ball: dribbleBall(owner) };
}

describe('tham số tắc bóng đứng', () => {
  it('tầm tắc đứng ngắn hơn tầm xoạc ở mọi mức Phòng ngự', () => {
    for (const def of [1, 50, 99]) {
      expect(standTackleReachFor(def)).toBeLessThan(tackleReachFor(def));
    }
  });

  it('tỉ lệ giành bóng tăng theo Phòng ngự, giảm theo Rê bóng', () => {
    expect(standTackleWinChance(90, 60)).toBeGreaterThan(standTackleWinChance(50, 60));
    expect(standTackleWinChance(70, 90)).toBeLessThan(standTackleWinChance(70, 40));
  });
});

describe('resolveStandTackle', () => {
  it('bóng ngoài tầm tắc đứng → không tắc, không tung xác suất', () => {
    const d = duel({ me: vec2(-3, 0) });
    const rng = seedRng(5);
    const r = resolveStandTackle(d.players, d.me, d.ball, d.owner.id, rng);
    expect(r.outcome).toEqual({ type: 'miss' });
    expect(r.rng).toBe(rng);
  });

  it('đồng đội dẫn bóng hoặc bóng tự do → không tắc', () => {
    const d = duel();
    const mate = { ...d.owner, team: 'home' as const };
    expect(resolveStandTackle([d.me, mate], d.me, d.ball, mate.id, seedRng(5)).outcome).toEqual({
      type: 'miss',
    });
    expect(resolveStandTackle(d.players, d.me, d.ball, null, seedRng(5)).outcome).toEqual({
      type: 'miss',
    });
  });

  it('từ phía sau vẫn là lỗi (không tính thô bạo), không tung xác suất', () => {
    // Người dẫn bóng quay mặt về +x, người tắc đứng sau lưng, bóng vẫn trong tầm.
    const d = duel({ me: vec2(-0.5, 0), ownerFacing: vec2(1, 0) });
    const ball = { ...d.ball, pos: vec2(0.3, 0) };
    const rng = seedRng(5);
    const r = resolveStandTackle(d.players, d.me, ball, d.owner.id, rng);
    expect(r.outcome).toEqual({
      type: 'foul',
      victimId: d.owner.id,
      fromBehind: true,
      rough: false,
    });
    expect(r.rng).toBe(rng);
  });

  it('tắc đứng có tỉ lệ phạm lỗi thấp hơn xoạc (1.000 lần, seed cố định)', () => {
    const d = duel();
    let standFouls = 0;
    let slideFouls = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const rng = seedRng(seed);
      if (resolveStandTackle(d.players, d.me, d.ball, d.owner.id, rng).outcome.type === 'foul') {
        standFouls++;
      }
      if (resolveTackle(d.players, d.me, d.ball, d.owner.id, rng).outcome.type === 'foul') {
        slideFouls++;
      }
    }
    expect(standFouls).toBeGreaterThan(0);
    expect(standFouls).toBeLessThan(slideFouls * 0.6);
  });

  it('Phòng ngự 90 giành bóng nhiều hơn Phòng ngự 50 (1.000 lần, seed cố định)', () => {
    const wins = (defending: number) => {
      const d = duel({ defending });
      let n = 0;
      for (let seed = 1; seed <= 1000; seed++) {
        const r = resolveStandTackle(d.players, d.me, d.ball, d.owner.id, seedRng(seed));
        if (r.outcome.type === 'won') n++;
      }
      return n;
    };
    const strong = wins(90);
    expect(strong).toBeGreaterThan(wins(50));
    expect(strong / 1000).toBeCloseTo(standTackleWinChance(90, duel().owner.stats.dribbling), 1);
  });

  it('trượt có thể là "failed" (không chạm người, người dẫn bóng giữ bóng) hoặc phạm lỗi', () => {
    const d = duel();
    const outcomes = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      const r = resolveStandTackle(d.players, d.me, d.ball, d.owner.id, seedRng(seed));
      outcomes.add(r.outcome.type);
    }
    expect(outcomes).toEqual(new Set(['won', 'failed', 'foul']));
  });
});
