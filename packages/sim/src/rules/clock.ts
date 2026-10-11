import { TICK_RATE } from '../tick';
import type { MatchState, Stoppage } from '../types';

/*
 * Đồng hồ trận (PRD §5): 2 hiệp × halfLengthSec giây thật, hiển thị 0'–90'.
 * Đồng hồ chạy cả khi bóng chết; phần chờ thực hiện quá RESTART_GRACE_TICKS và mỗi bàn thắng
 * được cộng vào bù giờ, công bố khi hết giờ chính thức của hiệp (45'+N', 90'+N').
 */

export const MINUTES_PER_HALF = 45;
/** Chờ thực hiện bóng chết tối đa chừng này tick thì chưa tính bù giờ (= lúc đội máy tự đá). */
export const RESTART_GRACE_TICKS = 3 * TICK_RATE;
/** Mỗi bàn thắng bù thêm chừng này phút game. */
export const GOAL_ADDED_MINUTES = 1;
export const MAX_ADDED_MINUTES = 3;

/** Số tick giờ chính thức của một hiệp. */
export const regulationTicks = (halfLengthSec: number): number =>
  Math.round(halfLengthSec * TICK_RATE);

/** Số phút bù giờ (làm tròn lên, có trần) từ thời gian bị mất trong hiệp. */
export function addedMinutesFor(stoppage: Stoppage, halfLengthSec: number): number {
  const reg = regulationTicks(halfLengthSec);
  // Nhân trước rồi chia để phép chia hết cho ra số nguyên chính xác.
  const overrunMin = Math.ceil((stoppage.overrunTicks * MINUTES_PER_HALF) / reg);
  return Math.min(MAX_ADDED_MINUTES, overrunMin + stoppage.goals * GOAL_ADDED_MINUTES);
}

/** Tick mà phút game thứ `minutes` (tính từ đầu hiệp) kết thúc. */
const minuteEndTick = (minutes: number, reg: number): number =>
  Math.round((minutes * reg) / MINUTES_PER_HALF);

/**
 * Sau khi đồng hồ vừa chạy tới `halfTick`: công bố bù giờ ở cuối giờ chính thức, báo hết hiệp
 * khi hết bù giờ. Bù giờ đã công bố thì giữ nguyên.
 */
export function advanceClock(
  halfTick: number,
  halfLengthSec: number,
  stoppage: Stoppage,
  addedMinutes: number | null,
): { addedMinutes: number | null; halfOver: boolean } {
  const reg = regulationTicks(halfLengthSec);
  if (halfTick < reg) return { addedMinutes, halfOver: false };
  const added = addedMinutes ?? addedMinutesFor(stoppage, halfLengthSec);
  return { addedMinutes: added, halfOver: halfTick >= reg + minuteEndTick(added, reg) };
}

export interface MatchClock {
  /** Phút hiển thị 0–90; dừng ở 45/90 trong bù giờ. */
  minute: number;
  /** Phút bù giờ đang đá (45'+1' → 1), 0 khi còn giờ chính thức. */
  addedMinute: number;
  /** Số phút bù đã công bố, null khi chưa tới cuối giờ chính thức. */
  addedMinutes: number | null;
}

/** Đồng hồ hiển thị cho HUD. */
export function matchClock(
  state: Pick<MatchState, 'half' | 'halfTick' | 'halfLengthSec' | 'addedMinutes'>,
): MatchClock {
  const reg = regulationTicks(state.halfLengthSec);
  const base = (state.half - 1) * MINUTES_PER_HALF;
  if (state.halfTick <= reg) {
    const minute = base + Math.floor((state.halfTick * MINUTES_PER_HALF) / reg);
    return { minute, addedMinute: 0, addedMinutes: state.addedMinutes };
  }
  const over = state.halfTick - reg;
  return {
    minute: base + MINUTES_PER_HALF,
    addedMinute: Math.floor(((over - 1) * MINUTES_PER_HALF) / reg) + 1,
    addedMinutes: state.addedMinutes,
  };
}
