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

export interface MissionRewardMismatch {
  userId: number;
  /** Số dòng / tổng xu `mission_reward` trong sổ cái. */
  ledgerCount: number;
  ledgerSum: number;
  /** Số nhiệm vụ đã nhận / tổng thưởng theo `daily_missions`. */
  claimedCount: number;
  claimedSum: number;
}

/**
 * Thưởng nhiệm vụ trong sổ cái phải khớp đúng các nhiệm vụ đã nhận (B3-05): dòng `mission_reward`
 * không có ref (khoá `daily_missions` là khoá ghép) nên so số dòng và tổng xu theo từng người chơi —
 * nhận thưởng hai lần sẽ lệch dù `coins` vẫn khớp sổ cái.
 */
export async function findMissionRewardMismatches(db: Db | Tx): Promise<MissionRewardMismatch[]> {
  const res = await db.execute<{
    user_id: string;
    ledger_count: string;
    ledger_sum: string;
    claimed_count: string;
    claimed_sum: string;
  }>(sql`
    select coalesce(l.user_id, d.user_id) as user_id,
           coalesce(l.n, 0) as ledger_count, coalesce(l.total, 0) as ledger_sum,
           coalesce(d.n, 0) as claimed_count, coalesce(d.total, 0) as claimed_sum
    from (
      select user_id, count(*) as n, sum(amount) as total from coin_transactions
      where type = 'mission_reward' group by user_id
    ) l
    full join (
      select user_id, count(*) as n, sum(reward) as total from daily_missions
      where claimed_at is not null group by user_id
    ) d on d.user_id = l.user_id
    where coalesce(l.n, 0) <> coalesce(d.n, 0) or coalesce(l.total, 0) <> coalesce(d.total, 0)
    order by 1
  `);
  return res.rows.map((r) => ({
    userId: Number(r.user_id),
    ledgerCount: Number(r.ledger_count),
    ledgerSum: Number(r.ledger_sum),
    claimedCount: Number(r.claimed_count),
    claimedSum: Number(r.claimed_sum),
  }));
}
