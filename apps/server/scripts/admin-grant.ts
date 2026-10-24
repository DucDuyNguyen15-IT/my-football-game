// pnpm --filter @pitch/server admin:grant <username> — bật quyền admin (không có API cấp quyền).
import { eq, sql } from 'drizzle-orm';
import { loadEnv } from '../src/config/env';
import { createDb } from '../src/db/client';
import { users } from '../src/db/schema';

const username = process.argv[2];
if (!username) {
  console.error('Cách dùng: admin:grant <username>');
  process.exit(1);
}
const { db, pool } = createDb(loadEnv().databaseUrl);
try {
  const rows = await db
    .update(users)
    .set({ isAdmin: true })
    .where(eq(sql`lower(${users.username})`, username.toLowerCase()))
    .returning({ id: users.id, username: users.username });
  if (rows.length === 0) {
    console.error(`Không có người dùng "${username}".`);
    process.exitCode = 1;
  } else {
    console.log(`Đã cấp quyền admin cho ${rows[0]!.username} (id ${rows[0]!.id}).`);
  }
} finally {
  await pool.end();
}
