// Trận vs máy (ARCHITECTURE §4.3 #15, §5.2). Nộp kết quả + thưởng làm ở task 7.2.
import { createHash, randomBytes } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { SquadSlot, type Difficulty, type StartedMatch } from '@pitch/shared';
import type { Db } from '../db/client';
import { matches, playerCards, squads, squadSlots } from '../db/schema';
import { buildHomeTeam, generateCpuTeam, type SquadEntry } from '../domain/match-teams';
import { cryptoRng, type Rng } from '../domain/rng';
import { AppError } from '../plugins/errors';
import type { CardCatalog } from './cards';
import { lockUser } from './wallet';

/** Seed của sim là uint32 (`seedRng` trong `@pitch/sim`). */
const SEED_RANGE = 2 ** 32;

/** SHA-256 (hex) của match token — DB chỉ lưu hash, token chỉ trả cho client một lần. */
export function hashMatchToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * POST /matches: khoá `users` (mọi thay đổi đội hình cũng khoá `users` trước nên đọc đội hình ở đây
 * nhất quán); đội hình thiếu người đá chính → 422 `invalid_squad` nêu rõ ô thiếu; dựng đội nhà,
 * sinh đội máy + seed + token, lưu `matches` (`started`). `reward_eligible` tạm `false` tới 7.2.
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
    const rewardEligible = false;

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
