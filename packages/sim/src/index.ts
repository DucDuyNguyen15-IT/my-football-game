export { TICK_RATE, TICK_DT } from './tick';
export { createMatch, step } from './match';
export * from './types';
export * from './rng';
export * from './pitch';
export * from './physics/ball';
export * from './physics/player';
export * from './stats/params';
export * from './rules/possession';
export * from './rules/restarts';
export * from './rules/clock';
export * from './actions/pass';
export * from './actions/shoot';
/** Phép toán vector (`V.add`, `V.length`, …) — gom vào namespace để không đè tên chung. */
export * as V from './math/vec2';
export type { Vec2 } from './math/vec2';
export * from './fixtures/demoTeams';
export * from './actions/tackle';
export * from './rules/fouls';
