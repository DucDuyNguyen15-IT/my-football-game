import { sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { afterAll } from 'vitest';
import { buildApp, type BuildAppOptions } from '../src/app';
import type { Clock } from '../src/clock';
import { createDb, type Db } from '../src/db/client';
import { TEST_DATABASE_URL } from './db-url';
import { users } from '../src/db/schema';
import { hashPassword } from '../src/services/auth';
import type { ReplayRunner } from '../src/services/replay';

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

/**
 * App nối DB test + đồng hồ giả. Nhớ `await app.close()` (không đóng pool dùng chung). Tắt rate limit
 * mặc định (mọi `inject` cùng IP) — test rate limit tự bật bằng `opts.rateLimit`.
 */
/**
 * Log "giả" cho test kinh tế/tamper (không quan tâm sim): `t_<nhà>_<khách>[_<luân lưu nhà>_<khách>]`.
 * `claimRunner` đọc lại đúng số đó làm "kết quả replay" nên các test cũ vẫn kiểm luật thưởng/trần/ledger.
 * Replay thật (worker + sim) được test riêng trong `routes/matches.replay.test.ts`.
 */
export const fakeLog = (h: number, a: number, sh?: { home: number; away: number }): string =>
  `t_${h}_${a}${sh ? `_${sh.home}_${sh.away}` : ''}`;

export const claimRunner: ReplayRunner = async (_setup, log) => {
  const m = /^t_(\d+)_(\d+)(?:_(\d+)_(\d+))?$/.exec(log);
  if (!m) return { ok: false, reason: 'invalid_log', message: 'log giả sai dạng' };
  const [h, a] = [Number(m[1]), Number(m[2])];
  const hasSh = m[3] !== undefined;
  return {
    ok: true,
    result: {
      score: { home: h, away: a },
      ...(hasSh && { shootout: { home: Number(m[3]), away: Number(m[4]) } }),
      phase: 'full_time',
      ticks: 0,
    },
  };
};

/**
 * Mặc định app test dùng `claimRunner` và tự điền `inputLog` giả từ số bàn trong body nếu test không
 * truyền (`replay: 'real'` = worker thật, không điền gì).
 */
export function createTestApp(
  clock: FakeClock = new FakeClock(),
  opts: Pick<BuildAppOptions, 'enableDevRoutes' | 'rng' | 'rateLimit'> & { replay?: 'real' } = {},
) {
  const { replay, ...rest } = opts;
  const fake = replay !== 'real';
  const fillFakeLog = async (req: FastifyRequest) => {
    const b = req.body as Record<string, unknown> | null;
    if (!b || typeof b !== 'object' || 'inputLog' in b) return;
    const ok = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= 0;
    const sh = b.shootout as { home?: unknown; away?: unknown } | undefined;
    if (ok(b.homeGoals) && ok(b.awayGoals) && (!sh || (ok(sh.home) && ok(sh.away)))) {
      b.inputLog = fakeLog(b.homeGoals, b.awayGoals, sh as { home: number; away: number });
    }
  };
  const app = buildApp({
    rateLimit: false,
    ...rest,
    db: testDb(),
    clock,
    ...(fake && {
      replay: { run: claimRunner },
      onRoute: (route) => {
        if (route.method === 'POST' && route.url.endsWith('/result')) {
          route.preValidation = [fillFakeLog];
        }
      },
    }),
  });
  return { app, clock };
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
