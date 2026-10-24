import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export type Db = NodePgDatabase;
/** Handle bên trong `db.transaction(async (tx) => …)`. */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * Pool Postgres + Drizzle. Người tạo chịu trách nhiệm `pool.end()`. Timeout theo ARCHITECTURE §3.4:
 * câu lệnh 10 s, giao dịch bỏ ngỏ 30 s.
 */
export function createDb(url: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString: url,
    max: 10,
    statement_timeout: 10_000,
    idle_in_transaction_session_timeout: 30_000,
  });
  return { db: drizzle(pool), pool };
}
