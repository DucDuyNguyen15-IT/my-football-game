import { createHash, randomBytes } from 'node:crypto';
import argon2 from 'argon2';
import { and, eq, gt, lte, sql } from 'drizzle-orm';
import type { Me } from '@pitch/shared';
import {
  BOX_COMPOSITION,
  MATCH_REWARD_DAILY_CAP,
  STARTER_FREE_PACK5,
  STARTER_SQUAD,
} from '../config/economy';
import type { Db } from '../db/client';
import { packBoxes, playerCards, sessions, squads, squadSlots, users } from '../db/schema';
import { AppError } from '../plugins/errors';

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

/** Xoá mọi phiên đã hết hạn (dùng index `sessions_expires_idx`). Trả số phiên đã xoá. */
export async function purgeExpiredSessions(db: Db, now: Date): Promise<number> {
  const deleted = await db
    .delete(sessions)
    .where(lte(sessions.expiresAt, now))
    .returning({ id: sessions.id });
  return deleted.length;
}

/** Khoá đăng nhập (PRD §8): sai {@link LOGIN_MAX_FAILURES} lần trong 15' → khoá 15'. */
export const LOGIN_MAX_FAILURES = 5;
export const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1000;
export const LOGIN_LOCK_MS = 15 * 60 * 1000;

/** Số ms còn bị khoá đăng nhập (0 = không khoá). */
export function loginLockRemainingMs(user: UserRow, now: Date): number {
  return user.lockedUntil ? Math.max(0, user.lockedUntil.getTime() - now.getTime()) : 0;
}

/**
 * Ghi một lần sai mật khẩu (khoá dòng `users` để các lần thử song song không đếm sót). Lần sai đầu
 * tiên ngoài cửa sổ 15' mở cửa sổ mới; đủ 5 lần trong cửa sổ → đặt `locked_until` và xoá bộ đếm.
 */
export async function recordLoginFailure(db: Db, userId: number, now: Date): Promise<void> {
  await db.transaction(async (tx) => {
    const [u] = await tx
      .select({ count: users.failedLoginCount, windowStart: users.failedLoginWindowStart })
      .from(users)
      .where(eq(users.id, userId))
      .for('update');
    if (!u) return;
    const inWindow =
      u.windowStart !== null && now.getTime() - u.windowStart.getTime() < LOGIN_FAILURE_WINDOW_MS;
    const count = inWindow ? u.count + 1 : 1;
    const patch =
      count >= LOGIN_MAX_FAILURES
        ? {
            failedLoginCount: 0,
            failedLoginWindowStart: null,
            lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MS),
          }
        : { failedLoginCount: count, failedLoginWindowStart: inWindow ? u.windowStart : now };
    await tx.update(users).set(patch).where(eq(users.id, userId));
  });
}

/** Đăng nhập đúng → xoá bộ đếm/khoá cũ (chỉ ghi DB khi có gì để xoá). */
export async function clearLoginFailures(db: Db, user: UserRow): Promise<void> {
  if (user.failedLoginCount === 0 && !user.failedLoginWindowStart && !user.lockedUntil) return;
  await db
    .update(users)
    .set({ failedLoginCount: 0, failedLoginWindowStart: null, lockedUntil: null })
    .where(eq(users.id, user.id));
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

/** Lỗi Postgres UNIQUE (`23505`) của đúng ràng buộc `constraint` (Drizzle bọc lỗi gốc trong `cause`). */
export function isUniqueViolation(err: unknown, constraint: string): boolean {
  for (let e: unknown = err; e instanceof Error; e = e.cause) {
    const pg = e as Error & { code?: string; constraint?: string };
    if (pg.code === '23505' && pg.constraint === constraint) return true;
  }
  return false;
}

/**
 * Đăng ký trong **một transaction** (ARCHITECTURE §4.3 #2): user + hộp 100 phiếu + 11 thẻ khởi đầu +
 * đội hình 2-3-1 xếp sẵn + lượt gói 5 miễn phí. Trùng tên (không phân biệt hoa thường) → 409.
 */
export async function registerUser(
  db: Db,
  input: { username: string; password: string; email?: string | undefined },
  now: Date,
): Promise<UserRow> {
  const passwordHash = await hashPassword(input.password);
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          username: input.username,
          passwordHash,
          email: input.email ?? null,
          freePack5Credits: STARTER_FREE_PACK5,
        })
        .returning();
      const userId = user!.id;
      await tx.insert(packBoxes).values({
        userId,
        bronzeLeft: BOX_COMPOSITION.bronze,
        silverLeft: BOX_COMPOSITION.silver,
        goldLeft: BOX_COMPOSITION.gold,
        legendLeft: BOX_COMPOSITION.legend,
        updatedAt: now,
      });
      const owned = await tx
        .insert(playerCards)
        .values(
          STARTER_SQUAD.slots.map(([, cardId]) => ({
            userId,
            cardId,
            source: 'starter' as const,
            acquiredAt: now,
          })),
        )
        .returning({ id: playerCards.id });
      await tx
        .insert(squads)
        .values({ userId, formation: STARTER_SQUAD.formation, updatedAt: now });
      await tx
        .insert(squadSlots)
        .values(
          STARTER_SQUAD.slots.map(([slot], i) => ({ userId, slot, playerCardId: owned[i]!.id })),
        );
      return user!;
    });
  } catch (err) {
    if (isUniqueViolation(err, 'users_username_lower_uq')) {
      throw new AppError('username_taken', 409, 'Tên đăng nhập đã có người dùng');
    }
    throw err;
  }
}
