import { FORMATION_LINES, type Formation, type SquadSlot } from '@pitch/shared';
import { attackSign } from '../actions/shoot';
import { add, length, normalize, scale, sub, vec2, ZERO, type Vec2 } from '../math/vec2';
import { HALF_LENGTH, HALF_WIDTH } from '../pitch';
import { CONTAIN_DIST } from '../stats/params';
import type { BallState, PlayerState, TeamSide } from '../types';

/*
 * AI tầng đội (mẫu "Simple Soccer", docs/research.md §2). Mỗi `reactionDelayTicks` đội lập kế hoạch:
 * chế độ, điểm neo theo sơ đồ dịch theo bóng, một người áp sát, phân công kèm người. Giữa hai lần,
 * từng cầu thủ steering (arrive) tới mục tiêu theo vai — mục tiêu của người áp sát/kèm người bám
 * theo vị trí thật mỗi tick, còn điểm neo thì đứng yên tới lần nghĩ sau (đó là độ trễ phản ứng).
 *
 * Toạ độ "tương đối": nhìn từ đội đang xét, tấn công về +x (lật cả x và y như `kickoffPlayers`).
 */

/** `transition`: bóng tự do — cả hai đội đưa một người đuổi bóng. */
export type TeamMode = 'attack' | 'defend' | 'transition';
/** `keep` thủ môn, `carry` người dẫn bóng, `press` áp sát/đuổi bóng, `mark` kèm người, `hold` giữ vị trí. */
export type AiRole = 'keep' | 'carry' | 'press' | 'mark' | 'hold';

export interface TeamPlan {
  mode: TeamMode;
  /** Lập lúc bóng chết (không ai áp sát). */
  deadBall: boolean;
  /** Người chơi đang điều khiển lúc lập kế hoạch (không có vai). */
  controlledId: string | null;
  /** Vai của từng cầu thủ AI (người đang được điều khiển không có mặt). */
  roles: Record<string, AiRole>;
  /** Người kèm → đối phương bị kèm. */
  marks: Record<string, string>;
  /** Điểm neo (toạ độ sân) của từng cầu thủ AI. */
  anchors: Record<string, Vec2>;
}

/** Kế hoạch đang dùng và tick lập lại. */
export interface TeamAiState {
  plan: TeamPlan;
  nextThinkTick: number;
}

export interface TeamPlanInput {
  team: TeamSide;
  half: 1 | 2;
  formation: Formation;
  players: readonly PlayerState[];
  ball: BallState;
  ballOwnerId: string | null;
  /** Bóng chết: đội được hưởng. null khi bóng sống. */
  restartTeam: TeamSide | null;
  /** 0–1, xem `AiProfile.aggression`. */
  aggression: number;
  controlledId: string | null;
}

/** Toạ độ x tương đối của từng tuyến khi bóng ở giữa sân, chế độ chuyển trạng thái. */
const LINE_X = { DF: -15, MF: -5, FW: 5 } as const;
/** Thủ môn đứng cách vạch cuối nhà chừng này mét, theo bóng ngang chừng này phần (5.8b thay). */
const GK_DEPTH = 1.5;
const GK_FOLLOW_Y = 0.15;
const GK_MAX_Y = 2;
/** Khối đội hình dịch theo bóng: x theo chừng này phần x của bóng, y theo chừng này phần y. */
const BALL_FOLLOW_X = 0.55;
const BALL_FOLLOW_Y = 0.35;
/** Dịch x thêm theo chế độ (m). */
const MODE_SHIFT_X: Record<TeamMode, number> = { attack: 5, defend: -3, transition: 0 };
/** Độ hung hăng 0 → lùi AGGRESSION_SHIFT_X/2, 1 → dâng AGGRESSION_SHIFT_X/2 (m). */
const AGGRESSION_SHIFT_X = 8;
/** Phòng ngự co hẹp chiều ngang còn chừng này phần. */
const DEFEND_WIDTH = 0.75;
/** Điểm neo cầu thủ ngoài sân cách vạch cuối nhà ít nhất OUTFIELD_MIN_DEPTH, cách biên/vạch cuối kia ít nhất ANCHOR_MARGIN (m). */
const OUTFIELD_MIN_DEPTH = 4;
const ANCHOR_MARGIN = 1.5;
/** Kèm đối phương có x tương đối dưới MARK_ZONE_X (phần sân nhà + chút); người kèm cách không quá MARK_RANGE. */
const MARK_ZONE_X = 5;
const MARK_RANGE = 15;
/** Người kèm đứng giữa đối phương và khung thành nhà, cách đối phương chừng này (m). */
const MARK_DIST = 2;
/** Đuổi bóng tự do: đón trước theo vận tốc bóng, tối đa chừng này giây. */
const CHASE_LEAD_MAX_SEC = 1;
const CHASE_SPEED_GUESS = 6;
/** Người dẫn bóng AI tạm thời rê tới cách vạch cuối đối phương chừng này (m) rồi dừng — 5.8a thay. */
const CARRY_STOP_DEPTH = 12;
/** Arrive: hết tốc khi còn xa hơn ARRIVE_RADIUS, chậm dần khi gần, dừng trong ARRIVE_STOP (m). */
const ARRIVE_RADIUS = 3;
const ARRIVE_STOP = 0.25;
/** Nước rút khi còn xa mục tiêu hơn SPRINT_DIST; người áp sát của đội hung hăng (≥ 0.5) rút khi xa hơn PRESS_SPRINT_DIST. */
const SPRINT_DIST = 12;
const PRESS_SPRINT_DIST = 3;
/** Mục tiêu luôn cách biên/vạch cuối chừng này để không chạy ra ngoài. */
const TARGET_MARGIN = 0.5;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const dist = (a: Vec2, b: Vec2): number => length(sub(a, b));

/** Đổi giữa toạ độ sân và toạ độ tương đối (phép lật tự nghịch). `+ 0` bỏ −0 để JSON khứ hồi y hệt. */
const flip = (v: Vec2, sign: 1 | -1): Vec2 => vec2(sign * v.x + 0, sign * v.y + 0);

const clampToPitch = (p: Vec2, margin: number): Vec2 =>
  vec2(
    clamp(p.x, -HALF_LENGTH + margin, HALF_LENGTH - margin),
    clamp(p.y, -HALF_WIDTH + margin, HALF_WIDTH - margin),
  );

/** Rải đều n người theo chiều ngang, chừa 20% mỗi bên biên (như vị trí giao bóng). */
const spreadY = (i: number, n: number): number =>
  (-HALF_WIDTH + ((i + 1) * 2 * HALF_WIDTH) / (n + 1)) * 0.8;

/** Vị trí gốc (tương đối) của ô P1…P6 theo sơ đồ, xếp HV → TV → TĐ. */
function baseShape(formation: Formation): Map<SquadSlot, Vec2> {
  const xs = [LINE_X.DF, LINE_X.MF, LINE_X.FW];
  const shape = new Map<SquadSlot, Vec2>();
  let slotNo = 1;
  FORMATION_LINES[formation].forEach((n, line) => {
    for (let i = 0; i < n; i++) {
      shape.set(`P${slotNo++}` as SquadSlot, vec2(xs[line]!, spreadY(i, n)));
    }
  });
  return shape;
}

function teamMode(
  team: TeamSide,
  ownerTeam: TeamSide | null,
  restartTeam: TeamSide | null,
): TeamMode {
  const holder = restartTeam ?? ownerTeam;
  if (holder === null) return 'transition';
  return holder === team ? 'attack' : 'defend';
}

/** Lập kế hoạch cho một đội. Hàm thuần, tất định (bằng khoảng cách thì người đứng trước trong mảng thắng). */
export function planTeam(input: TeamPlanInput): TeamPlan {
  const { team, half, players, ball, ballOwnerId, restartTeam, controlledId } = input;
  const sign = attackSign(team, half);
  const owner = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);
  const mode = teamMode(team, owner?.team ?? null, restartTeam);
  const deadBall = restartTeam !== null;
  const ballRel = flip(ball.pos, sign);
  const ownGoal = vec2(-sign * HALF_LENGTH, 0);

  const ai = players.filter((p) => p.team === team && p.id !== controlledId);
  const outfield = ai.filter((p) => p.position !== 'GK' && p.id !== owner?.id);

  // Điểm neo.
  const shape = baseShape(input.formation);
  const shiftX =
    ballRel.x * BALL_FOLLOW_X + MODE_SHIFT_X[mode] + (input.aggression - 0.5) * AGGRESSION_SHIFT_X;
  const widthK = mode === 'defend' ? DEFEND_WIDTH : 1;
  const anchors: Record<string, Vec2> = {};
  const roles: Record<string, AiRole> = {};
  for (const p of ai) {
    let rel: Vec2;
    if (p.position === 'GK') {
      rel = vec2(-HALF_LENGTH + GK_DEPTH, clamp(ballRel.y * GK_FOLLOW_Y, -GK_MAX_Y, GK_MAX_Y));
      roles[p.id] = 'keep';
    } else {
      const at = shape.get(p.slot) ?? vec2(LINE_X.MF, 0);
      rel = vec2(
        clamp(at.x + shiftX, -HALF_LENGTH + OUTFIELD_MIN_DEPTH, HALF_LENGTH - ANCHOR_MARGIN),
        clamp(
          at.y * widthK + ballRel.y * BALL_FOLLOW_Y,
          -HALF_WIDTH + ANCHOR_MARGIN,
          HALF_WIDTH - ANCHOR_MARGIN,
        ),
      );
      roles[p.id] = p.id === owner?.id ? 'carry' : 'hold';
    }
    anchors[p.id] = flip(rel, sign);
  }

  // Người áp sát: phòng ngự → gần người dẫn bóng nhất; bóng tự do → gần bóng nhất.
  let presserId: string | null = null;
  if (!deadBall && mode !== 'attack') {
    const target = owner ? owner.pos : ball.pos;
    let best = Infinity;
    for (const p of outfield) {
      const d = dist(p.pos, target);
      if (d < best) {
        best = d;
        presserId = p.id;
      }
    }
    if (presserId !== null) roles[presserId] = 'press';
  }

  // Kèm người: đối phương ở phần sân nhà, nguy hiểm nhất (gần khung thành nhà) chọn trước.
  const marks: Record<string, string> = {};
  if (mode === 'defend') {
    const threats = players
      .filter(
        (o) =>
          o.team !== team &&
          o.position !== 'GK' &&
          o.id !== owner?.id &&
          flip(o.pos, sign).x < MARK_ZONE_X,
      )
      .sort((a, b) => dist(a.pos, ownGoal) - dist(b.pos, ownGoal));
    const free = outfield.filter((p) => p.id !== presserId);
    for (const o of threats) {
      let pick: PlayerState | null = null;
      let best = MARK_RANGE;
      for (const p of free) {
        const d = dist(p.pos, o.pos);
        if (marks[p.id] === undefined && d <= best) {
          best = d;
          pick = p;
        }
      }
      if (pick) {
        marks[pick.id] = o.id;
        roles[pick.id] = 'mark';
      }
    }
  }

  return { mode, deadBall, controlledId, roles, marks, anchors };
}

/** Lập lại kế hoạch khi tới hạn, khi bóng chuyển sống/chết hoặc khi người chơi đổi người. */
export function thinkTeam(
  prev: TeamAiState | null,
  input: TeamPlanInput,
  tick: number,
  reactionDelayTicks: number,
): TeamAiState {
  if (
    prev &&
    tick < prev.nextThinkTick &&
    prev.plan.deadBall === (input.restartTeam !== null) &&
    prev.plan.controlledId === input.controlledId
  ) {
    return prev;
  }
  return { plan: planTeam(input), nextThinkTick: tick + Math.max(1, reactionDelayTicks) };
}

export interface AiMove {
  move: Vec2;
  sprint: boolean;
}

/** Điểm cách `of` một khoảng `gap`, nằm trên đường từ `of` về khung thành nhà của `team`. */
export function goalSidePoint(of: Vec2, team: TeamSide, half: 1 | 2, gap: number): Vec2 {
  const ownGoal = vec2(-attackSign(team, half) * HALF_LENGTH, 0);
  return add(of, scale(normalize(sub(ownGoal, of)), gap));
}

/** Vị trí mục tiêu của cầu thủ AI trong tick này theo vai; null nếu không có vai. */
export function aiTarget(
  player: PlayerState,
  plan: TeamPlan,
  players: readonly PlayerState[],
  ball: BallState,
  ballOwnerId: string | null,
  half: 1 | 2,
): Vec2 | null {
  const role = plan.roles[player.id];
  const anchor = plan.anchors[player.id];
  if (role === undefined || anchor === undefined) return null;
  const sign = attackSign(player.team, half);
  const goalSide = (of: Vec2, gap: number) => goalSidePoint(of, player.team, half, gap);
  const owner = ballOwnerId === null ? undefined : players.find((p) => p.id === ballOwnerId);

  let target: Vec2;
  switch (role) {
    case 'press':
      if (!owner) {
        const lead = Math.min(CHASE_LEAD_MAX_SEC, dist(player.pos, ball.pos) / CHASE_SPEED_GUESS);
        target = add(ball.pos, scale(ball.vel, lead));
      } else if (owner.team !== player.team) {
        target = goalSide(owner.pos, CONTAIN_DIST);
      } else {
        // Đội mình vừa giành bóng, chưa kịp lập lại kế hoạch.
        target = anchor;
      }
      break;
    case 'mark': {
      const opp = players.find((p) => p.id === plan.marks[player.id]);
      target = opp ? goalSide(opp.pos, MARK_DIST) : anchor;
      break;
    }
    case 'carry':
      target =
        owner?.id === player.id
          ? flip(vec2(HALF_LENGTH - CARRY_STOP_DEPTH, flip(player.pos, sign).y * 0.5), sign)
          : anchor;
      break;
    case 'keep':
    case 'hold':
      target = anchor;
      break;
  }
  return clampToPitch(target, TARGET_MARGIN);
}

/** Steering "arrive" tới mục tiêu: hết tốc khi xa, chậm dần khi gần, đứng yên khi tới. */
export function arrive(player: PlayerState, target: Vec2, sprintAllowed: boolean): AiMove {
  const d = sub(target, player.pos);
  const len = length(d);
  if (len < ARRIVE_STOP) return { move: ZERO, sprint: false };
  return {
    move: scale(normalize(d), Math.min(1, len / ARRIVE_RADIUS)),
    sprint: len > SPRINT_DIST || (sprintAllowed && len > PRESS_SPRINT_DIST),
  };
}

/** Input di chuyển của một cầu thủ AI trong tick này (không có vai → đứng yên). */
export function aiMove(
  player: PlayerState,
  plan: TeamPlan,
  players: readonly PlayerState[],
  ball: BallState,
  ballOwnerId: string | null,
  half: 1 | 2,
  aggression: number,
): AiMove {
  const target = aiTarget(player, plan, players, ball, ballOwnerId, half);
  if (!target) return { move: ZERO, sprint: false };
  return arrive(player, target, plan.roles[player.id] === 'press' && aggression >= 0.5);
}
