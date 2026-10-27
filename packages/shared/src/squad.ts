// Luật đội hình (PRD §6.4, F6) — dùng chung: server kiểm khi lưu, web tính ngay khi kéo-thả.
import {
  computeOvr,
  effectiveStats,
  FORMATIONS,
  type Formation,
  type PlayerStats,
  type Position,
} from './domain';
import { isStarterSlot, SquadSlot, STARTER_SLOTS } from './match';

type StarterSlot = (typeof STARTER_SLOTS)[number];

/** Nhóm vị trí của ô đá chính theo sơ đồ; ô dự bị → `undefined` (không phạt). */
export function slotRole(formation: Formation, slot: SquadSlot): Position | undefined {
  return isStarterSlot(slot) ? FORMATIONS[formation][slot as StarterSlot] : undefined;
}

/** Thẻ đặt trong một ô — đủ để tính chỉ số hiệu lực. */
export interface SquadMember {
  id: string;
  position: Position;
  stats: PlayerStats;
  level: number;
}

export type SquadWarningCode = 'missing_gk' | 'missing_starters' | 'misposition';
export interface SquadWarning {
  code: SquadWarningCode;
  slot?: SquadSlot;
  message: string;
}

export interface SquadEvaluation {
  /** Id thẻ xuất hiện ở hơn một ô (vi phạm cứng → server trả 422 `invalid_squad`). */
  duplicates: string[];
  warnings: SquadWarning[];
  /** TB OVR hiệu lực của 7 ô đá chính (ô trống tính 0), làm tròn. */
  teamRating: number;
  /** Chỉ số hiệu lực từng ô có thẻ (đã áp cấp + và phạt sai vị trí). */
  effective: Partial<Record<SquadSlot, PlayerStats>>;
}

const ROLE_NAME: Record<Position, string> = {
  GK: 'thủ môn',
  DF: 'hậu vệ',
  MF: 'tiền vệ',
  FW: 'tiền đạo',
};

/**
 * Đánh giá đội hình: phát hiện trùng thẻ, cảnh báo (thiếu thủ môn, thiếu người đá chính, sai vị
 * trí) và chỉ số đội. Thiếu người chỉ là cảnh báo khi lưu — chặn vào trận ở 6.11.
 */
export function evaluateSquad(
  formation: Formation,
  slots: Partial<Record<SquadSlot, SquadMember | null>>,
): SquadEvaluation {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  const warnings: SquadWarning[] = [];
  const effective: Partial<Record<SquadSlot, PlayerStats>> = {};
  let ovrSum = 0;
  let starters = 0;

  for (const slot of SquadSlot.options) {
    const m = slots[slot];
    if (!m) continue;
    if (seen.has(m.id)) duplicates.add(m.id);
    seen.add(m.id);
    const role = slotRole(formation, slot);
    const stats = effectiveStats(m, m.level, role);
    effective[slot] = stats;
    if (!role) continue;
    starters += 1;
    ovrSum += computeOvr(m.position, stats);
    if (role !== m.position) {
      warnings.push({
        code: 'misposition',
        slot,
        message: `Ô ${slot} cần ${ROLE_NAME[role]}, thẻ là ${ROLE_NAME[m.position]} (−15% chỉ số)`,
      });
    }
  }
  if (!slots.GK) warnings.unshift({ code: 'missing_gk', slot: 'GK', message: 'Chưa có thủ môn' });
  if (starters < STARTER_SLOTS.length) {
    warnings.unshift({
      code: 'missing_starters',
      message: `Mới có ${starters}/${STARTER_SLOTS.length} người đá chính`,
    });
  }
  return {
    duplicates: [...duplicates],
    warnings,
    teamRating: Math.round(ovrSum / STARTER_SLOTS.length),
    effective,
  };
}
