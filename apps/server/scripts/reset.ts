// pnpm --filter @pitch/server db:reset — CHỈ DEV: xoá sạch DB rồi migrate + seed lại.
import { sql } from 'drizzle-orm';
import { loadEnv } from '../src/config/env';
import { createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { seedCards } from '../src/db/seed';

const env = loadEnv();
if (env.nodeEnv === 'production') {
  console.error('db:reset bị chặn ở production.');
  process.exit(1);
}
const { db, pool } = createDb(env.databaseUrl);
try {
  await db.execute(sql`drop schema if exists drizzle cascade`);
  await db.execute(sql`drop schema public cascade`);
  await db.execute(sql`create schema public`);
} finally {
  await pool.end();
}
await runMigrations(env.databaseUrl);
const seeded = createDb(env.databaseUrl);
try {
  console.log(`Đã reset DB, nạp ${await seedCards(seeded.db)} thẻ.`);
} finally {
  await seeded.pool.end();
}
