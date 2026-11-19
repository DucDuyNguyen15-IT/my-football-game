// Analytics & retention (PRD §8, §10 F13; ARCHITECTURE §3.2 analytics_events, §4.3 #19).
import { sql, type SQL } from 'drizzle-orm';
import type { OnboardingStats, RetentionCohort, RetentionQuery } from '@pitch/shared';
import type { Db, Tx } from '../db/client';
import { analyticsEvents } from '../db/schema';
import { gameDay } from '../domain/rewards';
import { lockUser } from './wallet';

export type AnalyticsEventName =
  | 'register'
  | 'login'
  | 'session_seen'
  | 'match_start'
  | 'match_end'
  | 'match_replay_mismatch'
  | 'pack_open'
  | 'upgrade'
  | 'mission_claim';

const DAY_MS = 24 * 60 * 60 * 1000;

/** Cộng `delta` ngày vào chuỗi ISO `YYYY-MM-DD`. */
export function addDays(day: string, delta: number): string {
  const ms = new Date(`${day}T00:00:00.000Z`).getTime() + delta * DAY_MS;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Mốc 00:00 GMT+7 của ngày `day` (`YYYY-MM-DD`) theo UTC. */
export function gmt7DayStartUtc(day: string): Date {
  return new Date(`${day}T00:00:00.000+07:00`);
}

/**
 * Ghi một sự kiện analytics trong transaction hiện tại của nghiệp vụ. Luôn truyền `now` lấy từ
 * `app.clock.now()` để giữ nhất quán với đồng hồ nghiệp vụ (FakeClock trong test).
 */
export async function track(
  tx: Db | Tx,
  userId: number | null,
  name: AnalyticsEventName,
  props: Record<string, unknown>,
  now: Date,
): Promise<void> {
  await tx.insert(analyticsEvents).values({
    userId,
    name,
    props,
    createdAt: now,
  });
}

async function hasSessionSeenToday(db: Db | Tx, userId: number, day: string): Promise<boolean> {
  const startUtc = gmt7DayStartUtc(day);
  const endUtc = gmt7DayStartUtc(addDays(day, 1));
  const result = await db.execute<{ ok: number }>(sql`
    select 1 as ok
    from analytics_events
    where user_id = ${userId}
      and name = 'session_seen'
      and created_at >= ${startUtc}
      and created_at < ${endUtc}
    limit 1
  `);
  return result.rows.length > 0;
}

/**
 * Ghi `session_seen` tối đa 1 lần mỗi ngày GMT+7 cho mỗi người chơi khi gọi API đã đăng nhập.
 * Khoá dòng `users` trước khi chèn để hai request đồng thời đầu ngày không ghi trùng.
 */
export async function recordSessionSeen(db: Db, userId: number, now: Date): Promise<void> {
  const day = gameDay(now);
  if (await hasSessionSeenToday(db, userId, day)) return;

  await db.transaction(async (tx) => {
    await lockUser(tx, userId);
    if (await hasSessionSeenToday(tx, userId, day)) return;
    await track(tx, userId, 'session_seen', { day }, now);
  });
}

interface CohortSqlRow extends Record<string, unknown> {
  cohort_day: string;
  registered: number;
  d1_users: number;
  d7_users: number;
}

function resolveDateRange(
  now: Date,
  filter: RetentionQuery = {},
): { today: string; fromDay: string | undefined; toDay: string | undefined } {
  const today = gameDay(now);
  const fromDay =
    filter.from ?? (filter.days !== undefined ? addDays(today, -(filter.days - 1)) : undefined);
  const toDay = filter.to ?? (filter.days !== undefined ? today : undefined);
  return { today, fromDay, toDay };
}

/**
 * Thống kê D1 / D7 retention theo nhóm ngày đăng ký (GMT+7). "Quay lại ngày N" = có ≥ 1 sự kiện
 * bất kỳ vào ngày thứ N (GMT+7) sau ngày đăng ký (PRD §8). Nhóm chưa đủ 1 hoặc 7 ngày so với
 * `gameDay(now)` trả `null` ở cột tương ứng.
 */
export async function getRetentionCohorts(
  db: Db,
  now: Date,
  filter: RetentionQuery = {},
): Promise<RetentionCohort[]> {
  const { today } = resolveDateRange(now, filter);
  const res = await db.execute<CohortSqlRow>(retentionCohortsQuery(now, filter));

  return res.rows.map((row) => {
    const cohortDay = row.cohort_day;
    const registered = Number(row.registered);
    const d1Ready = addDays(cohortDay, 1) <= today;
    const d7Ready = addDays(cohortDay, 7) <= today;
    return {
      cohortDay,
      registered,
      d1: d1Ready && registered > 0 ? Number(row.d1_users) / registered : null,
      d7: d7Ready && registered > 0 ? Number(row.d7_users) / registered : null,
    };
  });
}

/** Câu SQL của {@link getRetentionCohorts} (tách riêng để script đo hiệu năng chạy `EXPLAIN`). */
export function retentionCohortsQuery(now: Date, filter: RetentionQuery = {}): SQL {
  const { fromDay, toDay } = resolveDateRange(now, filter);
  const fromFilter = fromDay ? sql`and u.created_at >= ${gmt7DayStartUtc(fromDay)}` : sql``;
  const toFilter = toDay
    ? sql`and u.created_at < ${gmt7DayStartUtc(addDays(toDay, 1))}`
    : sql``;

  return sql`
    with cohorts as (
      select
        u.id as user_id,
        ((u.created_at at time zone 'UTC') + interval '7 hours')::date as cohort_day
      from users u
      where 1 = 1
      ${fromFilter}
      ${toFilter}
    ),
    activity as (
      select distinct
        e.user_id,
        ((e.created_at at time zone 'UTC') + interval '7 hours')::date as event_day
      from analytics_events e
      where e.user_id is not null
    )
    select
      to_char(c.cohort_day, 'YYYY-MM-DD') as cohort_day,
      count(*)::int as registered,
      count(distinct d1.user_id)::int as d1_users,
      count(distinct d7.user_id)::int as d7_users
    from cohorts c
    left join activity d1
      on d1.user_id = c.user_id
      and d1.event_day = c.cohort_day + 1
    left join activity d7
      on d7.user_id = c.user_id
      and d7.event_day = c.cohort_day + 7
    group by c.cohort_day
    order by c.cohort_day asc
  `;
}

interface OnboardingSqlRow extends Record<string, unknown> {
  total_registered: number;
  completed_users: number;
  within_target_users: number;
  median_seconds: number | string | null;
  p90_seconds: number | string | null;
}

function roundTenth(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined) return null;
  const num = Number(value);
  return Number.isFinite(num) ? Math.round(num * 10) / 10 : null;
}

/**
 * Truy vấn phễu `register -> match_start` (7.6 / PRD §9, §10): tính thời gian trung vị (giây) và
 * phân vị 90 từ sự kiện `register` tới sự kiện `match_start` đầu tiên của từng người chơi.
 */
export async function getOnboardingStats(
  db: Db,
  now: Date,
  filter: RetentionQuery = {},
): Promise<OnboardingStats> {
  const { fromDay, toDay } = resolveDateRange(now, filter);
  if (fromDay && toDay && fromDay > toDay) {
    return {
      from: fromDay,
      to: toDay,
      totalRegistered: 0,
      completedUsers: 0,
      withinTargetUsers: 0,
      medianSeconds: null,
      p90Seconds: null,
    };
  }

  const res = await db.execute<OnboardingSqlRow>(onboardingStatsQuery(now, filter));

  const row = res.rows[0];
  return {
    from: fromDay ?? null,
    to: toDay ?? null,
    totalRegistered: Number(row?.total_registered ?? 0),
    completedUsers: Number(row?.completed_users ?? 0),
    withinTargetUsers: Number(row?.within_target_users ?? 0),
    medianSeconds: roundTenth(row?.median_seconds),
    p90Seconds: roundTenth(row?.p90_seconds),
  };
}

/** Câu SQL của {@link getOnboardingStats} (tách riêng để script đo hiệu năng chạy `EXPLAIN`). */
export function onboardingStatsQuery(now: Date, filter: RetentionQuery = {}): SQL {
  const { fromDay, toDay } = resolveDateRange(now, filter);
  const fromFilter = fromDay ? sql`and e.created_at >= ${gmt7DayStartUtc(fromDay)}` : sql``;
  const toFilter = toDay
    ? sql`and e.created_at < ${gmt7DayStartUtc(addDays(toDay, 1))}`
    : sql``;

  return sql`
    with reg as (
      select
        e.user_id,
        min(e.created_at) as registered_at
      from analytics_events e
      where e.name = 'register'
        and e.user_id is not null
        ${fromFilter}
        ${toFilter}
      group by e.user_id
    ),
    first_match as (
      select
        r.user_id,
        extract(epoch from (min(m.created_at) - r.registered_at))::float8 as delta_seconds
      from reg r
      left join analytics_events m
        on m.user_id = r.user_id
        and m.name = 'match_start'
        and m.created_at >= r.registered_at
      group by r.user_id, r.registered_at
    )
    select
      count(*)::int as total_registered,
      count(delta_seconds)::int as completed_users,
      count(*) filter (where delta_seconds is not null and delta_seconds <= 120)::int as within_target_users,
      percentile_cont(0.5) within group (order by delta_seconds) as median_seconds,
      percentile_cont(0.9) within group (order by delta_seconds) as p90_seconds
    from first_match
  `;
}
