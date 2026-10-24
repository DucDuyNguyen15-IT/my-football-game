import { sql } from 'drizzle-orm';
import { afterAll } from 'vitest';
import { buildApp } from '../src/app';
import type { Clock } from '../src/clock';
import { createDb, type Db } from '../src/db/client';

/** DB test: `DATABASE_URL_TEST`, mặc định DB `pitch_test` của `docker-compose.dev.yml`. */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgres://pitch:pitch@localhost:5432/pitch_test';

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
export function createTestApp(clock: FakeClock = new FakeClock()) {
  return { app: buildApp({ db: testDb(), clock }), clock };
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
