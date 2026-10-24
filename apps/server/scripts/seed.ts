// pnpm --filter @pitch/server db:seed — nạp dữ liệu tĩnh (danh mục thẻ) vào DATABASE_URL.
import { loadEnv } from '../src/config/env';
import { createDb } from '../src/db/client';
import { seedCards } from '../src/db/seed';

const env = loadEnv();
const { db, pool } = createDb(env.databaseUrl);
try {
  const n = await seedCards(db);
  console.log(n > 0 ? `Đã nạp ${n} thẻ.` : 'Chưa có src/db/seed/cards.json (task 6.2) — bỏ qua.');
} finally {
  await pool.end();
}
