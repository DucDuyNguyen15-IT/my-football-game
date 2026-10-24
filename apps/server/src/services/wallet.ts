import { and, eq, sql } from 'drizzle-orm';
import type { Tx } from '../db/client';
import { coinTransactions, coinTxTypeEnum, users } from '../db/schema';
import { AppError } from '../plugins/errors';
import type { UserRow } from './auth';

export type CoinTxType = (typeof coinTxTypeEnum.enumValues)[number];
export type CoinRef = {
  type: 'match' | 'pack_opening' | 'card_upgrade' | 'player_card';
  id: number;
};

/**
 * Bước đầu của mọi thao tác ghi dữ liệu người chơi (ARCHITECTURE §3.4): `SELECT … FOR UPDATE` dòng
 * `users`, tuần tự hoá mọi giao dịch của cùng người chơi.
 */
export async function lockUser(tx: Tx, userId: number): Promise<UserRow> {
  const [user] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
  if (!user) throw new AppError('unauthenticated', 401, 'Tài khoản không còn tồn tại');
  return user;
}

/**
 * Cộng/trừ xu + ghi một dòng sổ cái với `balance_after`. Yêu cầu người gọi **đã khoá** `users`
 * (`lockUser`) trong cùng `tx`. Số dư sẽ âm → 409 `insufficient_coins`, không ghi gì.
 * Trả về số dư mới.
 */
export async function applyCoinDelta(
  tx: Tx,
  userId: number,
  amount: number,
  type: CoinTxType,
  ref: CoinRef | null,
): Promise<number> {
  if (!Number.isInteger(amount) || amount === 0) {
    throw new Error(`applyCoinDelta: amount phải là số nguyên khác 0 (nhận ${amount})`);
  }
  const [row] = await tx
    .update(users)
    .set({ coins: sql`${users.coins} + ${amount}` })
    .where(and(eq(users.id, userId), sql`${users.coins} + ${amount} >= 0`))
    .returning({ coins: users.coins });
  if (!row) throw new AppError('insufficient_coins', 409, 'Không đủ xu');
  await tx.insert(coinTransactions).values({
    userId,
    type,
    amount,
    balanceAfter: row.coins,
    refType: ref?.type ?? null,
    refId: ref?.id ?? null,
  });
  return row.coins;
}
