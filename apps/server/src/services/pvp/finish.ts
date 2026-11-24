import { createHash, randomBytes } from 'node:crypto';
import { and, eq, inArray } from 'drizzle-orm';
import type { MatchOutcome, MatchTeamSetup, PvpEndReason, PvpRewardReason } from '@pitch/shared';
import type { TeamSide } from '@pitch/sim';
import { MATCH_REWARD_DAILY_CAP } from '../../config/economy';
import type { Db, Tx } from '../../db/client';
import { matches, pvpMatches } from '../../db/schema';
import { gameDay, judgeMatchResult, matchReward } from '../../domain/rewards';
import { track } from '../analytics';
import { countRewardedMatches } from '../matches';
import { applyMissionEvent } from '../missions';
import { applyCoinDelta, lockUser } from '../wallet';

export interface FinishInput {
  pvpId: number;
  reason: PvpEndReason;
  /** Bên bị xử thua (chỉ với `forfeit_*`). */
  forfeit?: TeamSide;
  /** Tỉ số sim bóng của server lúc kết thúc (đội nhà/đội khách). */
  score: Record<TeamSide, number>;
  /** Số bàn luân lưu mỗi đội (nếu có). */
  shootout?: Record<TeamSide, number> | undefined;
  inputLog: string;
  now: Date;
}

export interface SideResult {
  outcome: MatchOutcome;
  reward: number;
  rewardReason?: PvpRewardReason;
}

export interface FinishResult {
  reason: PvpEndReason;
  home: number;
  away: number;
  sides: Record<TeamSide, SideResult>;
}

const isCancel = (r: PvpEndReason) =>
  r === 'void_desync' || r === 'void_both_left' || r === 'void_not_ready' || r === 'server_restart';

const other = (s: TeamSide): TeamSide => (s === 'home' ? 'away' : 'home');

/** FR-023: người ở lại thắng 3-0, hoặc giữ tỉ số nếu đang dẫn hơn 3 bàn. */
export function forfeitScore(
  score: Record<TeamSide, number>,
  loser: TeamSide,
): Record<TeamSide, number> {
  const stay = other(loser);
  if (score[stay] - score[loser] > 3) return { ...score };
  return { [stay]: 3, [loser]: 0 } as Record<TeamSide, number>;
}

/**
 * Kết thúc trận PvP cho MỌI cách kết thúc (T019), idempotent: một transaction khoá `pvp_matches`
 * (FOR UPDATE) rồi hai `users` theo thứ tự id (tránh khoá chéo), ghi đủ hai dòng `matches`, thưởng
 * ranked như máy Khó qua `applyCoinDelta`. Gọi lần hai (trận không còn `live`) trả kết quả đã lưu.
 */
export async function finishPvpMatch(db: Db, input: FinishInput): Promise<FinishResult> {
  const { pvpId, reason, now } = input;
  return db.transaction(async (tx) => {
    const [pvp] = await tx.select().from(pvpMatches).where(eq(pvpMatches.id, pvpId)).for('update');
    if (!pvp) throw new Error(`Không có trận PvP ${pvpId}`);
    const uid: Record<TeamSide, number> = { home: pvp.homeUserId, away: pvp.awayUserId };
    if (pvp.status !== 'live') return loadStored(tx, pvp, uid);

    const cancelled = isCancel(reason);
    const ranked = pvp.kind === 'ranked';
    const day = gameDay(now);
    const score = cancelled
      ? null
      : input.forfeit
        ? forfeitScore(input.score, input.forfeit)
        : input.score;
    const shootout = input.forfeit ? undefined : input.shootout;
    const snap = pvp.squadSnapshot as { home: MatchTeamSetup; away: MatchTeamSetup };

    for (const id of [uid.home, uid.away].sort((a, b) => a - b)) await lockUser(tx, id);

    const sides = {} as Record<TeamSide, SideResult>;
    for (const side of ['home', 'away'] as const) {
      const me = uid[side];
      const foe = other(side);
      const mine = snap[side];
      const theirs = snap[foe];
      const sh = shootout && { home: shootout[side], away: shootout[foe] };
      let outcome: MatchOutcome | null = null;
      if (score) {
        const j = judgeMatchResult({ homeGoals: score[side], awayGoals: score[foe], shootout: sh });
        if (!j.ok) throw new Error(`Kết quả PvP không hợp lệ: ${j.reason}`);
        outcome = j.outcome;
      }
      const lost = input.forfeit === side;
      let reward = 0;
      let rewardReason: PvpRewardReason | undefined;
      if (cancelled) rewardReason = 'void';
      else if (!ranked) rewardReason = 'friendly';
      else if (lost) rewardReason = 'forfeit';
      else {
        const rewarded = await countRewardedMatches(tx, me, day);
        reward = matchReward('hard', outcome!, rewarded);
        if (rewarded >= MATCH_REWARD_DAILY_CAP) rewardReason = 'daily_cap';
      }
      const [row] = await tx
        .insert(matches)
        .values({
          userId: me,
          tokenHash: createHash('sha256').update(randomBytes(32)).digest('hex'),
          difficulty: 'hard',
          status: cancelled ? 'expired' : 'finished',
          seed: pvp.seed,
          squadSnapshot: { formation: mine.formation, home: mine, away: theirs },
          rewardEligible: ranked,
          startedAt: pvp.startedAt,
          finishedAt: now,
          homeGoals: score ? score[side] : null,
          awayGoals: score ? score[foe] : null,
          outcome,
          reward,
          rewardDay: day,
          mode: ranked ? 'pvp_ranked' : 'pvp_friendly',
          pvpMatchId: pvpId,
          opponentUserId: uid[foe],
          consumesDailyCap: ranked && lost,
        })
        .returning({ id: matches.id });
      if (reward > 0) {
        await applyCoinDelta(tx, me, reward, 'match_reward', { type: 'match', id: row!.id });
      }
      if (!cancelled && ranked && !lost) {
        // Xử thua chỉ tính match_play/match_win (FR-023): 0 bàn thắng, thủng lưới 1 → không chạm
        // match_goals/match_clean_sheet.
        const forfeited = input.forfeit !== undefined;
        await applyMissionEvent(tx, me, day, {
          type: 'match_finished',
          mode: 'pvp',
          difficulty: 'hard',
          outcome: outcome!,
          homeGoals: forfeited ? 0 : score![side],
          awayGoals: forfeited ? 1 : score![foe],
        });
      }
      await track(
        tx,
        me,
        'pvp_end',
        { kind: pvp.kind, endReason: reason, score: score && `${score.home}-${score.away}` },
        now,
      );
      sides[side] = { outcome: outcome ?? 'draw', reward, ...(rewardReason && { rewardReason }) };
    }

    await tx
      .update(pvpMatches)
      .set({
        status: cancelled ? 'cancelled' : 'finished',
        endReason: reason,
        forfeitUserId: input.forfeit ? uid[input.forfeit] : null,
        homeGoals: score?.home ?? null,
        awayGoals: score?.away ?? null,
        inputLog: input.inputLog,
        finishedAt: now,
      })
      .where(eq(pvpMatches.id, pvpId));
    return { reason, home: score?.home ?? 0, away: score?.away ?? 0, sides };
  });
}

/** Kết quả đã lưu của trận không còn `live` (gọi lần hai). Lý do không lưu riêng nên chỉ dựng lại phần suy ra được. */
async function loadStored(
  tx: Tx,
  pvp: typeof pvpMatches.$inferSelect,
  uid: Record<TeamSide, number>,
): Promise<FinishResult> {
  const rows = await tx
    .select()
    .from(matches)
    .where(and(eq(matches.pvpMatchId, pvp.id), inArray(matches.userId, [uid.home, uid.away])));
  const sides = {} as Record<TeamSide, SideResult>;
  for (const side of ['home', 'away'] as const) {
    const r = rows.find((x) => x.userId === uid[side]);
    if (!r) throw new Error(`Trận PvP ${pvp.id} thiếu dòng matches của ${side}`);
    const rewardReason: PvpRewardReason | undefined =
      pvp.status === 'cancelled'
        ? 'void'
        : pvp.kind === 'friendly'
          ? 'friendly'
          : pvp.forfeitUserId === uid[side]
            ? 'forfeit'
            : undefined;
    sides[side] = {
      outcome: r.outcome ?? 'draw',
      reward: r.reward,
      ...(rewardReason && { rewardReason }),
    };
  }
  return { reason: pvp.endReason!, home: pvp.homeGoals ?? 0, away: pvp.awayGoals ?? 0, sides };
}

/** T020: khi khởi động, mọi trận `live` bị huỷ `server_restart` (đủ hai dòng `matches` expired). */
export async function cancelLiveMatches(
  db: Db,
  now: Date,
  onError: (err: unknown) => void = () => {},
): Promise<number> {
  const live = await db
    .select({ id: pvpMatches.id })
    .from(pvpMatches)
    .where(eq(pvpMatches.status, 'live'));
  for (const { id } of live) {
    // Một dòng hỏng không được chặn server khởi động.
    await finishPvpMatch(db, {
      pvpId: id,
      reason: 'server_restart',
      score: { home: 0, away: 0 },
      inputLog: '',
      now,
    }).catch(onError);
  }
  return live.length;
}
