// Trận vs máy (ARCHITECTURE §4.3 #15–16, §5.2): bắt đầu trận (match token) + nộp kết quả & thưởng.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, count, eq, gt } from 'drizzle-orm';
import { buildMatchSetup, TICK_RATE, type MatchSetup } from '@pitch/sim';
import {
  SquadSlot,
  type Difficulty,
  type MatchTeamSetup,
  type MatchResult,
  type StartedMatch,
  type SubmitMatchResultRequest,
} from '@pitch/shared';
import { MATCH_MAX_AGE_SEC, MATCH_REWARD_DAILY_CAP } from '../config/economy';
import type { Db, Tx } from '../db/client';
import { matches, playerCards, squads, squadSlots } from '../db/schema';
import { buildHomeTeam, generateCpuTeam, type SquadEntry } from '../domain/match-teams';
import { gameDay, judgeMatchResult, matchReward } from '../domain/rewards';
import { cryptoRng, type Rng } from '../domain/rng';
import { AppError } from '../plugins/errors';
import type { CardCatalog } from './cards';
import { track } from './analytics';
import type { ReplayRunner } from './replay';
import { applyMissionEvent, ensureTodayMissions } from './missions';
import { applyCoinDelta, lockUser } from './wallet';

/** Seed của sim là uint32 (`seedRng` trong `@pitch/sim`). */
const SEED_RANGE = 2 ** 32;

/** SHA-256 (hex) của match token — DB chỉ lưu hash, token chỉ trả cho client một lần. */
export function hashMatchToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/** So hash token với hash đã lưu, thời gian hằng định. */
function tokenMatches(token: string, storedHash: string): boolean {
  const a = Buffer.from(hashMatchToken(token), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Số trận đã nhận thưởng (> 0 xu) của người chơi trong ngày GMT+7 `day` (`YYYY-MM-DD`). */
export async function countRewardedMatches(
  db: Db | Tx,
  userId: number,
  day: string,
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(matches)
    .where(and(eq(matches.userId, userId), eq(matches.rewardDay, day), gt(matches.reward, 0)));
  return row?.n ?? 0;
}

/**
 * POST /matches: khoá `users` (mọi thay đổi đội hình cũng khoá `users` trước nên đọc đội hình ở đây
 * nhất quán); đội hình thiếu người đá chính → 422 `invalid_squad` nêu rõ ô thiếu; dựng đội nhà,
 * sinh đội máy + seed + token, lưu `matches` (`started`). `reward_eligible` = còn dưới trần trận có
 * thưởng của ngày GMT+7 hiện tại (chỉ để UI báo trước; thưởng thật đếm lại lúc nộp).
 */
export async function startMatch(
  db: Db,
  catalog: CardCatalog,
  userId: number,
  difficulty: Difficulty,
  now: Date,
  rng: Rng = cryptoRng,
): Promise<StartedMatch> {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    // Mỗi người chỉ một trận đang đá: bắt đầu trận mới thì huỷ mọi trận `started` trước đó (kể cả chưa
    // quá hạn) — không mở sẵn 15 trận rồi nộp cùng lúc sau 6 phút (B3-02).
    await tx
      .update(matches)
      .set({ status: 'expired' })
      .where(and(eq(matches.userId, userId), eq(matches.status, 'started')));
    const [squad] = await tx
      .select({ formation: squads.formation })
      .from(squads)
      .where(eq(squads.userId, userId));
    if (!squad) throw new Error(`Người chơi ${userId} không có đội hình`);
    const rows = await tx
      .select({ slot: squadSlots.slot, cardId: playerCards.cardId, level: playerCards.level })
      .from(squadSlots)
      .innerJoin(playerCards, eq(playerCards.id, squadSlots.playerCardId))
      .where(eq(squadSlots.userId, userId));
    const slots: Partial<Record<SquadSlot, SquadEntry>> = {};
    for (const row of rows) {
      const card = catalog.byId.get(String(row.cardId));
      if (!card) throw new Error(`Thẻ mẫu ${row.cardId} không có trong danh mục`);
      slots[SquadSlot.parse(row.slot)] = { card, level: row.level };
    }

    // Đội hình lưu trước luật 16/11 có thể đặt cầu thủ ngoài sân ở ô GK.
    if (slots.GK && slots.GK.card.position !== 'GK') {
      throw new AppError('invalid_squad', 422, 'Ô GK phải là thẻ thủ môn — sửa đội hình trước', [
        { field: 'slots.GK', message: 'Ô GK phải là thẻ thủ môn' },
      ]);
    }
    const home = buildHomeTeam(squad.formation, slots);
    if (!home.ok) {
      const missing = home.missing;
      const what = missing.includes('GK') ? 'thủ môn' : `${missing.length} người đá chính`;
      throw new AppError(
        'invalid_squad',
        422,
        `Đội hình thiếu ${what} — cần đủ 7 người đá chính (ô trống: ${missing.join(', ')})`,
        missing.map((slot) => ({ field: `slots.${slot}`, message: 'Ô đá chính đang trống' })),
      );
    }
    const away = generateCpuTeam(catalog.all, difficulty, rng);
    const seed = rng(SEED_RANGE);
    const token = randomBytes(32).toString('base64url');
    const rewardEligible =
      (await countRewardedMatches(tx, userId, gameDay(now))) < MATCH_REWARD_DAILY_CAP;

    const [match] = await tx
      .insert(matches)
      .values({
        userId,
        tokenHash: hashMatchToken(token),
        difficulty,
        seed,
        squadSnapshot: { formation: squad.formation, home: home.team, away },
        rewardEligible,
        startedAt: now,
      })
      .returning({ id: matches.id });
    await track(tx, userId, 'match_start', { matchId: match!.id, difficulty, rewardEligible }, now);
    return { matchId: String(match!.id), token, seed, rewardEligible, home: home.team, away };
  });
}

export interface SubmitResultInput extends SubmitMatchResultRequest {
  userId: number;
  matchId: number;
  now: Date;
  /** Thời gian tối thiểu từ lúc phát token tới lúc nộp (giây). */
  minDurationSec: number;
}

/** Tham số chạy lại trận: runner (worker thread) + tham số dev chỉ có ở test/E2E, không phải client gửi. */
export interface ReplayOptions {
  run: ReplayRunner;
  dev?: { halfLengthSec?: number | undefined; autopilot?: boolean | undefined };
}

/** Dung sai lệch giờ: tick của log không được nhiều hơn thời gian thực đã trôi từ lúc phát token. */
const REPLAY_CLOCK_SLACK_MS = 5000;

const rejected = (message: string) => new AppError('match_token_invalid', 422, message);

type MatchRow = typeof matches.$inferSelect;
type Precheck = { done: MatchResult } | { match: MatchRow; elapsedMs: number };

/**
 * Kiểm token/trạng thái/hạn/thời lượng với `matches` khoá FOR UPDATE. Trận đã xong + đúng token →
 * trả kết quả cũ (client retry, không cộng lần 2). Gọi hai lần: trước replay (bỏ nhanh nộp sai) và
 * trong transaction cộng thưởng (trạng thái có thể đã đổi trong lúc replay).
 */
async function precheck(tx: Tx, input: SubmitResultInput): Promise<Precheck & { coins: number }> {
  const { userId, matchId, now, token } = input;
  const user = await lockUser(tx, userId);
  const [match] = await tx
    .select()
    .from(matches)
    .where(and(eq(matches.id, matchId), eq(matches.userId, userId)))
    .for('update');
  if (!match) throw new AppError('not_found', 404, 'Không tìm thấy trận');
  if (!tokenMatches(token, match.tokenHash)) throw rejected('Match token không hợp lệ');

  if (match.status === 'finished' && match.outcome) {
    // Nộp lại sau nửa đêm: trả nhiệm vụ của hôm nay, không phải ngày đá trận (B3-07).
    const missions = await ensureTodayMissions(tx, userId, gameDay(now));
    return {
      done: { outcome: match.outcome, reward: match.reward, balance: user.coins, missions },
      coins: user.coins,
    };
  }
  if (match.status !== 'started') throw rejected('Trận đã hết hạn');
  const elapsedMs = now.getTime() - match.startedAt.getTime();
  if (elapsedMs > MATCH_MAX_AGE_SEC * 1000) throw rejected('Trận đã hết hạn');
  if (elapsedMs < input.minDurationSec * 1000) {
    throw rejected('Trận kết thúc quá sớm — kết quả không được ghi nhận');
  }
  return { match, elapsedMs, coins: user.coins };
}

/** Dựng lại `MatchSetup` từ dòng `matches` bằng cùng hàm với web; `dev` chỉ do cấu hình server (test/E2E). */
function setupFromRow(match: MatchRow, dev: ReplayOptions['dev']): MatchSetup {
  const snap = match.squadSnapshot as { home: MatchTeamSetup; away: MatchTeamSetup };
  return buildMatchSetup(
    { seed: match.seed, difficulty: match.difficulty, home: snap.home, away: snap.away },
    dev,
  );
}

/**
 * POST /matches/:id/result (ARCHITECTURE §5.2 bước 3, SEC-07): tỉ số do SERVER tính bằng cách chạy lại
 * sim từ seed + đội đã lưu + `inputLog` (worker thread, ngoài mọi transaction); số client báo chỉ để
 * đối chiếu — lệch, log hỏng hoặc trận chưa tới `full_time` → 422 `match_token_invalid` + analytics
 * `match_replay_mismatch`. Thứ tự: (1) kiểm token/hạn/thời lượng; (2) replay; (3) transaction khoá
 * `users` rồi `matches`, kiểm lại trạng thái, đếm lại trần thưởng ngày GMT+7 **lúc nộp**, cộng xu +
 * ledger `match_reward`, `status = finished`. Trận không thuộc người gọi → 404.
 */
export async function submitMatchResult(
  db: Db,
  input: SubmitResultInput,
  replay: ReplayOptions,
): Promise<MatchResult> {
  const { userId, matchId, now } = input;
  const pre = await db.transaction((tx) => precheck(tx, input));
  if ('done' in pre) return pre.done;

  const outcome = await replay.run(setupFromRow(pre.match, replay.dev), input.inputLog);
  if (!outcome.ok && outcome.reason === 'failed') {
    throw new AppError('internal_error', 503, 'Chưa kiểm tra được trận, thử lại sau');
  }
  const mismatch = async (why: string): Promise<never> => {
    await track(db, userId, 'match_replay_mismatch', { matchId, why }, now);
    throw rejected('Kết quả không khớp với diễn biến trận — không được ghi nhận');
  };
  if (!outcome.ok) return mismatch(outcome.message);
  const r = outcome.result;
  if (r.phase !== 'full_time') return mismatch('Log chưa tới hết trận');
  if (
    r.score.home !== input.homeGoals ||
    r.score.away !== input.awayGoals ||
    r.shootout?.home !== input.shootout?.home ||
    r.shootout?.away !== input.shootout?.away
  ) {
    return mismatch(
      `Tỉ số báo ${input.homeGoals}-${input.awayGoals} khác replay ${r.score.home}-${r.score.away}`,
    );
  }
  // Tạm dừng chỉ làm trận ngắn đi so với giờ thực, không bao giờ dài hơn.
  if ((r.ticks / TICK_RATE) * 1000 > pre.elapsedMs + REPLAY_CLOCK_SLACK_MS) {
    throw rejected('Trận kết thúc quá sớm — kết quả không được ghi nhận');
  }
  const judged = judgeMatchResult({
    homeGoals: r.score.home,
    awayGoals: r.score.away,
    shootout: r.shootout,
  });
  if (!judged.ok) throw rejected(judged.reason);

  return db.transaction(async (tx) => {
    const again = await precheck(tx, input);
    if ('done' in again) return again.done;
    const day = gameDay(now);
    const reward = matchReward(
      again.match.difficulty,
      judged.outcome,
      await countRewardedMatches(tx, userId, day),
    );
    const balance =
      reward > 0
        ? await applyCoinDelta(tx, userId, reward, 'match_reward', { type: 'match', id: matchId })
        : again.coins;
    await tx
      .update(matches)
      .set({
        status: 'finished',
        finishedAt: now,
        homeGoals: r.score.home,
        awayGoals: r.score.away,
        outcome: judged.outcome,
        reward,
        rewardDay: day,
      })
      .where(eq(matches.id, matchId));
    const missions = await applyMissionEvent(tx, userId, day, {
      type: 'match_finished',
      difficulty: again.match.difficulty,
      outcome: judged.outcome,
      homeGoals: r.score.home,
      awayGoals: r.score.away,
    });
    await track(
      tx,
      userId,
      'match_end',
      {
        matchId,
        difficulty: again.match.difficulty,
        outcome: judged.outcome,
        homeGoals: r.score.home,
        awayGoals: r.score.away,
        reward,
      },
      now,
    );
    return { outcome: judged.outcome, reward, balance, missions };
  });
}
