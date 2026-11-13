// Analytics & retention (PRD §8, §10 F13; ARCHITECTURE §3.2 analytics_events, §4.3 #19).
import { sql } from 'drizzle-orm';
import type { RetentionCohort } from '@pitch/shared';
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

/**
 * Thống kê D1 / D7 retention theo nhóm ngày đăng ký (GMT+7). "Quay lại ngày N" = có ≥ 1 sự kiện
 * bất kỳ vào ngày thứ N (GMT+7) sau ngày đăng ký (PRD §8). Nhóm chưa đủ 1 hoặc 7 ngày so với
 * `gameDay(now)` trả `null` ở cột tương ứng.
 */
export async function getRetentionCohorts(
  db: Db,
  now: Date,
  filter: { from?: string | undefined; to?: string | undefined; days?: number | undefined } = {},
): Promise<RetentionCohort[]> {
  const today = gameDay(now);
  const fromDay =
    filter.from ?? (filter.days !== undefined ? addDays(today, -(filter.days - 1)) : undefined);
  const toDay = filter.to ?? (filter.days !== undefined ? today : undefined);
  const fromFilter = fromDay ? sql`and u.created_at >= ${gmt7DayStartUtc(fromDay)}` : sql``;
  const toFilter = toDay
    ? sql`and u.created_at < ${gmt7DayStartUtc(addDays(toDay, 1))}`
    : sql``;

  const res = await db.execute<CohortSqlRow>(sql`
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
  `);

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
