import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../index';
import { vec2, type Vec2 } from '../math/vec2';
import { BALL_RADIUS, GOAL_HEIGHT, GOAL_WIDTH, HALF_LENGTH, HALF_WIDTH } from '../pitch';
import type { BallState, TeamSide } from '../types';
import { GOAL_DEPTH, POST_RADIUS, stepBall, type BallEvent } from './ball';

const ball = (pos: Vec2, vel: Vec2, z = 0, vz = 0): BallState => ({ pos, vel, z, vz });

/** Chạy tối đa `maxTicks` tick, gom mọi sự kiện. */
function run(
  start: BallState,
  maxTicks: number,
  opts: { attackingPlusX?: TeamSide; stopWhen?: (b: BallState) => boolean } = {},
) {
  let b = start;
  const events: BallEvent[] = [];
  const trace: BallState[] = [];
  for (let i = 0; i < maxTicks; i++) {
    const r = stepBall(b, opts.attackingPlusX ?? 'home');
    b = r.ball;
    events.push(...r.events);
    trace.push(b);
    if (opts.stopWhen?.(b)) break;
  }
  return { ball: b, events, trace };
}

const isStill = (b: BallState) => b.vel.x === 0 && b.vel.y === 0 && b.z === 0 && b.vz === 0;

describe('stepBall — lăn trên cỏ', () => {
  it('bóng đứng yên thì giữ nguyên, không sự kiện', () => {
    const r = stepBall(ball(vec2(3, 4), vec2(0, 0)), 'home');
    expect(r.ball).toEqual(ball(vec2(3, 4), vec2(0, 0)));
    expect(r.events).toEqual([]);
  });

  it('không sửa state đầu vào', () => {
    const start = ball(vec2(0, 0), vec2(5, 0), 1, 2);
    const copy: unknown = JSON.parse(JSON.stringify(start));
    stepBall(start, 'home');
    expect(start).toEqual(copy);
  });

  it('lăn 10 m/s thì dừng hẳn sau 15–25 m, trong dưới 8 s', () => {
    const { ball: end, trace } = run(ball(vec2(-20, 0), vec2(10, 0)), 20 * TICK_RATE, {
      stopWhen: isStill,
    });
    expect(isStill(end)).toBe(true);
    const dist = end.pos.x - -20;
    expect(dist).toBeGreaterThan(15);
    expect(dist).toBeLessThan(25);
    expect(trace.length).toBeLessThan(8 * TICK_RATE);
  });

  it('lăn nhanh hơn thì đi xa hơn', () => {
    const slow = run(ball(vec2(-25, 0), vec2(6, 0)), 20 * TICK_RATE, { stopWhen: isStill });
    const fast = run(ball(vec2(-25, 0), vec2(9, 0)), 20 * TICK_RATE, { stopWhen: isStill });
    expect(fast.ball.pos.x).toBeGreaterThan(slow.ball.pos.x);
  });
});

describe('stepBall — bóng bổng', () => {
  it('rơi xuống đất rồi nảy thấp dần, cuối cùng lăn trên cỏ', () => {
    const { trace } = run(ball(vec2(-25, 0), vec2(5, 0), 0, 9), 10 * TICK_RATE);
    // Đỉnh của từng cung bay: z lớn nhất giữa hai lần chạm đất (vz từ âm thành ≥ 0).
    const peaks: number[] = [];
    let peak = 0;
    for (let i = 1; i < trace.length; i++) {
      const b = trace[i]!;
      peak = Math.max(peak, b.z);
      if (trace[i - 1]!.vz < 0 && b.vz >= 0) {
        peaks.push(peak);
        peak = 0;
      }
    }
    expect(peaks.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < peaks.length; i++) expect(peaks[i]!).toBeLessThan(peaks[i - 1]!);
    // Đỉnh đầu ≈ vz²/2g = 81/19.62 ≈ 4.1 m (cản không khí làm thấp hơn chút).
    expect(peaks[0]!).toBeGreaterThan(3.7);
    expect(peaks[0]!).toBeLessThan(4.2);
    const last = trace[trace.length - 1]!;
    expect(last.z).toBe(0);
    expect(last.vz).toBe(0);
  });

  it('z không bao giờ âm', () => {
    const { trace } = run(ball(vec2(-25, 0), vec2(8, 3), 0, 12), 6 * TICK_RATE);
    expect(trace.every((b) => b.z >= 0)).toBe(true);
  });
});

describe('stepBall — bóng ra ngoài', () => {
  it('qua hẳn vạch biên dọc → ball_out touch, phát một lần, điểm nằm trên vạch', () => {
    const { events } = run(ball(vec2(5, HALF_WIDTH - 2), vec2(0, 8)), 3 * TICK_RATE);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e).toMatchObject({ type: 'ball_out', line: 'touch' });
    if (e.type !== 'ball_out') return;
    expect(e.point.y).toBeCloseTo(HALF_WIDTH, 5);
    expect(e.point.x).toBeCloseTo(5, 5);
  });

  it('bóng đè vạch (tâm qua vạch nhưng chưa hết bán kính) vẫn trong sân', () => {
    // Lăn chậm ra phía -y, dừng khi tâm đã qua vạch nhưng chưa quá một bán kính.
    const { ball: end, events } = run(
      ball(vec2(0, -HALF_WIDTH + 0.5), vec2(0, -1.5)),
      TICK_RATE * 2,
      {
        stopWhen: isStill,
      },
    );
    expect(end.pos.y).toBeLessThan(-HALF_WIDTH);
    expect(end.pos.y).toBeGreaterThan(-HALF_WIDTH - BALL_RADIUS);
    expect(events).toEqual([]);
  });

  it('vận tốc không hữu hạn (NaN/Infinity) → RangeError thay vì treo vòng lặp', () => {
    expect(() => stepBall(ball(vec2(0, 0), vec2(Infinity, 0)), 'home')).toThrow(RangeError);
    expect(() => stepBall(ball(vec2(0, 0), vec2(1, 0), 0, NaN), 'home')).toThrow(RangeError);
  });

  it('qua vạch cuối ngoài khung thành → ball_out goal', () => {
    const { events } = run(ball(vec2(HALF_LENGTH - 3, 8), vec2(10, 0)), 2 * TICK_RATE);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'ball_out', line: 'goal' });
  });

  it('bay trên xà → ball_out goal, không phải bàn thắng', () => {
    // Bay ở độ cao 3 m (xà 2 m), bay thêm 2 m trong 0.1 s nên không kịp rơi.
    const { events } = run(ball(vec2(HALF_LENGTH - 2, 0), vec2(20, 0), 3, 2), TICK_RATE);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'ball_out', line: 'goal' });
  });
});

describe('stepBall — bàn thắng', () => {
  it('lăn vào khung thành dưới xà → goal cho đội tấn công về +x', () => {
    const { events } = run(ball(vec2(HALF_LENGTH - 5, 0), vec2(15, 0)), 2 * TICK_RATE);
    expect(events).toEqual([{ type: 'goal', team: 'home' }]);
  });

  it('vào khung thành phía -x → goal cho đội còn lại', () => {
    const { events } = run(ball(vec2(-HALF_LENGTH + 5, 1), vec2(-15, 0), 0.5, 1), 2 * TICK_RATE);
    expect(events).toEqual([{ type: 'goal', team: 'away' }]);
  });

  it('đội khách tấn công về +x (hiệp 2) → bàn ở khung +x thuộc đội khách', () => {
    const { events } = run(ball(vec2(HALF_LENGTH - 5, 0), vec2(15, 0)), 2 * TICK_RATE, {
      attackingPlusX: 'away',
    });
    expect(events).toEqual([{ type: 'goal', team: 'away' }]);
  });

  it('lưới giữ bóng: bóng sút mạnh nằm lại trong khung thành', () => {
    const { ball: end } = run(ball(vec2(HALF_LENGTH - 5, 1), vec2(30, 0), 0.5, 2), 5 * TICK_RATE);
    expect(end.pos.x).toBeGreaterThan(HALF_LENGTH);
    expect(end.pos.x).toBeLessThanOrEqual(HALF_LENGTH + GOAL_DEPTH);
    expect(Math.abs(end.pos.y)).toBeLessThanOrEqual(GOAL_WIDTH / 2);
    expect(end.z + 2 * BALL_RADIUS).toBeLessThanOrEqual(GOAL_HEIGHT + 1e-9);
  });
});

describe('stepBall — cột dọc và xà ngang', () => {
  // Tâm cột nằm ngoài mép trong một bán kính cột.
  const postY = GOAL_WIDTH / 2 + POST_RADIUS;

  it('lăn thẳng vào cột dọc → bật ngược ra, không thành bàn', () => {
    const { events, trace } = run(ball(vec2(HALF_LENGTH - 5, postY), vec2(12, 0)), TICK_RATE);
    expect(events.find((e) => e.type === 'goal')).toBeUndefined();
    expect(trace.some((b) => b.vel.x < 0)).toBe(true);
  });

  it('sút mạnh vào cột (30 m/s) cũng không xuyên qua', () => {
    const { trace } = run(ball(vec2(HALF_LENGTH - 5, postY), vec2(30, 0)), TICK_RATE / 2);
    expect(trace.some((b) => b.vel.x < 0)).toBe(true);
  });

  it('bay trúng xà → bật ra, không thành bàn', () => {
    // Tâm bóng ngang tâm xà, bay thẳng; 3 m ở 20 m/s là 0.15 s nên rơi chưa tới 0.1 m.
    const start = ball(
      vec2(HALF_LENGTH - 3, 0),
      vec2(20, 0),
      GOAL_HEIGHT + POST_RADIUS - BALL_RADIUS,
      1,
    );
    const { events, trace } = run(start, TICK_RATE / 2);
    expect(events.find((e) => e.type === 'goal')).toBeUndefined();
    expect(trace.some((b) => b.vel.x < 0)).toBe(true);
  });
});

describe('stepBall — tất định', () => {
  it('cùng đầu vào → cùng kết quả', () => {
    const start = ball(vec2(-10, -5), vec2(14, 6), 0.2, 7);
    expect(run(start, 600)).toEqual(run(start, 600));
  });
});
