import type { MatchPlayerSetup, SquadSlot } from '@pitch/shared';
import { ZERO } from '../math/vec2';
import type { MatchState, PlayerState, TeamSide, Windup } from '../types';

/*
 * Thay người (PRD §5, F3): chỉ khi bóng chết (cả nghỉ giữa hiệp), tối đa MAX_SUBS lượt mỗi đội.
 * Người vào đứng đúng chỗ người ra, nhận ô sơ đồ của người ra (AI dùng ô để chọn vị trí), thể lực
 * đầy. Người ra không quay lại sân; người bị thẻ đỏ đã rời sân nên không thay được.
 * Không thay lúc đang chờ đá phạt đền. Ngoại lệ duy nhất: đội mất thủ môn vì thẻ đỏ được đưa thủ môn
 * dự bị vào thay một cầu thủ ngoài sân (kể cả trước quả phạt đền) — người vào nhận ô và vai GK.
 */

export const MAX_SUBS = 3;
/** Đội máy tự thay cầu thủ có thể lực dưới mức này (%) — cũng là mốc bắt đầu giảm tốc (PRD §5). */
export const AI_SUB_STAMINA = 30;

export type SubRejection =
  | 'ball_live'
  | 'shootout'
  | 'penalty_pending'
  | 'no_subs_left'
  | 'not_on_pitch'
  | 'not_on_bench'
  | 'keeper_mismatch';

export type SubResult = { ok: true; state: MatchState } | { ok: false; reason: SubRejection };

const hasKeeper = (state: MatchState, team: TeamSide): boolean =>
  state.players.some((p) => p.team === team && p.position === 'GK');

/**
 * Đội `team` lúc này được thay những ai: `open` = mọi lượt hợp lệ; `keeper_only` = chỉ được đưa thủ
 * môn dự bị vào (đang chờ phạt đền mà đội không còn thủ môn); `closed` = không được thay (bóng sống,
 * luân lưu, hết trận, hết lượt, chờ phạt đền). Menu thay người bật/tắt theo giá trị này.
 */
export function substitutionWindow(
  state: MatchState,
  team: TeamSide,
): 'open' | 'keeper_only' | 'closed' {
  if (state.shootout || !state.ballDead || state.phase === 'full_time') return 'closed';
  if (state.subsUsed[team] >= MAX_SUBS) return 'closed';
  if (state.restart?.type !== 'penalty') return 'open';
  const keeperOnBench = state.bench[team].some((p) => p.position === 'GK');
  return !hasKeeper(state, team) && keeperOnBench ? 'keeper_only' : 'closed';
}

/** Lý do không cho thay (null = hợp lệ). */
function rejection(
  state: MatchState,
  team: TeamSide,
  outId: string,
  benchSlot: SquadSlot,
): SubRejection | null {
  // Luân lưu không thay người (cả lúc chờ sút, bóng vẫn chết).
  if (state.shootout) return 'shootout';
  if (!state.ballDead || state.phase === 'full_time') return 'ball_live';
  if (state.subsUsed[team] >= MAX_SUBS) return 'no_subs_left';
  const out = state.players.find((p) => p.id === outId && p.team === team);
  if (!out) return 'not_on_pitch';
  const incoming = state.bench[team].find((p) => p.slot === benchSlot);
  if (!incoming) return 'not_on_bench';
  // Chỉ một thủ môn trên sân: thủ môn đổi thủ môn, cầu thủ ngoài sân đổi cầu thủ ngoài sân. Đội mất
  // thủ môn (thẻ đỏ) thì thủ môn dự bị được vào thay một cầu thủ ngoài sân.
  const keeperIn = fillsEmptyGoal(state, team, incoming);
  if (!keeperIn && (out.position === 'GK') !== (incoming.position === 'GK')) {
    return 'keeper_mismatch';
  }
  if (state.restart?.type === 'penalty' && !keeperIn) return 'penalty_pending';
  return null;
}

/** Thủ môn dự bị vào sân khi đội không còn thủ môn (bị thẻ đỏ). */
const fillsEmptyGoal = (state: MatchState, team: TeamSide, incoming: MatchPlayerSetup): boolean =>
  incoming.position === 'GK' && !hasKeeper(state, team);

/** Đổi id người lấy đà và người nhận dự kiến của cú phát bóng đang lấy đà. */
function swapWindup(windup: Windup, swap: (id: string) => string): Windup {
  const { kick } = windup;
  return {
    ...windup,
    playerId: swap(windup.playerId),
    kick:
      kick.type === 'pass' && kick.targetId !== null
        ? { ...kick, targetId: swap(kick.targetId) }
        : kick,
  };
}

/** Thay `outId` (đang trên sân) bằng dự bị ô `benchSlot` của đội `team`. Hàm thuần. */
export function substitute(
  state: MatchState,
  team: TeamSide,
  outId: string,
  benchSlot: SquadSlot,
): SubResult {
  const reason = rejection(state, team, outId, benchSlot);
  if (reason) return { ok: false, reason };
  const out = state.players.find((p) => p.id === outId)!;
  const incoming = state.bench[team].find((p) => p.slot === benchSlot)!;
  const inId = `${team}-${benchSlot}`;
  const player: PlayerState = {
    id: inId,
    team,
    // Thủ môn vào thay cầu thủ ngoài sân (đội mất thủ môn): nhận ô GK, ô của người ra bỏ trống.
    slot: fillsEmptyGoal(state, team, incoming) ? 'GK' : out.slot,
    position: incoming.position,
    stats: incoming.stats,
    pos: out.pos,
    vel: ZERO,
    facing: out.facing,
    stamina: 100,
  };
  const swap = (id: string) => (id === outId ? inId : id);
  return {
    ok: true,
    state: {
      ...state,
      players: state.players.map((p) => (p.id === outId ? player : p)),
      bench: { ...state.bench, [team]: state.bench[team].filter((p) => p.slot !== benchSlot) },
      subsUsed: { ...state.subsUsed, [team]: state.subsUsed[team] + 1 },
      substitutions: [...state.substitutions, { team, outId, inId, tick: state.tick }],
      controlledId: swap(state.controlledId),
      restart: state.restart && { ...state.restart, takerId: swap(state.restart.takerId) },
      // Thủ môn đang lấy đà phát bóng (bóng vẫn chết) bị thay: người vào phát bóng tiếp.
      windup: state.windup && swapWindup(state.windup, swap),
      // Kế hoạch AI giữ vai theo id người: lập lại cho đội vừa thay.
      ai: state.ai && { ...state.ai, [team]: null },
    },
  };
}

/**
 * Đội máy tự thay: mất thủ môn (thẻ đỏ) mà còn thủ môn dự bị thì đưa vào thay cầu thủ ngoài sân mệt
 * nhất; rồi lần lượt người mệt nhất dưới AI_SUB_STAMINA, lấy dự bị cùng vị trí (không có thì cầu thủ
 * ngoài sân bất kỳ), tới khi hết lượt / hết dự bị phù hợp. Không có gì để thay thì trả nguyên `state`.
 */
export function autoSubstitute(state: MatchState, team: TeamSide): MatchState {
  let s = state;
  const spareKeeper = state.bench[team].find((b) => b.position === 'GK');
  if (spareKeeper && !hasKeeper(state, team)) {
    const outfield = state.players.filter((p) => p.team === team);
    const out = outfield.reduce<PlayerState | null>(
      (a, b) => (a === null || b.stamina < a.stamina ? b : a),
      null,
    );
    const r = out && substitute(s, team, out.id, spareKeeper.slot);
    if (r?.ok) s = r.state;
  }
  const tired = s.players
    .filter((p) => p.team === team && p.stamina < AI_SUB_STAMINA)
    .sort((a, b) => a.stamina - b.stamina);
  for (const out of tired) {
    const bench = s.bench[team].filter((b) => (b.position === 'GK') === (out.position === 'GK'));
    const pick = bench.find((b) => b.position === out.position) ?? bench[0];
    if (!pick) continue;
    const r = substitute(s, team, out.id, pick.slot);
    if (!r.ok) break;
    s = r.state;
  }
  return s;
}
