import { describe, expect, it } from 'vitest';
import {
  HALF_LENGTH,
  cpuEasyTeam,
  createMatch,
  starterLikeTeam,
  type MatchState,
} from '@pitch/sim';
import {
  REPLAY_AFTER_TICKS,
  REPLAY_SPEED,
  ReplayBuffer,
  advanceReplay,
  replayCamera,
  replayFrame,
  startReplay,
} from './replay';

const base = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, difficulty: 'easy', seed: 1 });
const at = (tick: number): MatchState => ({ ...base, tick });

describe('ReplayBuffer', () => {
  it('giữ đúng N trạng thái mới nhất theo thứ tự cũ → mới', () => {
    const buf = new ReplayBuffer(3);
    for (let t = 1; t <= 5; t++) buf.push(at(t));
    expect(buf.frames().map((s) => s.tick)).toEqual([3, 4, 5]);
    buf.clear();
    expect(buf.frames()).toEqual([]);
  });
});

describe('replay', () => {
  const frames = Array.from({ length: 10 }, (_, i) => at(100 + i));

  it('chạy chậm: một giây thực chỉ đi REPLAY_SPEED giây trận', () => {
    let r = startReplay(frames, 1);
    r = advanceReplay(r, 1 / 60 / REPLAY_SPEED);
    expect(r.head).toBeCloseTo(1, 5);
    const f = replayFrame(advanceReplay(r, 1 / 60 / REPLAY_SPEED / 2));
    expect(f.prev.tick).toBe(101);
    expect(f.curr.tick).toBe(102);
    expect(f.alpha).toBeCloseTo(0.5, 5);
  });

  it('xong khi phát tới khung cuối, không đọc quá buffer', () => {
    const r = advanceReplay(startReplay(frames, 1), 100);
    expect(r.done).toBe(true);
    expect(replayFrame(r).curr.tick).toBe(109);
  });

  it('báo đúng một lần khi đi qua khung bàn thắng (để rung lưới lại)', () => {
    let r = startReplay(
      Array.from({ length: REPLAY_AFTER_TICKS + 30 }, (_, i) => at(i)),
      1,
    );
    let hits = 0;
    for (let i = 0; i < 2000 && !r.done; i++) {
      r = advanceReplay(r, 1 / 60);
      if (r.crossedGoal) hits++;
    }
    expect(r.done).toBe(true);
    expect(hits).toBe(1);
  });
});

describe('replayCamera', () => {
  it('camera thấp, gần bóng hơn camera truyền hình, đứng phía trước khung thành bị ghi bàn', () => {
    const ball = { x: HALF_LENGTH - 8, y: 3 };
    const cam = replayCamera(null, ball, 1, 1 / 60);
    expect(cam.pos.y).toBeLessThan(8);
    expect(cam.pos.x).toBeLessThan(ball.x);
    expect(Math.hypot(cam.pos.x - ball.x, cam.pos.z - ball.y)).toBeLessThan(25);
    expect(cam.look.x).toBeCloseTo(ball.x, 5);
  });

  it('bám mượt theo bóng (không nhảy cóc giữa hai khung)', () => {
    const a = replayCamera(null, { x: 0, y: 0 }, 1, 1 / 60);
    const b = replayCamera(a, { x: 10, y: 0 }, 1, 1 / 60);
    expect(b.look.x).toBeGreaterThan(0);
    expect(b.look.x).toBeLessThan(2);
  });
});
