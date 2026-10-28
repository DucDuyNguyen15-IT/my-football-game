import { sql } from 'drizzle-orm';
import { afterAll } from 'vitest';
import { buildApp, type BuildAppOptions } from '../src/app';
import type { Clock } from '../src/clock';
import { createDb, type Db } from '../src/db/client';
import { TEST_DATABASE_URL } from './db-url';
import { users } from '../src/db/schema';
import { hashPassword } from '../src/services/auth';

export { TEST_DATABASE_URL };

/** Đồng hồ giả cho test: đứng yên tới khi `set`/`advance`. */
export class FakeClock implements Clock {
  private t: number;
  constructor(start: Date | string = '2026-01-01T00:00:00Z') {
    this.t = new Date(start).getTime();
  }
  now(): Date {
    return new Date(this.t);
  }
  set(at: Date | string): void {
    this.t = new Date(at).getTime();
  }
  advance(ms: number): void {
    this.t += ms;
  }
}

let shared: { db: Db; end: () => Promise<void> } | null = null;

/** Một pool cho cả file test, tự đóng ở `afterAll`. */
export function testDb(): Db {
  if (!shared) {
    const { db, pool } = createDb(TEST_DATABASE_URL);
    shared = { db, end: () => pool.end() };
    afterAll(async () => {
      await shared?.end();
      shared = null;
    });
  }
  return shared.db;
}

/** App nối DB test + đồng hồ giả. Nhớ `await app.close()` (không đóng pool dùng chung). */
export function createTestApp(
  clock: FakeClock = new FakeClock(),
  opts: Pick<BuildAppOptions, 'enableDevRoutes' | 'rng'> = {},
) {
  return { app: buildApp({ ...opts, db: testDb(), clock }), clock };
}

/** Xoá sạch dữ liệu mọi bảng `public` của DB test (giữ schema), dùng giữa các file test. */
export async function resetTestData(db: Db): Promise<void> {
  const rows = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  if (rows.rows.length === 0) return;
  const names = rows.rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await db.execute(sql.raw(`truncate ${names} restart identity cascade`));
}

/** Tạo user trực tiếp trong DB (trước khi có /auth/register). */
export async function createUser(
  db: Db,
  username = 'tester',
  password = 'mat-khau-1',
): Promise<typeof users.$inferSelect> {
  const [user] = await db
    .insert(users)
    .values({ username, passwordHash: await hashPassword(password) })
    .returning();
  return user!;
}
