import { MatchTeamSetup, isStarterSlot, type MatchPlayerSetup } from '@pitch/shared';
import { AI_PROFILES, type AiProfile } from './ai/difficulty';
import {
  AI_MIN_HOLD_TICKS,
  decideCarrier,
  decideRestartKick,
  type CarrierAction,
} from './ai/player';
import { asKicker, diveStep, diveTarget, resolveSave } from './ai/goalkeeper';
import { aiMove, arrive, goalSidePoint, thinkTeam } from './ai/team';
import { choosePassTarget, passBall, passLeadPoint, type PassKind } from './actions/pass';
import { attackSign, shootBall, shotPower, shotTarget } from './actions/shoot';
import {
  isFromBehind,
  resolveStandTackle,
  resolveTackle,
  slideTackle,
  TACKLE_RECOVERY_TICKS,
} from './actions/tackle';
import {
  add,
  clampLength,
  length,
  normalize,
  scale,
  sub,
  vec2,
  ZERO,
  type Vec2,
} from './math/vec2';
import { exitEvent, stepBall, type BallEvent } from './physics/ball';
import { HALF_LENGTH } from './pitch';
import { separatePlayers, stepPlayer } from './physics/player';
import { nextFloat, type RngState, seedRng } from './rng';
import { advanceClock, RESTART_GRACE_TICKS } from './rules/clock';
import { isKeeperHandling, judgeFoul } from './rules/fouls';
import {
  chooseDefensiveSwitchTarget,
  chooseSwitchTarget,
  CONTROL_HEIGHT,
  dribbleBall,
  findCapturer,
  losesBallOnTurn,
} from './rules/possession';
import {
  cpuRestartDue,
  decideRestart,
  holdRestart,
  kickoffPlayers,
  setupRestart,
  type RestartPlan,
} from './rules/restarts';
import {
  AI_STAND_TACKLE_COOLDOWN_TICKS,
  CONTAIN_DIST,
  GK_BODY_BLOCK_DIST,
  GK_REACH_HEIGHT,
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
  type PlayerInput,
  type PlayerState,
  type TeamSide,
} from './types';

const DEFAULT_HALF_LENGTH_SEC = 180;

/** Người chơi luôn điều khiển đội nhà; đội khách là máy. */
const HUMAN_TEAM: TeamSide = 'home';

const other = (team: TeamSide): TeamSide => (team === 'home' ? 'away' : 'home');

const restingBall = (pos: Vec2): BallState => ({ pos, vel: ZERO, z: 0, vz: 0 });

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
  const placed = setupRestart(players, plan, state.half, tick);
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
    tackleRecovery: {},
    standTackleCooldown: {},
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
    formations: { home: home.formation, away: away.formation },
    kickoffTeam,
    ball: restingBall(ZERO),
    players: [...spawnTeam(home, 'home'), ...spawnTeam(away, 'away')],
    bookings: [],
    tackleRecovery: {},
    standTackleCooldown: {},
    bench: { home: benchOf(home), away: benchOf(away) },
    ballOwnerId: null,
    ownerSinceTick: 0,
    kickLock: null,
    shotChargeTicks: 0,
    controlledId: '',
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
  };
}

/** Người vừa chuyền/sút/mất bóng không chạm lại được bóng trong bấy nhiêu tick (0,2 s). */
export const KICK_LOCK_TICKS = 12;
/** Chuyền thấp không có người nhận trong hướng bấm thì bóng đi chừng này mét. */
const LOOSE_PASS_DIST = 15;
/** Chuyền bổng không có người nhận thì bóng đi chừng này phần tầm chuyền bổng. */
const LOOSE_LOB_RANGE_FRAC = 0.6;
type Button = Exclude<keyof PlayerInput, 'move'>;

/**
 * Chuyền từ `from` theo hướng `dir`: đón trước đồng đội tốt nhất trong hướng, không có thì vào
 * khoảng trống. `receiverId` là người nhận dự kiến (null khi chuyền vào khoảng trống).
 */
function kickPass(
  players: readonly PlayerState[],
  passer: PlayerState,
  from: Vec2,
  dir: Vec2,
  kind: PassKind,
  rng: RngState,
): { ball: BallState; rng: RngState; receiverId: string | null } {
  const range = kind === 'lob' ? lobRangeFor(passer.stats.passing) : Infinity;
  const target = choosePassTarget(players, passer, dir, range, kind);
  const looseDist = kind === 'lob' ? range * LOOSE_LOB_RANGE_FRAC : LOOSE_PASS_DIST;
  const to = target
    ? passLeadPoint(from, target, kind)
    : add(from, scale(normalize(dir), looseDist));
  return { ...passBall(passer, from, to, kind, rng), receiverId: target?.id ?? null };
}

/** Khung thành nhà của `team` trong hiệp `half`. */
const ownGoalOf = (team: TeamSide, half: 1 | 2): Vec2 =>
  vec2(-attackSign(team, half) * HALF_LENGTH, 0);

/** Đội máy theo mức độ khó; cầu thủ AI cùng đội người chơi dùng profile đồng đội. */
const aiProfile = (state: MatchState, team: TeamSide): AiProfile =>
  team === HUMAN_TEAM ? AI_PROFILES.teammate : AI_PROFILES[state.difficulty];

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
  const next = state.restart
    ? stepDeadBall(state, input, pressed, tick)
    : stepPlay(state, input, pressed, tick);
  return runClock(next);
}

/** Đồng hồ chạy thêm một tick; hết hiệp thì sang nghỉ giữa hiệp hoặc hết trận. */
function runClock(state: MatchState): MatchState {
  const halfTick = state.halfTick + 1;
  const clock = advanceClock(halfTick, state.halfLengthSec, state.stoppage, state.addedMinutes);
  if (!clock.halfOver) return { ...state, halfTick, addedMinutes: clock.addedMinutes };
  return {
    ...state,
    halfTick,
    addedMinutes: clock.addedMinutes,
    phase: state.half === 1 ? 'half_time' : 'full_time',
    ballDead: true,
    restart: null,
    ballOwnerId: null,
    kickLock: null,
    shotChargeTicks: 0,
    ball: restingBall(state.ball.pos),
  };
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
    kickPass(state.players, taker, restart.spot, dir, kind, state.rng);

  let kicked: {
    ball: BallState;
    rng: RngState;
    shot: boolean;
    receiverId?: string | null;
  } | null = null;
  let shotChargeTicks = 0;
  if (humanRestart) {
    if (canPass && (pressed('pass') || pressed('lob'))) {
      const dir = length(input.move) > 0 ? input.move : taker.facing;
      kicked = { ...pass(pressed('pass') ? 'ground' : 'lob', dir), shot: false };
    } else if (canShoot && input.shoot && (state.shotChargeTicks > 0 || pressed('shoot'))) {
      shotChargeTicks = state.shotChargeTicks + 1;
    } else if (canShoot && !input.shoot && state.shotChargeTicks > 0) {
      const target = shotTarget(goalSign, input.move.y);
      const power = shotPower(state.shotChargeTicks);
      kicked = { ...shootBall(taker, restart.spot, target, power, state.rng), shot: true };
    }
  } else if (cpuRestartDue(restart, tick)) {
    const decided = decideRestartKick(restart, state.players, state.half, state.rng);
    if (decided.action.type !== 'dribble') {
      const profile = aiProfile(state, restart.team);
      kicked = performKick(taker, restart.spot, decided.action, decided.rng, profile);
    }
  }

  if (kicked) {
    const { ball, rng } = kicked;
    return {
      ...state,
      tick,
      phase: 'play',
      ballDead: false,
      restart: null,
      rng,
      ball,
      ballOwnerId: null,
      ownerSinceTick: tick,
      // Người chơi chuyền bóng chết: đổi ngay sang người nhận (5.17).
      controlledId: humanRestart && kicked.receiverId ? kicked.receiverId : state.controlledId,
      kickLock: { playerId: taker.id, untilTick: tick + KICK_LOCK_TICKS },
      lastTouchTeam: restart.team,
      shotChargeTicks: 0,
      shots: kicked.shot ? addShot(state.shots, restart.team) : state.shots,
      lastShot: shotFrom(kicked.shot, restart.team, tick),
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
      if (p.id === taker.id) return stepPlayer(p, ZERO, false);
      if (p.id === human) return stepPlayer(p, input.move, input.sprint);
      const m = moveOf(p);
      return stepPlayer(p, m.move, m.sprint);
    }),
  );
  // Phạt đền: hướng bấm chỉ dùng để nhắm lúc sút, người sút luôn quay mặt về khung thành.
  const aim = humanRestart && restart.type !== 'penalty' ? input.move : ZERO;
  const overrun = tick - restart.startTick > RESTART_GRACE_TICKS ? 1 : 0;
  return {
    ...state,
    tick,
    players: holdRestart(moved, restart, state.half, aim),
    controlledId,
    ai,
    shotChargeTicks,
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
  let { ball, rng, kickLock, controlledId, ballOwnerId, shotChargeTicks, shots } = state;
  let { lastShot, lastTouchTeam } = state;
  const byId = (id: string) => state.players.find((p) => p.id === id);
  const lock = (playerId: string) => ({ playerId, untilTick: tick + KICK_LOCK_TICKS });
  const tackleRecovery = Object.fromEntries(
    Object.entries(state.tackleRecovery).filter(([, until]) => until > tick),
  );
  const standTackleCooldown = Object.fromEntries(
    Object.entries(state.standTackleCooldown).filter(([, until]) => until > tick),
  );
  let slidingId: string | null = null;

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
  const keeperHolds = ballHolder !== undefined && isKeeperHandling(ballHolder, state.half);

  // 2. Hành động của người dẫn bóng do người chơi điều khiển.
  const humanBefore = humanOf(state, controlledId);
  const me = humanBefore === null ? undefined : byId(humanBefore);
  if (me && ballOwnerId === me.id) {
    const kind: PassKind | null = pressed('pass') ? 'ground' : pressed('lob') ? 'lob' : null;
    const releasedShot = !input.shoot && shotChargeTicks > 0;
    if (losesBallOnTurn(me, input.move)) {
      // Bóng tuột chân, giữ vận tốc đang chạy.
      ballOwnerId = null;
      kickLock = lock(me.id);
      shotChargeTicks = 0;
    } else if (kind) {
      // Chuẩn hoá: độ lớn cần analog chỉ chọn hướng, không làm ngắn đường chuyền vào khoảng trống.
      const dir = length(input.move) > 0 ? normalize(input.move) : me.facing;
      let receiverId: string | null;
      ({ ball, rng, receiverId } = kickPass(state.players, asKicker(me), ball.pos, dir, kind, rng));
      // Đổi ngay sang người nhận như FC Online, không chờ bắt được bóng (5.17).
      if (receiverId) controlledId = receiverId;
      ballOwnerId = null;
      kickLock = lock(me.id);
      shotChargeTicks = 0;
      lastShot = null;
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
    }
  } else {
    shotChargeTicks = 0;
    // Nút chuyền bổng (A) khi không có bóng = xoạc.
    if (me && !keeperHolds && pressed('lob') && tackleRecovery[me.id] === undefined) {
      const tackle = resolveTackle(state.players, me, ball, ballOwnerId, rng, CONTROL_HEIGHT);
      rng = tackle.rng;
      const { outcome } = tackle;
      if (outcome.type === 'foul') {
        const victim = byId(outcome.victimId)!;
        return enterFoul({ ...state, tick, rng, input }, me, victim, outcome, tick);
      }
      if (outcome.type === 'won') {
        ballOwnerId = me.id;
        kickLock = outcome.victimId === null ? null : lock(outcome.victimId);
      } else {
        slidingId = me.id;
        tackleRecovery[me.id] = tick + TACKLE_RECOVERY_TICKS;
      }
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
    state.ai && ballOwnerId !== null && ballOwnerId !== humanBefore ? byId(ballOwnerId) : undefined;
  if (aiCarrier) {
    const profile = aiProfile(state, aiCarrier.team);
    const action = decideCarrier({
      carrier: aiCarrier,
      players: state.players,
      half: state.half,
      heldTicks: ballOwnerId === state.ballOwnerId ? tick - state.ownerSinceTick : 0,
      minHoldTicks: Math.max(AI_MIN_HOLD_TICKS, profile.reactionDelayTicks),
    });
    if (action.type === 'dribble') {
      carrierMove = { id: aiCarrier.id, move: action.move, sprint: action.sprint };
    } else {
      const kick = performKick(aiCarrier, ball.pos, action, rng, profile);
      ({ ball, rng } = kick);
      ballOwnerId = null;
      kickLock = lock(aiCarrier.id);
      if (kick.shot) shots = addShot(shots, aiCarrier.team);
      lastShot = shotFrom(kick.shot, aiCarrier.team, tick);
    }
  }

  // 2c. Người áp sát AI tắc bóng đứng khi bóng vào tầm (không tắc từ phía sau, không tắc thủ môn
  // đang ôm bóng).
  const owned = state.ai && ballOwnerId !== null ? byId(ballOwnerId) : undefined;
  const victim = owned && !isKeeperHandling(owned, state.half) ? owned : undefined;
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
  const diving = (p: PlayerState) =>
    state.ai && p.position === 'GK' && ballOwnerId === null && reacted(p)
      ? diveTarget(p, ball, state.half)
      : null;
  let players = separatePlayers(
    state.players.map((p) => {
      if (p.id === slidingId) return stepPlayer(slideTackle(p), ZERO, false);
      if (tackleRecovery[p.id] !== undefined) return stepPlayer(p, ZERO, false);
      if (p.id === human) return stepPlayer(p, controlledMove(p), input.sprint);
      if (p.id === carrierMove?.id) return stepPlayer(p, carrierMove.move, carrierMove.sprint);
      const dive = diving(p);
      if (dive) return diveStep(p, dive);
      const m = moveOf(p);
      return stepPlayer(p, m.move, m.sprint);
    }),
  );

  // 3b. Thủ môn đội phòng ngự chạm được cú sút đang bay: trong tầm với (đã phản ứng) hoặc trúng
  // người (chưa kịp phản ứng) → bắt dính hoặc đẩy ra.
  const keeper = shot && players.find((p) => p.position === 'GK' && p.team !== shot.team);
  if (keeper && ballOwnerId === null && ball.z <= GK_REACH_HEIGHT) {
    const reach = reacted(keeper) ? keeperReachFor(keeper.stats.positioning) : GK_BODY_BLOCK_DIST;
    if (length(sub(ball.pos, keeper.pos)) <= reach) {
      const [roll, afterRoll] = nextFloat(rng);
      rng = afterRoll;
      lastShot = null;
      const save =
        roll < keeperSaveChance(keeper.stats.reflexes)
          ? resolveSave(keeper, ball, rng, state.half)
          : null;
      if (save) {
        rng = save.rng;
        lastTouchTeam = keeper.team;
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
    controlledId,
    tackleRecovery,
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
    const capturer = findCapturer(players, ball, kickLock?.playerId ?? null);
    const captured = capturer === null ? undefined : players.find((p) => p.id === capturer);
    if (captured) {
      ballOwnerId = captured.id;
      lastShot = null;
      ball = dribbleBall(captured);
      if (captured.team === HUMAN_TEAM) controlledId = captured.id;
    }
  }
  const holder = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);

  return {
    ...played,
    ball,
    ballOwnerId,
    ownerSinceTick: ballOwnerId === state.ballOwnerId ? state.ownerSinceTick : tick,
    kickLock,
    controlledId,
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
