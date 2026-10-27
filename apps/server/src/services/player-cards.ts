// Kho thẻ (ARCHITECTURE §4.3 #7–8): liệt kê và bán cho hệ thống (PRD §6.6, F11).
import { and, asc, eq, inArray } from 'drizzle-orm';
import {
  computeOvr,
  effectiveStats,
  FORMATIONS,
  type Card,
  type PlayerCard,
  type PlayerCardSort,
  type Position,
  type Rarity,
  type SellCardsResult,
} from '@pitch/shared';
import { CARD_SALE_PRICE } from '../config/economy';
import type { Db } from '../db/client';
import { playerCards, squads, squadSlots } from '../db/schema';
import { AppError } from '../plugins/errors';
import type { CardCatalog } from './cards';
import { applyCoinDelta, lockUser } from './wallet';

export interface ListPlayerCardsInput {
  userId: number;
  position?: Position;
  rarity?: Rarity;
  sort: PlayerCardSort;
}

function catalogCard(catalog: CardCatalog, cardId: number): Card {
  const card = catalog.byId.get(String(cardId));
  if (!card) throw new Error(`Thẻ mẫu ${cardId} không có trong danh mục`);
  return card;
}

/** GET /player-cards: thẻ của người chơi kèm `inSquad` và chỉ số hiệu lực (phạt sai vị trí nếu đá chính). */
export async function listPlayerCards(
  db: Db,
  catalog: CardCatalog,
  { userId, position, rarity, sort }: ListPlayerCardsInput,
): Promise<PlayerCard[]> {
  const [rows, [squad]] = await Promise.all([
    db
      .select({
        id: playerCards.id,
        cardId: playerCards.cardId,
        level: playerCards.level,
        luck: playerCards.luck,
        acquiredAt: playerCards.acquiredAt,
        slot: squadSlots.slot,
      })
      .from(playerCards)
      .leftJoin(squadSlots, eq(squadSlots.playerCardId, playerCards.id))
      .where(eq(playerCards.userId, userId))
      .orderBy(asc(playerCards.id)),
    db.select({ formation: squads.formation }).from(squads).where(eq(squads.userId, userId)),
  ]);
  const roles: Readonly<Record<string, Position>> = squad ? FORMATIONS[squad.formation] : {};

  const items = rows
    .map((row) => {
      const card = catalogCard(catalog, row.cardId);
      const stats = effectiveStats(card, row.level, row.slot ? roles[row.slot] : undefined);
      return { row, card, stats, ovr: computeOvr(card.position, stats) };
    })
    .filter(
      ({ card }) =>
        (!position || card.position === position) && (!rarity || card.rarity === rarity),
    );

  const dir = sort.startsWith('-') ? -1 : 1;
  const key = sort.replace('-', '');
  items.sort((a, b) => {
    const diff =
      key === 'ovr' ? a.ovr - b.ovr : a.row.acquiredAt.getTime() - b.row.acquiredAt.getTime();
    // Cùng giá trị → theo id (thẻ mở trong một gói có cùng `acquired_at`).
    return dir * (diff || a.row.id - b.row.id);
  });

  return items.map(({ row, stats }) => ({
    id: String(row.id),
    cardId: String(row.cardId),
    level: row.level,
    luck: row.luck,
    inSquad: row.slot !== null,
    effectiveStats: stats,
  }));
}

/**
 * POST /player-cards/sell (ARCHITECTURE §3.4): một transaction, khoá `users` rồi `player_cards` theo
 * id tăng dần. Thiếu bất kỳ thẻ nào (không tồn tại/không phải của mình/đã bán) → 404; có thẻ trong
 * đội hình → 409 `card_in_squad`. Không lỗi nào để lại thay đổi. Mỗi thẻ một dòng sổ cái `card_sale`.
 */
export async function sellPlayerCards(
  db: Db,
  catalog: CardCatalog,
  userId: number,
  playerCardIds: readonly number[],
): Promise<SellCardsResult> {
  const ids = [...new Set(playerCardIds)].sort((a, b) => a - b);
  return db.transaction(async (tx) => {
    const user = await lockUser(tx, userId);
    const owned = await tx
      .select({ id: playerCards.id, cardId: playerCards.cardId })
      .from(playerCards)
      .where(and(eq(playerCards.userId, userId), inArray(playerCards.id, ids)))
      .orderBy(asc(playerCards.id))
      .for('update');
    if (owned.length !== ids.length) throw new AppError('not_found', 404, 'Không tìm thấy thẻ');

    const inSquad = await tx
      .select({ id: squadSlots.playerCardId })
      .from(squadSlots)
      .where(inArray(squadSlots.playerCardId, ids))
      .limit(1);
    if (inSquad.length > 0) {
      throw new AppError('card_in_squad', 409, 'Không bán được thẻ đang trong đội hình');
    }

    await tx.delete(playerCards).where(inArray(playerCards.id, ids));
    let balance = user.coins;
    let coinsGained = 0;
    for (const pc of owned) {
      const price = CARD_SALE_PRICE[catalogCard(catalog, pc.cardId).rarity];
      balance = await applyCoinDelta(tx, userId, price, 'card_sale', {
        type: 'player_card',
        id: pc.id,
      });
      coinsGained += price;
    }
    return { coinsGained, balance };
  });
}
