// Nhiệm vụ ngày (PRD §7.1 F12, ARCHITECTURE §3.2 daily_missions, §4.3 #16–18).
import { and, eq } from 'drizzle-orm';
import type { ClaimMissionResult, MissionProgress } from '@pitch/shared';
import { MISSIONS, type MissionDef } from '../config/economy';
import type { Db, Tx } from '../db/client';
import { dailyMissions } from '../db/schema';
import {
  advanceProgress,
  missionDelta,
  pickDailyMissions,
  type MissionEvent,
} from '../domain/missions';
import { gameDay } from '../domain/rewards';
import { AppError } from '../plugins/errors';
import { track } from './analytics';
import { applyCoinDelta, lockUser } from './wallet';

const MISSIONS_BY_CODE = new Map<string, MissionDef>(MISSIONS.map((m) => [m.code, m]));

function toMissionProgress(row: typeof dailyMissions.$inferSelect): MissionProgress {
  const def = MISSIONS_BY_CODE.get(row.missionCode);
  return {
    code: row.missionCode,
    title: def?.title ?? row.missionCode,
    progress: row.progress,
    target: row.target,
    reward: row.reward,
    claimed: row.claimedAt !== null,
  };
}

function orderMissions(
  rows: (typeof dailyMissions.$inferSelect)[],
  picked: readonly MissionDef[],
): MissionProgress[] {
  const rank = new Map<string, number>(picked.map((m, i) => [m.code, i]));
  return [...rows]
    .sort((a, b) => {
      const ra = rank.get(a.missionCode) ?? Number.MAX_SAFE_INTEGER;
      const rb = rank.get(b.missionCode) ?? Number.MAX_SAFE_INTEGER;
      return ra - rb || a.missionCode.localeCompare(b.missionCode);
    })
    .map(toMissionProgress);
}

/**
 * Đảm bảo người chơi đã có đủ 3 nhiệm vụ cho ngày GMT+7 `day`. Phải được gọi trong transaction
 * đã khoá `users` (`lockUser`) từ cả đường cập nhật tiến độ (trận/gói) lẫn `GET /missions/today`.
 */
export async function ensureTodayMissions(
  tx: Tx,
  userId: number,
  day: string,
): Promise<MissionProgress[]> {
  const picked = pickDailyMissions(userId, day);
  if (picked.length > 0) {
    await tx
      .insert(dailyMissions)
      .values(
        picked.map((m) => ({
          userId,
          day,
          missionCode: m.code,
          progress: 0,
          target: m.target,
          reward: m.reward,
        })),
      )
      .onConflictDoNothing();
  }
  const rows = await tx
    .select()
    .from(dailyMissions)
    .where(and(eq(dailyMissions.userId, userId), eq(dailyMissions.day, day)));
  return orderMissions(rows, picked);
}

/**
 * Cập nhật tiến độ nhiệm vụ ngày trong **cùng transaction** với nộp kết quả trận hoặc mở gói.
 * Tự gọi `ensureTodayMissions` nên hành động trước khi mở màn nhiệm vụ vẫn được tính.
 */
export async function applyMissionEvent(
  tx: Tx,
  userId: number,
  day: string,
  event: MissionEvent,
): Promise<MissionProgress[]> {
  const current = await ensureTodayMissions(tx, userId, day);
  const updated: MissionProgress[] = [];
  for (const m of current) {
    if (m.progress >= m.target) {
      updated.push(m);
      continue;
    }
    const def = MISSIONS_BY_CODE.get(m.code);
    if (!def) {
      updated.push(m);
      continue;
    }
    const delta = missionDelta(def.event, event);
    const next = advanceProgress(m.progress, m.target, delta);
    if (next > m.progress) {
      await tx
        .update(dailyMissions)
        .set({ progress: next })
        .where(
          and(
            eq(dailyMissions.userId, userId),
            eq(dailyMissions.day, day),
            eq(dailyMissions.missionCode, m.code),
          ),
        );
      updated.push({ ...m, progress: next });
    } else {
      updated.push(m);
    }
  }
  return updated;
}

/** GET /missions/today: khoá `users` để không đua với trận/gói, tạo nếu chưa có, trả 3 nhiệm vụ. */
export async function getTodayMissions(
  db: Db,
  userId: number,
  now: Date,
): Promise<MissionProgress[]> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    return ensureTodayMissions(tx, userId, gameDay(now));
  });
}

/**
 * POST /missions/:code/claim: khoá `users` (tuần tự hoá giao dịch theo người chơi) → đảm bảo
 * nhiệm vụ ngày; chỉ nhận được khi `progress >= target` và chưa `claimed`; cộng xu + ghi sổ cái `mission_reward`.
 */
export async function claimMission(
  db: Db,
  userId: number,
  missionCode: string,
  now: Date,
): Promise<ClaimMissionResult> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    const day = gameDay(now);
    const missions = await ensureTodayMissions(tx, userId, day);
    const mission = missions.find((m) => m.code === missionCode);
    if (!mission) {
      throw new AppError('not_found', 404, 'Không tìm thấy nhiệm vụ hôm nay');
    }
    if (mission.claimed) {
      throw new AppError('mission_already_claimed', 409, 'Nhiệm vụ này đã nhận thưởng');
    }
    if (mission.progress < mission.target) {
      throw new AppError('mission_incomplete', 422, 'Nhiệm vụ chưa hoàn thành');
    }

    await tx
      .update(dailyMissions)
      .set({ claimedAt: now })
      .where(
        and(
          eq(dailyMissions.userId, userId),
          eq(dailyMissions.day, day),
          eq(dailyMissions.missionCode, missionCode),
        ),
      );
    const balance = await applyCoinDelta(tx, userId, mission.reward, 'mission_reward', null);
    await track(tx, userId, 'mission_claim', { missionCode, day, reward: mission.reward }, now);
    return { reward: mission.reward, balance };
  });
}
