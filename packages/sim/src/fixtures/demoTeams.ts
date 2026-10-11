/**
 * Đội demo hư cấu dùng tới hết GĐ5 (chưa có thẻ/tài khoản). Không có tên — chỉ ô, vị trí, chỉ số.
 * Chỉ số dựng sao cho OVR (PRD §6.2) đúng bằng `ovr`; `FLAVOR` lệch vài chỉ số nhưng giữ nguyên OVR.
 */
import type {
  Formation,
  MatchPlayerSetup,
  MatchTeamSetup,
  PlayerStats,
  Position,
  SquadSlot,
} from '@pitch/shared';

/** Chỉ số thủ môn của cầu thủ ngoài sân, và chỉ số ngoài sân của thủ môn. */
const OFF_ROLE_STAT = 30;

/** Lệch theo vị trí, tổng tác động lên OVR = 0 (theo trọng số PRD §6.2). */
const FLAVOR: Record<Position, Partial<Record<keyof PlayerStats, number>>> = {
  // Tốc độ +4 (×25) bù Phòng ngự −20 (×5).
  FW: { pace: 4, defending: -20 },
  // Sút +3 (×10) bù Phòng ngự −3 (×10).
  MF: { shooting: 3, defending: -3 },
  // Sút không tính vào OVR hậu vệ.
  DF: { shooting: -15 },
  GK: {},
};

function player(slot: SquadSlot, position: Position, ovr: number): MatchPlayerSetup {
  const outfield = position === 'GK' ? OFF_ROLE_STAT : ovr;
  const keeper = position === 'GK' ? ovr : OFF_ROLE_STAT;
  const stats: PlayerStats = {
    pace: outfield,
    shooting: outfield,
    passing: outfield,
    dribbling: outfield,
    defending: outfield,
    stamina: ovr,
    reflexes: keeper,
    handling: keeper,
    positioning: keeper,
    kicking: keeper,
  };
  for (const [k, d] of Object.entries(FLAVOR[position])) {
    stats[k as keyof PlayerStats] += d;
  }
  return { slot, position, stats };
}

function team(formation: Formation, players: [SquadSlot, Position, number][]): MatchTeamSetup {
  return { formation, players: players.map(([slot, pos, ovr]) => player(slot, pos, ovr)) };
}

/** Mô phỏng quà tân thủ: 11 thẻ Đồng (1 TM, 3 HV, 4 TV, 3 TĐ), sơ đồ 2-3-1, OVR TB đá chính 57 (PRD §7.1). */
export const starterLikeTeam: MatchTeamSetup = team('2-3-1', [
  ['GK', 'GK', 56],
  ['P1', 'DF', 55],
  ['P2', 'DF', 57],
  ['P3', 'MF', 58],
  ['P4', 'MF', 56],
  ['P5', 'MF', 57],
  ['P6', 'FW', 60],
  ['B1', 'DF', 54],
  ['B2', 'MF', 55],
  ['B3', 'FW', 58],
  ['B4', 'FW', 52],
]);

/** Đội máy mức Dễ, OVR TB ~60 (PRD §5). */
export const cpuEasyTeam: MatchTeamSetup = team('3-2-1', [
  ['GK', 'GK', 61],
  ['P1', 'DF', 59],
  ['P2', 'DF', 60],
  ['P3', 'DF', 58],
  ['P4', 'MF', 62],
  ['P5', 'MF', 60],
  ['P6', 'FW', 61],
  ['B1', 'DF', 58],
  ['B2', 'MF', 59],
  ['B3', 'FW', 60],
]);

/** Đội máy mức Khó, OVR TB ~78 (PRD §5). */
export const cpuHardTeam: MatchTeamSetup = team('2-2-2', [
  ['GK', 'GK', 79],
  ['P1', 'DF', 77],
  ['P2', 'DF', 78],
  ['P3', 'MF', 76],
  ['P4', 'MF', 80],
  ['P5', 'FW', 78],
  ['P6', 'FW', 77],
  ['B1', 'MF', 75],
  ['B2', 'DF', 74],
  ['B3', 'FW', 76],
]);
