/**
 * Phát lại quay chậm sau bàn thắng (task 5.21f), thuần (không Three.js) để test. Sim bất biến nên
 * chỉ cần giữ tham chiếu các `MatchState` gần nhất trong buffer vòng; phát lại là vẽ lại chúng
 * chậm hơn, sim đứng yên trong lúc đó.
 */
import { TICK_DT, type MatchState, type Vec2 } from '@pitch/sim';
import type { CameraState } from './camera';

/** Tốc độ phát lại so với thời gian thực. */
export const REPLAY_SPEED = 0.35;
/** Phát lại chừng này tick trước khi bóng vào lưới… */
export const REPLAY_BEFORE_TICKS = 210;
/** …và chừng này tick sau đó (bóng rung lưới) — renderer chờ đủ số tick này mới bắt đầu. */
export const REPLAY_AFTER_TICKS = 50;
export const REPLAY_TICKS = REPLAY_BEFORE_TICKS + REPLAY_AFTER_TICKS;

/** Buffer vòng giữ `capacity` trạng thái mới nhất. */
export class ReplayBuffer {
  private readonly items: MatchState[] = [];
  private start = 0;

  constructor(private readonly capacity = REPLAY_TICKS) {}

  push(state: MatchState): void {
    if (this.items.length < this.capacity) {
      this.items.push(state);
      return;
    }
    this.items[this.start] = state;
    this.start = (this.start + 1) % this.capacity;
  }

  /** Các trạng thái từ cũ tới mới. */
  frames(): MatchState[] {
    return [...this.items.slice(this.start), ...this.items.slice(0, this.start)];
  }

  clear(): void {
    this.items.length = 0;
    this.start = 0;
  }
}

export interface Replay {
  readonly frames: readonly MatchState[];
  /** Vị trí phát (tính bằng tick, có phần lẻ để nội suy). */
  readonly head: number;
  /** Khung bóng vừa vào lưới. */
  readonly goalIndex: number;
  /** Khung thành bị ghi bàn: +1 bên phải (x > 0), −1 bên trái. */
  readonly side: 1 | -1;
  readonly done: boolean;
  /** Khung hình vừa rồi đi qua khoảnh khắc bàn thắng. */
  readonly crossedGoal: boolean;
}

export function startReplay(frames: readonly MatchState[], side: 1 | -1): Replay {
  return {
    frames,
    head: 0,
    goalIndex: Math.max(0, frames.length - 1 - REPLAY_AFTER_TICKS),
    side,
    done: frames.length < 2,
    crossedGoal: false,
  };
}

export function advanceReplay(r: Replay, dt: number): Replay {
  const last = r.frames.length - 1;
  const head = Math.min(last, r.head + (dt * REPLAY_SPEED) / TICK_DT);
  return {
    ...r,
    head,
    done: head >= last,
    crossedGoal: r.head < r.goalIndex && head >= r.goalIndex,
  };
}

/** Hai khung kề nhau quanh vị trí phát + tỉ lệ nội suy giữa chúng. */
export function replayFrame(r: Replay): { prev: MatchState; curr: MatchState; alpha: number } {
  const last = r.frames.length - 1;
  const base = Math.floor(r.head);
  if (base >= last) {
    const end = r.frames[last] as MatchState;
    return { prev: end, curr: end, alpha: 1 };
  }
  return {
    prev: r.frames[base] as MatchState,
    curr: r.frames[base + 1] as MatchState,
    alpha: r.head - base,
  };
}

/** Camera phát lại: thấp, sát đường biên, lùi về phía đội tấn công một chút để thấy bóng bay vào. */
const REPLAY_HEIGHT = 4.5;
const REPLAY_BACK_Z = 15;
const REPLAY_BEHIND_X = 9;
const REPLAY_FOLLOW_RATE = 4;

function replayCameraFor(look: Vec2, side: 1 | -1): CameraState {
  return {
    look: { x: look.x, y: 0.6, z: look.y },
    pos: { x: look.x - side * REPLAY_BEHIND_X, y: REPLAY_HEIGHT, z: look.y + REPLAY_BACK_Z },
  };
}

/** Camera một khung hình sau; `cam = null` thì đặt thẳng vào bóng (khung đầu tiên). */
export function replayCamera(
  cam: CameraState | null,
  ball: Vec2,
  side: 1 | -1,
  dt: number,
): CameraState {
  if (!cam) return replayCameraFor(ball, side);
  const k = 1 - Math.exp(-REPLAY_FOLLOW_RATE * dt);
  return replayCameraFor(
    { x: cam.look.x + (ball.x - cam.look.x) * k, y: cam.look.z + (ball.y - cam.look.z) * k },
    side,
  );
}
