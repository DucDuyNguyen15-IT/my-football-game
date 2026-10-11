import {
  FORMATION_LINES,
  MatchTeamSetup,
  isStarterSlot,
  type MatchPlayerSetup,
  type SquadSlot,
} from '@pitch/shared';
import { clampLength, length, sub, vec2, ZERO, type Vec2 } from './math/vec2';
import { CENTER_CIRCLE_RADIUS, HALF_LENGTH, HALF_WIDTH } from './pitch';
import { seedRng } from './rng';
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

/** Chạy một tick cố định (TICK_DT). Hàm thuần: không sửa `state`, không đọc đồng hồ thật. */
export function step(state: MatchState, input: PlayerInput): MatchState {
  return {
    ...state,
    tick: state.tick + 1,
    halfTick: state.halfTick + 1,
    input: sanitizeInput(input),
  };
}
