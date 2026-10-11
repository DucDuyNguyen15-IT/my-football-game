import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from '../fixtures/demoTeams';
import { createMatch } from '../match';
import { length, sub, vec2, ZERO, type Vec2 } from '../math/vec2';
import { seedRng } from '../rng';
import { HALF_LENGTH } from '../pitch';
import type { PlayerState, Restart } from '../types';
import {
  AI_MIN_HOLD_TICKS,
  decideCarrier,
  decideRestartKick,
  PRESSURE_DIST,
  supportSpot,
  type CarrierContext,
} from './player';

/*
 * AI người có bóng (task 5.8a). Đội nhà tấn công về +x ở hiệp 1; home-P3 dẫn bóng. Mọi người
 * không được nhắc tới đứng dồn ở hai biên phần sân nhà, xa bóng.
 */

const base = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed: 1, difficulty: 'easy' });
const CARRIER = 'home-P3';

function place(at: Record<string, Vec2>, drop: string[] = []): PlayerState[] {
  return base.players
    .filter((p) => !drop.includes(p.id))
    .map((p, i) => ({
      ...p,
      pos: at[p.id] ?? vec2(-25 + i * 0.9, p.team === 'home' ? -19 : 19),
      vel: ZERO,
      facing: vec2(1, 0),
    }));
}

function ctx(players: PlayerState[], over: Partial<CarrierContext> = {}): CarrierContext {
  return {
    carrier: players.find((p) => p.id === CARRIER)!,
    players,
    half: 1,
    heldTicks: 60,
    minHoldTicks: AI_MIN_HOLD_TICKS,
    ...over,
  };
}

/** Thủ môn đội khách giữ khung thành +x. */
const AWAY_GK = { 'away-GK': vec2(HALF_LENGTH - 1.5, 0) };
const ALL_MATES = ['home-P1', 'home-P2', 'home-P4', 'home-P5', 'home-P6', 'home-GK'];

describe('decideCarrier', () => {
  it('gần khung thành, đường sút thoáng → sút về khung thành đối phương', () => {
    const a = decideCarrier(ctx(place({ ...AWAY_GK, [CARRIER]: vec2(HALF_LENGTH - 11, 1) })));
    expect(a.type).toBe('shoot');
    if (a.type !== 'shoot') return;
    expect(a.target.x).toBe(HALF_LENGTH);
    expect(Math.abs(a.target.y)).toBeLessThan(2.5);
  });

  it('xa khung thành, phía trước có người chặn, đồng đội trống phía trên → chuyền cho người đó', () => {
    const a = decideCarrier(
      ctx(
        place({
          ...AWAY_GK,
          [CARRIER]: vec2(-10, 0),
          'away-P2': vec2(-5, -2),
          'home-P6': vec2(5, 4),
        }),
      ),
    );
    expect(a).toMatchObject({ type: 'pass', targetId: 'home-P6' });
  });

  it('không ai trống phía trước, không bị áp sát → rê về phía khung thành đối phương', () => {
    const a = decideCarrier(ctx(place({ ...AWAY_GK, [CARRIER]: vec2(-10, 0) })));
    expect(a.type).toBe('dribble');
    if (a.type !== 'dribble') return;
    expect(a.move.x).toBeGreaterThan(0.5);
  });

  it('rê né đối phương đứng chếch phía trước', () => {
    const a = decideCarrier(
      ctx(place({ ...AWAY_GK, [CARRIER]: vec2(-10, 0), 'away-P2': vec2(-7, 1.5) })),
    );
    expect(a.type).toBe('dribble');
    if (a.type !== 'dribble') return;
    expect(a.move.y).toBeLessThan(0);
  });

  it('bị áp sát sát người → chuyền đi ngay (không rê), kể cả khi lựa chọn không đẹp', () => {
    const players = place({
      ...AWAY_GK,
      [CARRIER]: vec2(-10, 0),
      'away-P4': vec2(-9, 0),
      'home-P1': vec2(-18, -6),
    });
    expect(length(sub(vec2(-9, 0), vec2(-10, 0)))).toBeLessThan(PRESSURE_DIST);
    const a = decideCarrier(ctx(players));
    expect(a).toMatchObject({ type: 'pass', targetId: 'home-P1' });
  });

  it('bị áp sát mà không còn ai để chuyền → phát bóng bổng lên phía trước', () => {
    const players = place(
      { ...AWAY_GK, [CARRIER]: vec2(-10, 0), 'away-P4': vec2(-9, 0) },
      ALL_MATES,
    );
    const a = decideCarrier(ctx(players));
    expect(a).toMatchObject({ type: 'pass', kind: 'lob', targetId: null });
    if (a.type !== 'pass') return;
    expect(a.to.x).toBeGreaterThan(-10);
  });

  it('chưa giữ bóng đủ lâu thì rê (kể cả khi bị áp sát)', () => {
    const players = place({ ...AWAY_GK, [CARRIER]: vec2(-10, 0), 'away-P4': vec2(-9, 0) });
    expect(decideCarrier(ctx(players, { heldTicks: 0 })).type).toBe('dribble');
  });

  it('đối phương chắn giữa đường chuyền → không chuyền sệt cho người đó', () => {
    const players = place({
      ...AWAY_GK,
      [CARRIER]: vec2(-10, 0),
      'home-P6': vec2(2, 0),
      'away-P5': vec2(-4, 0.2),
    });
    const a = decideCarrier(ctx(players));
    if (a.type === 'pass' && a.targetId === 'home-P6') expect(a.kind).toBe('lob');
  });

  it('hiệp 2 đổi sân: sút về khung thành phía −x', () => {
    const players = place({
      'away-GK': vec2(-HALF_LENGTH + 1.5, 0),
      [CARRIER]: vec2(-HALF_LENGTH + 11, 1),
    });
    const a = decideCarrier(ctx(players, { half: 2 }));
    expect(a.type).toBe('shoot');
    if (a.type === 'shoot') expect(a.target.x).toBe(-HALF_LENGTH);
  });
});

describe('decideRestartKick', () => {
  const restart = (over: Partial<Restart>): Restart => ({
    type: 'throw_in',
    team: 'home',
    spot: vec2(0, -20),
    takerId: CARRIER,
    startTick: 0,
    ...over,
  });

  it('ném biên → chuyền cho đồng đội', () => {
    const players = place({ [CARRIER]: vec2(0, -20.5), 'home-P4': vec2(3, -12) });
    const { action } = decideRestartKick(restart({}), players, 1, seedRng(1));
    expect(action).toMatchObject({ type: 'pass', targetId: 'home-P4' });
  });

  it('phạt đền → sút; đá phạt sát vòng cấm, đường sút thoáng → sút', () => {
    const pen = decideRestartKick(
      restart({ type: 'penalty', spot: vec2(HALF_LENGTH - 8, 0) }),
      place({ ...AWAY_GK, [CARRIER]: vec2(HALF_LENGTH - 8.6, 0) }),
      1,
      seedRng(1),
    );
    expect(pen.action.type).toBe('shoot');
    const fk = decideRestartKick(
      restart({ type: 'free_kick', spot: vec2(HALF_LENGTH - 13, 2) }),
      place({ ...AWAY_GK, [CARRIER]: vec2(HALF_LENGTH - 13.6, 2) }),
      1,
      seedRng(1),
    );
    expect(fk.action.type).toBe('shoot');
  });

  it('không có ai để chuyền → chuyền vào khoảng trống theo hướng đang quay mặt', () => {
    const players = place({ [CARRIER]: vec2(0, -20.5) }, ALL_MATES);
    const { action } = decideRestartKick(restart({}), players, 1, seedRng(1));
    expect(action).toMatchObject({ type: 'pass', targetId: null });
  });
});

describe('supportSpot', () => {
  it('dạt khỏi đối phương đứng gần điểm neo, không quá 3 m', () => {
    const spot = supportSpot(vec2(0, 0), 'home', place({ 'away-P4': vec2(1, 0) }));
    expect(spot.x).toBeLessThan(0);
    expect(length(spot)).toBeLessThanOrEqual(3 + 1e-9);
  });

  it('không có đối phương gần thì giữ điểm neo', () => {
    expect(supportSpot(vec2(0, 0), 'home', place({}))).toEqual(vec2(0, 0));
  });
});
