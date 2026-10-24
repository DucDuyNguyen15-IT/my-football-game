import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { and, eq, gt, sql } from 'drizzle-orm';
import type { Me } from '@pitch/shared';
import { MATCH_REWARD_DAILY_CAP } from '../config/economy';
import type { Db } from '../db/client';
import { sessions, users } from '../db/schema';

/** Hạn phiên 30 ngày, gia hạn trượt (ARCHITECTURE §4.1). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Chỉ gia hạn khi phiên đã dùng quá 1 ngày, tránh ghi DB ở mọi request. */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;

export type UserRow = typeof users.$inferSelect;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

let dummyHash: Promise<string> | null = null;
/** So với hash giả khi không có user để thời gian phản hồi không lộ tên đăng nhập có tồn tại. */
export async function burnPasswordCheck(password: string): Promise<void> {
  dummyHash ??= hashPassword(randomBytes(16).toString('hex'));
  await verifyPassword(await dummyHash, password);
}

/** Khoá chính `sessions.id` = SHA-256 (hex) của token trong cookie. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function findUserByUsername(db: Db, username: string): Promise<UserRow | undefined> {
  const [user] = await db
    .select()
    .from(users)
    .where(sql`lower(${users.username}) = lower(${username})`);
  return user;
}

export async function createSession(
  db: Db,
  userId: number,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export async function destroySession(db: Db, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/**
 * Tra phiên còn hạn theo token, gia hạn trượt khi cần. `null` nếu token sai/hết hạn.
 * `renewedUntil` có giá trị khi phiên vừa được gia hạn (để đặt lại cookie).
 */
export async function resolveSession(
  db: Db,
  token: string,
  now: Date,
): Promise<{ user: UserRow; renewedUntil: Date | null } | null> {
  const id = hashToken(token);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)));
  if (!row) return null;
  const age = SESSION_TTL_MS - (row.expiresAt.getTime() - now.getTime());
  if (age < SESSION_RENEW_AFTER_MS) return { user: row.user, renewedUntil: null };
  const renewedUntil = new Date(now.getTime() + SESSION_TTL_MS);
  await db.update(sessions).set({ expiresAt: renewedUntil }).where(eq(sessions.id, id));
  return { user: row.user, renewedUntil };
}

export function toMe(user: UserRow): Me {
  return {
    id: String(user.id),
    username: user.username,
    coins: user.coins,
    freePack5Credits: user.freePack5Credits,
    rewardedMatchesToday: 0,
    rewardedMatchesLimit: MATCH_REWARD_DAILY_CAP,
  };
}
