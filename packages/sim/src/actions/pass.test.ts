import type { PlayerStats } from '@pitch/shared';
import { describe, expect, it } from 'vitest';
import { length, scale, sub, vec2, ZERO, type Vec2 } from '../math/vec2';
import { stepBall } from '../physics/ball';
import { seedRng, type RngState } from '../rng';
import { findCapturer } from '../rules/possession';
import { TICK_RATE } from '../tick';
import type { BallState, PlayerState, TeamSide } from '../types';
import { PASS_LEAD_MAX, choosePassTarget, groundPassSpeed, passBall, passLeadPoint } from './pass';

const STATS: PlayerStats = {
  pace: 70,
  shooting: 70,
  passing: 70,
  dribbling: 70,
  defending: 70,
  stamina: 70,
  reflexes: 30,
  handling: 30,
  positioning: 30,
  kicking: 30,
};

function player(
  id: string,
  pos: Vec2,
  over: Partial<Omit<PlayerState, 'stats'>> & { stats?: Partial<PlayerStats> } = {},
): PlayerState {
  const { stats, ...rest } = over;
  const [team, slot] = id.split('-') as [TeamSide, PlayerState['slot']];
  return {
    id,
    team,
    slot,
    position: slot === 'GK' ? 'GK' : 'MF',
    pos,
    vel: ZERO,
    facing: vec2(1, 0),
    stamina: 100,
    ...rest,
    stats: { ...STATS, ...stats },
  };
}

const RIGHT = vec2(1, 0);
const isStill = (b: BallState) => b.vel.x === 0 && b.vel.y === 0 && b.z === 0 && b.vz === 0;

/** Lăn/bay bóng tới khi dừng (tối đa 15 s), trả về toàn bộ quỹ đạo. */
function fly(start: BallState): BallState[] {
  const trace = [start];
  let b = start;
  for (let i = 0; i < 15 * TICK_RATE && !isStill(b); i++) {
    b = stepBall(b, 'home').ball;
    trace.push(b);
  }
  return trace;
}

/** Khoảng cách gần nhất từ quỹ đạo bóng tới đích. */
function lateralMiss(trace: BallState[], to: Vec2): number {
  const closest = trace.reduce((a, b) => (length(sub(b.pos, to)) < length(sub(a.pos, to)) ? b : a));
  return length(sub(closest.pos, to));
}

describe('choosePassTarget — đồng đội tốt nhất theo hướng', () => {
  const passer = player('home-P1', ZERO);

  it('chọn đồng đội nằm đúng hướng bấm, bỏ qua đối phương', () => {
    const players = [
      passer,
      player('away-P1', vec2(8, 0)),
      player('home-P2', vec2(10, 1)),
      player('home-P3', vec2(0, 10)),
    ];
    expect(choosePassTarget(players, passer, RIGHT)?.id).toBe('home-P2');
    expect(choosePassTarget(players, passer, vec2(0, 1))?.id).toBe('home-P3');
  });

  it('cùng hướng thì ưu tiên người gần hơn', () => {
    const players = [passer, player('home-P2', vec2(25, 0)), player('home-P3', vec2(10, 0.5))];
    expect(choosePassTarget(players, passer, RIGHT)?.id).toBe('home-P3');
  });

  it('không ai trong hình nón phía trước thì trả null', () => {
    const players = [passer, player('home-P2', vec2(-10, 0)), player('home-P3', vec2(0, -10))];
    expect(choosePassTarget(players, passer, RIGHT)).toBeNull();
  });

  it('bỏ qua người xa hơn tầm tối đa', () => {
    const players = [passer, player('home-P2', vec2(30, 0))];
    expect(choosePassTarget(players, passer, RIGHT, 25)).toBeNull();
    expect(choosePassTarget(players, passer, RIGHT, 35)?.id).toBe('home-P2');
  });

  // Người chơi chơi thử 5.9: chuyền thẳng vào người bị kèm thì bị cắt ngay (task 5.17).
  describe('đường chuyền bị chắn (chuyền sệt)', () => {
    const blocked = player('home-P2', vec2(10, 0));
    const open = player('home-P3', vec2(10, 4));
    const marker = player('away-P1', vec2(5, 0.3));

    it('đối thủ đứng trên đường chuyền thì chọn đồng đội thoáng gần hướng đó', () => {
      const players = [passer, blocked, open, marker];
      expect(choosePassTarget(players, passer, RIGHT)?.id).toBe('home-P3');
    });

    it('không có đối thủ chắn thì vẫn chọn người đúng hướng nhất', () => {
      expect(choosePassTarget([passer, blocked, open], passer, RIGHT)?.id).toBe('home-P2');
    });

    it('đối thủ đứng sau người nhận không tính là chắn', () => {
      const behind = player('away-P1', vec2(13, 0));
      expect(choosePassTarget([passer, blocked, open, behind], passer, RIGHT)?.id).toBe('home-P2');
    });

    it('chuyền bổng bay qua đầu nên không bị phạt chắn đường', () => {
      const players = [passer, blocked, open, marker];
      expect(choosePassTarget(players, passer, RIGHT, Infinity, 'lob')?.id).toBe('home-P2');
    });

    it('người duy nhất trong hướng bị chắn thì vẫn chuyền cho người đó', () => {
      expect(choosePassTarget([passer, blocked, marker], passer, RIGHT)?.id).toBe('home-P2');
    });
  });
});

describe('passLeadPoint — chuyền đón trước người nhận', () => {
  it('người nhận đứng yên thì chuyền vào chân', () => {
    const receiver = player('home-P2', vec2(12, 0));
    expect(passLeadPoint(ZERO, receiver, 'ground')).toEqual(receiver.pos);
  });

  it('người nhận đang chạy thì điểm chuyền nằm phía trước theo hướng chạy, có giới hạn', () => {
    const receiver = player('home-P2', vec2(12, 0), { vel: vec2(0, 6) });
    const lead = passLeadPoint(ZERO, receiver, 'ground');
    expect(lead.x).toBeCloseTo(12);
    expect(lead.y).toBeGreaterThan(1);
    expect(lead.y).toBeLessThanOrEqual(PASS_LEAD_MAX);
  });

  it('bóng sệt tới điểm đón trước gần lúc người nhận chạy tới (sai lệch < 1.5 m)', () => {
    const receiver = player('home-P2', vec2(12, 0), { vel: vec2(0, 2.5) });
    const lead = passLeadPoint(ZERO, receiver, 'ground');
    const speed = groundPassSpeed(length(lead));
    const dir = scale(lead, 1 / length(lead));
    const trace = fly({ pos: ZERO, vel: scale(dir, speed), z: 0, vz: 0 });
    const arrival = trace.findIndex((b) => length(sub(b.pos, ZERO)) >= length(lead));
    const runnerY = 2.5 * (arrival / TICK_RATE);
    expect(Math.abs(runnerY - lead.y)).toBeLessThan(1.5);
  });
});

describe('groundPassSpeed — lực chuyền thấp vừa tới đích', () => {
  it.each([5, 15, 30])('bóng lăn tới được %s m rồi dừng không quá xa sau đó', (d) => {
    const trace = fly({ pos: ZERO, vel: vec2(groundPassSpeed(d), 0), z: 0, vz: 0 });
    const end = trace[trace.length - 1]!;
    expect(end.pos.x).toBeGreaterThan(d);
    // Tới chân 6 m/s (5.17): không ai đón thì trôi thêm ~8 m như đường chuyền căng.
    expect(end.pos.x).toBeLessThan(d + 9);
  });

  it('chuyền xa cần lực lớn hơn', () => {
    expect(groundPassSpeed(30)).toBeGreaterThan(groundPassSpeed(15));
  });
});

describe('passBall — sai số theo Chuyền và thể lực', () => {
  const target = vec2(15, 0);

  function meanMiss(p: PlayerState, kind: 'ground' | 'lob', n = 200): number {
    let rng: RngState = seedRng(7);
    let total = 0;
    for (let i = 0; i < n; i++) {
      const r = passBall(p, ZERO, target, kind, rng);
      rng = r.rng;
      total += lateralMiss(fly(r.ball), target);
    }
    return total / n;
  }

  it('chuyền thấp: bóng nằm sát cỏ, đi về phía đích', () => {
    const { ball } = passBall(player('home-P1', ZERO), ZERO, target, 'ground', seedRng(1));
    expect(ball.z).toBe(0);
    expect(ball.vz).toBe(0);
    expect(ball.vel.x).toBeGreaterThan(0);
  });

  it('cùng PRNG → cùng cú chuyền; PRNG được tiến lên', () => {
    const p = player('home-P1', ZERO);
    const a = passBall(p, ZERO, target, 'ground', seedRng(3));
    const b = passBall(p, ZERO, target, 'ground', seedRng(3));
    expect(a).toEqual(b);
    expect(a.rng).not.toBe(seedRng(3));
  });

  it('Chuyền 99 lệch ít hơn Chuyền 30', () => {
    const good = meanMiss(player('home-P1', ZERO, { stats: { passing: 99 } }), 'ground');
    const bad = meanMiss(player('home-P1', ZERO, { stats: { passing: 30 } }), 'ground');
    expect(good).toBeLessThan(bad);
  });

  it('mệt (thể lực 0%) lệch nhiều hơn lúc khoẻ', () => {
    const fresh = meanMiss(player('home-P1', ZERO), 'ground');
    const tired = meanMiss(player('home-P1', ZERO, { stamina: 0 }), 'ground');
    expect(tired).toBeGreaterThan(fresh);
  });

  it('chuyền bổng: bóng bay lên và chạm đất lần đầu quanh đích (±30%)', () => {
    const far = vec2(25, 0);
    const p = player('home-P1', ZERO, { stats: { passing: 99 } });
    const { ball } = passBall(p, ZERO, far, 'lob', seedRng(5));
    expect(ball.vz).toBeGreaterThan(0);
    const trace = fly(ball);
    const landing = trace.find((b, i) => i > 0 && b.z === 0)!;
    expect(landing.pos.x).toBeGreaterThan(25 * 0.7);
    expect(landing.pos.x).toBeLessThan(25 * 1.3);
  });
});

it('PRD 5.4: chuyền thấp tới đồng đội đứng yên 15 m tới được ≥ 90% với Chuyền 80', () => {
  const passer = player('home-P1', ZERO, { stats: { passing: 80 } });
  const mate = player('home-P2', vec2(15, 0), { stats: { passing: 80, dribbling: 80 } });
  const from = vec2(0.6, 0);
  const N = 1000;
  let received = 0;
  let rng: RngState = seedRng(2024);
  for (let i = 0; i < N; i++) {
    const r = passBall(passer, from, mate.pos, 'ground', rng);
    rng = r.rng;
    let b = r.ball;
    for (let t = 0; t < 10 * TICK_RATE && !isStill(b); t++) {
      b = stepBall(b, 'home').ball;
      if (findCapturer([mate], b, null) === mate.id) {
        received++;
        break;
      }
    }
  }
  expect(received / N).toBeGreaterThanOrEqual(0.9);
});

describe('passBall — errorMult (AI theo mức độ khó)', () => {
  it('errorMult lớn hơn thì hướng chuyền lệch nhiều hơn (500 lần, seed cố định)', () => {
    const passer = player('home-P1', ZERO);
    const meanLateral = (errorMult: number) => {
      let sum = 0;
      for (let seed = 1; seed <= 500; seed++) {
        const { ball } = passBall(passer, ZERO, vec2(20, 0), 'ground', seedRng(seed), errorMult);
        sum += Math.abs(ball.vel.y / length(ball.vel));
      }
      return sum / 500;
    };
    expect(meanLateral(2)).toBeGreaterThan(meanLateral(1) * 1.6);
  });
});
