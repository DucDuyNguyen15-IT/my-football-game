import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from '../fixtures/demoTeams';
import { createMatch } from '../match';
import { length, sub, vec2, ZERO, type Vec2 } from '../math/vec2';
import { HALF_LENGTH, HALF_WIDTH, isInsidePitch } from '../pitch';
import { dribbleBall } from '../rules/possession';
import type { BallState, PlayerState, TeamSide } from '../types';
import { planTeam, type TeamPlan, type TeamPlanInput } from './team';

const base = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed: 7, difficulty: 'easy' });

const freeBall = (pos: Vec2): BallState => ({ pos, vel: ZERO, z: 0, vz: 0 });

/** Cầu thủ ở vị trí giao bóng, dời vài người tới chỗ cho trước. */
const players = (moved: Record<string, Vec2> = {}): PlayerState[] =>
  base.players.map((p) => (moved[p.id] ? { ...p, pos: moved[p.id]! } : p));

type Over = Partial<TeamPlanInput> & { team: TeamSide };

function input(over: Over): TeamPlanInput {
  return {
    half: 1,
    formation: base.formations[over.team],
    players: base.players,
    ball: freeBall(ZERO),
    ballOwnerId: null,
    restartTeam: null,
    aggression: 0.5,
    controlledId: null,
    ...over,
  };
}

/** `ownerId` dẫn bóng ở `at`; `moved` dời thêm người khác. */
function owned(ownerId: string, at: Vec2, over: Over, moved: Record<string, Vec2> = {}) {
  const ps = players({ ...moved, [ownerId]: at });
  const owner = ps.find((p) => p.id === ownerId)!;
  return input({ players: ps, ball: dribbleBall(owner), ballOwnerId: ownerId, ...over });
}

const avgAnchorX = (plan: TeamPlan): number => {
  const xs = Object.values(plan.anchors).map((a) => a.x);
  return xs.reduce((s, x) => s + x, 0) / xs.length;
};
const pressers = (plan: TeamPlan): string[] =>
  Object.entries(plan.roles)
    .filter(([, r]) => r === 'press')
    .map(([id]) => id);

describe('planTeam — chế độ', () => {
  it('đội có bóng tấn công, đội kia phòng ngự, bóng tự do thì cả hai chuyển trạng thái', () => {
    expect(planTeam(owned('away-P5', vec2(5, 0), { team: 'away' })).mode).toBe('attack');
    expect(planTeam(owned('away-P5', vec2(5, 0), { team: 'home' })).mode).toBe('defend');
    expect(planTeam(input({ team: 'home' })).mode).toBe('transition');
    expect(planTeam(input({ team: 'away' })).mode).toBe('transition');
  });

  it('bóng chết: đội được hưởng tấn công, đội kia phòng ngự', () => {
    expect(planTeam(input({ team: 'home', restartTeam: 'home' })).mode).toBe('attack');
    expect(planTeam(input({ team: 'away', restartTeam: 'home' })).mode).toBe('defend');
  });
});

describe('planTeam — điểm neo', () => {
  it('bóng ở 1/3 sân nhà thì trung bình x của đội phòng ngự lùi về khung thành nhà', () => {
    const center = planTeam(owned('away-P6', vec2(0, 0), { team: 'home' }));
    const deep = planTeam(owned('away-P6', vec2(-HALF_LENGTH + 8, 0), { team: 'home' }));
    expect(avgAnchorX(deep)).toBeLessThan(avgAnchorX(center) - 5);

    // Đội khách phòng ngự khung thành phía +x ở hiệp 1.
    const awayCenter = planTeam(owned('home-P6', vec2(0, 0), { team: 'away' }));
    const awayDeep = planTeam(owned('home-P6', vec2(HALF_LENGTH - 8, 0), { team: 'away' }));
    expect(avgAnchorX(awayDeep)).toBeGreaterThan(avgAnchorX(awayCenter) + 5);
  });

  it('hiệp 2 đổi sân: đội nhà phòng ngự khung thành phía +x', () => {
    const center = planTeam(owned('away-P6', vec2(0, 0), { team: 'home', half: 2 }));
    const deep = planTeam(owned('away-P6', vec2(HALF_LENGTH - 8, 0), { team: 'home', half: 2 }));
    expect(avgAnchorX(deep)).toBeGreaterThan(avgAnchorX(center) + 5);
  });

  it('cùng vị trí bóng, tấn công dâng cao hơn phòng ngự', () => {
    const atk = planTeam(owned('home-P3', vec2(0, 0), { team: 'home' }));
    const def = planTeam(owned('away-P3', vec2(0, 0), { team: 'home' }));
    expect(avgAnchorX(atk)).toBeGreaterThan(avgAnchorX(def));
  });

  it('hung hăng hơn thì khối đội hình dâng cao hơn', () => {
    const calm = planTeam(owned('away-P6', vec2(0, 0), { team: 'home', aggression: 0.1 }));
    const fierce = planTeam(owned('away-P6', vec2(0, 0), { team: 'home', aggression: 0.9 }));
    expect(avgAnchorX(fierce)).toBeGreaterThan(avgAnchorX(calm));
  });

  it('giữ thứ tự tuyến: hậu vệ sau tiền vệ, tiền vệ sau tiền đạo (theo hướng tấn công)', () => {
    // 2-3-1: P1–P2 hậu vệ, P3–P5 tiền vệ, P6 tiền đạo. Bóng ở chỗ không ai được giao áp sát/kèm.
    const plan = planTeam(input({ team: 'home', formation: '2-3-1', restartTeam: 'home' }));
    const x = (slot: string) => plan.anchors[`home-${slot}`]!.x;
    expect(Math.max(x('P1'), x('P2'))).toBeLessThan(Math.min(x('P3'), x('P4'), x('P5')));
    expect(Math.max(x('P3'), x('P4'), x('P5'))).toBeLessThan(x('P6'));
  });

  it('điểm neo luôn trong sân kể cả khi bóng ở góc', () => {
    for (const corner of [vec2(HALF_LENGTH, HALF_WIDTH), vec2(-HALF_LENGTH, -HALF_WIDTH)]) {
      for (const team of ['home', 'away'] as const) {
        for (const plan of [
          planTeam(input({ team, ball: freeBall(corner) })),
          planTeam(owned('away-P4', corner, { team })),
        ]) {
          for (const a of Object.values(plan.anchors)) expect(isInsidePitch(a)).toBe(true);
        }
      }
    }
  });

  it('thủ môn giữ khung thành nhà', () => {
    const plan = planTeam(owned('home-P6', vec2(HALF_LENGTH - 5, 0), { team: 'home' }));
    expect(plan.roles['home-GK']).toBe('keep');
    expect(plan.anchors['home-GK']!.x).toBeLessThan(-HALF_LENGTH + 3);
  });
});

describe('planTeam — áp sát', () => {
  it('phòng ngự: đúng 1 người áp sát, là cầu thủ ngoài sân gần người dẫn bóng nhất', () => {
    const plan = planTeam(
      owned('away-P6', vec2(-10, 5), { team: 'home' }, { 'home-P3': vec2(-11, 4) }),
    );
    expect(pressers(plan)).toEqual(['home-P3']);
  });

  it('không giao vai cho người đang được người chơi điều khiển', () => {
    const plan = planTeam(
      owned(
        'away-P6',
        vec2(-10, 5),
        { team: 'home', controlledId: 'home-P3' },
        { 'home-P3': vec2(-11, 4) },
      ),
    );
    expect(plan.roles['home-P3']).toBeUndefined();
    expect(plan.anchors['home-P3']).toBeUndefined();
    expect(pressers(plan)).toHaveLength(1);
    expect(pressers(plan)[0]).not.toBe('home-P3');
  });

  it('bóng tự do: mỗi đội đúng 1 người đuổi bóng, là người gần bóng nhất', () => {
    const ball = freeBall(vec2(-4, -12));
    const dist = (p: PlayerState) => length(sub(p.pos, ball.pos));
    for (const team of ['home', 'away'] as const) {
      const nearest = base.players
        .filter((p) => p.team === team && p.position !== 'GK')
        .reduce((a, b) => (dist(b) < dist(a) ? b : a));
      expect(pressers(planTeam(input({ team, ball })))).toEqual([nearest.id]);
    }
  });

  it('tấn công: không ai áp sát, người dẫn bóng mang vai "carry"', () => {
    const plan = planTeam(owned('home-P5', vec2(3, 3), { team: 'home' }));
    expect(pressers(plan)).toHaveLength(0);
    expect(plan.roles['home-P5']).toBe('carry');
  });

  it('bóng chết: không ai áp sát', () => {
    for (const team of ['home', 'away'] as const) {
      expect(pressers(planTeam(input({ team, restartTeam: 'away' })))).toHaveLength(0);
    }
  });
});

describe('planTeam — kèm người', () => {
  it('đối phương ở phần sân nhà được kèm, mỗi người một người kèm; người dẫn bóng không bị kèm thêm', () => {
    const plan = planTeam(
      owned(
        'away-P6',
        vec2(-12, 0),
        { team: 'home' },
        { 'away-P4': vec2(-15, 8), 'away-P5': vec2(-15, -8) },
      ),
    );
    const marked = Object.values(plan.marks);
    expect(marked).toEqual(expect.arrayContaining(['away-P4', 'away-P5']));
    expect(new Set(marked).size).toBe(marked.length);
    expect(marked).not.toContain('away-P6');
    for (const markerId of Object.keys(plan.marks)) {
      expect(plan.roles[markerId]).toBe('mark');
      expect(markerId.startsWith('home-')).toBe(true);
    }
  });

  it('đối phương ở xa phần sân nhà thì không bị kèm; tấn công thì không kèm ai', () => {
    expect(
      Object.keys(planTeam(owned('away-P6', vec2(25, 0), { team: 'home' })).marks),
    ).toHaveLength(0);
    const atk = planTeam(
      owned('home-P6', vec2(0, 0), { team: 'home' }, { 'away-P4': vec2(-10, 0) }),
    );
    expect(Object.keys(atk.marks)).toHaveLength(0);
  });
});
