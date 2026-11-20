// Luật nhiệm vụ ngày thuần (PRD §7.1 F12, ARCHITECTURE §4.3 #16–18) — không đụng DB, không dùng Math.random.
import { createHash } from 'node:crypto';
import type { Difficulty, MatchOutcome } from '@pitch/shared';
import {
  DAILY_MISSION_COUNT,
  MISSIONS,
  type MissionDef,
  type MissionEventKind,
} from '../config/economy';

export type MissionEvent =
  | {
      type: 'match_finished';
      mode: 'cpu' | 'pvp';
      difficulty: Difficulty;
      outcome: MatchOutcome;
      homeGoals: number;
      awayGoals: number;
    }
  | { type: 'pack_opened' };

/**
 * Chọn tất định `count` nhiệm vụ phân biệt cho `(userId, day)` bằng SHA-256 + Fisher-Yates từng phần.
 * Đảm bảo cùng một người trong cùng ngày GMT+7 luôn nhận cùng bộ nhiệm vụ dù được tạo ở bất kỳ điểm nào.
 */
export function pickDailyMissions(
  userId: number,
  day: string,
  pool: readonly MissionDef[] = MISSIONS,
  count: number = DAILY_MISSION_COUNT,
): MissionDef[] {
  const n = Math.min(count, pool.length);
  if (n <= 0) return [];
  const items = [...pool];
  // 8 uint32 (32 byte) đủ cho tối đa 8 bước Fisher-Yates; fallback nối digest nếu count > 8.
  let digest = createHash('sha256').update(`${userId}:${day}`).digest();
  for (let i = 0; i < n; i++) {
    const offset = (i % 8) * 4;
    if (i > 0 && offset === 0) {
      digest = createHash('sha256').update(digest).digest();
    }
    const r = digest.readUInt32BE(offset);
    const j = i + (r % (items.length - i));
    [items[i], items[j]] = [items[j]!, items[i]!];
  }
  return items.slice(0, n);
}

/** Tính lượng tiến độ tăng thêm từ một sự kiện nghiệp vụ. */
export function missionDelta(kind: MissionEventKind, event: MissionEvent): number {
  if (event.type === 'pack_opened') {
    return kind === 'pack_open' ? 1 : 0;
  }
  switch (kind) {
    case 'match_win':
      return event.outcome === 'win' || event.outcome === 'shootout_win' ? 1 : 0;
    case 'match_goals':
      return Math.max(0, event.homeGoals);
    case 'match_hard':
      return event.mode === 'cpu' && event.difficulty === 'hard' ? 1 : 0;
    case 'match_play':
      return 1;
    case 'match_clean_sheet':
      return event.awayGoals === 0 ? 1 : 0;
    case 'pack_open':
      return 0;
  }
}

/** Cộng tiến độ nhưng không vượt quá `target`. */
export function advanceProgress(progress: number, target: number, delta: number): number {
  if (delta <= 0) return progress;
  return Math.min(target, progress + delta);
}
