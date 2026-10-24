import type {
  Difficulty,
  Formation,
  MatchPlayerSetup,
  MatchTeamSetup,
  PlayerStats,
  Position,
  SquadSlot,
} from '@pitch/shared';
import type { TeamAiState } from './ai/team';
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
  /** AI điều khiển luôn đội người chơi, bỏ qua input (test cân bằng, E2E). Mặc định tắt. */
  autopilot?: boolean;
  /** Hồ sơ AI của đội người chơi: `proxy` khi chạy cân bằng (task 5.13). Mặc định `teammate`. */
  homeAi?: 'teammate' | 'proxy';
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
 * sim so với `MatchState.input` (tick trước) để biết lúc bấm và lúc thả (VD: giữ D để nạp lực sút).
 * Tên nút theo nghĩa khi có bóng; phím mặc định kiểu FC Online (PRD §5, DESIGN.md §6.2).
 */
export interface PlayerInput {
  /** Hướng di chuyển (mũi tên), độ dài ≤ 1. */
  move: Vec2;
  /** S: chuyền thấp; không có bóng = đổi người. */
  pass: boolean;
  /** A: chuyền bổng; không có bóng = xoạc. */
  lob: boolean;
  /** D: sút (giữ để nạp lực); không có bóng = áp sát/tắc bóng (task 5.15). */
  shoot: boolean;
  /** E (giữ): chạy nước rút. */
  sprint: boolean;
  /** Nút đổi người riêng (không gắn phím mặc định; dùng cho AI/test). */
  switch: boolean;
  /** W: chọc khe sệt; giữ thêm Q (`modifier`) = chọc khe bổng (task 5.16). */
  through: boolean;
  /** Q (giữ): phím phụ, đổi W thành chọc khe bổng. */
  modifier: boolean;
}

/** Đóng băng vì được nhiều state dùng chung tham chiếu. */
export const NO_INPUT: PlayerInput = Object.freeze({
  move: Object.freeze({ x: 0, y: 0 }),
  pass: false,
  lob: false,
  shoot: false,
  sprint: false,
  switch: false,
  through: false,
  modifier: false,
});

/**
 * Giai đoạn của trận. `kickoff`/`dead_ball`: bóng đặt sẵn chờ thực hiện; `half_time`: chờ người chơi
 * bấm chuyền để đá hiệp 2; `full_time`: hết trận, `step` không làm gì nữa.
 */
export type MatchPhase = 'kickoff' | 'play' | 'dead_ball' | 'half_time' | 'shootout' | 'full_time';

export type RestartType = 'kickoff' | 'throw_in' | 'corner' | 'goal_kick' | 'free_kick' | 'penalty';

export type CardColor = 'yellow' | 'red';

/** Một thẻ phạt. Vàng thứ hai ghi thành hai dòng: một vàng rồi một đỏ. */
export interface Booking {
  playerId: string;
  team: TeamSide;
  card: CardColor;
  tick: number;
}

/** Luân lưu (task 5.12): kết quả từng lượt (true = vào) và lượt đang sút. */
export interface Shootout {
  home: boolean[];
  away: boolean[];
  /** Đội sút trước mỗi vòng. */
  first: TeamSide;
  /** Đội đang sút lượt hiện tại. */
  kicking: TeamSide;
  /** Tick bóng rời chân ở lượt hiện tại; null khi người sút chưa sút. */
  kickTick: number | null;
}

/** Một lượt thay người (task 5.11). */
export interface Substitution {
  team: TeamSide;
  outId: string;
  inId: string;
  tick: number;
}

/** Tình huống bóng chết đang chờ thực hiện. */
export interface Restart {
  type: RestartType;
  /** Đội được hưởng. */
  team: TeamSide;
  /** Điểm đặt bóng. */
  spot: Vec2;
  takerId: string;
  /** Tick bắt đầu chờ (đội máy thực hiện sau RESTART_DELAY_TICKS, chờ lâu hơn bị tính bù giờ). */
  startTick: number;
}

/**
 * Cú ném/phát bóng thủ môn đã chọn lúc bắt đầu lấy đà. Đích chuyền tính lại lúc bóng rời đi theo vị
 * trí đồng đội khi đó: `assisted` = người chơi bấm hướng (hỗ trợ chuyền), `pass`/`shoot` = AI.
 */
export type WindupKick =
  | { type: 'assisted'; kind: 'ground' | 'lob'; dir: Vec2; power: number }
  | { type: 'pass'; kind: 'ground' | 'lob'; to: Vec2; targetId: string | null }
  | { type: 'shoot'; target: Vec2; power: number };

/**
 * Thủ môn đang lấy đà ném (`throw`) hoặc phát bóng (`kick`): bóng còn trong tay/chân tới
 * `releaseTick` mới bay đi (để hoạt ảnh kịp vung tay/chân).
 */
export interface Windup {
  playerId: string;
  releaseTick: number;
  style: 'throw' | 'kick';
  kick: WindupKick;
}

/** Người nhận đường chuyền của người chơi: tự chạy tới `point` đón bóng tới `untilTick`. */
export interface PassReceiver {
  playerId: string;
  point: Vec2;
  untilTick: number;
}

/** Thời gian bị mất trong hiệp hiện tại, dùng để tính bù giờ. */
export interface Stoppage {
  /** Số tick chờ thực hiện bóng chết vượt quá thời gian cho phép. */
  overrunTicks: number;
  goals: number;
}

/** Toàn bộ trạng thái trận — object thường, serialize được bằng JSON. */
export interface MatchState {
  /** Tổng số tick đã chạy. */
  tick: number;
  half: 1 | 2;
  /** Số tick đồng hồ đã chạy trong hiệp hiện tại (đứng yên khi nghỉ giữa hiệp/hết trận). */
  halfTick: number;
  /** Độ dài giờ chính thức một hiệp (s thật). */
  halfLengthSec: number;
  phase: MatchPhase;
  /** Bóng chết (mọi phase trừ `play`) — cho phép thay người (task 5.11). */
  ballDead: boolean;
  /** Tình huống đang chờ thực hiện khi phase là `kickoff`/`dead_ball`, ngược lại null. */
  restart: Restart | null;
  /** Đội chạm bóng cuối, quyết định ném biên/phạt góc/phát bóng. */
  lastTouchTeam: TeamSide;
  stoppage: Stoppage;
  /** Số phút bù giờ công bố khi hết giờ chính thức của hiệp; null khi chưa tới. */
  addedMinutes: number | null;
  difficulty: Difficulty;
  rng: RngState;
  score: Record<TeamSide, number>;
  /** Số cú sút (cả sút phạt, phạt đền) — cho màn kết quả và cân chỉnh. */
  shots: Record<TeamSide, number>;
  /** Cú sút đang bay (thủ môn đội kia phản ứng tính từ `tick`); null khi bóng đã được chạm/chết. */
  lastShot: {
    team: TeamSide;
    tick: number;
    /** Phạt đền: thủ môn đoán sai hướng thì lao ngay về điểm này, bỏ qua đường bóng thật. */
    keeperGuess?: Vec2;
  } | null;
  /** AI điều khiển luôn đội người chơi, input bị bỏ qua. */
  autopilot: boolean;
  /** Hồ sơ AI của đội người chơi (`MatchSetup.homeAi`). */
  homeAi: 'teammate' | 'proxy';
  formations: Record<TeamSide, Formation>;
  kickoffTeam: TeamSide;
  ball: BallState;
  /** Cầu thủ đang trên sân (người bị thẻ đỏ đã rời sân). */
  players: PlayerState[];
  /** Thẻ phạt theo thứ tự thời gian (cho HUD và màn kết quả). */
  bookings: Booking[];
  /**
   * Người đang nằm sân sau cú xoạc (người xoạc, người bị xoạc ngã/vấp): trượt theo quán tính, không
   * di chuyển, xoạc hay bắt bóng được trước tick này.
   */
  tackleRecovery: Record<string, number>;
  /**
   * Cú xoạc (A) gần nhất, cho render chọn hoạt ảnh. `victimReaction`: người bị xoạc trúng bóng ngã
   * hay vấp (null khi hụt / phạm lỗi — phạm lỗi thì trận dừng).
   */
  lastTackle: {
    tick: number;
    tacklerId: string;
    victimId: string | null;
    outcome: 'won' | 'miss' | 'foul';
    victimReaction: 'fall' | 'stumble' | null;
  } | null;
  /** Người vừa tắc đứng trượt: chưa tắc lại được trước tick này (vẫn di chuyển bình thường). */
  standTackleCooldown: Record<string, number>;
  /** Dự bị còn ngồi ghế (người đã vào sân bị bỏ khỏi đây). */
  bench: Record<TeamSide, MatchPlayerSetup[]>;
  /** Số lượt thay người đã dùng (tối đa 3, `rules/substitution.ts`). */
  subsUsed: Record<TeamSide, number>;
  /** Các lượt thay người theo thứ tự (cho HUD và màn kết quả). */
  substitutions: Substitution[];
  /** Luân lưu khi hoà sau 2 hiệp; null nếu không có. Giữ lại sau khi hết trận cho màn kết quả. */
  shootout: Shootout | null;
  /** Cầu thủ đang dẫn bóng (bóng dính chân), null khi bóng tự do. */
  ballOwnerId: string | null;
  /** Tick `ballOwnerId` đổi lần cuối (AI dùng để biết đã giữ bóng bao lâu). */
  ownerSinceTick: number;
  /** Người vừa chuyền/sút/mất bóng không được chạm lại bóng trước tick `untilTick`. */
  kickLock: { playerId: string; untilTick: number } | null;
  /** Số tick người chơi đã giữ nút sút (0 = không nạp lực). */
  shotChargeTicks: number;
  /**
   * Người chơi đang giữ S/A để nạp lực chuyền (nhả mới chuyền): loại chuyền, số tick đã giữ, hướng
   * bấm gần nhất. null khi không nạp.
   */
  passCharge: { kind: 'ground' | 'lob'; ticks: number; dir: Vec2 } | null;
  /** Cầu thủ đội nhà người chơi đang điều khiển. */
  controlledId: string;
  /** Thủ môn đang lấy đà ném/phát bóng; null khi không. */
  windup: Windup | null;
  /** Người chơi vừa chuyền cho đồng đội: người nhận tự chạy đón; null khi không. */
  passReceiver: PassReceiver | null;
  /**
   * Luật chuyền về: đội có cầu thủ (không phải thủ môn) vừa cố ý đá/ném bóng đi mà chưa ai khác chạm
   * — thủ môn đội đó không được bắt bằng tay, nhận được thì giữ bằng chân tới khi bóng rời chân.
   * null khi không.
   */
  backPass: TeamSide | null;
  /**
   * Kế hoạch AI tầng đội của từng đội (null = chưa lập). Cả trường null = tắt AI, mọi cầu thủ
   * không do người chơi điều khiển đứng yên — chỉ dùng trong test cơ chế.
   */
  ai: Record<TeamSide, TeamAiState | null> | null;
  /** Input đã áp dụng ở tick trước. */
  input: PlayerInput;
}
