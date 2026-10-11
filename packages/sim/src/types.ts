import type {
  Difficulty,
  Formation,
  MatchPlayerSetup,
  MatchTeamSetup,
  PlayerStats,
  Position,
  SquadSlot,
} from '@pitch/shared';
import type { Vec2 } from './math/vec2';
import type { RngState } from './rng';

export type TeamSide = 'home' | 'away';

export interface MatchSetup {
  home: MatchTeamSetup;
  away: MatchTeamSetup;
  seed: number;
  difficulty: Difficulty;
  /** Mặc định 180 s (PRD §5). */
  halfLengthSec?: number;
}

export interface PlayerState {
  /** `${team}-${slot}`, duy nhất trong trận. */
  id: string;
  team: TeamSide;
  slot: SquadSlot;
  position: Position;
  stats: PlayerStats;
  pos: Vec2;
  vel: Vec2;
  /** Hướng mặt, vector đơn vị. */
  facing: Vec2;
  /** Thể lực 0–100 (%). */
  stamina: number;
}

export interface BallState {
  pos: Vec2;
  vel: Vec2;
  /** Độ cao so với mặt cỏ (m) và vận tốc theo phương đứng (m/s). */
  z: number;
  vz: number;
}

/**
 * Input của người chơi trong một tick. Nút là trạng thái "đang giữ";
 * sim so với `MatchState.input` (tick trước) để biết lúc bấm và lúc thả (VD: giữ K để nạp lực sút).
 */
export interface PlayerInput {
  /** Hướng di chuyển, độ dài ≤ 1. */
  move: Vec2;
  pass: boolean;
  lob: boolean;
  shoot: boolean;
  sprint: boolean;
  switch: boolean;
}

/** Đóng băng vì được nhiều state dùng chung tham chiếu. */
export const NO_INPUT: PlayerInput = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  pass: false,
  lob: false,
  shoot: false,
  sprint: false,
  switch: false,
});

/** Toàn bộ trạng thái trận — object thường, serialize được bằng JSON. */
export interface MatchState {
  /** Tổng số tick đã chạy. */
  tick: number;
  half: 1 | 2;
  /** Số tick đã chạy trong hiệp hiện tại. */
  halfTick: number;
  halfLengthSec: number;
  difficulty: Difficulty;
  rng: RngState;
  score: Record<TeamSide, number>;
  formations: Record<TeamSide, Formation>;
  kickoffTeam: TeamSide;
  ball: BallState;
  /** Cầu thủ đang trên sân. */
  players: PlayerState[];
  bench: Record<TeamSide, MatchPlayerSetup[]>;
  /** Cầu thủ đội nhà người chơi đang điều khiển. */
  controlledId: string;
  /** Input đã áp dụng ở tick trước. */
  input: PlayerInput;
}
