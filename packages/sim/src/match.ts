import {
  FORMATION_LINES,
  MatchTeamSetup,
  isStarterSlot,
  type MatchPlayerSetup,
  type SquadSlot,
} from '@pitch/shared';
import { choosePassTarget, passBall, type PassKind } from './actions/pass';
import { attackSign, shootBall, shotPower, shotTarget } from './actions/shoot';
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
import { stepBall } from './physics/ball';
import { separatePlayers, stepPlayer } from './physics/player';
import { CENTER_CIRCLE_RADIUS, HALF_LENGTH, HALF_WIDTH } from './pitch';
import { seedRng } from './rng';
import { chooseSwitchTarget, dribbleBall, findCapturer, losesBallOnTurn } from './rules/possession';
import { lobRangeFor } from './stats/params';
import {
  NO_INPUT,
  type MatchSetup,
  type MatchState,
  type PlayerInput,
  type PlayerState,
  type TeamSide,
} from './types';

const DEFAULT_HALF_LENGTH_SEC = 180;

/** Toạ độ x của từng tuyến khi giao bóng, nhìn từ đội tấn công về +x. */
const KICKOFF_LINE_X = {
  GK: -HALF_LENGTH + 1.5,
  DF: -20,
  MF: -11,
  /** Tiền đạo đội giao bóng đứng sát bóng. */
  FW_KICKING: -1,
  /** Tiền đạo đội còn lại đứng ngoài vòng tròn giữa sân. */
  FW_DEFENDING: -(CENTER_CIRCLE_RADIUS + 1),
};

/** Rải đều n cầu thủ theo chiều ngang, chừa 20% mỗi bên biên. */
const spreadY = (i: number, n: number): number =>
  (-HALF_WIDTH + ((i + 1) * 2 * HALF_WIDTH) / (n + 1)) * 0.8;

/** Vị trí giao bóng theo sơ đồ, nhìn từ đội tấn công về +x. Ô P1…P6 xếp HV → TV → TĐ. */
function kickoffLayout(team: MatchTeamSetup, kicking: boolean): Map<SquadSlot, Vec2> {
  const [df, mf, fw] = FORMATION_LINES[team.formation];
  const lines = [
    { count: df, x: KICKOFF_LINE_X.DF },
    { count: mf, x: KICKOFF_LINE_X.MF },
    { count: fw, x: kicking ? KICKOFF_LINE_X.FW_KICKING : KICKOFF_LINE_X.FW_DEFENDING },
  ];
  const layout = new Map<SquadSlot, Vec2>([['GK', vec2(KICKOFF_LINE_X.GK, 0)]]);
  let slotNo = 1;
  for (const line of lines) {
    for (let i = 0; i < line.count; i++) {
      layout.set(`P${slotNo++}` as SquadSlot, vec2(line.x, spreadY(i, line.count)));
    }
  }
  return layout;
}

function spawnTeam(team: MatchTeamSetup, side: TeamSide, kickoffTeam: TeamSide): PlayerState[] {
  const layout = kickoffLayout(team, side === kickoffTeam);
  // Đội nhà tấn công về +x ở hiệp 1. Đội khách xoay 180° (lật cả x và y) để hai đội đối xứng tâm:
  // toạ độ "theo đội" = toạ độ sân × dir, AI dùng chung một hệ cho cả hai bên.
  const dir = side === 'home' ? 1 : -1;
  return team.players
    .filter((p) => isStarterSlot(p.slot))
    .map((p): PlayerState => {
      const at = layout.get(p.slot);
      if (!at) throw new Error(`Sơ đồ ${team.formation} không có vị trí cho ô ${p.slot}`);
      return {
        id: `${side}-${p.slot}`,
        team: side,
        slot: p.slot,
        position: p.position,
        stats: p.stats,
        // 0 - v thay vì v * -1 để không sinh -0 (JSON ghi -0 thành 0, state khứ hồi sẽ khác).
        pos: side === 'home' ? at : vec2(0 - at.x, 0 - at.y),
        vel: ZERO,
        facing: vec2(dir, 0),
        stamina: 100,
      };
    });
}

const benchOf = (team: MatchTeamSetup): MatchPlayerSetup[] =>
  team.players.filter((p) => !isStarterSlot(p.slot));

function nearestTo(players: PlayerState[], point: Vec2): PlayerState {
  const dist = (p: PlayerState) => length(sub(p.pos, point));
  return players.reduce((best, p) => (dist(p) < dist(best) ? p : best));
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
  const players = [
    ...spawnTeam(home, 'home', kickoffTeam),
    ...spawnTeam(away, 'away', kickoffTeam),
  ];
  return {
    tick: 0,
    half: 1,
    halfTick: 0,
    halfLengthSec,
    difficulty: setup.difficulty,
    rng: seedRng(setup.seed),
    score: { home: 0, away: 0 },
    formations: { home: home.formation, away: away.formation },
    kickoffTeam,
    ball: { pos: ZERO, vel: ZERO, z: 0, vz: 0 },
    players,
    bench: { home: benchOf(home), away: benchOf(away) },
    ballOwnerId: null,
    kickLock: null,
    shotChargeTicks: 0,
    controlledId: nearestTo(
      players.filter((p) => p.team === 'home'),
      ZERO,
    ).id,
    input: NO_INPUT,
  };
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
 * Chạy một tick cố định (TICK_DT). Hàm thuần: không sửa `state`, không đọc đồng hồ thật.
 * Thứ tự: đổi người → hành động của người chơi (mất bóng khi xoay / chuyền / sút) → di chuyển
 * cầu thủ → bóng (dính chân hoặc vật lý) → bắt bóng tự do.
 * Cầu thủ không do người chơi điều khiển đứng yên cho tới khi có AI (task 5.7).
 * Sự kiện bóng ra ngoài/bàn thắng chưa xử lý (task 5.5).
 */
export function step(state: MatchState, rawInput: PlayerInput): MatchState {
  const input = sanitizeInput(rawInput);
  const pressed = (b: Button) => input[b] && !state.input[b];
  const tick = state.tick + 1;

  let { ball, rng, kickLock, controlledId, ballOwnerId, shotChargeTicks } = state;
  const byId = (id: string) => state.players.find((p) => p.id === id);
  const lock = (playerId: string) => ({ playerId, untilTick: tick + KICK_LOCK_TICKS });

  // 1. Đổi người: nút đổi người, hoặc J khi người đang điều khiển không có bóng.
  if (ballOwnerId !== controlledId && (pressed('switch') || pressed('pass'))) {
    controlledId = chooseSwitchTarget(state.players, 'home', ball.pos, controlledId);
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
      const range = kind === 'lob' ? lobRangeFor(me.stats.passing) : Infinity;
      const target = choosePassTarget(state.players, me, dir, range);
      const looseDist = kind === 'lob' ? range * LOOSE_LOB_RANGE_FRAC : LOOSE_PASS_DIST;
      const to = target ? target.pos : add(me.pos, scale(dir, looseDist));
      ({ ball, rng } = passBall(me, ball.pos, to, kind, rng));
      ballOwnerId = null;
      kickLock = lock(me.id);
      shotChargeTicks = 0;
    } else if (input.shoot) {
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
  }

  // 3. Di chuyển cầu thủ.
  const players = separatePlayers(
    state.players.map((p) =>
      p.id === controlledId ? stepPlayer(p, input.move, input.sprint) : stepPlayer(p, ZERO, false),
    ),
  );

  // 4. Bóng: dính chân người dẫn, hoặc chạy vật lý rồi xét ai khống chế được.
  const owner = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);
  if (owner) {
    ball = dribbleBall(owner);
  } else {
    ballOwnerId = null;
    ball = stepBall(ball, state.half === 1 ? 'home' : 'away').ball;
    if (kickLock && tick >= kickLock.untilTick) kickLock = null;
    const capturer = findCapturer(players, ball, kickLock?.playerId ?? null);
    const captured = capturer === null ? undefined : players.find((p) => p.id === capturer);
    if (captured) {
      ballOwnerId = captured.id;
      ball = dribbleBall(captured);
      if (captured.team === 'home') controlledId = captured.id;
    }
  }

  return {
    ...state,
    tick,
    halfTick: state.halfTick + 1,
    rng,
    ball,
    players,
    ballOwnerId,
    kickLock,
    shotChargeTicks,
    controlledId,
    input,
  };
}
