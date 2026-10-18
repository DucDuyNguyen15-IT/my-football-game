import type { SquadSlot } from '@pitch/shared';
import { ZERO } from '../math/vec2';
import type { MatchState, PlayerState, TeamSide } from '../types';

/*
 * Thay người (PRD §5, F3): chỉ khi bóng chết (cả nghỉ giữa hiệp), tối đa MAX_SUBS lượt mỗi đội.
 * Người vào đứng đúng chỗ người ra, nhận ô sơ đồ của người ra (AI dùng ô để chọn vị trí), thể lực
 * đầy. Người ra không quay lại sân; người bị thẻ đỏ đã rời sân nên không thay được.
 */

export const MAX_SUBS = 3;
/** Đội máy tự thay cầu thủ có thể lực dưới mức này (%) — cũng là mốc bắt đầu giảm tốc (PRD §5). */
export const AI_SUB_STAMINA = 30;

export type SubRejection =
  'ball_live' | 'no_subs_left' | 'not_on_pitch' | 'not_on_bench' | 'keeper_mismatch';

export type SubResult = { ok: true; state: MatchState } | { ok: false; reason: SubRejection };

/** Lý do không cho thay (null = hợp lệ). */
function rejection(
  state: MatchState,
  team: TeamSide,
  outId: string,
  benchSlot: SquadSlot,
): SubRejection | null {
  if (!state.ballDead || state.phase === 'full_time') return 'ball_live';
  if (state.subsUsed[team] >= MAX_SUBS) return 'no_subs_left';
  const out = state.players.find((p) => p.id === outId && p.team === team);
  if (!out) return 'not_on_pitch';
  const incoming = state.bench[team].find((p) => p.slot === benchSlot);
  if (!incoming) return 'not_on_bench';
  // Chỉ một thủ môn trên sân: thủ môn đổi thủ môn, cầu thủ ngoài sân đổi cầu thủ ngoài sân.
  if ((out.position === 'GK') !== (incoming.position === 'GK')) return 'keeper_mismatch';
  return null;
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
    slot: out.slot,
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
      // Kế hoạch AI giữ vai theo id người: lập lại cho đội vừa thay.
      ai: state.ai && { ...state.ai, [team]: null },
    },
  };
}

/**
 * Đội máy tự thay: lần lượt người mệt nhất dưới AI_SUB_STAMINA, lấy dự bị cùng vị trí (không có thì
 * cầu thủ ngoài sân bất kỳ), tới khi hết lượt / hết dự bị phù hợp. Không có gì để thay thì trả
 * nguyên `state`.
 */
export function autoSubstitute(state: MatchState, team: TeamSide): MatchState {
  let s = state;
  const tired = state.players
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
