import { TICK_RATE } from '@pitch/sim';

/**
 * Nguồn thời gian đơn điệu + hẹn giờ cho bộ giữ nhịp (khác `Clock` nghiệp vụ: đó là `Date`, không hẹn giờ).
 * Test thay bằng bản giả điều khiển tay để không ngủ thật.
 */
export interface TimeSource {
  /** Mili giây đơn điệu (`performance.now()`). */
  now(): number;
  /** Gọi `fn` sau `ms`; trả hàm huỷ. */
  after(ms: number, fn: () => void): () => void;
}

export const realTime: TimeSource = {
  now: () => performance.now(),
  after(ms, fn) {
    const t = setTimeout(fn, ms);
    t.unref();
    return () => clearTimeout(t);
  },
};

/** Phiên trận như bộ giữ nhịp thấy: nhận mỗi tick; `done` thì bị bỏ khỏi vòng. */
export interface Tickable {
  readonly done: boolean;
  onTick(nowMs: number): void;
}

export const MAX_CATCHUP_TICKS = 5;
const TICK_MS = 1000 / TICK_RATE;

/**
 * MỘT vòng lặp chung cho mọi phiên (R11). Tick thứ n đến hạn lúc `t0 + n·1000/60` (mốc tuyệt đối, không
 * cộng dồn sai số). Trễ thì chạy bù tối đa {@link MAX_CATCHUP_TICKS} tick mỗi lượt, trễ hơn thì bỏ nhịp
 * (báo `onSkip`). Phiên ném lỗi ở `onTick` bị loại khỏi vòng (báo `onError`). Phiên mới vào vòng ở tick kế tiếp. Vòng tự dừng khi hết phiên.
 */
export class PvpTicker {
  private readonly sessions = new Set<Tickable>();
  private t0 = 0;
  private n = 0;
  private cancel: (() => void) | null = null;

  constructor(
    private readonly time: TimeSource,
    private readonly onSkip: (skipped: number) => void = () => {},
    private readonly onError: (err: unknown, s: Tickable) => void = () => {},
  ) {}

  get size(): number {
    return this.sessions.size;
  }

  add(s: Tickable): void {
    this.sessions.add(s);
    if (this.cancel) return;
    this.t0 = this.time.now();
    this.n = 0;
    this.schedule();
  }

  /** Chạy mọi tick đã đến hạn (timer gọi; test gọi tay sau khi tua giờ giả). */
  pump(): void {
    this.cancel = null;
    const now = this.time.now();
    const due = Math.floor((now - this.t0) / TICK_MS) + 1;
    const run = Math.min(due - this.n, MAX_CATCHUP_TICKS);
    for (let i = 0; i < run; i++) {
      for (const s of this.sessions) {
        try {
          s.onTick(now);
        } catch (err) {
          // Một phiên ném lỗi chỉ được hỏng phiên đó, không kéo sập tiến trình / các phiên khác.
          this.sessions.delete(s);
          this.onError(err, s);
          continue;
        }
        if (s.done) this.sessions.delete(s);
      }
    }
    if (due - this.n > MAX_CATCHUP_TICKS) this.onSkip(due - this.n - MAX_CATCHUP_TICKS);
    this.n = Math.max(this.n, due); // phần trễ quá 5 tick bị bỏ, không chạy bù
    if (this.sessions.size > 0) this.schedule();
  }

  stop(): void {
    this.cancel?.();
    this.cancel = null;
    this.sessions.clear();
  }

  private schedule(): void {
    const wait = Math.max(0, this.t0 + this.n * TICK_MS - this.time.now());
    this.cancel = this.time.after(wait, () => this.pump());
  }
}
