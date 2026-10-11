import { MatchTeamSetup, isStarterSlot, type MatchPlayerSetup } from '@pitch/shared';
import { AI_PROFILES, type AiProfile } from './ai/difficulty';
import { aiMove, thinkTeam } from './ai/team';
import { choosePassTarget, passBall, type PassKind } from './actions/pass';
import { attackSign, shootBall, shotPower, shotTarget } from './actions/shoot';
import { resolveTackle, slideTackle, TACKLE_RECOVERY_TICKS } from './actions/tackle';
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
import { separatePlayers, stepPlayer } from './physics/player';
import { nextFloat, type RngState, seedRng } from './rng';
import { advanceClock, RESTART_GRACE_TICKS } from './rules/clock';
import { judgeFoul } from './rules/fouls';
import {
  chooseSwitchTarget,
  CONTROL_HEIGHT,
  dribbleBall,
  findCapturer,
  losesBallOnTurn,
} from './rules/possession';
import {
  cpuRestartDue,
  cpuRestartKick,
  decideRestart,
  holdRestart,
  kickoffPlayers,
  setupRestart,
  type RestartPlan,
} from './rules/restarts';
import { lobRangeFor } from './stats/params';
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
    kickLock: null,
    shotChargeTicks: 0,
    tackleRecovery: {},
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
    formations: { home: home.formation, away: away.formation },
    kickoffTeam,
    ball: restingBall(ZERO),
    players: [...spawnTeam(home, 'home'), ...spawnTeam(away, 'away')],
    bookings: [],
    tackleRecovery: {},
    bench: { home: benchOf(home), away: benchOf(away) },
    ballOwnerId: null,
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
/** Lực đội máy sút phạt đền (tạm thời, AI ở 5.8a có thể thay). */
const CPU_PENALTY_POWER = 0.85;

type Button = Exclude<keyof PlayerInput, 'move'>;

/** Chuyền từ `from` theo hướng `dir`: tới đồng đội tốt nhất trong hướng, không có thì vào khoảng trống. */
function kickPass(
  players: readonly PlayerState[],
  passer: PlayerState,
  from: Vec2,
  dir: Vec2,
  kind: PassKind,
  rng: RngState,
): { ball: BallState; rng: RngState } {
  const range = kind === 'lob' ? lobRangeFor(passer.stats.passing) : Infinity;
  const target = choosePassTarget(players, passer, dir, range);
  const looseDist = kind === 'lob' ? range * LOOSE_LOB_RANGE_FRAC : LOOSE_PASS_DIST;
  const to = target ? target.pos : add(from, scale(normalize(dir), looseDist));
  return passBall(passer, from, to, kind, rng);
}

/** Đội máy theo mức độ khó; cầu thủ AI cùng đội người chơi dùng profile đồng đội. */
const aiProfile = (state: MatchState, team: TeamSide): AiProfile =>
  team === HUMAN_TEAM ? AI_PROFILES.teammate : AI_PROFILES[state.difficulty];

/**
 * AI tầng đội cho tick này: lập lại kế hoạch hai đội nếu tới hạn, trả kế hoạch mới và hàm cho input
 * di chuyển của từng cầu thủ AI (người đang được điều khiển và mọi người khi tắt AI: đứng yên).
 */
function runTeamAi(
  state: MatchState,
  players: readonly PlayerState[],
  ball: BallState,
  ballOwnerId: string | null,
  restartTeam: TeamSide | null,
  controlledId: string,
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
        controlledId: team === HUMAN_TEAM ? controlledId : null,
      },
      tick,
      profile.reactionDelayTicks,
    );
  };
  const ai = { home: think('home'), away: think('away') };
  const moveOf = (p: PlayerState) =>
    p.id === controlledId
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
  const input = sanitizeInput(rawInput);
  const pressed = (b: Button) => input[b] && !state.input[b];
  const tick = state.tick + 1;

  if (state.phase === 'half_time') {
    const waiting = { ...state, tick, input };
    return pressed('pass') ? startSecondHalf(waiting, tick) : waiting;
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
  const humanRestart = restart.team === HUMAN_TEAM;
  const canShoot = restart.type === 'free_kick' || restart.type === 'penalty';
  const canPass = restart.type !== 'penalty';
  const goalSign = attackSign(restart.team, state.half);
  const pass = (kind: PassKind, dir: Vec2) =>
    kickPass(state.players, taker, restart.spot, dir, kind, state.rng);

  let kicked: { ball: BallState; rng: RngState } | null = null;
  let shotChargeTicks = 0;
  if (humanRestart) {
    if (canPass && (pressed('pass') || pressed('lob'))) {
      const dir = length(input.move) > 0 ? input.move : taker.facing;
      kicked = pass(pressed('pass') ? 'ground' : 'lob', dir);
    } else if (canShoot && input.shoot && (state.shotChargeTicks > 0 || pressed('shoot'))) {
      shotChargeTicks = state.shotChargeTicks + 1;
    } else if (canShoot && !input.shoot && state.shotChargeTicks > 0) {
      const target = shotTarget(goalSign, input.move.y);
      kicked = shootBall(taker, restart.spot, target, shotPower(state.shotChargeTicks), state.rng);
    }
  } else if (cpuRestartDue(restart, tick)) {
    if (restart.type === 'penalty') {
      const [f, r] = nextFloat(state.rng);
      const target = shotTarget(goalSign, f * 2 - 1);
      kicked = shootBall(taker, restart.spot, target, CPU_PENALTY_POWER, r);
    } else {
      const kick = cpuRestartKick(restart, taker);
      kicked = pass(kick.kind, kick.dir);
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
      kickLock: { playerId: taker.id, untilTick: tick + KICK_LOCK_TICKS },
      lastTouchTeam: restart.team,
      shotChargeTicks: 0,
      input,
    };
  }

  let { controlledId } = state;
  if (!humanRestart && (pressed('switch') || pressed('pass'))) {
    controlledId = chooseSwitchTarget(state.players, HUMAN_TEAM, restart.spot, controlledId);
  }
  // Đội hình giữ nguyên lúc chờ giao bóng; phạt đền thì mọi người đứng ngoài vòng cấm chờ.
  const aiActive = restart.type !== 'kickoff' && restart.type !== 'penalty';
  const { ai, moveOf } = aiActive
    ? runTeamAi(state, state.players, state.ball, null, restart.team, controlledId, tick)
    : { ai: state.ai, moveOf: () => ({ move: ZERO, sprint: false }) };
  const moved = separatePlayers(
    state.players.map((p) => {
      if (p.id === taker.id) return stepPlayer(p, ZERO, false);
      if (p.id === controlledId) return stepPlayer(p, input.move, input.sprint);
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
 * xoạc khi không có bóng — phạm lỗi thì sang bóng chết ngay) → di chuyển cầu thủ → bóng (dính chân
 * hoặc vật lý) → bóng ra ngoài / bàn thắng → bắt bóng tự do.
 * Cầu thủ không do người chơi điều khiển di chuyển theo AI đội (`ai/team.ts`); chưa tự chuyền/sút/xoạc.
 */
function stepPlay(
  state: MatchState,
  input: PlayerInput,
  pressed: (b: Button) => boolean,
  tick: number,
): MatchState {
  let { ball, rng, kickLock, controlledId, ballOwnerId, shotChargeTicks } = state;
  const byId = (id: string) => state.players.find((p) => p.id === id);
  const lock = (playerId: string) => ({ playerId, untilTick: tick + KICK_LOCK_TICKS });
  const tackleRecovery = Object.fromEntries(
    Object.entries(state.tackleRecovery).filter(([, until]) => until > tick),
  );
  let slidingId: string | null = null;

  // 1. Đổi người: nút đổi người, hoặc J khi người đang điều khiển không có bóng.
  if (ballOwnerId !== controlledId && (pressed('switch') || pressed('pass'))) {
    controlledId = chooseSwitchTarget(state.players, HUMAN_TEAM, ball.pos, controlledId);
  }

  // 2. Hành động của người dẫn bóng do người chơi điều khiển.
  const me = byId(controlledId);
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
      ({ ball, rng } = kickPass(state.players, me, ball.pos, dir, kind, rng));
      ballOwnerId = null;
      kickLock = lock(me.id);
      shotChargeTicks = 0;
    } else if (input.shoot && (shotChargeTicks > 0 || pressed('shoot'))) {
      // Chỉ nạp lực khi bấm nút sút lúc đang có bóng: giữ nút từ lúc chưa có bóng không thành sút.
      shotChargeTicks += 1;
    } else if (releasedShot) {
      const target = shotTarget(attackSign(me.team, state.half), input.move.y);
      ({ ball, rng } = shootBall(me, ball.pos, target, shotPower(shotChargeTicks), rng));
      ballOwnerId = null;
      kickLock = lock(me.id);
      shotChargeTicks = 0;
    }
  } else {
    shotChargeTicks = 0;
    // Nút chuyền bổng (A) khi không có bóng = xoạc.
    if (me && pressed('lob') && tackleRecovery[me.id] === undefined) {
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
    }
  }

  // 3. Di chuyển cầu thủ: người chơi theo input, người khác theo AI đội. Người đang trượt/đứng dậy
  // sau cú xoạc hụt không điều khiển được.
  const { ai, moveOf } = runTeamAi(
    state,
    state.players,
    ball,
    ballOwnerId,
    null,
    controlledId,
    tick,
  );
  const players = separatePlayers(
    state.players.map((p) => {
      if (p.id === slidingId) return stepPlayer(slideTackle(p), ZERO, false);
      if (tackleRecovery[p.id] !== undefined) return stepPlayer(p, ZERO, false);
      if (p.id === controlledId) return stepPlayer(p, input.move, input.sprint);
      const m = moveOf(p);
      return stepPlayer(p, m.move, m.sprint);
    }),
  );

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
    return enterDeadBall(
      played,
      players,
      decideRestart(event, state.lastTouchTeam, state.half),
      tick,
    );
  }

  // 6. Bắt bóng tự do.
  if (!owner) {
    if (kickLock && tick >= kickLock.untilTick) kickLock = null;
    const capturer = findCapturer(players, ball, kickLock?.playerId ?? null);
    const captured = capturer === null ? undefined : players.find((p) => p.id === capturer);
    if (captured) {
      ballOwnerId = captured.id;
      ball = dribbleBall(captured);
      if (captured.team === HUMAN_TEAM) controlledId = captured.id;
    }
  }
  const holder = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);

  return {
    ...played,
    ball,
    ballOwnerId,
    kickLock,
    controlledId,
    lastTouchTeam: holder ? holder.team : state.lastTouchTeam,
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
