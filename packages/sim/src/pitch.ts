import type { Vec2 } from './math/vec2';

/**
 * Kích thước sân 7v7 (mét). Gốc toạ độ ở tâm sân, trục x dọc sân (về phía khung thành),
 * trục y ngang sân. Khung thành nằm ở x = ±HALF_LENGTH.
 */
export const PITCH_LENGTH = 60;
export const PITCH_WIDTH = 40;
export const HALF_LENGTH = PITCH_LENGTH / 2;
export const HALF_WIDTH = PITCH_WIDTH / 2;

/** Khung thành: rộng giữa hai cột dọc, cao tới mép dưới xà. */
export const GOAL_WIDTH = 5;
export const GOAL_HEIGHT = 2;

/** Vòng cấm: sâu tính từ vạch cuối, rộng theo trục y. */
export const PENALTY_AREA_DEPTH = 12;
export const PENALTY_AREA_WIDTH = 20;

export const CENTER_CIRCLE_RADIUS = 6;

export const BALL_RADIUS = 0.11;

/** Trong sân, tính cả điểm nằm trên vạch. */
export const isInsidePitch = (p: Vec2): boolean =>
  Math.abs(p.x) <= HALF_LENGTH && Math.abs(p.y) <= HALF_WIDTH;

/** Chấm phạt đền cách vạch cuối chừng này mét. */
export const PENALTY_SPOT_DIST = 8;

/** Điểm nằm trong vòng cấm ở đầu sân phía `side` (1 = phía +x, −1 = phía −x), tính cả vạch. */
export const isInPenaltyArea = (p: Vec2, side: 1 | -1): boolean =>
  side * p.x >= HALF_LENGTH - PENALTY_AREA_DEPTH &&
  side * p.x <= HALF_LENGTH &&
  Math.abs(p.y) <= PENALTY_AREA_WIDTH / 2;
