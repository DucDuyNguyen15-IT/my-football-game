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
import type { Db, Tx } from '../db/client';
import {
  analyticsEvents,
  packBoxes,
  playerCards,
  sessions,
  squads,
  squadSlots,
  users,
} from '../db/schema';
import { AppError } from '../plugins/errors';
import { track } from './analytics';

/** Hạn phiên 30 ngày, gia hạn trượt (ARCHITECTURE §4.1). */
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** Chỉ gia hạn khi phiên đã dùng quá 1 ngày, tránh ghi DB ở mọi request. */
export const SESSION_RENEW_AFTER_MS = 24 * 60 * 60 * 1000;
/** Hạn tuyệt đối 90 ngày kể từ lúc đăng nhập: cookie bị lộ không sống mãi nhờ gia hạn trượt. */
export const SESSION_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export type UserRow = typeof users.$inferSelect;

export function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, { type: argon2.argon2id });
}

export function verifyPassword(hash: string, password: string): Promise<boolean> {
  return argon2.verify(hash, password);
}

/**
 * Hash của tài khoản đã xoá: không phải chuỗi argon2 nên không mật khẩu nào khớp; giữ để thoả CHECK
 * `users_has_login_method`. Tên `deleted-<id>` có dấu `-`, không qua được `Username` nên cũng không
 * đăng nhập hay đăng ký trùng được.
 */
export const DELETED_PASSWORD_HASH = '!deleted';

/**
 * Xoá tài khoản bằng cách ẩn danh hoá (chốt 2026-11-16): bỏ tên, mật khẩu, email, liên kết Google,
 * mọi phiên và sự kiện analytics. Thẻ, trận và sổ cái xu (append-only, trigger chặn DELETE) giữ lại
 * dưới id không còn gắn với ai.
 */
export async function anonymizeUser(db: Db, userId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(users)
      .set({
        username: `deleted-${userId}`,
        passwordHash: DELETED_PASSWORD_HASH,
        googleSub: null,
        email: null,
        isAdmin: false,
        failedLoginCount: 0,
        failedLoginWindowStart: null,
        lockedUntil: null,
      })
      .where(eq(users.id, userId));
    await tx.delete(analyticsEvents).where(eq(analyticsEvents.userId, userId));
    await tx.delete(sessions).where(eq(sessions.userId, userId));
  });
}

/**
 * Gọi đầu transaction cấp phiên: khoá dòng user và kiểm cách đăng nhập chưa đổi kể từ lúc đọc
 * `user`. Chặn khe "xoá tài khoản xong trong lúc đăng nhập đang kiểm mật khẩu" (review main-b T1):
 * không cấp phiên vào tài khoản đã ẩn danh hoá, không ghi analytics sau khi đã xoá.
 */
export async function assertLoginUnchanged(tx: Tx, user: UserRow): Promise<void> {
  const [now] = await tx
    .select({ passwordHash: users.passwordHash, googleSub: users.googleSub })
    .from(users)
    .where(eq(users.id, user.id))
    .for('update');
  if (!now || now.passwordHash !== user.passwordHash || now.googleSub !== user.googleSub) {
    throw new AppError('invalid_credentials', 401, 'Tài khoản vừa thay đổi, hãy đăng nhập lại');
  }
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
  db: Db | Tx,
  userId: number,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({ id: hashToken(token), userId, expiresAt, createdAt: now });
  return { token, expiresAt };
}

/** Lúc tạo phiên của token (null nếu không có) — để đòi đăng nhập lại trước thao tác nguy hiểm. */
export async function sessionCreatedAt(db: Db, token: string): Promise<Date | null> {
  const [row] = await db
    .select({ createdAt: sessions.createdAt })
    .from(sessions)
    .where(eq(sessions.id, hashToken(token)));
  return row?.createdAt ?? null;
}

export async function destroySession(db: Db | Tx, token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, hashToken(token)));
}

/**
 * Tra phiên còn hạn theo token, tính hạn mới nếu cần gia hạn trượt. `null` nếu token sai/hết hạn.
 * `renewedUntil` có giá trị khi phiên cần gia hạn (nơi gọi ghi DB sau khi qua rate limit).
 */
export async function resolveSession(
  db: Db,
  token: string,
  now: Date,
): Promise<{ user: UserRow; renewedUntil: Date | null } | null> {
  const id = hashToken(token);
  const [row] = await db
    .select({ user: users, expiresAt: sessions.expiresAt, createdAt: sessions.createdAt })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, now)));
  if (!row) return null;
  const age = SESSION_TTL_MS - (row.expiresAt.getTime() - now.getTime());
  if (age < SESSION_RENEW_AFTER_MS) return { user: row.user, renewedUntil: null };
  const renewedUntil = new Date(
    Math.min(now.getTime() + SESSION_TTL_MS, row.createdAt.getTime() + SESSION_MAX_AGE_MS),
  );
  if (renewedUntil <= row.expiresAt) return { user: row.user, renewedUntil: null };
  return { user: row.user, renewedUntil };
}

/** Ghi hạn mới cho phiên đang dùng khi gia hạn trượt. */
export async function renewSession(db: Db, token: string, expiresAt: Date): Promise<void> {
  await db
    .update(sessions)
    .set({ expiresAt })
    .where(eq(sessions.id, hashToken(token)));
}

/** Xoá mọi phiên đã hết hạn (dùng index `sessions_expires_idx`). Trả số phiên đã xoá. */
export async function purgeExpiredSessions(db: Db | Tx, now: Date): Promise<number> {
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
 * Giữ một lượt thử mật khẩu TRƯỚC khi kiểm (A-1): khoá dòng `users`, nếu đang khoá trả số ms còn
 * khoá; không thì đếm lượt này như một lần sai (đăng nhập đúng sẽ xoá bộ đếm). Vì đếm trước khi chạy
 * argon2 nên request song song cũng chỉ được kiểm tối đa 5 lần/15', và không lọt request nào sau khi
 * đã khoá. Lần đầu ngoài cửa sổ 15' mở cửa sổ mới; đủ 5 lần → đặt `locked_until`, xoá bộ đếm.
 */
export async function reserveLoginAttempt(db: Db, userId: number, now: Date): Promise<number> {
  return db.transaction(async (tx) => {
    const [u] = await tx.select().from(users).where(eq(users.id, userId)).for('update');
    if (!u) return 0;
    const lockedMs = loginLockRemainingMs(u, now);
    if (lockedMs > 0) return lockedMs;
    const inWindow =
      u.failedLoginWindowStart !== null &&
      now.getTime() - u.failedLoginWindowStart.getTime() < LOGIN_FAILURE_WINDOW_MS;
    const count = inWindow ? u.failedLoginCount + 1 : 1;
    const patch =
      count >= LOGIN_MAX_FAILURES
        ? {
            failedLoginCount: 0,
            failedLoginWindowStart: null,
            lockedUntil: new Date(now.getTime() + LOGIN_LOCK_MS),
          }
        : {
            failedLoginCount: count,
            failedLoginWindowStart: inWindow ? u.failedLoginWindowStart : now,
          };
    await tx.update(users).set(patch).where(eq(users.id, userId));
    return 0;
  });
}

/** Đăng nhập đúng → xoá bộ đếm/khoá (lượt vừa giữ ở {@link reserveLoginAttempt} cũng được xoá). */
export async function clearLoginFailures(db: Db | Tx, userId: number): Promise<void> {
  await db
    .update(users)
    .set({ failedLoginCount: 0, failedLoginWindowStart: null, lockedUntil: null })
    .where(eq(users.id, userId));
}

/** `rewardedMatchesToday`: số trận đã nhận thưởng hôm nay (GMT+7), route tính qua `countRewardedMatches`. */
export function toMe(user: UserRow, rewardedMatchesToday = 0): Me {
  return {
    id: String(user.id),
    username: user.username,
    coins: user.coins,
    freePack5Credits: user.freePack5Credits,
    rewardedMatchesToday,
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

/** Đăng ký bằng tên + mật khẩu (task 6.3b) — xem {@link createAccount}. */
export async function registerUser(
  db: Db,
  input: { username: string; password: string; email?: string | undefined },
  now: Date,
): Promise<UserRow> {
  const passwordHash = await hashPassword(input.password);
  return createAccount(db, { username: input.username, passwordHash, email: input.email }, now);
}

/** Tra user theo `sub` Google đã gắn (ADR-0010). */
export async function findUserByGoogleSub(db: Db, sub: string): Promise<UserRow | undefined> {
  const [user] = await db.select().from(users).where(eq(users.googleSub, sub));
  return user;
}

/**
 * Tạo tài khoản trong **một transaction** (ARCHITECTURE §4.3 #2): user + hộp 100 phiếu + 11 thẻ khởi
 * đầu + đội hình 2-3-1 xếp sẵn + lượt gói 5 miễn phí. Dùng chung cho đăng ký thường (có
 * `passwordHash`) và Google (có `googleSub`, không mật khẩu — task 7.7). Trùng tên (không phân biệt
 * hoa thường) → 409; trùng `googleSub` ném lỗi gốc (`users_google_sub_uq`) để nơi gọi tự xử lý.
 */
export async function createAccount(
  db: Db,
  input: {
    username: string;
    passwordHash?: string | null | undefined;
    googleSub?: string | null | undefined;
    email?: string | null | undefined;
  },
  now: Date,
): Promise<UserRow> {
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx
        .insert(users)
        .values({
          username: input.username,
          passwordHash: input.passwordHash ?? null,
          googleSub: input.googleSub ?? null,
          email: input.email ?? null,
          freePack5Credits: STARTER_FREE_PACK5,
          // Route đăng ký (thường + Google) đã bắt buộc `acceptTerms: true` trước khi gọi tới đây.
          termsAcceptedAt: now,
          createdAt: now,
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
      await track(tx, userId, 'register', { method: input.googleSub ? 'google' : 'password' }, now);
      return user!;
    });
  } catch (err) {
    if (isUniqueViolation(err, 'users_username_lower_uq')) {
      throw new AppError('username_taken', 409, 'Tên đăng nhập đã có người dùng');
    }
    throw err;
  }
}
