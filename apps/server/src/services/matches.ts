// Trận vs máy (ARCHITECTURE §4.3 #15–16, §5.2): bắt đầu trận (match token) + nộp kết quả & thưởng.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { and, count, eq, gt } from 'drizzle-orm';
import {
  SquadSlot,
  type Difficulty,
  type MatchResult,
  type StartedMatch,
  type SubmitMatchResultRequest,
} from '@pitch/shared';
import { MATCH_REWARD_DAILY_CAP } from '../config/economy';
import type { Db, Tx } from '../db/client';
import { matches, playerCards, squads, squadSlots } from '../db/schema';
import { buildHomeTeam, generateCpuTeam, type SquadEntry } from '../domain/match-teams';
import { gameDay, judgeMatchResult, matchReward } from '../domain/rewards';
import { cryptoRng, type Rng } from '../domain/rng';
import { AppError } from '../plugins/errors';
import type { CardCatalog } from './cards';
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

const rejected = (message: string) => new AppError('match_token_invalid', 422, message);

/**
 * POST /matches/:id/result (ARCHITECTURE §5.2 bước 3), một transaction: khoá `users` rồi `matches`
 * FOR UPDATE. Trận đã xong + đúng token → trả lại kết quả cũ (client retry, không cộng lần 2). Kiểm
 * token, thời lượng tối thiểu, tỉ số hợp lý; đếm lại trần thưởng theo ngày GMT+7 **lúc nộp**; cộng xu
 * + ledger `match_reward`; `status = finished`. Trận không thuộc người gọi → 404.
 */
export async function submitMatchResult(db: Db, input: SubmitResultInput): Promise<MatchResult> {
  const { userId, matchId, now, token } = input;
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    const [match] = await tx
      .select()
      .from(matches)
      .where(and(eq(matches.id, matchId), eq(matches.userId, userId)))
      .for('update');
    if (!match) throw new AppError('not_found', 404, 'Không tìm thấy trận');
    if (!tokenMatches(token, match.tokenHash)) throw rejected('Match token không hợp lệ');

    if (match.status === 'finished' && match.outcome) {
      return { outcome: match.outcome, reward: match.reward, balance: user.coins, missions: [] };
    }
    if (match.status !== 'started') throw rejected('Trận đã hết hạn');
    if (now.getTime() - match.startedAt.getTime() < input.minDurationSec * 1000) {
      throw rejected('Trận kết thúc quá sớm — kết quả không được ghi nhận');
    }
    const judged = judgeMatchResult(input);
    if (!judged.ok) throw rejected(judged.reason);

    const day = gameDay(now);
    const reward = matchReward(
      match.difficulty,
      judged.outcome,
      await countRewardedMatches(tx, userId, day),
    );
    const balance =
      reward > 0
        ? await applyCoinDelta(tx, userId, reward, 'match_reward', { type: 'match', id: matchId })
        : user.coins;
    await tx
      .update(matches)
      .set({
        status: 'finished',
        finishedAt: now,
        homeGoals: input.homeGoals,
        awayGoals: input.awayGoals,
        outcome: judged.outcome,
        reward,
        rewardDay: day,
      })
      .where(eq(matches.id, matchId));
    return { outcome: judged.outcome, reward, balance, missions: [] };
  });
}
