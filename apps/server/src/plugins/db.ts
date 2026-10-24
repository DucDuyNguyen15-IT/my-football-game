import type { FastifyInstance } from 'fastify';
import { sql } from 'drizzle-orm';
import { createDb, type Db } from '../db/client';

declare module 'fastify' {
  interface FastifyInstance {
    db: Db;
  }
}

/**
 * Gắn `app.db`. Truyền sẵn `db` (test dùng chung một pool) thì không đóng khi app đóng; truyền `url`
 * thì plugin tự tạo pool và đóng nó ở `onClose`.
 */
export function registerDb(app: FastifyInstance, opts: { db: Db } | { url: string }): void {
  if ('db' in opts) {
    app.decorate('db', opts.db);
    return;
  }
  const { db, pool } = createDb(opts.url);
  app.decorate('db', db);
  app.addHook('onClose', async () => {
    await pool.end();
  });
}

/** Kiểm kết nối DB (dùng cho /health). */
export async function pingDb(db: Db): Promise<void> {
  await db.execute(sql`select 1`);
}
