// pnpm --filter @pitch/server bench:analytics — đo truy vấn retention/onboarding trên dữ liệu giả lớn
// (task 8.3). Sinh BENCH_USERS người chơi + ~BENCH_EVENTS dòng `analytics_events`, chạy mỗi truy vấn
// nhiều lần rồi in trung vị và `EXPLAIN (ANALYZE, BUFFERS)`.
//
// XOÁ SẠCH dữ liệu của DATABASE_URL trước khi sinh → chỉ chạy trên DB tên chứa "perf":
//   DATABASE_URL=postgres://pitch:pitch@localhost:5432/pitch_perf_b pnpm --filter @pitch/server bench:analytics
// Không nằm trong `pnpm check`.
import { performance } from 'node:perf_hooks';
import { sql, type SQL } from 'drizzle-orm';
import type { RetentionQuery } from '@pitch/shared';
import { createDb, type Db } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import {
  getOnboardingStats,
  getRetentionCohorts,
  onboardingStatsQuery,
  retentionCohortsQuery,
} from '../src/services/analytics';
import { perfDatabaseUrl, percentile } from './bench-util';

const USERS = Number(process.env.BENCH_USERS ?? 5_000);
const EVENTS = Number(process.env.BENCH_EVENTS ?? 200_000);
const RUNS = Number(process.env.BENCH_RUNS ?? 7);
/** Người chơi đăng ký rải đều trong chừng này ngày gần nhất. */
const SPREAD_DAYS = 60;

const url = perfDatabaseUrl();
await runMigrations(url);
const { db, pool } = createDb(url);

async function generate(now: Date): Promise<void> {
  const tables = await db.execute<{ tablename: string }>(
    sql`select tablename from pg_tables where schemaname = 'public'`,
  );
  const names = tables.rows.map((r) => `"public"."${r.tablename}"`).join(', ');
  await db.execute(sql.raw(`truncate ${names} restart identity cascade`));

  // Dữ liệu tất định (không random): ngày đăng ký = now − (g mod 60) ngày − vài giờ.
  await db.execute(sql`
    insert into users (username, password_hash, created_at)
    select
      'perf_' || g,
      'bench-no-login',
      ${now}::timestamptz - (g % ${SPREAD_DAYS}) * interval '1 day'
        - (3600 + (g * 7919) % 72000) * interval '1 second'
    from generate_series(1, ${USERS}) g
  `);
  await db.execute(sql`
    insert into analytics_events (user_id, name, props, created_at)
    select id, 'register', '{}'::jsonb, created_at from users
  `);
  // 80% người chơi vào trận đầu sau 20–620 giây.
  await db.execute(sql`
    insert into analytics_events (user_id, name, props, created_at)
    select id, 'match_start', '{}'::jsonb, created_at + (20 + (id * 37) % 600) * interval '1 second'
    from users
    where id % 5 <> 0
  `);
  // Phần còn lại: mỗi người chơi k sự kiện rải trên các ngày từ lúc đăng ký tới hôm nay.
  const perUser = Math.max(0, Math.ceil((EVENTS - USERS * 1.8) / USERS));
  await db.execute(sql`
    insert into analytics_events (user_id, name, props, created_at)
    select
      u.id,
      (array['session_seen', 'login', 'match_start', 'match_end', 'pack_open', 'mission_claim'])[1 + (k % 6)],
      '{}'::jsonb,
      u.created_at
        + ((u.id * 31 + k * 17) % (1 + (u.id % ${SPREAD_DAYS}))) * interval '1 day'
        + ((u.id * 13 + k * 101) % 3000) * interval '1 second'
    from users u
    cross join generate_series(1, ${perUser}) k
  `);
  await db.execute(sql`analyze users`);
  await db.execute(sql`analyze analytics_events`);
}

async function timeIt(fn: () => Promise<unknown>): Promise<{ p50: number; max: number }> {
  await fn(); // làm nóng cache
  const samples: number[] = [];
  for (let i = 0; i < RUNS; i++) {
    const t0 = performance.now();
    await fn();
    samples.push(performance.now() - t0);
  }
  return { p50: percentile(samples, 50), max: Math.max(...samples) };
}

async function explain(target: Db, query: SQL): Promise<string> {
  const res = await target.execute<{ 'QUERY PLAN': string }>(
    sql`explain (analyze, buffers) ${query}`,
  );
  return res.rows.map((r) => r['QUERY PLAN']).join('\n');
}

try {
  const now = new Date();
  if (process.env.BENCH_SKIP_GENERATE !== '1') {
    const t0 = performance.now();
    await generate(now);
    console.log(`Sinh dữ liệu: ${((performance.now() - t0) / 1000).toFixed(1)} s`);
  }
  const [counts] = (
    await db.execute<{ users: string; events: string }>(sql`
      select (select count(*) from users) as users, (select count(*) from analytics_events) as events
    `)
  ).rows;
  console.log(`Dữ liệu: ${counts!.users} users, ${counts!.events} analytics_events\n`);

  const filters: [string, RetentionQuery][] = [
    ['days=7', { days: 7 }],
    ['days=30', { days: 30 }],
    ['không lọc', {}],
  ];
  const rows: Record<string, string | number>[] = [];
  for (const [label, filter] of filters) {
    const cohorts = await getRetentionCohorts(db, now, filter);
    const retention = await timeIt(() => getRetentionCohorts(db, now, filter));
    const onboarding = await timeIt(() => getOnboardingStats(db, now, filter));
    rows.push({
      'khoảng': label,
      cohorts: cohorts.length,
      'retention p50 (ms)': retention.p50.toFixed(1),
      'retention max (ms)': retention.max.toFixed(1),
      'onboarding p50 (ms)': onboarding.p50.toFixed(1),
      'onboarding max (ms)': onboarding.max.toFixed(1),
    });
  }
  console.table(rows);

  for (const [label, filter] of filters.slice(1)) {
    console.log(`\n--- EXPLAIN getRetentionCohorts (${label}) ---`);
    console.log(await explain(db, retentionCohortsQuery(now, filter)));
    console.log(`\n--- EXPLAIN getOnboardingStats (${label}) ---`);
    console.log(await explain(db, onboardingStatsQuery(now, filter)));
  }
} finally {
  await pool.end();
}
