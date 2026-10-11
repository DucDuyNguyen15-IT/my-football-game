/** Số bước mô phỏng mỗi giây. Bước thời gian cố định để trận đấu tất định (PRD §5). */
export const TICK_RATE = 60;

/** Độ dài một bước mô phỏng, tính bằng giây. */
export const TICK_DT = 1 / TICK_RATE;

export { createMatch, step } from './match';
export * from './types';
export * from './rng';
export * from './pitch';
export * from './physics/ball';
export * from './physics/player';
export * from './stats/params';
/** Phép toán vector (`V.add`, `V.length`, …) — gom vào namespace để không đè tên chung. */
export * as V from './math/vec2';
export type { Vec2 } from './math/vec2';
export * from './fixtures/demoTeams';
