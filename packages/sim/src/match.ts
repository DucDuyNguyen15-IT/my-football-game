import {
  MatchTeamSetup,
  isStarterSlot,
  slotRole,
  type MatchPlayerSetup,
  type Position,
} from '@pitch/shared';
import { AI_PROFILES, type AiProfile } from './ai/difficulty';
import {
  AI_MIN_HOLD_TICKS,
  decideCarrier,
  decideRestartKick,
  type CarrierAction,
} from './ai/player';
import {
  asKicker,
  diveStep,
  diveTarget,
  keeperContact,
  keeperReach,
  penaltyGuess,
  resolveSave,
} from './ai/goalkeeper';
import { aiMove, arrive, goalSidePoint, planTeam, thinkTeam } from './ai/team';
import {
  choosePassTarget,
  passBall,
  PASS_ASSIST_ERROR_MULT,
  interceptPoint,
  passLeadPoint,
  passPower,
  passTravelTime,
  PASS_FULL_CHARGE_TICKS,
  type PassKind,
} from './actions/pass';
import { attackSign, finesseShot, shootBall, shotPower, shotTarget } from './actions/shoot';
import { keeperClaim, tryHeader } from './actions/header';
import { tryScissor } from './actions/volley';
import {
  isFromBehind,
  pokeBall,
  resolveStandTackle,
  resolveTackle,
  slideStep,
  slideTackle,
  TACKLE_RECOVERY_TICKS,
  VICTIM_FALL_TICKS,
  VICTIM_STUMBLE_TICKS,
  victimReaction,
} from './actions/tackle';
import {
  add,
  clampLength,
  dot,
  length,
  normalize,
  scale,
  sub,
  vec2,
  ZERO,
  type Vec2,
} from './math/vec2';
import { exitEvent, stepBall, type BallEvent } from './physics/ball';
import { HALF_LENGTH, PENALTY_SPOT_DIST } from './pitch';
import { separatePlayers, stepPlayer } from './physics/player';
import { nextFloat, type RngState, seedRng } from './rng';
import { TICK_DT } from './tick';
import { advanceClock, regulationTicks, RESTART_GRACE_TICKS } from './rules/clock';
import { isKeeperHandling, judgeFoul } from './rules/fouls';
import {
  HALF_TIME_MAX_TICKS,
  KEEPER_HOLD_MAX_TICKS,
  SET_PIECE_MAX_TICKS,
  WHISTLE_PENALTY_WAIT_TICKS,
  WHISTLE_SHOT_WAIT_TICKS,
} from './rules/limits';
import {
  AIMED_RESTARTS,
  aimTarget,
  CONTACT_RESTARTS,
  kickWithContact,
  moveContact,
  movePenaltyAim,
  PENALTY_RUNUP_TICKS,
  penaltyShot,
  restartAim,
  restartContact,
  turnAim,
} from './rules/setPieceAim';
import { autoSubstitute } from './rules/substitution';
import { nextShooter, SHOOTOUT_KICK_TICKS, shooterFor, shootoutWinner } from './rules/shootout';
import {
  chooseDefensiveSwitchTarget,
  chooseSwitchTarget,
  CONTROL_HEIGHT,
  DRIBBLE_OFFSET,
  dribbleBall,
  findCapturer,
  losesBallOnTurn,
} from './rules/possession';
import {
  cpuRestartDue,
  decideRestart,
  FOUL_HOLD_TICKS,
  GOAL_HOLD_TICKS,
  OUT_HOLD_TICKS,
  SHOOTOUT_HOLD_TICKS,
  holdRestart,
  RESTART_SETTLE_DIST,
  RESTART_SETUP_MAX_TICKS,
  restartFacing,
  restartTargets,
  THROW_IN_RELEASE_Z,
  kickoffPlayers,
  setupRestart,
  type RestartPlan,
} from './rules/restarts';
import {
  AI_STAND_TACKLE_COOLDOWN_TICKS,
  CONTAIN_DIST,
  GK_REACH_HEIGHT,
  KEEPER_WINDUP_TICKS,
  keeperReactionTicks,
  keeperSaveChance,
  miscontrolChance,
  MISCONTROL_KEEP_VEL,
  MISCONTROL_SPEED_RANGE,
  CONTAIN_STEER_WEIGHT,
  PENALTY_ERROR_MULT,
  lobRangeFor,
  STAND_TACKLE_COOLDOWN_TICKS,
} from './stats/params';
import {
  NO_INPUT,
  type ActionDeadline,
  type BallState,
  type MatchSetup,
  type MatchState,
  type PassReceiver,
  type PlayerInput,
  type PlayerState,
  type TeamSide,
  type Windup,
  type WindupKick,
} from './types';

const DEFAULT_HALF_LENGTH_SEC = 180;

/** Người chơi luôn điều khiển đội nhà; đội khách là máy. */
const HUMAN_TEAM: TeamSide = 'home';

const other = (team: TeamSide): TeamSide => (team === 'home' ? 'away' : 'home');

const restingBall = (pos: Vec2): BallState => ({ pos, vel: ZERO, z: 0, vz: 0 });
/** Luật chuyền về: cầu thủ (không phải thủ môn) cố ý đá/ném bóng đi → thủ môn đội đó không được bắt tay. */
const kickedBy = (p: PlayerState): TeamSide | null => (p.position === 'GK' ? null : p.team);

/**
 * Vai trên sân của người đá chính. Đội hình cho phép xếp thẻ sai vị trí (PRD §6.4, chỉ bị −15% chỉ
 * số), còn sim phân biệt thủ môn với cầu thủ ngoài sân theo `position` — nên thủ môn là người ở ô GK
 * dù thẻ gì, và thẻ thủ môn xếp ô ngoài sân đá theo vai của ô (không thành thủ môn thứ hai). Cầu thủ
 * ngoài sân xếp lệch tuyến giữ vị trí của thẻ (chỗ đứng đã theo ô).
 */
function pitchPosition(team: MatchTeamSetup, p: MatchPlayerSetup): Position {
  if (p.slot === 'GK') return 'GK';
  if (p.position !== 'GK') return p.position;
  return slotRole(team.formation, p.slot) ?? p.position;
}

function spawnTeam(team: MatchTeamSetup, side: TeamSide): PlayerState[] {
  return team.players
    .filter((p) => isStarterSlot(p.slot))
    .map((p): PlayerState => ({
      id: `${side}-${p.slot}`,
      team: side,
      slot: p.slot,
      position: pitchPosition(team, p),
      stats: p.stats,
      foot: p.foot ?? 'right',
      ...(p.weakFoot === undefined ? {} : { weakFoot: p.weakFoot }),
      // Vị trí thật do kickoffPlayers đặt.
      pos: ZERO,
      vel: ZERO,
      facing: vec2(attackSign(side, 1), 0),
      stamina: 100,
    }));
}

const benchOf = (team: MatchTeamSetup): MatchPlayerSetup[] =>
  team.players.filter((p) => !isStarterSlot(p.slot));

/**
 * Cầu thủ ngoài sân của người chơi gần `point` nhất (dùng khi đội máy được hưởng bóng chết).
 * Hết cầu thủ ngoài sân (thẻ đỏ) thì lấy thủ môn.
 */
function nearestHuman(players: readonly PlayerState[], point: Vec2): string {
  const dist = (p: PlayerState) => length(sub(p.pos, point));
  const team = players.filter((p) => p.team === HUMAN_TEAM);
  const outfield = team.filter((p) => p.position !== 'GK');
  const pool = outfield.length > 0 ? outfield : team;
  return pool.reduce((best, p) => (dist(p) < dist(best) ? p : best)).id;
}

/**
 * Đội hình lúc bóng chết (luật 2): mọi cầu thủ đứng thẳng vào điểm neo AI của mình quanh điểm đặt
 * bóng, quay mặt về bóng — không ai phải đi bộ về. Tắt AI (test cơ chế) thì ai ở đâu đứng yên đó.
 */
function restartShape(
  state: MatchState,
  players: readonly PlayerState[],
  plan: RestartPlan,
): PlayerState[] {
  if (!state.ai) return [...players];
  const anchorsOf = (team: TeamSide) =>
    planTeam({
      team,
      half: state.half,
      formation: state.formations[team],
      players,
      ball: restingBall(plan.spot),
      ballOwnerId: null,
      restartTeam: plan.team,
      aggression: aiProfile(state, team).aggression,
      controlledId: null,
    }).anchors;
  const anchors = { home: anchorsOf('home'), away: anchorsOf('away') };
  return players.map((p) => {
    const pos = anchors[p.team][p.id] ?? p.pos;
    const toBall = sub(plan.spot, pos);
    return { ...p, pos, vel: ZERO, facing: length(toBall) > 0 ? normalize(toBall) : p.facing };
  });
}

/**
 * Đặt bóng chết: tình huống → state ở phase `kickoff`/`dead_ball`. Mọi cầu thủ được đặt thẳng vào vị
 * trí ngay ở tick này (luật 2, không đi bộ về): người thực hiện sau bóng, đối phương ngoài khoảng
 * cách tối thiểu, phạt đền thì ra ngoài vòng cấm; phần hiển thị che màn rồi mới vẽ vị trí mới.
 * Giao bóng: `players` đã ở vị trí giao bóng. Luân lưu: chỉ người sút (`takerId`) và thủ môn đổi chỗ.
 * Đội người được hưởng thì người chơi cầm luôn người thực hiện.
 */
function enterDeadBall(
  state: MatchState,
  players: readonly PlayerState[],
  plan: RestartPlan,
  tick: number,
  /** Thời gian phần hiển thị giữ hình trước khi che màn (`Restart.readyTick`). */
  holdTicks: number,
  takerId?: string,
): MatchState {
  const shaped =
    plan.type === 'kickoff' || state.shootout ? players : restartShape(state, players, plan);
  // Người thực hiện chọn sau khi xếp đội hình: người có chỗ đứng gần bóng nhất, đội hình không bị hổng.
  const { players: placed, restart } = setupRestart(
    shaped,
    plan,
    state.half,
    tick,
    holdTicks,
    takerId,
  );
  return {
    ...state,
    phase: plan.type === 'kickoff' ? 'kickoff' : 'dead_ball',
    ballDead: true,
    restart,
    players: placed,
    // Vị trí đã đổi hẳn: AI đội lập lại kế hoạch ở tick sau.
    ai: state.ai && { home: null, away: null },
    ball: restingBall(plan.spot),
    ballOwnerId: null,
    ownerSinceTick: tick,
    kickLock: null,
    lastShot: null,
    shotChargeTicks: 0,
    passCharge: null,
    tackleRecovery: {},
    standTackleCooldown: {},
    windup: null,
    passReceiver: null,
    backPass: null,
    controlledId: plan.team === HUMAN_TEAM ? restart.takerId : nearestHuman(placed, plan.spot),
  };
}

/** Giao bóng ở giữa sân: mọi cầu thủ về vị trí giao bóng. */
function enterKickoff(
  state: MatchState,
  kickingTeam: TeamSide,
  tick: number,
  holdTicks = 0,
): MatchState {
  const players = kickoffPlayers(state.players, state.formations, kickingTeam, state.half);
  const plan: RestartPlan = { type: 'kickoff', team: kickingTeam, spot: ZERO };
  return enterDeadBall(state, players, plan, tick, holdTicks);
}

/** Tạo trận ở thời điểm giao bóng hiệp 1 (đội nhà giao bóng). Ném lỗi nếu đội hình không hợp lệ. */
export function createMatch(setup: MatchSetup): MatchState {
  const home = MatchTeamSetup.parse(setup.home);
  const away = MatchTeamSetup.parse(setup.away);
  const halfLengthSec = setup.halfLengthSec ?? DEFAULT_HALF_LENGTH_SEC;
  // Ngắn hơn nửa tick thì giờ chính thức làm tròn thành 0 tick: bù giờ chia cho 0, hiệp không hết.
  if (!Number.isFinite(halfLengthSec) || regulationTicks(halfLengthSec) < 1) {
    throw new RangeError(`halfLengthSec phải đủ dài cho ít nhất 1 tick, nhận ${halfLengthSec}`);
  }
  const kickoffTeam: TeamSide = 'home';
  const blank: MatchState = {
    tick: 0,
    half: 1,
    halfTick: 0,
    halfLengthSec,
    phase: 'kickoff',
    ballDead: true,
    restart: null,
    lastTouchTeam: kickoffTeam,
    stoppage: { overrunTicks: 0, goals: 0 },
    addedMinutes: null,
    difficulty: setup.difficulty,
    rng: seedRng(setup.seed),
    score: { home: 0, away: 0 },
    shots: { home: 0, away: 0 },
    lastShot: null,
    autopilot: setup.autopilot ?? false,
    homeAi: setup.homeAi ?? 'teammate',
    formations: { home: home.formation, away: away.formation },
    kickoffTeam,
    ball: restingBall(ZERO),
    players: [...spawnTeam(home, 'home'), ...spawnTeam(away, 'away')],
    bookings: [],
    tackleRecovery: {},
    lastTackle: null,
    standTackleCooldown: {},
    bench: { home: benchOf(home), away: benchOf(away) },
    subsUsed: { home: 0, away: 0 },
    substitutions: [],
    actionDeadline: null,
    halfTimeEndTick: null,
    shotInFlight: null,
    shootout: null,
    ballOwnerId: null,
    ownerSinceTick: 0,
    kickLock: null,
    shotChargeTicks: 0,
    passCharge: null,
    controlledId: '',
    windup: null,
    passReceiver: null,
    backPass: null,
    input: NO_INPUT,
    ai: { home: null, away: null },
  };
  return enterKickoff(blank, kickoffTeam, 0);
}

const finiteOr0 = (v: number): number => (Number.isFinite(v) ? v : 0);

/** Input đến từ bên ngoài: NaN/Infinity → 0, hướng dài hơn 1 bị kẹp, nút ép về boolean. */
function sanitizeInput(input: PlayerInput): PlayerInput {
  return {
    move: clampLength(vec2(finiteOr0(input.move.x), finiteOr0(input.move.y)), 1),
    pass: !!input.pass,
    lob: !!input.lob,
    shoot: !!input.shoot,
    sprint: !!input.sprint,
    switch: !!input.switch,
    through: !!input.through,
    modifier: !!input.modifier,
    finesse: !!input.finesse,
    adjust: !!input.adjust,
  };
}

/** Người vừa chuyền/sút/mất bóng không chạm lại được bóng trong bấy nhiêu tick (0,2 s). */
export const KICK_LOCK_TICKS = 12;
/** Chuyền thấp không có người nhận trong hướng bấm thì bóng đi chừng này mét. */
const LOOSE_PASS_DIST = 15;
/** Chuyền bổng không có người nhận thì bóng đi chừng này phần tầm chuyền bổng. */
const LOOSE_LOB_RANGE_FRAC = 0.6;
type Button = Exclude<keyof PlayerInput, 'move'>;

/** Người nhận còn tự chạy đón thêm chừng này tick sau lúc bóng dự kiến tới. */
const RECEIVE_GRACE_TICKS = 20;

/**
 * Người chơi chuyền từ `from` theo hướng `dir` (có hỗ trợ chuyền): đón trước đồng đội gần nhất
 * trong hướng, bóng đi chuẩn; không có ai thì vào khoảng trống. `receiver` là người nhận dự kiến
 * và chỗ bóng tới (null khi chuyền vào khoảng trống).
 */
function kickPass(
  players: readonly PlayerState[],
  passer: PlayerState,
  from: Vec2,
  dir: Vec2,
  kind: PassKind,
  rng: RngState,
  tick: number,
  /** Lực chuyền 0…1 (giữ S/A); 0 = bấm nhanh, như bóng chết và trước khi có thanh lực. */
  power = 0,
): { ball: BallState; rng: RngState; receiver: PassReceiver | null } {
  const range = kind === 'lob' ? lobRangeFor(passer.stats.passing) : Infinity;
  const target = choosePassTarget(players, passer, dir, range, kind, power, true);
  const looseDist =
    kind === 'lob'
      ? range * (LOOSE_LOB_RANGE_FRAC + (1 - LOOSE_LOB_RANGE_FRAC) * power)
      : LOOSE_PASS_DIST * (1 + power);
  const to = target
    ? passLeadPoint(from, target, kind)
    : add(from, scale(normalize(dir), looseDist));
  const errorMult = target ? PASS_ASSIST_ERROR_MULT : 1;
  const travelTicks = Math.ceil(passTravelTime(length(sub(to, from)), kind) / TICK_DT);
  const receiver = target
    ? { playerId: target.id, point: to, untilTick: tick + travelTicks + RECEIVE_GRACE_TICKS }
    : null;
  return { ...passBall(passer, from, to, kind, rng, errorMult, power), receiver };
}

/** AI chỉ đá khi hướng đá lệch hướng mặt không quá ~80° (cos); lệch hơn thì xoay người trước. */
export const AI_KICK_FACING_COS = 0.2;
/** Độ lớn cần analog khi AI xoay người để đá (chậm lại, giữ bóng trong chân). */
const AI_TURN_MOVE = 0.3;

/** Hướng cần xoay tới trước khi đá, hoặc null nếu đã đủ thẳng hướng mặt. */
function kickAim(
  carrier: PlayerState,
  action: Exclude<CarrierAction, { type: 'dribble' }>,
): Vec2 | null {
  const to = sub(action.type === 'shoot' ? action.target : action.to, carrier.pos);
  if (length(to) === 0) return null;
  const dir = normalize(to);
  return dot(dir, carrier.facing) >= AI_KICK_FACING_COS ? null : dir;
}

/** Thủ môn ném tay: bóng rời tay ở độ cao vai (m) với vận tốc đứng hướng lên (m/s). */
export const THROW_RELEASE_HEIGHT = 1.5;
export const THROW_RELEASE_VZ = 2;

/** Chọc khe bấm nhanh: bóng tới trước người nhận chừng này mét theo hướng tấn công (task 5.16). */
export const THROUGH_LEAD = 4;
/** Chọc khe đầy thanh lực: bóng tới trước người nhận chừng này mét (task 5.23). */
export const THROUGH_LEAD_MAX = 9;
/**
 * Chọc khe chỉ dùng phần này của lực để tăng tốc độ bóng lúc tới nơi (chuyền thường dùng đủ): đầy
 * lực thì bóng tới chân ~8 m/s thay vì 12 m/s — người chơi thấy chọc khe căng quá, ảo (16/11/2026).
 */
export const THROUGH_ARRIVAL_POWER_MULT = 1 / 3;

/**
 * Người chơi chọc khe (W / Q+W): như `kickPass` nhưng đích là khoảng trống phía trước người nhận theo
 * hướng tấn công `attack`, người nhận chạy đón. Không có ai trong hướng thì chuyền vào khoảng trống.
 * `power` 0…1 (giữ W): lực lớn thì ưu tiên người xa hơn, bóng dẫn xa hơn trước người nhận và đi căng hơn.
 */
function throughPass(
  players: readonly PlayerState[],
  passer: PlayerState,
  from: Vec2,
  dir: Vec2,
  kind: PassKind,
  attack: 1 | -1,
  rng: RngState,
  tick: number,
  power = 0,
): { ball: BallState; rng: RngState; receiver: PassReceiver | null } {
  const range = kind === 'lob' ? lobRangeFor(passer.stats.passing) : Infinity;
  const target = choosePassTarget(players, passer, dir, range, kind, power, true);
  if (!target) return kickPass(players, passer, from, dir, kind, rng, tick, power);
  const leadM = THROUGH_LEAD + (THROUGH_LEAD_MAX - THROUGH_LEAD) * power;
  const lead = add(passLeadPoint(from, target, kind), vec2(attack * leadM, 0));
  const to = vec2(Math.max(-HALF_LENGTH + 1, Math.min(HALF_LENGTH - 1, lead.x)), lead.y);
  const travelTicks = Math.ceil(passTravelTime(length(sub(to, from)), kind) / TICK_DT);
  const receiver = {
    playerId: target.id,
    point: to,
    untilTick: tick + travelTicks + RECEIVE_GRACE_TICKS,
  };
  const passPow = power * THROUGH_ARRIVAL_POWER_MULT;
  return { ...passBall(passer, from, to, kind, rng, PASS_ASSIST_ERROR_MULT, passPow), receiver };
}

/** Người nhận đường chuyền của AI (chạy đón bóng như đường chuyền của người chơi). */
function aiReceiver(
  action: Exclude<CarrierAction, { type: 'dribble' }>,
  from: Vec2,
  tick: number,
): PassReceiver | null {
  if (action.type !== 'pass' || action.targetId === null) return null;
  const travelTicks = Math.ceil(
    passTravelTime(length(sub(action.to, from)), action.kind) / TICK_DT,
  );
  return {
    playerId: action.targetId,
    point: action.to,
    untilTick: tick + travelTicks + RECEIVE_GRACE_TICKS,
  };
}

/** Thủ môn bắt đầu lấy đà: bóng rời tay/chân sau KEEPER_WINDUP_TICKS. */
const startWindup = (
  playerId: string,
  tick: number,
  style: Windup['style'],
  kick: WindupKick,
): Windup => ({ playerId, releaseTick: tick + KEEPER_WINDUP_TICKS, style, kick });

/**
 * Lấy đà xong: đá/ném từ `from`, đích chuyền tính lại theo vị trí đồng đội lúc này (đồng đội đã chạy
 * thêm trong lúc lấy đà). `receiver` chỉ có với cú chuyền của người chơi.
 */
function releaseWindup(
  state: MatchState,
  players: readonly PlayerState[],
  windup: Windup,
  from: Vec2,
  rng: RngState,
  tick: number,
): { ball: BallState; rng: RngState; shot: boolean; receiver: PassReceiver | null } {
  const kick = releaseWindupKick(state, players, windup, from, rng, tick);
  if (windup.style !== 'throw') return kick;
  // Ném tay: bóng rời tay ở độ cao vai, bay lên một chút rồi rơi xuống lăn tiếp.
  return { ...kick, ball: { ...kick.ball, z: THROW_RELEASE_HEIGHT, vz: THROW_RELEASE_VZ } };
}

function releaseWindupKick(
  state: MatchState,
  players: readonly PlayerState[],
  windup: Windup,
  from: Vec2,
  rng: RngState,
  tick: number,
): { ball: BallState; rng: RngState; shot: boolean; receiver: PassReceiver | null } {
  const keeper = players.find((p) => p.id === windup.playerId)!;
  const k = windup.kick;
  if (k.type === 'assisted') {
    return {
      ...kickPass(players, asKicker(keeper), from, k.dir, k.kind, rng, tick, k.power),
      shot: false,
    };
  }
  const target =
    k.type === 'pass' && k.targetId !== null ? players.find((p) => p.id === k.targetId) : undefined;
  const action =
    target && k.type === 'pass' ? { ...k, to: passLeadPoint(from, target, k.kind) } : k;
  const profile = aiProfile(state, keeper.team);
  return {
    ...performKick(keeper, from, action, rng, profile),
    receiver: aiReceiver(k, from, tick),
  };
}

/** Khung thành nhà của `team` trong hiệp `half`. */
const ownGoalOf = (team: TeamSide, half: 1 | 2): Vec2 =>
  vec2(-attackSign(team, half) * HALF_LENGTH, 0);

/** Đội máy theo mức độ khó; cầu thủ AI cùng đội người chơi dùng profile đồng đội. */
const aiProfile = (state: MatchState, team: TeamSide): AiProfile =>
  team === HUMAN_TEAM ? AI_PROFILES[state.homeAi] : AI_PROFILES[state.difficulty];

/** Cầu thủ đang nhận input của người chơi; null khi autopilot (AI điều khiển cả đội). */
const humanOf = (state: MatchState, controlledId: string): string | null =>
  state.autopilot ? null : controlledId;

/** AI chuyền/sút theo quyết định, sai số nhân theo profile. `shot`: có tính là cú sút không. */
function performKick(
  player: PlayerState,
  from: Vec2,
  action: Exclude<CarrierAction, { type: 'dribble' }>,
  rng: RngState,
  profile: AiProfile,
): { ball: BallState; rng: RngState; shot: boolean } {
  const kicker = asKicker(player);
  if (action.type === 'shoot') {
    const kick = shootBall(kicker, from, action.target, action.power, rng, profile.shotErrorMult);
    return { ...kick, shot: true };
  }
  const kick = passBall(kicker, from, action.to, action.kind, rng, profile.passErrorMult);
  return { ...kick, shot: false };
}

/** Cú sút mới bay đi (thủ môn đội kia bắt đầu phản ứng), hoặc null nếu là đường chuyền. */
const shotFrom = (shot: boolean, team: TeamSide, tick: number): MatchState['lastShot'] =>
  shot ? { team, tick } : null;

const addShot = (shots: Record<TeamSide, number>, team: TeamSide): Record<TeamSide, number> => ({
  ...shots,
  [team]: shots[team] + 1,
});

/**
 * AI tầng đội cho tick này: lập lại kế hoạch hai đội nếu tới hạn, trả kế hoạch mới và hàm cho input
 * di chuyển của từng cầu thủ AI (người do người chơi điều khiển `humanId` và mọi người khi tắt AI:
 * đứng yên).
 */
function runTeamAi(
  state: MatchState,
  players: readonly PlayerState[],
  ball: BallState,
  ballOwnerId: string | null,
  restartTeam: TeamSide | null,
  humanId: string | null,
  tick: number,
): { ai: MatchState['ai']; moveOf: (p: PlayerState) => { move: Vec2; sprint: boolean } } {
  const still = { move: ZERO, sprint: false };
  if (!state.ai) return { ai: null, moveOf: () => still };
  const prev = state.ai;
  const think = (team: TeamSide) => {
    const profile = aiProfile(state, team);
    return thinkTeam(
      prev[team],
      {
        team,
        half: state.half,
        formation: state.formations[team],
        players,
        ball,
        ballOwnerId,
        restartTeam,
        aggression: profile.aggression,
        controlledId: team === HUMAN_TEAM ? humanId : null,
      },
      tick,
      profile.reactionDelayTicks,
    );
  };
  const ai = { home: think('home'), away: think('away') };
  const moveOf = (p: PlayerState) =>
    p.id === humanId
      ? still
      : aiMove(
          p,
          ai[p.team].plan,
          players,
          ball,
          ballOwnerId,
          state.half,
          aiProfile(state, p.team).aggression,
          state.backPass,
        );
  return { ai, moveOf };
}

/**
 * Chạy một tick cố định (TICK_DT). Hàm thuần: không sửa `state`, không đọc đồng hồ thật.
 * Theo phase: `play` → chơi bóng; `kickoff`/`dead_ball` → chờ thực hiện lại bóng;
 * `half_time` → chờ bấm chuyền để đá hiệp 2 (tối đa HALF_TIME_MAX_TICKS); `full_time` → trả nguyên
 * state.
 * Đồng hồ chạy ở mọi phase trừ `half_time`/`full_time`.
 */
export function step(state: MatchState, rawInput: PlayerInput): MatchState {
  if (state.phase === 'full_time') return state;
  const next = advance(state, rawInput);
  const actionDeadline = nextDeadline(state.actionDeadline, next);
  return actionDeadline === next.actionDeadline ? next : { ...next, actionDeadline };
}

/**
 * Hạn chót người chơi phải tự thực hiện ở state `s` (`prev`: hạn chót tick trước, giữ nguyên object
 * nếu không đổi): mọi tình huống cố định của đội người chơi tính từ `readyTick` (người thực hiện đã
 * đứng trước bóng, chuyển cảnh đã xong — luật 3); thủ môn do người chơi cầm đang ôm bóng bằng tay
 * tính từ lúc bắt đầu ôm. Autopilot thì không có.
 */
function nextDeadline(prev: ActionDeadline | null, s: MatchState): ActionDeadline | null {
  if (s.autopilot) return null;
  const r = s.restart;
  if (r) {
    if (r.team !== HUMAN_TEAM) return null;
    const deadlineTick = r.readyTick + SET_PIECE_MAX_TICKS;
    return prev?.kind === r.type &&
      prev.playerId === r.takerId &&
      prev.deadlineTick === deadlineTick
      ? prev
      : { kind: r.type, playerId: r.takerId, deadlineTick };
  }
  const holder = s.ballOwnerId === null ? undefined : s.players.find((p) => p.id === s.ballOwnerId);
  if (
    s.phase !== 'play' ||
    !holder ||
    holder.team !== HUMAN_TEAM ||
    holder.id !== s.controlledId ||
    !isKeeperHandling(holder, s.half, s.backPass)
  ) {
    return null;
  }
  // Tính từ lúc bắt đầu cầm bóng (không phải lúc vào vòng cấm): ra/vào vòng cấm không đặt lại hạn.
  const deadlineTick = s.ownerSinceTick + KEEPER_HOLD_MAX_TICKS;
  return prev?.kind === 'keeper_hold' &&
    prev.playerId === holder.id &&
    prev.deadlineTick === deadlineTick
    ? prev
    : { kind: 'keeper_hold', playerId: holder.id, deadlineTick };
}

/**
 * Cú sút chưa phân định sau tick này: cú sút mới (`lastShot` vừa đặt ở tick này) hoặc cú đang theo
 * dõi, còn tính tới khi bóng chết (vào lưới / ra ngoài), có người giữ bóng, đội kia chạm bóng làm
 * bóng đổi hướng ra xa khung thành (thủ môn cản) hoặc quá WHISTLE_SHOT_WAIT_TICKS. Chạm nhẹ mà bóng
 * vẫn đi về khung thành thì vẫn chờ.
 */
function trackShot(prev: MatchState['shotInFlight'], s: MatchState): MatchState {
  const shot =
    s.lastShot && s.lastShot.tick === s.tick ? { team: s.lastShot.team, tick: s.tick } : prev;
  const pending =
    shot !== null &&
    s.restart === null &&
    s.ballOwnerId === null &&
    (s.lastTouchTeam === shot.team || s.ball.vel.x * attackSign(shot.team, s.half) > 0) &&
    s.tick - shot.tick < WHISTLE_SHOT_WAIT_TICKS;
  const shotInFlight = pending ? shot : null;
  return shotInFlight === s.shotInFlight ? s : { ...s, shotInFlight };
}

function advance(state: MatchState, rawInput: PlayerInput): MatchState {
  const input = state.autopilot ? NO_INPUT : sanitizeInput(rawInput);
  const pressed = (b: Button) => input[b] && !state.input[b];
  const tick = state.tick + 1;

  if (state.phase === 'half_time') {
    const waiting = { ...state, tick, input };
    const timeUp = state.halfTimeEndTick !== null && tick >= state.halfTimeEndTick;
    return pressed('pass') || state.autopilot || timeUp ? startSecondHalf(waiting, tick) : waiting;
  }
  if (state.phase === 'shootout') return stepShootout(state, input, pressed, tick);
  const played = state.restart
    ? stepDeadBall(state, input, pressed, tick)
    : stepPlay(state, input, pressed, tick);
  const next = runClock(trackShot(state.shotInFlight, played));
  if (!next.ballDead || state.ballDead) return next;
  // Bóng vừa chết: đội máy (và đội người chơi khi tự đá) thay cầu thủ kiệt sức.
  const cpu = autoSubstitute(next, other(HUMAN_TEAM));
  return next.autopilot ? autoSubstitute(cpu, HUMAN_TEAM) : cpu;
}

/**
 * Hết giờ mà chưa được thổi còi: đang chờ đá phạt đền, hoặc cú sút đang bay chưa phân định (PRD §5).
 * Cả hai đều có trần thời gian nên hiệp luôn kết thúc.
 */
const whistleHeld = (s: MatchState): boolean =>
  s.shotInFlight !== null ||
  (s.restart?.type === 'penalty' && s.tick - s.restart.startTick < WHISTLE_PENALTY_WAIT_TICKS);

/**
 * Đồng hồ chạy thêm một tick; hết hiệp thì sang nghỉ giữa hiệp, hết trận, hoặc luân lưu nếu hoà
 * sau hiệp 2. Hết giờ lúc chờ phạt đền / cú sút đang bay: đồng hồ đứng ở tick cuối tới khi xong.
 */
function runClock(state: MatchState): MatchState {
  const halfTick = state.halfTick + 1;
  const clock = advanceClock(halfTick, state.halfLengthSec, state.stoppage, state.addedMinutes);
  if (!clock.halfOver) return { ...state, halfTick, addedMinutes: clock.addedMinutes };
  if (whistleHeld(state)) return { ...state, addedMinutes: clock.addedMinutes };
  const ended = { ...state, halfTick, addedMinutes: clock.addedMinutes };
  if (state.half === 1) return whistle(ended, 'half_time');
  return state.score.home === state.score.away ? enterShootout(ended) : whistle(ended, 'full_time');
}

/** Còi nghỉ giữa hiệp / hết trận: bóng chết tại chỗ, huỷ mọi thao tác đang dở. */
function whistle(state: MatchState, phase: 'half_time' | 'full_time'): MatchState {
  return {
    ...state,
    phase,
    ballDead: true,
    restart: null,
    ballOwnerId: null,
    kickLock: null,
    shotChargeTicks: 0,
    passCharge: null,
    windup: null,
    passReceiver: null,
    backPass: null,
    lastShot: null,
    shotInFlight: null,
    halfTimeEndTick: phase === 'half_time' ? state.tick + HALF_TIME_MAX_TICKS : null,
    ball: restingBall(state.ball.pos),
  };
}

/** Hoà sau 2 hiệp: vào luân lưu, đội nhà sút trước. */
function enterShootout(state: MatchState): MatchState {
  const shootout = {
    home: [],
    away: [],
    first: 'home' as const,
    kicking: 'home' as const,
    kickTick: null,
  };
  return setupShootoutKick({ ...state, shootout }, state.tick);
}

/**
 * Đặt lượt sút kế: phạt đền về khung thành đội sút tấn công ở hiệp 2, người sút theo thứ tự
 * `shooterFor`. Lượt của đội người chơi thì người chơi cầm người sút.
 */
function setupShootoutKick(state: MatchState, tick: number): MatchState {
  const so = state.shootout!;
  const team = nextShooter(so, so.first);
  const taker = shooterFor(state.players, team, so[team].length);
  const spot = vec2(attackSign(team, state.half) * (HALF_LENGTH - PENALTY_SPOT_DIST), 0);
  // Lượt đầu vào thẳng; các lượt sau phần hiển thị cho xem kết quả lượt vừa sút rồi mới che màn.
  const holdTicks = so.home.length + so.away.length > 0 ? SHOOTOUT_HOLD_TICKS : 0;
  const plan: RestartPlan = { type: 'penalty', team, spot };
  const dead = enterDeadBall(state, state.players, plan, tick, holdTicks, taker.id);
  return { ...dead, phase: 'shootout', shootout: { ...so, kicking: team, kickTick: null } };
}

/**
 * Một tick luân lưu: chờ sút như phạt đền (`stepDeadBall`), rồi cho bóng chạy (`stepPlay`) tới khi
 * phân định lượt: vào lưới, hoặc hỏng.
 * Bàn luân lưu và cú sút không tính vào tỉ số / thống kê trận. Đồng hồ không chạy.
 */
function stepShootout(
  state: MatchState,
  input: PlayerInput,
  pressed: (b: Button) => boolean,
  tick: number,
): MatchState {
  const so = state.shootout!;
  if (state.restart) {
    const next = stepDeadBall(state, input, pressed, tick);
    const kicked = next.restart === null;
    return {
      ...next,
      phase: 'shootout',
      shots: state.shots,
      shootout: kicked ? { ...so, kickTick: tick } : so,
    };
  }
  const next = stepPlay(state, input, pressed, tick);
  const team = so.kicking;
  const scored = next.score[team] > state.score[team];
  // Hỏng: bóng ra ngoài (sang bóng chết), thủ môn chạm/bắt (đội kia chạm cuối), có người khống
  // chế bóng bật ra, hoặc quá lâu.
  const over =
    scored ||
    next.phase !== 'shootout' ||
    next.lastTouchTeam !== team ||
    next.ballOwnerId !== null ||
    tick - (so.kickTick ?? tick) >= SHOOTOUT_KICK_TICKS;
  if (!over) return { ...next, phase: 'shootout', shots: state.shots };
  const tally = { ...so, [team]: [...so[team], scored] };
  // Vào lưới: `stepPlay` đã xếp mọi người về vị trí giao bóng — luân lưu không giao bóng, ai ở đâu
  // đứng yên đó (người sút lượt kế được đặt thẳng vào chấm phạt đền).
  const players = scored ? state.players : next.players;
  const after: MatchState = {
    ...next,
    players,
    score: state.score,
    shots: state.shots,
    shootout: tally,
  };
  if (shootoutWinner(tally) === null) return setupShootoutKick(after, tick);
  return whistle({ ...after, ball: restingBall(after.ball.pos) }, 'full_time');
}

/** Hiệp 2: đổi sân, đội không giao bóng hiệp 1 giao bóng, đồng hồ và bù giờ về 0. */
function startSecondHalf(state: MatchState, tick: number): MatchState {
  const second: MatchState = {
    ...state,
    half: 2,
    halfTick: 0,
    stoppage: { overrunTicks: 0, goals: 0 },
    addedMinutes: null,
    halfTimeEndTick: null,
  };
  return enterKickoff(second, other(state.kickoffTeam), tick);
}

/**
 * Bóng chết: đội người bấm J/L để chuyền (hướng bấm chọn hướng chuyền), đá phạt và phạt đền thì
 * giữ-thả K để sút (phạt đền chỉ được sút); đội máy tự thực hiện sau 3 s. Tình huống nào của người
 * chơi (kể cả giao bóng, ném biên, phạt góc, phát bóng) chờ quá SET_PIECE_MAX_TICKS (15 s) kể từ
 * `readyTick` thì máy thực hiện hộ. Trong lúc chờ, người thực
 * hiện đứng yên sau bóng; cầu thủ người chơi đang cầm (nếu không phải người thực hiện) vẫn chạy được.
 * Chờ quá RESTART_GRACE_TICKS bị tính vào bù giờ.
 */
function stepDeadBall(
  state: MatchState,
  input: PlayerInput,
  pressed: (b: Button) => boolean,
  tick: number,
): MatchState {
  const restart = state.restart!;
  const taker = state.players.find((p) => p.id === restart.takerId)!;
  const humanRestart = restart.team === HUMAN_TEAM && !state.autopilot;
  const canShoot = restart.type === 'free_kick' || restart.type === 'penalty';
  const canPass = restart.type !== 'penalty';
  const goalSign = attackSign(restart.team, state.half);
  const pass = (kind: PassKind, dir: Vec2) =>
    kickPass(state.players, taker, restart.spot, dir, kind, state.rng, tick);
  // Phạt đền có hệ số sai số riêng (không theo mức độ khó); đá phạt sút như bóng sống.
  const penalty = restart.type === 'penalty';
  // Đá phạt, phạt góc, phát bóng của người chơi: mũi tên trái/phải xoay hướng ngắm (camera sau lưng
  // người đá), giữ Shift thì dời điểm chạm bóng (`rules/setPieceAim.ts`).
  const takerFar = length(sub(taker.pos, restart.spot)) > DRIBBLE_OFFSET + RESTART_SETTLE_DIST;
  const aimed = humanRestart && AIMED_RESTARTS.has(restart.type);
  const adjusting = aimed && input.adjust && CONTACT_RESTARTS.has(restart.type);
  // Người đá chưa tới bóng thì chưa xoay (giữ hướng mặc định để đi đúng chỗ).
  const turn = adjusting || takerFar ? 0 : input.move.x;
  const setAim = aimed ? turnAim(restartAim(restart, state.half), turn) : null;
  const contact = adjusting ? moveContact(restartContact(restart), input.move) : restart.contact;
  // Đá phạt, phạt góc của người chơi: bóng đi theo điểm chạm đã chọn.
  const touch = <K extends { ball: BallState; rng: RngState }>(k: K): K =>
    humanRestart && CONTACT_RESTARTS.has(restart.type)
      ? { ...k, ...kickWithContact(k.ball, contact, taker.stats.shooting, k.rng) }
      : k;
  const humanShot = (chargeTicks: number) => ({
    ...shootBall(
      taker,
      restart.spot,
      setAim ? aimTarget(restart.spot, setAim, goalSign) : shotTarget(goalSign, input.move.y),
      shotPower(chargeTicks),
      state.rng,
    ),
    shot: true,
  });
  // Phạt đền của người chơi: nhả D thì lấy đà, trong lúc lấy đà mũi tên dời vòng ngắm.
  const runUp = humanRestart && penalty ? restart.penaltyRunUp : undefined;
  let penaltyRunUp = runUp && { ...runUp, y: movePenaltyAim(runUp.y, input.move.x, goalSign) };
  const release = (chargeTicks: number) => {
    if (penalty) {
      penaltyRunUp = {
        power: shotPower(chargeTicks),
        y: 0,
        releaseTick: tick + PENALTY_RUNUP_TICKS,
      };
      return null;
    }
    return touch(humanShot(chargeTicks));
  };

  // Mọi người đã được đặt vào vị trí lúc bóng chết (luật 2). Ai rời chỗ sau đó (người chơi chạy vào
  // khoảng cách cấm, bị chen) thì tự đi về; chưa xong thì chưa thực hiện được.
  // Phạt đền: hướng bấm chỉ dùng để nhắm lúc sút, người sút luôn quay mặt về khung thành.
  const humanAim = setAim ?? (humanRestart && restart.type !== 'penalty' ? input.move : ZERO);
  // Người thực hiện vừa đi tới bóng thì quay mặt về hướng thực hiện mặc định.
  const aim =
    length(humanAim) > 0 ? humanAim : takerFar ? restartFacing(restart, state.half) : ZERO;
  const timedOut = tick - restart.startTick >= RESTART_SETUP_MAX_TICKS;
  // Người chơi chờ quá hạn: máy thực hiện hộ (đang nạp lực sút thì sút luôn).
  const expired = humanRestart && tick >= restart.readyTick + SET_PIECE_MAX_TICKS;
  // Đã vào vị trí hay chưa xét theo hướng đang quay mặt: tới bóng rồi thì hướng bấm chỉ xoay người.
  // Đi quá lâu (bị chen) thì tick này đặt luôn mọi người vào vị trí, tick sau mới thực hiện.
  const targets = restartTargets(state.players, restart, state.half, takerFar ? aim : ZERO);

  let kicked: {
    ball: BallState;
    rng: RngState;
    shot: boolean;
    receiver?: PassReceiver | null;
  } | null = null;
  let { rng, windup } = state;
  let shotChargeTicks = 0;
  let passCharge: MatchState['passCharge'] = null;
  // Phát bóng: thủ môn lấy đà rồi bóng mới đi.
  const goalKick = restart.type === 'goal_kick';
  // Chuyền bóng chết như bóng sống: bấm S/A bắt đầu nạp lực, giữ thì lực tăng, nhả mới đá.
  const releasePass = (charge: NonNullable<MatchState['passCharge']>) => {
    const dir = setAim ?? (length(input.move) > 0 ? input.move : charge.dir);
    const power = passPower(charge.ticks);
    if (goalKick) {
      windup = startWindup(taker.id, tick, 'kick', {
        type: 'assisted',
        kind: charge.kind,
        dir,
        power,
      });
      return null;
    }
    return touch({
      ...kickPass(state.players, taker, restart.spot, dir, charge.kind, state.rng, tick, power),
      shot: false,
    });
  };
  const charging = state.passCharge;
  if (windup) {
    if (tick >= windup.releaseTick) {
      kicked = releaseWindup(state, state.players, windup, restart.spot, rng, tick);
      windup = null;
    }
  } else if (penaltyRunUp) {
    if (tick >= penaltyRunUp.releaseTick) {
      const { y, power } = penaltyRunUp;
      kicked = { ...penaltyShot(taker, restart.spot, goalSign, y, power, state.rng), shot: true };
    }
  } else if (targets.size > 0) {
    // Còn người đang đi về vị trí.
  } else if (expired && state.shotChargeTicks > 0) {
    kicked = release(state.shotChargeTicks);
  } else if (expired && charging) {
    kicked = releasePass(charging);
  } else if (humanRestart && !expired) {
    if (charging && input[charging.kind === 'ground' ? 'pass' : 'lob']) {
      passCharge = {
        ...charging,
        ticks: Math.min(PASS_FULL_CHARGE_TICKS, charging.ticks + 1),
        dir: length(input.move) > 0 ? input.move : charging.dir,
      };
    } else if (charging) {
      kicked = releasePass(charging);
    } else if (canPass && (pressed('pass') || pressed('lob'))) {
      const dir = setAim ?? (length(input.move) > 0 ? input.move : taker.facing);
      const kind = pressed('pass') ? 'ground' : 'lob';
      // Giao bóng, ném biên (camera TV) vẫn bấm là đá.
      if (aimed) passCharge = { kind, ticks: 1, dir, through: false };
      else kicked = { ...pass(kind, dir), shot: false };
    } else if (canShoot && input.shoot && (state.shotChargeTicks > 0 || pressed('shoot'))) {
      shotChargeTicks = state.shotChargeTicks + 1;
    } else if (canShoot && !input.shoot && state.shotChargeTicks > 0) {
      kicked = release(state.shotChargeTicks);
    }
  } else if (expired || cpuRestartDue(restart, tick)) {
    const decided = decideRestartKick(restart, state.players, state.half, state.rng);
    if (decided.action.type !== 'dribble' && goalKick) {
      windup = startWindup(taker.id, tick, 'kick', decided.action);
      rng = decided.rng;
    } else if (decided.action.type !== 'dribble') {
      const ai = aiProfile(state, restart.team);
      const profile = penalty ? { ...ai, shotErrorMult: PENALTY_ERROR_MULT } : ai;
      kicked = {
        ...performKick(taker, restart.spot, decided.action, decided.rng, profile),
        // Máy đá hộ người chơi: người chơi cầm luôn người nhận như khi tự chuyền.
        receiver: humanRestart ? aiReceiver(decided.action, restart.spot, tick) : null,
      };
    }
  }

  if (kicked) {
    // Phạt đền: thủ môn đội kia đoán hướng ngay lúc sút.
    let lastShot = shotFrom(kicked.shot, restart.team, tick);
    const keeper = state.players.find((p) => p.position === 'GK' && p.team !== restart.team);
    if (restart.type === 'penalty' && lastShot && keeper) {
      const guessMult = aiProfile(state, keeper.team).penaltyGuessMult;
      const g = penaltyGuess(keeper, kicked.ball, kicked.rng, guessMult);
      kicked = { ...kicked, rng: g.rng };
      if (g.guess) lastShot = { ...lastShot, keeperGuess: g.guess };
    }
    // Ném biên bằng tay: bóng rời tay trên đầu chứ không lăn từ chân.
    const ball =
      restart.type === 'throw_in' ? { ...kicked.ball, z: THROW_IN_RELEASE_Z } : kicked.ball;
    const receiver = kicked.receiver ?? null;
    return {
      ...state,
      tick,
      phase: 'play',
      ballDead: false,
      restart: null,
      rng: kicked.rng,
      ball,
      // Người vừa tới sát chỗ ở tick trước: đứng đúng vị trí lúc bóng đi.
      players: holdRestart(state.players, restart, state.half),
      ballOwnerId: null,
      ownerSinceTick: tick,
      // Người chơi chuyền bóng chết: đổi ngay sang người nhận, người nhận tự chạy đón (5.17).
      controlledId: humanRestart && receiver ? receiver.playerId : state.controlledId,
      passReceiver: humanRestart ? receiver : null,
      windup: null,
      backPass: kickedBy(taker),
      kickLock: { playerId: taker.id, untilTick: tick + KICK_LOCK_TICKS },
      lastTouchTeam: restart.team,
      shotChargeTicks: 0,
      passCharge: null,
      shots: kicked.shot ? addShot(state.shots, restart.team) : state.shots,
      lastShot,
      input,
    };
  }

  let { controlledId } = state;
  if (!humanRestart && (pressed('switch') || pressed('pass'))) {
    controlledId = chooseSwitchTarget(state.players, HUMAN_TEAM, restart.spot, controlledId);
  }
  const human = humanOf(state, controlledId);
  // Đội hình giữ nguyên lúc chờ giao bóng; phạt đền thì mọi người đứng ngoài vòng cấm chờ.
  const aiActive = restart.type !== 'kickoff' && restart.type !== 'penalty';
  const { ai, moveOf } = aiActive
    ? runTeamAi(state, state.players, state.ball, null, restart.team, human, tick)
    : { ai: state.ai, moveOf: () => ({ move: ZERO, sprint: false }) };
  const moved = separatePlayers(
    state.players.map((p) => {
      const target = targets.get(p.id);
      if (target) {
        const m = arrive(p, target, false);
        return stepPlayer(p, m.move, m.sprint);
      }
      if (p.id === taker.id) return stepPlayer(p, ZERO, false);
      if (p.id === human) return stepPlayer(p, input.move, input.sprint);
      const m = moveOf(p);
      return stepPlayer(p, m.move, m.sprint);
    }),
  );
  // Ai đã tới chỗ thì giữ đúng vị trí (người thực hiện sau bóng, đối phương ngoài khoảng cách).
  const held = holdRestart(moved, restart, state.half, aim);
  const players = moved.map((p, i) => (targets.has(p.id) && !timedOut ? p : held[i]!));
  const overrun = tick - restart.startTick > RESTART_GRACE_TICKS ? 1 : 0;
  return {
    ...state,
    tick,
    rng,
    windup,
    restart: setAim
      ? { ...restart, aim: setAim, contact }
      : penaltyRunUp
        ? { ...restart, penaltyRunUp }
        : restart,
    players,
    controlledId,
    ai,
    shotChargeTicks,
    passCharge,
    stoppage: { ...state.stoppage, overrunTicks: state.stoppage.overrunTicks + overrun },
    input,
  };
}

/**
 * Bóng sống. Thứ tự: đổi người → hành động của người chơi (mất bóng khi xoay / chuyền / sút, hoặc
 * xoạc (A) / giữ D để áp sát và tắc đứng khi không có bóng — phạm lỗi thì sang bóng chết ngay) →
 * di chuyển cầu thủ → bóng (dính chân
 * hoặc vật lý) → bóng ra ngoài / bàn thắng → bắt bóng tự do.
 * Cầu thủ không do người chơi điều khiển theo AI: người có bóng sút/chuyền/rê (`ai/player.ts`), người
 * áp sát tắc bóng đứng, những người khác di chuyển theo AI đội (`ai/team.ts`).
 */
function stepPlay(
  state: MatchState,
  input: PlayerInput,
  pressed: (b: Button) => boolean,
  tick: number,
): MatchState {
  let { ball, rng, kickLock, controlledId, ballOwnerId, shotChargeTicks, passCharge, shots } =
    state;
  let { lastShot, lastTouchTeam, lastTackle } = state;
  const byId = (id: string) => state.players.find((p) => p.id === id);
  const lock = (playerId: string) => ({ playerId, untilTick: tick + KICK_LOCK_TICKS });
  const tackleRecovery = Object.fromEntries(
    Object.entries(state.tackleRecovery).filter(([, until]) => until > tick),
  );
  const standTackleCooldown = Object.fromEntries(
    Object.entries(state.standTackleCooldown).filter(([, until]) => until > tick),
  );
  let slidingId: string | null = null;
  let { windup, passReceiver, backPass } = state;

  // 0. Thủ môn lấy đà xong: bóng rời tay/chân (đội người chơi: đổi sang người nhận, người đó chạy đón).
  if (windup && ballOwnerId !== windup.playerId) windup = null;
  if (windup && tick >= windup.releaseTick) {
    const keeper = byId(windup.playerId)!;
    const kick = releaseWindup(state, state.players, windup, ball.pos, rng, tick);
    ({ ball, rng } = kick);
    ballOwnerId = null;
    kickLock = lock(keeper.id);
    if (kick.receiver) {
      // Thủ môn đội người chơi ném/phát cho đồng đội: người chơi điều khiển luôn người nhận.
      if (keeper.team === HUMAN_TEAM) controlledId = kick.receiver.playerId;
      passReceiver = kick.receiver;
    }
    if (kick.shot) shots = addShot(shots, keeper.team);
    lastShot = shotFrom(kick.shot, keeper.team, tick);
    windup = null;
    backPass = null;
  }

  // 1. Đổi người: nút đổi người, hoặc J khi người đang điều khiển không có bóng.
  if (ballOwnerId !== controlledId && (pressed('switch') || pressed('pass'))) {
    const carrier = ballOwnerId === null ? undefined : byId(ballOwnerId);
    // Đối thủ dẫn bóng: chọn người chắn trước mặt họ, không chọn người đã bị vượt qua (5.17).
    controlledId =
      carrier && carrier.team !== HUMAN_TEAM
        ? chooseDefensiveSwitchTarget(
            state.players,
            HUMAN_TEAM,
            carrier,
            ownGoalOf(HUMAN_TEAM, state.half),
            controlledId,
          )
        : chooseSwitchTarget(state.players, HUMAN_TEAM, ball.pos, controlledId);
  }

  // Thủ môn đang ôm bóng thì không ai tranh được (người chơi lẫn máy).
  const ballHolder = ballOwnerId === null ? undefined : byId(ballOwnerId);
  const keeperHolds =
    ballHolder !== undefined && isKeeperHandling(ballHolder, state.half, backPass);

  // 2. Hành động của người dẫn bóng do người chơi điều khiển.
  const humanBefore = humanOf(state, controlledId);
  const me = humanBefore === null ? undefined : byId(humanBefore);
  if (me && ballOwnerId === me.id && !windup) {
    // S/A/W: bấm bắt đầu nạp lực chuyền/chọc khe, giữ thì lực tăng, nhả mới đá (đang nạp sút thì bỏ
    // qua). Thủ môn ôm bóng không chọc khe.
    const canStart = !passCharge && shotChargeTicks === 0;
    const startThrough = canStart && !keeperHolds && pressed('through');
    const startKind: PassKind | null = !canStart
      ? null
      : startThrough
        ? input.modifier
          ? 'lob'
          : 'ground'
        : pressed('pass')
          ? 'ground'
          : pressed('lob')
            ? 'lob'
            : null;
    const holding =
      passCharge !== null &&
      input[passCharge.through ? 'through' : passCharge.kind === 'ground' ? 'pass' : 'lob'];
    const moveDir = length(input.move) > 0 ? normalize(input.move) : null;
    const releasedShot = !input.shoot && shotChargeTicks > 0;
    const hold = state.actionDeadline;
    const holdExpired =
      keeperHolds &&
      hold?.kind === 'keeper_hold' &&
      hold.playerId === me.id &&
      tick >= hold.deadlineTick;
    // Ôm bóng quá hạn: tự phát bóng như thủ môn AI (chuyền cho người trống nhất, không có thì phát dài).
    const forced = holdExpired
      ? decideCarrier({
          carrier: me,
          players: state.players,
          half: state.half,
          heldTicks: KEEPER_HOLD_MAX_TICKS,
          minHoldTicks: 0,
        })
      : null;
    if (forced && forced.type !== 'dribble') {
      const style = forced.type === 'pass' && forced.kind === 'ground' ? 'throw' : 'kick';
      windup = startWindup(me.id, tick, style, forced);
      shotChargeTicks = 0;
      passCharge = null;
    } else if (!keeperHolds && losesBallOnTurn(me, input.move)) {
      // Thủ môn ôm bóng bằng tay thì xoay gắt cũng không tuột.
      // Bóng tuột chân, giữ vận tốc đang chạy.
      ballOwnerId = null;
      kickLock = lock(me.id);
      shotChargeTicks = 0;
      passCharge = null;
      backPass = null;
    } else if (startKind) {
      passCharge = { kind: startKind, ticks: 1, dir: moveDir ?? me.facing, through: startThrough };
    } else if (passCharge && holding) {
      passCharge = {
        ...passCharge,
        ticks: Math.min(PASS_FULL_CHARGE_TICKS, passCharge.ticks + 1),
        dir: moveDir ?? passCharge.dir,
      };
    } else if (passCharge) {
      // Chuẩn hoá: độ lớn cần analog chỉ chọn hướng, không làm ngắn đường chuyền vào khoảng trống.
      const dir = moveDir ?? passCharge.dir;
      const power = passPower(passCharge.ticks);
      const { kind } = passCharge;
      if (passCharge.through) {
        const attack = attackSign(me.team, state.half);
        const kick = throughPass(
          state.players,
          asKicker(me),
          ball.pos,
          dir,
          kind,
          attack,
          rng,
          tick,
          power,
        );
        ({ ball, rng } = kick);
        if (kick.receiver) controlledId = kick.receiver.playerId;
        passReceiver = kick.receiver;
        ballOwnerId = null;
        kickLock = lock(me.id);
        lastShot = null;
        backPass = kickedBy(me);
      } else if (keeperHolds) {
        // Thủ môn ôm bóng: lấy đà ném (chuyền sệt) / phát bóng (bổng), bóng còn trong tay.
        const style = kind === 'ground' ? 'throw' : 'kick';
        windup = startWindup(me.id, tick, style, { type: 'assisted', kind, dir, power });
      } else {
        const kick = kickPass(state.players, asKicker(me), ball.pos, dir, kind, rng, tick, power);
        rng = kick.rng;
        ball = kick.ball;
        // Đổi ngay sang người nhận như FC Online, không chờ bắt được bóng (5.17); người nhận tự
        // chạy tới chỗ bóng tới.
        if (kick.receiver) controlledId = kick.receiver.playerId;
        passReceiver = kick.receiver;
        ballOwnerId = null;
        kickLock = lock(me.id);
        lastShot = null;
        backPass = kickedBy(me);
      }
      shotChargeTicks = 0;
      passCharge = null;
    } else if (input.shoot && (shotChargeTicks > 0 || pressed('shoot'))) {
      // Chỉ nạp lực khi bấm nút sút lúc đang có bóng: giữ nút từ lúc chưa có bóng không thành sút.
      shotChargeTicks += 1;
    } else if (releasedShot) {
      const sign = attackSign(me.team, state.half);
      const power = shotPower(shotChargeTicks);
      ({ ball, rng } = input.finesse
        ? finesseShot(asKicker(me), ball.pos, sign, power, rng)
        : shootBall(asKicker(me), ball.pos, shotTarget(sign, input.move.y), power, rng));
      ballOwnerId = null;
      kickLock = lock(me.id);
      shotChargeTicks = 0;
      shots = addShot(shots, me.team);
      lastShot = shotFrom(true, me.team, tick);
      backPass = kickedBy(me);
    }
  } else {
    shotChargeTicks = 0;
    passCharge = null;
    // Nút chuyền bổng (A) khi không có bóng = xoạc.
    if (me && !keeperHolds && pressed('lob') && tackleRecovery[me.id] === undefined) {
      const tackle = resolveTackle(state.players, me, ball, ballOwnerId, rng, CONTROL_HEIGHT);
      rng = tackle.rng;
      const { outcome } = tackle;
      const victimId = outcome.type === 'miss' ? null : outcome.victimId;
      const tackleOf = (reaction: 'fall' | 'stumble' | null): MatchState['lastTackle'] => ({
        tick,
        tacklerId: me.id,
        victimId,
        outcome: outcome.type,
        victimReaction: reaction,
      });
      if (outcome.type === 'foul') {
        const victim = byId(outcome.victimId)!;
        const fouled = enterFoul({ ...state, tick, rng, input }, me, victim, outcome, tick);
        return { ...fouled, lastTackle: tackleOf(null) };
      }
      // Trúng bóng hay hụt đều nằm trượt; trúng bóng thì bóng bật ra, người bị xoạc ngã hoặc vấp.
      slidingId = me.id;
      tackleRecovery[me.id] = tick + TACKLE_RECOVERY_TICKS;
      let reaction: 'fall' | 'stumble' | null = null;
      if (outcome.type === 'won') {
        ball = pokeBall(me, ball);
        ballOwnerId = null;
        lastTouchTeam = me.team;
        backPass = null;
        if (outcome.victimId !== null) {
          const hit = victimReaction(rng);
          rng = hit.rng;
          reaction = hit.reaction;
          kickLock = lock(outcome.victimId);
          tackleRecovery[outcome.victimId] =
            tick + (reaction === 'fall' ? VICTIM_FALL_TICKS : VICTIM_STUMBLE_TICKS);
        }
      }
      lastTackle = tackleOf(reaction);
    } else if (
      me &&
      !keeperHolds &&
      input.shoot &&
      tackleRecovery[me.id] === undefined &&
      standTackleCooldown[me.id] === undefined
    ) {
      // Giữ D (nút sút) khi không có bóng: bóng vào tầm thì tắc bóng đứng.
      const tackle = resolveStandTackle(state.players, me, ball, ballOwnerId, rng);
      rng = tackle.rng;
      const { outcome } = tackle;
      if (outcome.type === 'foul') {
        const victim = byId(outcome.victimId)!;
        return enterFoul({ ...state, tick, rng, input }, me, victim, outcome, tick);
      }
      if (outcome.type === 'won') {
        ballOwnerId = me.id;
        kickLock = outcome.victimId === null ? null : lock(outcome.victimId);
      } else if (outcome.type === 'failed') {
        standTackleCooldown[me.id] = tick + STAND_TACKLE_COOLDOWN_TICKS;
      }
    }
  }

  // 2b. Người dẫn bóng do AI điều khiển: sút / chuyền, hoặc rê (hướng rê dùng ở bước 3).
  let carrierMove: { id: string; move: Vec2; sprint: boolean } | null = null;
  const aiCarrier =
    state.ai && ballOwnerId !== null && ballOwnerId !== humanBefore && !windup
      ? byId(ballOwnerId)
      : undefined;
  if (aiCarrier) {
    const profile = aiProfile(state, aiCarrier.team);
    const action = decideCarrier({
      carrier: aiCarrier,
      players: state.players,
      half: state.half,
      heldTicks: ballOwnerId === state.ballOwnerId ? tick - state.ownerSinceTick : 0,
      minHoldTicks: AI_MIN_HOLD_TICKS,
    });
    const aim = action.type === 'dribble' ? null : kickAim(aiCarrier, action);
    if (action.type === 'dribble') {
      carrierMove = { id: aiCarrier.id, move: action.move, sprint: action.sprint };
    } else if (aim && !isKeeperHandling(aiCarrier, state.half, backPass)) {
      // Hướng đá lệch quá xa hướng mặt (chuyền về sau): xoay người trước, tick sau mới đá.
      carrierMove = { id: aiCarrier.id, move: scale(aim, AI_TURN_MOVE), sprint: false };
    } else {
      if (isKeeperHandling(aiCarrier, state.half, backPass)) {
        const style = action.type === 'pass' && action.kind === 'ground' ? 'throw' : 'kick';
        windup = startWindup(aiCarrier.id, tick, style, action);
      } else {
        const kick = performKick(aiCarrier, ball.pos, action, rng, profile);
        rng = kick.rng;
        ball = kick.ball;
        passReceiver = aiReceiver(action, aiCarrier.pos, tick);
        ballOwnerId = null;
        kickLock = lock(aiCarrier.id);
        if (kick.shot) shots = addShot(shots, aiCarrier.team);
        lastShot = shotFrom(kick.shot, aiCarrier.team, tick);
        backPass = kickedBy(aiCarrier);
      }
    }
  }

  // 2c. Người áp sát AI tắc bóng đứng khi bóng vào tầm (không tắc từ phía sau, không tắc thủ môn
  // đang ôm bóng).
  const owned = state.ai && ballOwnerId !== null ? byId(ballOwnerId) : undefined;
  const victim = owned && !isKeeperHandling(owned, state.half, backPass) ? owned : undefined;
  const defendingPlan = victim ? state.ai?.[other(victim.team)]?.plan : undefined;
  const presserId = defendingPlan
    ? Object.entries(defendingPlan.roles).find(([, role]) => role === 'press')?.[0]
    : undefined;
  const presser = presserId === undefined ? undefined : byId(presserId);
  if (
    victim &&
    presser &&
    presser.id !== humanBefore &&
    presser.id !== kickLock?.playerId &&
    tackleRecovery[presser.id] === undefined &&
    standTackleCooldown[presser.id] === undefined &&
    !isFromBehind(presser, victim)
  ) {
    const tackle = resolveStandTackle(state.players, presser, ball, ballOwnerId, rng);
    rng = tackle.rng;
    const { outcome } = tackle;
    if (outcome.type === 'foul') {
      return enterFoul({ ...state, tick, rng, shots, input }, presser, victim, outcome, tick);
    }
    if (outcome.type === 'won') {
      ballOwnerId = presser.id;
      kickLock = lock(victim.id);
      carrierMove = null;
      if (presser.team === HUMAN_TEAM) controlledId = presser.id;
    } else if (outcome.type === 'failed') {
      const delay = aiProfile(state, presser.team).reactionDelayTicks;
      standTackleCooldown[presser.id] = tick + AI_STAND_TACKLE_COOLDOWN_TICKS + delay;
    }
  }
  const human = humanOf(state, controlledId);

  // Giữ D khi đối phương dẫn bóng: tự chạy tới điểm chắn giữa người đó và khung thành nhà,
  // hướng bấm cộng thêm để chỉnh.
  const opponentOwner =
    ballOwnerId === null ? undefined : state.players.find((p) => p.id === ballOwnerId);
  const controlledMove = (p: PlayerState): Vec2 => {
    if (!input.shoot || !opponentOwner || opponentOwner.team === p.team) return input.move;
    const spot = goalSidePoint(opponentOwner.pos, p.team, state.half, CONTAIN_DIST);
    const auto = arrive(p, spot, false).move;
    return clampLength(add(auto, scale(input.move, CONTAIN_STEER_WEIGHT)), 1);
  };

  // 3. Di chuyển cầu thủ: người chơi theo input, người khác theo AI đội. Người đang trượt/đứng dậy
  // sau cú xoạc hụt không điều khiển được.
  const { ai, moveOf } = runTeamAi(state, state.players, ball, ballOwnerId, null, human, tick);
  // Thủ môn AI đã phản ứng với cú sút của đối phương thì lao người về điểm cắt đường bóng.
  const shot = lastShot;
  const reacted = (gk: PlayerState) =>
    shot !== null &&
    shot.team !== gk.team &&
    tick - shot.tick >= keeperReactionTicks(gk.stats.reflexes);
  const diving = (p: PlayerState) => {
    if (!state.ai || p.position !== 'GK' || ballOwnerId !== null) return null;
    // Phạt đền đoán sai hướng: lao ngay về phía đã đoán.
    if (shot?.keeperGuess && shot.team !== p.team) return shot.keeperGuess;
    return reacted(p) ? diveTarget(p, ball, state.half) : null;
  };
  // Người nhận đường chuyền tự chạy theo đường bóng thật tới chỗ đón, tới khi có người giữ bóng.
  // Đường chuyền đội người chơi: thôi khi người chơi đổi sang điều khiển người khác.
  if (
    passReceiver &&
    (ballOwnerId !== null ||
      tick > passReceiver.untilTick ||
      (human !== null &&
        byId(passReceiver.playerId)?.team === HUMAN_TEAM &&
        passReceiver.playerId !== human))
  ) {
    passReceiver = null;
  }
  const receiving = passReceiver;
  let players = separatePlayers(
    state.players.map((p) => {
      if (p.id === slidingId) return slideStep(slideTackle(p));
      if (tackleRecovery[p.id] !== undefined) return slideStep(p);
      if (p.id === windup?.playerId) return stepPlayer(p, ZERO, false);
      if (p.id === receiving?.playerId) {
        const m = arrive(p, interceptPoint(ball, p, CONTROL_HEIGHT), true);
        return stepPlayer(p, m.move, m.sprint);
      }
      if (p.id === human) return stepPlayer(p, controlledMove(p), input.sprint);
      if (p.id === carrierMove?.id) return stepPlayer(p, carrierMove.move, carrierMove.sprint);
      const dive = diving(p);
      if (dive) return diveStep(p, dive);
      const m = moveOf(p);
      return stepPlayer(p, m.move, m.sprint);
    }),
  );

  // 3b. Thủ môn đội phòng ngự chạm được cú sút đang bay: trong tầm với (đã phản ứng) hoặc trúng
  // người (chưa kịp phản ứng) → bắt dính hoặc đẩy ra, tuỳ bóng trúng tay, thân hay chân.
  const keeper = shot && players.find((p) => p.position === 'GK' && p.team !== shot.team);
  if (keeper && ballOwnerId === null && ball.z <= GK_REACH_HEIGHT) {
    const ready = reacted(keeper);
    if (length(sub(ball.pos, keeper.pos)) <= keeperReach(keeper, ball, ready)) {
      const [roll, afterRoll] = nextFloat(rng);
      rng = afterRoll;
      lastShot = null;
      const save =
        roll < keeperSaveChance(keeper.stats.reflexes)
          ? resolveSave(keeper, ball, rng, state.half, keeperContact(keeper, ball, ready))
          : null;
      if (save) {
        rng = save.rng;
        lastTouchTeam = keeper.team;
        backPass = null;
      }
      if (!save) {
        // Bị đánh bại: bóng đi qua, thủ môn không chạm lại kịp.
        kickLock = lock(keeper.id);
      } else if (save.outcome === 'catch') {
        ballOwnerId = keeper.id;
        kickLock = null;
        // Ôm bóng quay mặt ra sân để bóng không lọt qua vạch.
        const facing = vec2(attackSign(keeper.team, state.half), 0);
        players = players.map((p) => (p.id === keeper.id ? { ...p, facing } : p));
        if (keeper.team === HUMAN_TEAM) controlledId = keeper.id;
      } else {
        ball = save.ball;
        kickLock = lock(keeper.id);
      }
    }
  }

  // 4. Bóng: dính chân người dẫn, hoặc chạy vật lý.
  const attackingPlusX: TeamSide = attackSign('home', state.half) === 1 ? 'home' : 'away';
  const owner = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);
  let event: BallEvent | null;
  if (owner) {
    const dribbled = dribbleBall(owner);
    event = exitEvent(ball, dribbled, attackingPlusX);
    ball = dribbled;
  } else {
    ballOwnerId = null;
    const result = stepBall(ball, attackingPlusX);
    ball = result.ball;
    event = result.events[0] ?? null;
  }

  const played: MatchState = {
    ...state,
    tick,
    rng,
    ball,
    players,
    ballOwnerId,
    kickLock,
    shotChargeTicks,
    passCharge,
    controlledId,
    windup,
    passReceiver,
    backPass,
    tackleRecovery,
    lastTackle,
    standTackleCooldown,
    shots,
    lastShot,
    lastTouchTeam,
    input,
    ai,
  };

  // 5. Bóng ra ngoài hoặc vào lưới → bóng chết. `touch`: đội chạm bóng cuối.
  const exitPlay = (e: BallEvent, touch: TeamSide): MatchState => {
    if (e.type === 'goal') {
      const scored: MatchState = {
        ...played,
        lastTouchTeam: touch,
        score: { ...state.score, [e.team]: state.score[e.team] + 1 },
        stoppage: { ...state.stoppage, goals: state.stoppage.goals + 1 },
      };
      return enterKickoff(scored, other(e.team), tick, GOAL_HOLD_TICKS);
    }
    const out: MatchState = { ...played, lastTouchTeam: touch };
    return enterDeadBall(out, players, decideRestart(e, touch, state.half), tick, OUT_HOLD_TICKS);
  };
  if (event) return exitPlay(event, lastTouchTeam);

  // 6. Bắt bóng tự do.
  if (!owner) {
    if (kickLock && tick >= kickLock.untilTick) kickLock = null;
    const down = (p: PlayerState) => tackleRecovery[p.id] !== undefined;
    // Vừa có cú đánh đầu / móc bóng: chờ hết khoá rồi mới ai đó chạm bóng bổng tiếp, không thì
    // hai người sát bóng đánh đầu qua lại mỗi tick (review Fable V1).
    const aerialLocked = kickLock?.touch !== undefined;
    // Bóng bổng ngang hông–vai sát cầu thủ tấn công giỏi trong vòng cấm: có thể móc bóng.
    const volley = tryScissor(
      players,
      state.players,
      ball,
      state.ball,
      state.half,
      (p) => !aerialLocked && p.id !== kickLock?.playerId && !down(p) && p.position !== 'GK',
      rng,
    );
    rng = volley.rng;
    if (volley.kicker) {
      const k = volley.kicker;
      return {
        ...played,
        rng,
        backPass: null,
        ball: volley.ball,
        kickLock: { ...lock(k.id), touch: 'scissor' },
        passReceiver: null,
        lastTouchTeam: k.team,
        shots: addShot(shots, k.team),
        lastShot: shotFrom(true, k.team, tick),
      };
    }
    const up = players.filter((p) => !down(p));
    // Bóng bổng quá tầm chân: thủ môn trong vòng cấm nhà bắt dính, không thì đánh đầu.
    // Cú sút thì đã xét cản phá ở 3b (bắt / đẩy / bị đánh bại), không bắt lại ở đây.
    const claim = lastShot
      ? null
      : keeperClaim(up, ball, state.half, kickLock?.playerId ?? null, backPass);
    const header = claim
      ? null
      : tryHeader(
          up,
          ball,
          state.half,
          (p) => !aerialLocked && p.id !== kickLock?.playerId,
          (p) => (p.id === human && length(input.move) > 0 ? input.move : null),
          rng,
        );
    if (header) {
      const h = header.header;
      return {
        ...played,
        rng: header.rng,
        backPass: null,
        ball: header.ball,
        kickLock: { ...lock(h.id), touch: 'header' },
        passReceiver: null,
        lastTouchTeam: h.team,
        shots: header.shot ? addShot(shots, h.team) : shots,
        lastShot: shotFrom(header.shot, h.team, tick),
      };
    }
    const capturer = claim ? claim.id : findCapturer(up, ball, kickLock?.playerId ?? null);
    let captured = capturer === null ? undefined : players.find((p) => p.id === capturer);
    // Bóng lao nhanh có thể chạm chân bật ra thay vì dính (chỉ gieo khi đủ nhanh để bóng chậm
    // không làm lệch chuỗi ngẫu nhiên). Thủ môn bắt bằng tay thì không.
    const relVel = captured ? sub(ball.vel, captured.vel) : null;
    if (!claim && captured && relVel && length(relVel) > MISCONTROL_SPEED_RANGE[0]) {
      const [roll, afterRoll] = nextFloat(rng);
      rng = afterRoll;
      if (roll < miscontrolChance(captured.stats.dribbling, length(relVel))) {
        ball = {
          pos: ball.pos,
          z: ball.z,
          vz: ball.vz,
          vel: add(captured.vel, scale(relVel, MISCONTROL_KEEP_VEL)),
        };
        kickLock = lock(captured.id);
        lastTouchTeam = captured.team;
        lastShot = null;
        captured = undefined;
      }
    }
    if (captured) {
      const dribbled = dribbleBall(captured);
      // Khống chế bóng sát vạch khi quay mặt ra ngoài: bóng dính chân đã nằm ngoài vạch → bóng chết
      // ngay (không xét ở đây thì tick sau bóng "đã ở ngoài" nên không bao giờ sinh sự kiện nữa).
      const trapOut = exitEvent(ball, dribbled, attackingPlusX);
      if (trapOut) return exitPlay(trapOut, captured.team);
      ballOwnerId = captured.id;
      lastShot = null;
      ball = dribbled;
      if (captured.team === HUMAN_TEAM) controlledId = captured.id;
    }
  }
  const holder = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);
  // Bóng chuyền về chỉ cấm tay thủ môn nhận nó; người khác nhận bóng thì hết.
  if (holder && !(holder.position === 'GK' && holder.team === backPass)) backPass = null;

  return {
    ...played,
    rng,
    backPass,
    ball,
    ballOwnerId,
    ownerSinceTick: ballOwnerId === state.ballOwnerId ? state.ownerSinceTick : tick,
    kickLock,
    controlledId,
    passReceiver: ballOwnerId === null ? passReceiver : null,
    lastTouchTeam: holder ? holder.team : lastTouchTeam,
    lastShot,
  };
}

/** Phạm lỗi: rút thẻ (nếu có), người bị đỏ rời sân, đặt bóng đá phạt/phạt đền cho đội bị phạm lỗi. */
function enterFoul(
  state: MatchState,
  tackler: PlayerState,
  victim: PlayerState,
  foul: { fromBehind: boolean; rough: boolean },
  tick: number,
): MatchState {
  const judged = judgeFoul(foul, tackler, victim, state.half, state.bookings, tick, state.rng);
  const players = state.players.filter((p) => p.id !== judged.sentOffId);
  const booked: MatchState = {
    ...state,
    rng: judged.rng,
    players,
    bookings: judged.bookings,
    lastTouchTeam: victim.team,
  };
  return enterDeadBall(booked, players, judged.plan, tick, FOUL_HOLD_TICKS);
}
