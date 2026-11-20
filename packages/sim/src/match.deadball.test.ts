import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { length, sub, vec2, ZERO } from './math/vec2';
import { TICK_DT } from './tick';
import { NO_INPUT, type MatchState, type TeamSide } from './types';

/*
 * Chờ thực hiện bóng chết không được giật: cầu thủ AI không chạy vào vùng cấm rồi bị luật đẩy ra
 * mỗi tick (vị trí nhảy lệch khỏi vận tốc).
 */

/** Trận đã chạy một lúc (AI đã lập kế hoạch), rồi đặt đá phạt cho `team` tại `spot`. */
function freeKick(seed: number, team: TeamSide): MatchState {
  let s = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed, difficulty: 'easy' });
  for (let i = 0; i < 400 + seed * 50; i++) s = step(s, NO_INPUT);
  const spot = vec2(-3 + seed, -2 + seed);
  const dist = (p: { pos: typeof spot }) => length(sub(p.pos, spot));
  const taker = s.players
    .filter((p) => p.team === team && p.position !== 'GK')
    .reduce((a, b) => (dist(b) < dist(a) ? b : a));
  return {
    ...s,
    phase: 'dead_ball',
    ballDead: true,
    ballOwnerId: null,
    lastShot: null,
    ball: { pos: spot, vel: ZERO, z: 0, vz: 0 },
    restart: {
      type: 'free_kick',
      team,
      spot,
      takerId: taker.id,
      startTick: s.tick,
      readyTick: s.tick,
    },
    controlledId: { home: team === 'home' ? taker.id : s.controlledId.home, away: '' },
  };
}

describe('chờ đá phạt không giật', () => {
  it.each([3, 4, 5].flatMap((seed) => (['home', 'away'] as const).map((t) => [seed, t] as const)))(
    'seed %i, đội %s được hưởng: không ai bị đẩy lệch vận tốc quá 2 tick',
    (seed, team) => {
      let s = freeKick(seed, team);
      const jumps: Record<string, number> = {};
      for (let i = 0; i < 170 && s.restart; i++) {
        const prev = s;
        s = step(s, NO_INPUT);
        for (const p of s.players) {
          const q = prev.players.find((x) => x.id === p.id)!;
          const off = sub(sub(p.pos, q.pos), vec2(p.vel.x * TICK_DT, p.vel.y * TICK_DT));
          if (length(off) > 0.01) jumps[p.id] = (jumps[p.id] ?? 0) + 1;
        }
      }
      for (const n of Object.values(jumps)) expect(n).toBeLessThanOrEqual(2);
    },
  );
});

describe('ngắm đá phạt (camera sau lưng)', () => {
  const held = (over: Partial<typeof NO_INPUT>) => ({ ...NO_INPUT, ...over });
  /** Đá phạt của người chơi, mọi người đã vào vị trí. */
  const ready = () => {
    let s = freeKick(3, 'home');
    const takerAt = (m: MatchState) =>
      length(sub(m.players.find((p) => p.id === m.restart!.takerId)!.pos, m.restart!.spot));
    for (let i = 0; i < 300 && takerAt(s) > 0.7; i++) s = step(s, NO_INPUT);
    return s;
  };

  it('giữ mũi tên phải xoay hướng ngắm sang phải, người đá quay theo', () => {
    let s = ready();
    const before = s.restart!.aim;
    for (let i = 0; i < 20; i++) s = step(s, held({ move: vec2(1, 0) }));
    const aim = s.restart!.aim!;
    expect(aim).not.toEqual(before);
    const taker = s.players.find((p) => p.id === s.restart!.takerId)!;
    expect(taker.facing.x).toBeCloseTo(aim.x, 6);
    expect(taker.facing.y).toBeCloseTo(aim.y, 6);
  });

  it('giữ Shift + mũi tên lên dời điểm chạm lên trên, hướng ngắm đứng yên', () => {
    let s = step(ready(), NO_INPUT);
    const aim = s.restart!.aim;
    for (let i = 0; i < 10; i++) s = step(s, held({ adjust: true, move: vec2(0, -1) }));
    expect(s.restart!.aim).toEqual(aim);
    expect(s.restart!.contact!.y).toBeGreaterThan(0);
  });

  it('đá phạt chạm lệch phải: bóng xoáy và cong sang trái so với cú chạm giữa', () => {
    const base = step(ready(), NO_INPUT);
    const kick = (contactRight: boolean) => {
      let s = base;
      if (contactRight)
        for (let i = 0; i < 40; i++) s = step(s, held({ adjust: true, move: vec2(1, 0) }));
      for (let i = 0; i < 30; i++) s = step(s, held({ shoot: true }));
      s = step(s, NO_INPUT);
      expect(s.phase).toBe('play');
      const kicked = s.ball;
      for (let i = 0; i < 40; i++) s = step(s, NO_INPUT);
      return { kicked, ball: s.ball };
    };
    const centre = kick(false);
    const curled = kick(true);
    expect(centre.kicked.spin).toBeUndefined();
    expect(curled.kicked.spin!.side).toBeLessThan(0);
    // Độ lệch sang phải (rightOf) so với hướng bay lúc rời chân: âm = cong sang trái.
    const sideDrift = (k: typeof centre) => {
      const d = sub(k.ball.pos, k.kicked.pos);
      const v = k.kicked.vel;
      const dir = vec2(v.x / length(v), v.y / length(v));
      const across = vec2(-dir.y, dir.x);
      return d.x * across.x + d.y * across.y;
    };
    // Độ xoáy có sai số theo chỉ số Sút nên chỉ đòi hỏi cong rõ về đúng phía.
    expect(sideDrift(curled)).toBeLessThan(sideDrift(centre) - 0.2);
  });
});
