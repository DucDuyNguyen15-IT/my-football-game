/*
 * Ánh xạ chỉ số thẻ (1–99) → tham số gameplay (PRD §6.2). Tuyến tính có kẹp.
 * Mọi hằng số cân chỉnh nằm ở đây để chỉnh một chỗ ở task 5.13.
 */

export const STAT_MIN = 1;
export const STAT_MAX = 99;

/** Tốc độ chạy thường (m/s) theo Tốc độ: chỉ số 1 → [0], 99 → [1]. */
export const RUN_SPEED_RANGE = [4.5, 6.5] as const;
/** Tốc độ nước rút = chạy thường × hệ số này. */
export const SPRINT_SPEED_MULT = 1.35;
/** Gia tốc tối đa (m/s²) theo Tốc độ. */
export const ACCEL_RANGE = [6, 12] as const;

/** Thể lực hao mỗi giây (%) khi nước rút. */
export const SPRINT_DRAIN_PER_SEC = 1.5;
/** Thể lực hao mỗi giây (%) khi chạy thường hết tốc; chạy chậm hơn thì hao tỉ lệ theo tốc độ. */
export const RUN_DRAIN_PER_SEC = 0.25;
/** Thể lực hồi mỗi giây (%) khi đứng yên (không phụ thuộc chỉ số). */
export const RECOVER_PER_SEC = 1;
/** Dưới tốc độ này (m/s) coi như đứng yên. */
export const STAND_SPEED = 0.5;
/** Hệ số nhân mức hao theo chỉ số Thể lực: 1 → [0], 99 → [1]. */
export const STAMINA_DRAIN_MULT_RANGE = [1.6, 0.6] as const;

/** Dưới ngưỡng thể lực này (%) bắt đầu mệt (PRD §5). */
export const FATIGUE_THRESHOLD = 30;
/** `fatigueFactor` khi thể lực về 0. */
export const MIN_FATIGUE_FACTOR = 0.6;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Nội suy tuyến tính: chỉ số 1 → `min`, 99 → `max`; kẹp ngoài khoảng, NaN coi như 1. */
export function statScale(stat: number, min: number, max: number): number {
  const s = Number.isNaN(stat) ? STAT_MIN : clamp(stat, STAT_MIN, STAT_MAX);
  return min + ((s - STAT_MIN) * (max - min)) / (STAT_MAX - STAT_MIN);
}

export const runSpeedFor = (pace: number): number => statScale(pace, ...RUN_SPEED_RANGE);

export const sprintSpeedFor = (pace: number): number => runSpeedFor(pace) * SPRINT_SPEED_MULT;

export const accelFor = (pace: number): number => statScale(pace, ...ACCEL_RANGE);

export const staminaDrainMultFor = (stamina: number): number =>
  statScale(stamina, ...STAMINA_DRAIN_MULT_RANGE);

/**
 * Hệ số mệt (0–1] theo thể lực còn lại (%): 1 từ ngưỡng 30% trở lên, giảm tuyến tính về
 * `MIN_FATIGUE_FACTOR` ở 0%. Nhân vào tốc độ tối đa và độ chính xác chuyền/sút.
 */
export function fatigueFactor(stamina: number): number {
  const s = Number.isNaN(stamina) ? 0 : clamp(stamina, 0, 100);
  if (s >= FATIGUE_THRESHOLD) return 1;
  return MIN_FATIGUE_FACTOR + ((1 - MIN_FATIGUE_FACTOR) * s) / FATIGUE_THRESHOLD;
}
