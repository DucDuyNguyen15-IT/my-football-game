import { MatchTeamSetup, isStarterSlot, type MatchPlayerSetup } from '@pitch/shared';
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
  penaltyGuess,
  resolveSave,
} from './ai/goalkeeper';
import { aiMove, arrive, goalSidePoint, thinkTeam } from './ai/team';
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
import { attackSign, shootBall, shotPower, shotTarget } from './actions/shoot';
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
import { advanceClock, RESTART_GRACE_TICKS } from './rules/clock';
import { isKeeperHandling, judgeFoul } from './rules/fouls';
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
  createRestart,
  decideRestart,
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
  GK_BODY_BLOCK_DIST,
  GK_REACH_HEIGHT,
  KEEPER_WINDUP_TICKS,
  keeperReachFor,
  keeperReactionTicks,
  keeperSaveChance,
  CONTAIN_STEER_WEIGHT,
  lobRangeFor,
  STAND_TACKLE_COOLDOWN_TICKS,
} from './stats/params';
import {
  NO_INPUT,
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

function spawnTeam(team: MatchTeamSetup, side: TeamSide): PlayerState[] {
  return team.players
    .filter((p) => isStarterSlot(p.slot))
    .map((p): PlayerState => ({
      id: `${side}-${p.slot}`,
      team: side,
      slot: p.slot,
      position: p.position,
      stats: p.stats,
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
 * Đặt bóng chết: cầu thủ (đã ở vị trí mới) + tình huống → state ở phase `kickoff`/`dead_ball`.
 * Đội người được hưởng thì người chơi cầm luôn người thực hiện.
 */
function enterDeadBall(
  state: MatchState,
  players: readonly PlayerState[],
  plan: RestartPlan,
  tick: number,
): MatchState {
  // Giao bóng: mọi người đã về sẵn vị trí. Tình huống khác: mọi người tự đi tới chỗ (stepDeadBall).
  const placed =
    plan.type === 'kickoff'
      ? setupRestart(players, plan, state.half, tick)
      : { players: [...players], restart: createRestart(players, plan, tick) };
  return {
    ...state,
    phase: plan.type === 'kickoff' ? 'kickoff' : 'dead_ball',
    ballDead: true,
    restart: placed.restart,
    players: placed.players,
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
    controlledId:
      plan.team === HUMAN_TEAM ? placed.restart.takerId : nearestHuman(placed.players, plan.spot),
  };
}

/** Giao bóng ở giữa sân: mọi cầu thủ về vị trí giao bóng. */
function enterKickoff(state: MatchState, kickingTeam: TeamSide, tick: number): MatchState {
  const players = kickoffPlayers(state.players, state.formations, kickingTeam, state.half);
  return enterDeadBall(state, players, { type: 'kickoff', team: kickingTeam, spot: ZERO }, tick);
}

/** Tạo trận ở thời điểm giao bóng hiệp 1 (đội nhà giao bóng). Ném lỗi nếu đội hình không hợp lệ. */
export function createMatch(setup: MatchSetup): MatchState {
  const home = MatchTeamSetup.parse(setup.home);
  const away = MatchTeamSetup.parse(setup.away);
  const halfLengthSec = setup.halfLengthSec ?? DEFAULT_HALF_LENGTH_SEC;
  if (!Number.isFinite(halfLengthSec) || halfLengthSec <= 0) {
    throw new RangeError(`halfLengthSec phải là số dương, nhận ${halfLengthSec}`);
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

/** Chọc khe: bóng tới trước người nhận chừng này mét theo hướng tấn công (task 5.16). */
export const THROUGH_LEAD = 6;

/**
 * Người chơi chọc khe (W / Q+W): như `kickPass` nhưng đích là khoảng trống phía trước người nhận theo
 * hướng tấn công `attack`, người nhận chạy đón. Không có ai trong hướng thì chuyền vào khoảng trống.
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
): { ball: BallState; rng: RngState; receiver: PassReceiver | null } {
  const range = kind === 'lob' ? lobRangeFor(passer.stats.passing) : Infinity;
  const target = choosePassTarget(players, passer, dir, range, kind, 0, true);
  if (!target) return kickPass(players, passer, from, dir, kind, rng, tick);
  const lead = add(passLeadPoint(from, target, kind), vec2(attack * THROUGH_LEAD, 0));
  const to = vec2(Math.max(-HALF_LENGTH + 1, Math.min(HALF_LENGTH - 1, lead.x)), lead.y);
  const travelTicks = Math.ceil(passTravelTime(length(sub(to, from)), kind) / TICK_DT);
  const receiver = {
    playerId: target.id,
    point: to,
    untilTick: tick + travelTicks + RECEIVE_GRACE_TICKS,
  };
  return { ...passBall(passer, from, to, kind, rng, PASS_ASSIST_ERROR_MULT), receiver };
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
 * `half_time` → chờ bấm chuyền để đá hiệp 2; `full_time` → trả nguyên state.
 * Đồng hồ chạy ở mọi phase trừ `half_time`/`full_time`.
 */
export function step(state: MatchState, rawInput: PlayerInput): MatchState {
  if (state.phase === 'full_time') return state;
  const input = state.autopilot ? NO_INPUT : sanitizeInput(rawInput);
  const pressed = (b: Button) => input[b] && !state.input[b];
  const tick = state.tick + 1;

  if (state.phase === 'half_time') {
    const waiting = { ...state, tick, input };
    return pressed('pass') || state.autopilot ? startSecondHalf(waiting, tick) : waiting;
  }
  if (state.phase === 'shootout') return stepShootout(state, input, pressed, tick);
  const next = runClock(
    state.restart
      ? stepDeadBall(state, input, pressed, tick)
      : stepPlay(state, input, pressed, tick),
  );
  if (!next.ballDead || state.ballDead) return next;
  // Bóng vừa chết: đội máy (và đội người chơi khi tự đá) thay cầu thủ kiệt sức.
  const cpu = autoSubstitute(next, other(HUMAN_TEAM));
  return next.autopilot ? autoSubstitute(cpu, HUMAN_TEAM) : cpu;
}

/**
 * Đồng hồ chạy thêm một tick; hết hiệp thì sang nghỉ giữa hiệp, hết trận, hoặc luân lưu nếu hoà
 * sau hiệp 2.
 */
function runClock(state: MatchState): MatchState {
  const halfTick = state.halfTick + 1;
  const clock = advanceClock(halfTick, state.halfLengthSec, state.stoppage, state.addedMinutes);
  if (!clock.halfOver) return { ...state, halfTick, addedMinutes: clock.addedMinutes };
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
  const dead = enterDeadBall(state, state.players, { type: 'penalty', team, spot }, tick);
  return {
    ...dead,
    phase: 'shootout',
    restart: { ...dead.restart!, takerId: taker.id },
    controlledId: team === HUMAN_TEAM ? taker.id : dead.controlledId,
    shootout: { ...so, kicking: team, kickTick: null },
  };
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
  const after: MatchState = { ...next, score: state.score, shots: state.shots, shootout: tally };
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
  };
  return enterKickoff(second, other(state.kickoffTeam), tick);
}

/**
 * Bóng chết: đội người bấm J/L để chuyền (hướng bấm chọn hướng chuyền), đá phạt và phạt đền thì
 * giữ-thả K để sút (phạt đền chỉ được sút); đội máy tự thực hiện sau 3 s. Trong lúc chờ, người thực
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

  // Ai đứng sai chỗ thì tự đi tới chỗ (không dịch chuyển tức thì); chưa xong thì chưa thực hiện được.
  // Phạt đền: hướng bấm chỉ dùng để nhắm lúc sút, người sút luôn quay mặt về khung thành.
  const humanAim = humanRestart && restart.type !== 'penalty' ? input.move : ZERO;
  const takerFar = length(sub(taker.pos, restart.spot)) > DRIBBLE_OFFSET + RESTART_SETTLE_DIST;
  // Người thực hiện vừa đi tới bóng thì quay mặt về hướng thực hiện mặc định.
  const aim =
    length(humanAim) > 0 ? humanAim : takerFar ? restartFacing(restart, state.half) : ZERO;
  const timedOut = tick - restart.startTick >= RESTART_SETUP_MAX_TICKS;
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
  // Phát bóng: thủ môn lấy đà rồi bóng mới đi.
  const goalKick = restart.type === 'goal_kick';
  if (windup) {
    if (tick >= windup.releaseTick) {
      kicked = releaseWindup(state, state.players, windup, restart.spot, rng, tick);
      windup = null;
    }
  } else if (targets.size > 0) {
    // Còn người đang đi về vị trí.
  } else if (humanRestart) {
    if (canPass && (pressed('pass') || pressed('lob'))) {
      const dir = length(input.move) > 0 ? input.move : taker.facing;
      const kind = pressed('pass') ? 'ground' : 'lob';
      if (goalKick)
        windup = startWindup(taker.id, tick, 'kick', { type: 'assisted', kind, dir, power: 0 });
      else kicked = { ...pass(kind, dir), shot: false };
    } else if (canShoot && input.shoot && (state.shotChargeTicks > 0 || pressed('shoot'))) {
      shotChargeTicks = state.shotChargeTicks + 1;
    } else if (canShoot && !input.shoot && state.shotChargeTicks > 0) {
      const target = shotTarget(goalSign, input.move.y);
      const power = shotPower(state.shotChargeTicks);
      kicked = { ...shootBall(taker, restart.spot, target, power, state.rng), shot: true };
    }
  } else if (cpuRestartDue(restart, tick)) {
    const decided = decideRestartKick(restart, state.players, state.half, state.rng);
    if (decided.action.type !== 'dribble' && goalKick) {
      windup = startWindup(taker.id, tick, 'kick', decided.action);
      rng = decided.rng;
    } else if (decided.action.type !== 'dribble') {
      const profile = aiProfile(state, restart.team);
      kicked = performKick(taker, restart.spot, decided.action, decided.rng, profile);
    }
  }

  if (kicked) {
    // Phạt đền: thủ môn đội kia đoán hướng ngay lúc sút.
    let lastShot = shotFrom(kicked.shot, restart.team, tick);
    const keeper = state.players.find((p) => p.position === 'GK' && p.team !== restart.team);
    if (restart.type === 'penalty' && lastShot && keeper) {
      const g = penaltyGuess(keeper, kicked.ball, kicked.rng);
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
    players,
    controlledId,
    ai,
    shotChargeTicks,
    passCharge: null,
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
    // S/A: bấm bắt đầu nạp lực chuyền, giữ thì lực tăng, nhả mới chuyền (đang nạp sút thì bỏ qua).
    const startKind: PassKind | null =
      passCharge || shotChargeTicks > 0
        ? null
        : pressed('pass')
          ? 'ground'
          : pressed('lob')
            ? 'lob'
            : null;
    const holding = passCharge !== null && input[passCharge.kind === 'ground' ? 'pass' : 'lob'];
    const moveDir = length(input.move) > 0 ? normalize(input.move) : null;
    const releasedShot = !input.shoot && shotChargeTicks > 0;
    if (losesBallOnTurn(me, input.move)) {
      // Bóng tuột chân, giữ vận tốc đang chạy.
      ballOwnerId = null;
      kickLock = lock(me.id);
      shotChargeTicks = 0;
      passCharge = null;
      backPass = null;
    } else if (pressed('through') && !passCharge && shotChargeTicks === 0 && !keeperHolds) {
      const kind: PassKind = input.modifier ? 'lob' : 'ground';
      const dir = moveDir ?? me.facing;
      const attack = attackSign(me.team, state.half);
      const kick = throughPass(state.players, asKicker(me), ball.pos, dir, kind, attack, rng, tick);
      ({ ball, rng } = kick);
      if (kick.receiver) controlledId = kick.receiver.playerId;
      passReceiver = kick.receiver;
      ballOwnerId = null;
      kickLock = lock(me.id);
      lastShot = null;
      backPass = kickedBy(me);
    } else if (startKind) {
      passCharge = { kind: startKind, ticks: 1, dir: moveDir ?? me.facing };
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
      if (keeperHolds) {
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
      const target = shotTarget(attackSign(me.team, state.half), input.move.y);
      const power = shotPower(shotChargeTicks);
      ({ ball, rng } = shootBall(asKicker(me), ball.pos, target, power, rng));
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
    const reach = ready ? keeperReachFor(keeper.stats.positioning) : GK_BODY_BLOCK_DIST;
    if (length(sub(ball.pos, keeper.pos)) <= reach) {
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

  // 5. Bóng ra ngoài hoặc vào lưới → bóng chết.
  if (event?.type === 'goal') {
    const scored: MatchState = {
      ...played,
      score: { ...state.score, [event.team]: state.score[event.team] + 1 },
      stoppage: { ...state.stoppage, goals: state.stoppage.goals + 1 },
    };
    return enterKickoff(scored, other(event.team), tick);
  }
  if (event?.type === 'ball_out') {
    return enterDeadBall(played, players, decideRestart(event, lastTouchTeam, state.half), tick);
  }

  // 6. Bắt bóng tự do.
  if (!owner) {
    if (kickLock && tick >= kickLock.untilTick) kickLock = null;
    const down = (p: PlayerState) => tackleRecovery[p.id] !== undefined;
    const capturer = findCapturer(
      players.filter((p) => !down(p)),
      ball,
      kickLock?.playerId ?? null,
    );
    const captured = capturer === null ? undefined : players.find((p) => p.id === capturer);
    if (captured) {
      ballOwnerId = captured.id;
      lastShot = null;
      ball = dribbleBall(captured);
      if (captured.team === HUMAN_TEAM) controlledId = captured.id;
    }
  }
  const holder = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);
  // Bóng chuyền về chỉ cấm tay thủ môn nhận nó; người khác nhận bóng thì hết.
  if (holder && !(holder.position === 'GK' && holder.team === backPass)) backPass = null;

  return {
    ...played,
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
  return enterDeadBall(booked, players, judged.plan, tick);
}
