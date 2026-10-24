import { eq, sql } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vitest';
import { resetTestData, testDb } from '../../test/helpers';
import { cards, coinTransactions, playerCards, squads, squadSlots, users } from './schema';

const db = testDb();

/** Lỗi Postgres (pg bọc trong `cause` khi đi qua Drizzle): trả mã SQLSTATE + tên ràng buộc. */
async function pgError(p: Promise<unknown>): Promise<{ code?: string; constraint?: string }> {
  try {
    await p;
  } catch (e) {
    const err = (e as { cause?: unknown }).cause ?? e;
    return err as { code?: string; constraint?: string };
  }
  throw new Error('mong đợi lỗi từ Postgres');
}

async function makeUser(name = 'tester') {
  const [u] = await db
    .insert(users)
    .values({ username: name, passwordHash: 'x' })
    .returning({ id: users.id });
  return u!.id;
}

const CARD = {
  id: 1,
  code: 'FW-0001',
  name: 'Test',
  nickname: 'Thử',
  position: 'FW' as const,
  rarity: 'bronze' as const,
  pace: 50,
  shooting: 50,
  passing: 50,
  dribbling: 50,
  defending: 50,
  stamina: 50,
  reflexes: 10,
  handling: 10,
  positioning: 10,
  kicking: 10,
  ovr: 50,
  avatarSeed: 'a',
};

async function makePlayerCard(userId: number) {
  await db.insert(cards).values(CARD).onConflictDoNothing();
  const [pc] = await db
    .insert(playerCards)
    .values({ userId, cardId: CARD.id, source: 'pack', acquiredAt: new Date() })
    .returning({ id: playerCards.id });
  return pc!.id;
}

beforeEach(async () => {
  await resetTestData(db);
});

describe('ràng buộc schema (ARCHITECTURE §3.2)', () => {
  it('users.coins âm bị CHECK chặn', async () => {
    const err = await pgError(
      db.insert(users).values({ username: 'neg', passwordHash: 'x', coins: -1 }),
    );
    expect(err.code).toBe('23514');
    expect(err.constraint).toBe('users_coins_nonneg');
  });

  it('username trùng khác hoa thường bị UNIQUE (lower) chặn', async () => {
    await makeUser('Alice');
    const err = await pgError(makeUser('aLICE'));
    expect(err.code).toBe('23505');
    expect(err.constraint).toBe('users_username_lower_uq');
  });

  it('coin_transactions append-only: UPDATE và DELETE bị trigger chặn', async () => {
    const userId = await makeUser();
    const [tx] = await db
      .insert(coinTransactions)
      .values({ userId, type: 'admin_adjust', amount: 100, balanceAfter: 100 })
      .returning({ id: coinTransactions.id });
    const upd = await pgError(
      db.update(coinTransactions).set({ amount: 5 }).where(eq(coinTransactions.id, tx!.id)),
    );
    expect(upd.code).toBe('23001');
    const del = await pgError(db.delete(coinTransactions).where(eq(coinTransactions.id, tx!.id)));
    expect(del.code).toBe('23001');
    const rows = await db.select().from(coinTransactions);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amount).toBe(100);
  });

  it('coin_transactions.amount = 0 bị CHECK chặn', async () => {
    const userId = await makeUser();
    const err = await pgError(
      db
        .insert(coinTransactions)
        .values({ userId, type: 'admin_adjust', amount: 0, balanceAfter: 0 }),
    );
    expect(err.constraint).toBe('coin_transactions_amount_nonzero');
  });

  it('squad_slots: một thẻ ở hai ô bị UNIQUE chặn; ô ngoài danh sách bị CHECK chặn', async () => {
    const userId = await makeUser();
    const pc = await makePlayerCard(userId);
    await db.insert(squads).values({ userId, updatedAt: new Date() });
    await db.insert(squadSlots).values({ userId, slot: 'P1', playerCardId: pc });
    const dup = await pgError(
      db.insert(squadSlots).values({ userId, slot: 'P2', playerCardId: pc }),
    );
    expect(dup.code).toBe('23505');
    expect(dup.constraint).toBe('squad_slots_player_card_uq');
    const pc2 = await makePlayerCard(userId);
    const bad = await pgError(
      db.insert(squadSlots).values({ userId, slot: 'P7', playerCardId: pc2 }),
    );
    expect(bad.constraint).toBe('squad_slots_slot');
  });

  it('xoá player_cards đang trong squad_slots bị FK RESTRICT chặn', async () => {
    const userId = await makeUser();
    const pc = await makePlayerCard(userId);
    await db.insert(squads).values({ userId, updatedAt: new Date() });
    await db.insert(squadSlots).values({ userId, slot: 'GK', playerCardId: pc });
    const err = await pgError(db.delete(playerCards).where(eq(playerCards.id, pc)));
    expect(err.code).toBe('23503');
    expect(err.constraint).toBe('squad_slots_player_card_id_player_cards_id_fk');
    const [{ n }] = (
      await db.execute<{ n: number }>(sql`select count(*)::int as n from player_cards`)
    ).rows as [{ n: number }];
    expect(n).toBe(1);
  });

  it('player_cards.level ngoài 0…5 bị CHECK chặn', async () => {
    const userId = await makeUser();
    await db.insert(cards).values(CARD);
    const err = await pgError(
      db
        .insert(playerCards)
        .values({ userId, cardId: CARD.id, source: 'pack', acquiredAt: new Date(), level: 6 }),
    );
    expect(err.constraint).toBe('player_cards_level_range');
  });
});
