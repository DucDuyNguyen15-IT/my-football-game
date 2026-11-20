/**
 * Logic thuần của client PvP lockstep (không WebSocket/DOM, test được trong Node):
 * bộ đệm jitter, cổng khung theo thứ tự, lịch sử state để hiển thị, quyết định gửi input/hash.
 * Xem docs/specs/pvp-realtime/research.md R2, R6.
 */
import { TICK_RATE, type MatchState } from '@pitch/sim';

export const FRAME_MS = 1000 / TICK_RATE;
export const MIN_DELAY_FRAMES = 3;
export const MAX_DELAY_FRAMES = 6;
export const HASH_EVERY_TICKS = 60;
/** Giữ chừng này state gần nhất để vòng vẽ nội suy (đủ cho độ trễ tối đa + dư). */
const HISTORY_SIZE = 24;

/**
 * Đo độ giật của khung tới: trung bình trượt của |khoảng cách giữa hai khung - 1 khung|. Bộ đệm
 * hiển thị = 3 khung + số khung độ giật, kẹp 3–6 (A17). Hạ chậm hơn nâng để không dao động.
 */
export class JitterEstimator {
  private last: number | null = null;
  private jitterMs = 0;
  private frames = MIN_DELAY_FRAMES;

  onArrival(nowMs: number): void {
    if (this.last !== null) {
      const dev = Math.abs(nowMs - this.last - FRAME_MS);
      this.jitterMs += (dev - this.jitterMs) / 16;
    }
    this.last = nowMs;
    const want = Math.min(
      MAX_DELAY_FRAMES,
      Math.max(MIN_DELAY_FRAMES, MIN_DELAY_FRAMES + Math.round(this.jitterMs / FRAME_MS)),
    );
    // Nâng ngay, hạ từ từ.
    this.frames = Math.max(want, this.frames - 0.01);
  }

  /** Số khung trễ khi hiển thị, nguyên 3–6. */
  delayFrames(): number {
    return Math.min(MAX_DELAY_FRAMES, Math.max(MIN_DELAY_FRAMES, Math.round(this.frames)));
  }
}

export type FrameVerdict = 'apply' | 'drop' | 'gap';

/** Cổng thứ tự: chỉ áp khung có tick đúng bằng tick kế tiếp; cũ hơn thì bỏ, mới hơn nghĩa là hụt khung. */
export class FrameGate {
  constructor(public next = 0) {}

  classify(tick: number): FrameVerdict {
    if (tick < this.next) return 'drop';
    return tick === this.next ? 'apply' : 'gap';
  }

  /**
   * Sau khi dựng lại từ `catchup` (A13): khung tick k đưa state từ k lên k+1, nên khung đầu cần áp là
   * tick của state vừa dựng (= tick khung cuối trong log + 1). Lấy từ state, không tin `catchup.tick`.
   */
  resumeAt(stateTick: number): void {
    this.next = stateTick;
  }
}

/** Mã input chỉ gửi khi đổi so với lần gửi trước (server giữ input cuối). */
export function shouldSendInput(lastSent: number, code: number): boolean {
  return code !== lastSent;
}

/** State sau khi chạy khung có `state.tick` là bội số của 60 thì phải gửi `hash`. */
export function hashDue(tick: number): boolean {
  return tick > 0 && tick % HASH_EVERY_TICKS === 0;
}

/** Các state gần nhất theo tick, cho vòng vẽ lấy state trễ. */
export class StateHistory {
  private readonly byTick = new Map<number, MatchState>();
  private latest: MatchState | null = null;

  push(state: MatchState): void {
    this.byTick.set(state.tick, state);
    this.latest = state;
    this.byTick.delete(state.tick - HISTORY_SIZE);
  }

  reset(): void {
    this.byTick.clear();
    this.latest = null;
  }

  latestTick(): number {
    return this.latest?.tick ?? 0;
  }

  /** State ở `tick`, kẹp về khoảng còn giữ. */
  at(tick: number): MatchState | null {
    if (!this.latest) return null;
    const t = Math.min(this.latest.tick, Math.max(this.latest.tick - HISTORY_SIZE + 1, tick));
    return this.byTick.get(t) ?? this.latest;
  }
}

/**
 * Con trỏ hiển thị (đơn vị tick, có phần lẻ) bám `latestTick - delay`: chạy nhanh/chậm tới 50% để
 * nuốt jitter thay vì nhảy; lệch quá 30 tick thì nhảy thẳng tới đích.
 */
export class DisplayCursor {
  private cursor = Number.NaN;

  advance(dtSec: number, latestTick: number, delayFrames: number): number {
    const target = latestTick - delayFrames;
    if (Number.isNaN(this.cursor) || Math.abs(target - this.cursor) > 30) {
      this.cursor = target;
    } else {
      const rate = 1 + Math.max(-0.5, Math.min(1, (target - this.cursor) * 0.1));
      this.cursor += dtSec * TICK_RATE * rate;
    }
    this.cursor = Math.min(this.cursor, latestTick);
    return this.cursor;
  }
}

/** Hai state kề nhau + hệ số nội suy cho con trỏ `cursor`. */
export function displayPair(
  history: StateHistory,
  cursor: number,
): { prev: MatchState; curr: MatchState; alpha: number } | null {
  const base = Math.floor(cursor);
  const prev = history.at(base);
  const curr = history.at(base + 1);
  if (!prev || !curr) return null;
  return { prev, curr, alpha: Math.min(1, Math.max(0, cursor - base)) };
}
