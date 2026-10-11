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

/** Góc tính bằng radian. */
const DEG = Math.PI / 180;

/** Bán kính khống chế bóng (m, từ tâm cầu thủ tới tâm bóng) theo Rê bóng. */
export const CONTROL_RADIUS_RANGE = [0.7, 1.2] as const;
/**
 * Mất bóng khi xoay gắt: cos của góc giữa hướng đang chạy và hướng bấm nhỏ hơn ngưỡng này
 * (theo Rê bóng): 0 = xoay quá 90° là mất, −0.9 = phải quá ~154°.
 */
export const TURN_LOSS_COS_RANGE = [0, -0.9] as const;
/** Độ lệch chuẩn sai số hướng chuyền (radian) theo Chuyền. */
export const PASS_ANGLE_ERR_RANGE = [6 * DEG, 0.5 * DEG] as const;
/** Độ lệch chuẩn sai số lực chuyền (tỉ lệ so với lực đúng) theo Chuyền. */
export const PASS_POWER_ERR_RANGE = [0.15, 0.03] as const;
/** Tầm chuyền bổng tối đa (m) theo Chuyền. */
export const LOB_RANGE_RANGE = [20, 40] as const;
/** Vận tốc bóng khi sút hết lực (m/s) theo Sút. */
export const SHOT_SPEED_RANGE = [18, 30] as const;
/** Độ lệch chuẩn sai số hướng sút (radian) theo Sút. */
export const SHOT_ANGLE_ERR_RANGE = [14 * DEG, 1.5 * DEG] as const;
/** Độ lệch chuẩn sai số vận tốc đứng khi sút (m/s) theo Sút — sút vọt xà. */
export const SHOT_HEIGHT_ERR_RANGE = [2, 0.4] as const;

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

export const controlRadiusFor = (dribbling: number): number =>
  statScale(dribbling, ...CONTROL_RADIUS_RANGE);

export const turnLossCosFor = (dribbling: number): number =>
  statScale(dribbling, ...TURN_LOSS_COS_RANGE);

export const passAngleErrFor = (passing: number): number =>
  statScale(passing, ...PASS_ANGLE_ERR_RANGE);

export const passPowerErrFor = (passing: number): number =>
  statScale(passing, ...PASS_POWER_ERR_RANGE);

export const lobRangeFor = (passing: number): number => statScale(passing, ...LOB_RANGE_RANGE);

export const shotSpeedFor = (shooting: number): number => statScale(shooting, ...SHOT_SPEED_RANGE);

export const shotAngleErrFor = (shooting: number): number =>
  statScale(shooting, ...SHOT_ANGLE_ERR_RANGE);

export const shotHeightErrFor = (shooting: number): number =>
  statScale(shooting, ...SHOT_HEIGHT_ERR_RANGE);

/** Tầm xoạc (m, từ tâm người xoạc tới bóng hoặc tới người dẫn bóng) theo Phòng ngự. */
export const TACKLE_REACH_RANGE = [1.3, 2.1] as const;
/** Xác suất xoạc trúng bóng (xoạc sạch) khi bóng trong tầm, theo Phòng ngự của người xoạc. */
export const TACKLE_WIN_CHANCE_RANGE = [0.3, 0.9] as const;
/** Phần xác suất xoạc sạch bị trừ theo Rê bóng của người bị xoạc (giữ bóng khi bị tranh). */
export const TACKLE_RESIST_RANGE = [0, 0.25] as const;
/** Kẹp xác suất xoạc sạch: không bao giờ chắc chắn trúng hay chắc chắn trượt. */
export const TACKLE_WIN_CHANCE_BOUNDS = [0.05, 0.95] as const;

export const tackleReachFor = (defending: number): number =>
  statScale(defending, ...TACKLE_REACH_RANGE);

/** Tầm tắc bóng đứng (m, từ tâm người tắc tới bóng) theo Phòng ngự — ngắn hơn xoạc. */
export const STAND_TACKLE_REACH_RANGE = [0.9, 1.4] as const;
/** Xác suất tắc đứng giành bóng theo Phòng ngự người tắc… */
export const STAND_TACKLE_WIN_CHANCE_RANGE = [0.2, 0.7] as const;
/** …trừ phần này theo Rê bóng người dẫn bóng. Kẹp theo TACKLE_WIN_CHANCE_BOUNDS. */
export const STAND_TACKLE_RESIST_RANGE = [0, 0.3] as const;
/** Tắc đứng trượt (không từ phía sau): xác suất chạm người → phạm lỗi; còn lại người dẫn bóng giữ bóng. */
export const STAND_TACKLE_FOUL_CHANCE = 0.25;
/** Tắc đứng trượt xong phải chờ chừng này tick (0,4 s) mới tắc lại; vẫn di chuyển bình thường. */
export const STAND_TACKLE_COOLDOWN_TICKS = 24;
/** Áp sát (giữ D, AI người áp sát): đứng cách người dẫn bóng chừng này (m), phía khung thành nhà. */
export const CONTAIN_DIST = 1.2;
/** Giữ D: hướng người chơi bấm được cộng vào hướng tự chạy với trọng số này. */
export const CONTAIN_STEER_WEIGHT = 0.6;

export const standTackleReachFor = (defending: number): number =>
  statScale(defending, ...STAND_TACKLE_REACH_RANGE);

/** Xác suất tắc đứng giành bóng của người có Phòng ngự `defending` vào người có Rê bóng `dribbling`. */
export function standTackleWinChance(defending: number, dribbling: number): number {
  const chance =
    statScale(defending, ...STAND_TACKLE_WIN_CHANCE_RANGE) -
    statScale(dribbling, ...STAND_TACKLE_RESIST_RANGE);
  return clamp(chance, ...TACKLE_WIN_CHANCE_BOUNDS);
}

/** Xác suất xoạc sạch của người có Phòng ngự `defending` vào người có Rê bóng `dribbling`. */
export function tackleWinChance(defending: number, dribbling: number): number {
  const chance =
    statScale(defending, ...TACKLE_WIN_CHANCE_RANGE) - statScale(dribbling, ...TACKLE_RESIST_RANGE);
  return clamp(chance, ...TACKLE_WIN_CHANCE_BOUNDS);
}
