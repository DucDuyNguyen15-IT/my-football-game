// Đội hình (ARCHITECTURE §4.3 #13–14, PRD §6.4): đọc và thay toàn bộ trong một transaction.
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  evaluateSquad,
  SquadSlot,
  type Formation,
  type PutSquadRequest,
  type Squad,
  type SquadMember,
} from '@pitch/shared';
import type { Db, Tx } from '../db/client';
import { playerCards, squads, squadSlots } from '../db/schema';
import { AppError } from '../plugins/errors';
import type { CardCatalog } from './cards';
import { lockUser } from './wallet';

async function readSquad(db: Db | Tx, catalog: CardCatalog, userId: number): Promise<Squad> {
  const [squad] = await db
    .select({ formation: squads.formation })
    .from(squads)
    .where(eq(squads.userId, userId));
  if (!squad) throw new Error(`Người chơi ${userId} không có đội hình`);
  const rows = await db
    .select({
      slot: squadSlots.slot,
      id: playerCards.id,
      cardId: playerCards.cardId,
      level: playerCards.level,
    })
    .from(squadSlots)
    .innerJoin(playerCards, eq(playerCards.id, squadSlots.playerCardId))
    .where(eq(squadSlots.userId, userId));
  return buildSquad(squad.formation, catalog, rows);
}

function buildSquad(
  formation: Formation,
  catalog: CardCatalog,
  rows: { slot: string; id: number; cardId: number; level: number }[],
): Squad {
  const slots = Object.fromEntries(SquadSlot.options.map((s) => [s, null])) as Squad['slots'];
  const members: Partial<Record<SquadSlot, SquadMember>> = {};
  for (const row of rows) {
    const slot = SquadSlot.parse(row.slot);
    const card = catalog.byId.get(String(row.cardId));
    if (!card) throw new Error(`Thẻ mẫu ${row.cardId} không có trong danh mục`);
    slots[slot] = String(row.id);
    members[slot] = {
      id: String(row.id),
      position: card.position,
      stats: card.stats,
      level: row.level,
    };
  }
  const { teamRating, warnings } = evaluateSquad(formation, members);
  return { formation, slots, teamRating, warnings };
}

/** GET /squad. */
export function getSquad(db: Db, catalog: CardCatalog, userId: number): Promise<Squad> {
  return readSquad(db, catalog, userId);
}

/**
 * PUT /squad: khoá theo thứ tự `users` → `player_cards` (id tăng dần) → `squads`
 * (ARCHITECTURE §3.4); thẻ không phải của mình → 404, một thẻ ở hai ô → 422 `invalid_squad`;
 * ô GK không phải thẻ thủ môn → 422 `invalid_squad`; xoá-chèn lại `squad_slots`. Thiếu người chỉ
 * là cảnh báo.
 */
export async function putSquad(
  db: Db,
  catalog: CardCatalog,
  userId: number,
  { formation, slots }: PutSquadRequest,
  now: Date,
): Promise<Squad> {
  const entries = SquadSlot.options.flatMap((slot) => {
    const id = slots[slot];
    return id ? [{ slot, playerCardId: Number(id) }] : [];
  });
  const ids = entries.map((e) => e.playerCardId);
  // Id ngoài phạm vi số nguyên an toàn không thể là thẻ có thật (và làm Postgres báo lỗi kiểu).
  if (!ids.every(Number.isSafeInteger)) throw new AppError('not_found', 404, 'Không tìm thấy thẻ');
  if (new Set(ids).size !== ids.length) {
    throw new AppError('invalid_squad', 422, 'Một thẻ chỉ được ở một ô');
  }
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);
    if (ids.length > 0) {
      const owned = await tx
        .select({ id: playerCards.id })
        .from(playerCards)
        .where(and(eq(playerCards.userId, userId), inArray(playerCards.id, ids)))
        .orderBy(asc(playerCards.id))
        .for('update');
      if (owned.length !== ids.length) throw new AppError('not_found', 404, 'Không tìm thấy thẻ');
    }
    await tx.select().from(squads).where(eq(squads.userId, userId)).for('update');
    await tx.delete(squadSlots).where(eq(squadSlots.userId, userId));
    if (entries.length > 0) {
      await tx.insert(squadSlots).values(entries.map((e) => ({ userId, ...e })));
    }
    await tx.update(squads).set({ formation, updatedAt: now }).where(eq(squads.userId, userId));
    const squad = await readSquad(tx, catalog, userId);
    // Ném lỗi trong transaction → huỷ toàn bộ thay đổi.
    if (squad.warnings.some((w) => w.code === 'gk_not_keeper')) {
      throw new AppError('invalid_squad', 422, 'Ô GK phải là thẻ thủ môn', [
        { field: 'slots.GK', message: 'Ô GK phải là thẻ thủ môn' },
      ]);
    }
    return squad;
  });
}
