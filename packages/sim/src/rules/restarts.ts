import { FORMATION_LINES, type Formation, type SquadSlot } from '@pitch/shared';
import type { PassKind } from '../actions/pass';
import { attackSign } from '../actions/shoot';
import { add, length, normalize, scale, sub, vec2, ZERO, type Vec2 } from '../math/vec2';
import {
  CENTER_CIRCLE_RADIUS,
  HALF_LENGTH,
  HALF_WIDTH,
  isInPenaltyArea,
  PENALTY_AREA_DEPTH,
} from '../pitch';
import type { PlayerState, Restart, RestartType, TeamSide } from '../types';
import { RESTART_GRACE_TICKS } from './clock';
import { DRIBBLE_OFFSET } from './possession';

/*
 * Bóng chết (PRD §5, đơn giản hoá): bóng ra ngoài → ném biên / phạt góc / phát bóng, bàn thắng →
 * giao bóng. Bóng tự đặt vào chỗ, người thực hiện đứng sẵn sau bóng; đội người bấm chuyền để tiếp tục,
 * đội máy tự thực hiện sau RESTART_DELAY_TICKS.
 */

/** Đội máy tự thực hiện bóng chết sau chừng này tick (3 s). */
export const RESTART_DELAY_TICKS = RESTART_GRACE_TICKS;
/** Đối phương phải đứng cách bóng ít nhất chừng này mét khi đá phạt góc/phát bóng/ném biên. */
export const RESTART_CLEARANCE = 5;
/** Phát bóng: bóng đặt giữa sân theo chiều ngang, cách vạch cuối chừng này mét. */
export const GOAL_KICK_DIST = 5;
/** Ném biên sát góc: bóng đặt cách vạch cuối ít nhất chừng này mét. */
const THROW_IN_END_GAP = 1;
/** Phạt góc nhắm vào điểm giữa vòng cấm, cách vạch cuối chừng này mét. */
const CORNER_AIM_DEPTH = 7;
/** Phạt đền: thủ môn đội phòng ngự đứng giữa khung thành, cách vạch cuối chừng này mét. */
export const PENALTY_GK_DEPTH = 0.5;
/** Phạt đền: mọi người khác đứng ngoài vòng cấm, cách mép vòng cấm ít nhất chừng này mét. */
const PENALTY_WAIT_GAP = 1;

const other = (team: TeamSide): TeamSide => (team === 'home' ? 'away' : 'home');
const signOf = (v: number): 1 | -1 => (v < 0 ? -1 : 1);

/** Tình huống cần thực hiện, chưa chọn người đá. */
export interface RestartPlan {
  type: RestartType;
  team: TeamSide;
  spot: Vec2;
}

/**
 * Bóng qua hẳn vạch biên dọc → ném biên cho đội không chạm cuối; qua vạch cuối → phạt góc nếu
 * đội phòng ngự (chủ khung thành đó) chạm cuối, ngược lại phát bóng cho đội phòng ngự.
 */
export function decideRestart(
  out: { line: 'touch' | 'goal'; point: Vec2 },
  lastTouch: TeamSide,
  half: 1 | 2,
): RestartPlan {
  if (out.line === 'touch') {
    const maxX = HALF_LENGTH - THROW_IN_END_GAP;
    const x = Math.min(maxX, Math.max(-maxX, out.point.x));
    return {
      type: 'throw_in',
      team: other(lastTouch),
      spot: vec2(x, signOf(out.point.y) * HALF_WIDTH),
    };
  }
  const sx = signOf(out.point.x);
  // Đội tấn công về phía sx thì khung thành phía sx là của đối thủ họ.
  const defending: TeamSide = attackSign('home', half) === sx ? 'away' : 'home';
  if (lastTouch === defending) {
    const spot = vec2(sx * HALF_LENGTH, signOf(out.point.y) * HALF_WIDTH);
    return { type: 'corner', team: other(defending), spot };
  }
  return { type: 'goal_kick', team: defending, spot: vec2(sx * (HALF_LENGTH - GOAL_KICK_DIST), 0) };
}

/** Hướng người thực hiện quay mặt lúc đặt bóng (cũng là hướng chuyền mặc định). */
function restartFacing(plan: RestartPlan, half: 1 | 2): Vec2 {
  const { spot } = plan;
  switch (plan.type) {
    case 'throw_in':
      return vec2(0, -signOf(spot.y));
    case 'corner':
      return normalize(sub(vec2(signOf(spot.x) * (HALF_LENGTH - CORNER_AIM_DEPTH), 0), spot));
    case 'goal_kick':
    case 'kickoff':
    case 'penalty':
      return vec2(attackSign(plan.team, half), 0);
    case 'free_kick': {
      const goal = vec2(attackSign(plan.team, half) * HALF_LENGTH, 0);
      const toGoal = sub(goal, spot);
      return length(toGoal) > 0 ? normalize(toGoal) : vec2(attackSign(plan.team, half), 0);
    }
  }
}

function chooseTaker(players: readonly PlayerState[], plan: RestartPlan): PlayerState {
  const team = players.filter((p) => p.team === plan.team);
  if (plan.type === 'goal_kick') {
    const gk = team.find((p) => p.position === 'GK');
    if (gk) return gk;
  }
  const outfield = team.filter((p) => p.position !== 'GK');
  const pool = outfield.length > 0 ? outfield : team;
  if (pool.length === 0) throw new Error(`Đội ${plan.team} không còn cầu thủ để thực hiện`);
  const dist = (p: PlayerState) => length(sub(p.pos, plan.spot));
  return pool.reduce((best, p) => (dist(p) < dist(best) ? p : best));
}

/**
 * Giữ tình huống trong lúc chờ: người thực hiện đứng yên sau bóng (hướng `aim` khác 0 thì xoay theo),
 * đối phương bị đẩy ra ngoài khoảng cách tối thiểu. Gọi mỗi tick khi bóng chết.
 */
export function holdRestart(
  players: readonly PlayerState[],
  restart: Restart,
  half: 1 | 2,
  aim: Vec2 = ZERO,
): PlayerState[] {
  const clearance = restart.type === 'kickoff' ? CENTER_CIRCLE_RADIUS : RESTART_CLEARANCE;
  const goalSide = attackSign(restart.team, half);
  return players.map((p) => {
    if (p.id === restart.takerId) {
      const facing = length(aim) > 0 ? normalize(aim) : p.facing;
      return { ...p, facing, pos: sub(restart.spot, scale(facing, DRIBBLE_OFFSET)), vel: ZERO };
    }
    if (restart.type === 'penalty') return holdPenalty(p, restart, goalSide);
    if (p.team === restart.team) return p;
    const d = sub(p.pos, restart.spot);
    const dist = length(d);
    if (dist >= clearance) return p;
    // Trùng điểm đặt bóng thì lùi về phía khung thành nhà mình.
    const dir = dist > 0 ? scale(d, 1 / dist) : vec2(-attackSign(p.team, half), 0);
    return { ...p, pos: add(restart.spot, scale(dir, clearance)) };
  });
}

/**
 * Phạt đền: thủ môn đội phòng ngự đứng giữa khung thành, mọi người khác (cả hai đội) ra ngoài vòng
 * cấm — ngoài vòng cấm đã đủ xa chấm phạt đền.
 */
function holdPenalty(p: PlayerState, restart: Restart, goalSide: 1 | -1): PlayerState {
  if (p.team !== restart.team && p.position === 'GK') {
    return {
      ...p,
      pos: vec2(goalSide * (HALF_LENGTH - PENALTY_GK_DEPTH), 0),
      vel: ZERO,
      facing: vec2(-goalSide, 0),
    };
  }
  if (!isInPenaltyArea(p.pos, goalSide)) return p;
  return {
    ...p,
    pos: vec2(goalSide * (HALF_LENGTH - PENALTY_AREA_DEPTH - PENALTY_WAIT_GAP), p.pos.y),
  };
}

/** Chọn người thực hiện, đặt người đó sau bóng, dẹp đối phương ra xa. */
export function setupRestart(
  players: readonly PlayerState[],
  plan: RestartPlan,
  half: 1 | 2,
  startTick: number,
): { players: PlayerState[]; restart: Restart } {
  const taker = chooseTaker(players, plan);
  const restart: Restart = { ...plan, takerId: taker.id, startTick };
  return { players: holdRestart(players, restart, half, restartFacing(plan, half)), restart };
}

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
export function kickoffLayout(formation: Formation, kicking: boolean): Map<SquadSlot, Vec2> {
  const [df, mf, fw] = FORMATION_LINES[formation];
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

/**
 * Đưa cầu thủ về vị trí giao bóng theo sơ đồ, đứng yên, quay mặt về khung thành đối phương.
 * Đội tấn công về −x được xoay 180° (lật cả x và y) để hai đội đối xứng tâm. Giữ nguyên thể lực.
 */
export function kickoffPlayers(
  players: readonly PlayerState[],
  formations: Record<TeamSide, Formation>,
  kickingTeam: TeamSide,
  half: 1 | 2,
): PlayerState[] {
  const layouts = {
    home: kickoffLayout(formations.home, kickingTeam === 'home'),
    away: kickoffLayout(formations.away, kickingTeam === 'away'),
  };
  return players.map((p) => {
    const at = layouts[p.team].get(p.slot);
    if (!at) throw new Error(`Sơ đồ ${formations[p.team]} không có vị trí cho ô ${p.slot}`);
    const dir = attackSign(p.team, half);
    // 0 - v thay vì v * -1 để không sinh -0 (JSON ghi -0 thành 0, state khứ hồi sẽ khác).
    return {
      ...p,
      pos: dir === 1 ? at : vec2(0 - at.x, 0 - at.y),
      vel: ZERO,
      facing: vec2(dir, 0),
    };
  });
}

/** Đội máy đã chờ đủ lâu để tự thực hiện. */
export const cpuRestartDue = (restart: Restart, tick: number): boolean =>
  tick - restart.startTick >= RESTART_DELAY_TICKS;

/**
 * Cách đội máy chuyền khi thực hiện (tạm thời, AI ở task 5.7 có thể thay): giao bóng chuyền về sau,
 * phát bóng và phạt góc chuyền bổng, ném biên và đá phạt chuyền thấp theo hướng đang quay mặt.
 * Phạt đền không chuyền mà sút — `match.ts` xử lý riêng.
 */
export function cpuRestartKick(
  restart: Restart,
  taker: PlayerState,
): { kind: PassKind; dir: Vec2 } {
  switch (restart.type) {
    case 'kickoff':
      return { kind: 'ground', dir: vec2(0 - taker.facing.x, 0 - taker.facing.y) };
    case 'goal_kick':
    case 'corner':
      return { kind: 'lob', dir: taker.facing };
    case 'throw_in':
    case 'free_kick':
    case 'penalty':
      return { kind: 'ground', dir: taker.facing };
  }
}
