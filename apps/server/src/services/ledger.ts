// Đối soát sổ cái (PRD §7.4, ARCHITECTURE §3.4): `users.coins` phải bằng tổng `coin_transactions.amount`.
import { sql } from 'drizzle-orm';
import type { Db, Tx } from '../db/client';

export interface LedgerMismatch {
  userId: number;
  username: string;
  /** Số dư đang lưu ở `users.coins`. */
  coins: number;
  /** Tổng `amount` trong sổ cái (0 nếu chưa có dòng nào). */
  ledgerSum: number;
  /** `balance_after` của dòng sổ cái mới nhất; `null` nếu chưa có dòng nào. */
  lastBalanceAfter: number | null;
}

/**
 * Các người chơi có số dư lệch sổ cái: `coins ≠ SUM(amount)`, hoặc `balance_after` của dòng mới nhất
 * khác số dư. Rỗng = sổ cái toàn vẹn. Chỉ đọc, không khoá — chạy lúc đang có giao dịch có thể báo
 * lệch tạm thời ở mức cô lập READ COMMITTED (một câu lệnh = một snapshot nên thực tế nhất quán).
 */
export async function findLedgerMismatches(db: Db | Tx): Promise<LedgerMismatch[]> {
  const res = await db.execute<{
    user_id: string;
    username: string;
    coins: string;
    ledger_sum: string;
    last_balance_after: string | null;
  }>(sql`
    select u.id as user_id, u.username, u.coins,
           coalesce(l.total, 0) as ledger_sum,
           last.balance_after as last_balance_after
    from users u
    left join (
      select user_id, sum(amount) as total from coin_transactions group by user_id
    ) l on l.user_id = u.id
    left join lateral (
      select balance_after from coin_transactions t
      where t.user_id = u.id order by t.id desc limit 1
    ) last on true
    where u.coins <> coalesce(l.total, 0)
       or (last.balance_after is not null and last.balance_after <> u.coins)
    order by u.id
  `);
  return res.rows.map((r) => ({
    userId: Number(r.user_id),
    username: r.username,
    coins: Number(r.coins),
    ledgerSum: Number(r.ledger_sum),
    lastBalanceAfter: r.last_balance_after === null ? null : Number(r.last_balance_after),
  }));
}
