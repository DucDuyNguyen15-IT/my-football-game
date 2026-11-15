import type { FastifyInstance, FastifyRequest } from 'fastify';
import {
  GoogleAuthRequest,
  LoginRequest,
  RegisterRequest,
  type AuthConfigResponse,
  type GoogleAuthResponse,
  type MeResponse,
} from '@pitch/shared';
import type { Db, Tx } from '../db/client';
import { clearSessionCookie, requireAuth, SESSION_COOKIE, setSessionCookie } from '../plugins/auth';
import { AppError } from '../plugins/errors';
import { track } from '../services/analytics';
import {
  burnPasswordCheck,
  clearLoginFailures,
  createAccount,
  createSession,
  destroySession,
  findUserByGoogleSub,
  findUserByUsername,
  isUniqueViolation,
  purgeExpiredSessions,
  registerUser,
  reserveLoginAttempt,
  toMe,
  verifyPassword,
  type UserRow,
} from '../services/auth';
import { suggestUsername, type GoogleVerifier } from '../services/google';
import { countRewardedMatches } from '../services/matches';
import { gameDay } from '../domain/rewards';

/** `Me` kèm số trận có thưởng hôm nay (GMT+7) để web cảnh báo trước khi vào trận thứ 16. */
async function meWithRewards(app: FastifyInstance, user: UserRow) {
  const today = await countRewardedMatches(app.db, user.id, gameDay(app.clock.now()));
  return toMe(user, today);
}

export interface GoogleAuthConfig {
  clientId: string;
  verify: GoogleVerifier;
}

/** Cấp phiên mới, xoay token: bỏ phiên cũ trên trình duyệt này (nếu có), dọn phiên hết hạn. */
async function rotateSession(
  db: Db | Tx,
  req: FastifyRequest,
  user: UserRow,
  now: Date,
): Promise<{ token: string; expiresAt: Date }> {
  const old = req.cookies[SESSION_COOKIE];
  if (old) await destroySession(db, old);
  await purgeExpiredSessions(db, now);
  return createSession(db, user.id, now);
}

/** GET /config/auth (công khai, không cần DB): web biết có hiện nút Google không (ADR-0010). */
export function registerAuthConfigRoute(
  app: FastifyInstance,
  google: GoogleAuthConfig | null,
): void {
  app.get('/api/v1/config/auth', async (_req, reply): Promise<AuthConfigResponse> => {
    reply.header('cache-control', 'public, max-age=300');
    return { data: { googleClientId: google?.clientId ?? null } };
  });
}

export function registerAuthRoutes(app: FastifyInstance, google: GoogleAuthConfig | null): void {
  app.post('/api/v1/auth/register', async (req, reply): Promise<MeResponse> => {
    const input = RegisterRequest.parse(req.body);
    const now = app.clock.now();
    const user = await registerUser(app.db, input, now);
    const session = await rotateSession(app.db, req, user, now);
    setSessionCookie(reply, session.token, session.expiresAt);
    reply.code(201);
    return { data: await meWithRewards(app, user) };
  });

  app.post('/api/v1/auth/login', async (req, reply): Promise<MeResponse> => {
    const { username, password } = LoginRequest.parse(req.body);
    const now = app.clock.now();
    const user = await findUserByUsername(app.db, username);
    if (!user) {
      await burnPasswordCheck(password);
      throw new AppError('invalid_credentials', 401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    // Tài khoản chỉ có Google (không mật khẩu): từ chối như sai mật khẩu, không đếm vào khoá.
    if (user.passwordHash === null) {
      await burnPasswordCheck(password);
      throw new AppError('invalid_credentials', 401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    // Giữ lượt (kiểm khoá + đếm) dưới khoá dòng trước khi kiểm mật khẩu — đang khoá thì từ chối kể cả
    // mật khẩu đúng (PRD §8), và request song song không vượt được 5 lần (A-1).
    const lockedMs = await reserveLoginAttempt(app.db, user.id, now);
    if (lockedMs > 0) {
      reply.header('retry-after', String(Math.ceil(lockedMs / 1000)));
      throw new AppError('login_locked', 429, 'Đăng nhập sai quá nhiều lần, thử lại sau 15 phút');
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new AppError('invalid_credentials', 401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    const session = await app.db.transaction(async (tx) => {
      await clearLoginFailures(tx, user.id);
      await track(tx, user.id, 'login', { method: 'password' }, now);
      return rotateSession(tx, req, user, now);
    });
    setSessionCookie(reply, session.token, session.expiresAt);
    return { data: await meWithRewards(app, user) };
  });

  /**
   * Đăng nhập Google (ADR-0010): kiểm ID token → user đã gắn `sub` thì cấp phiên; chưa có thì cần
   * `username` để tạo tài khoản + quà tân thủ (chung code đăng ký), thiếu thì trả `needs_username`.
   * Khoá đăng nhập (sai mật khẩu) không chặn Google — khoá chỉ để chống dò mật khẩu.
   */
  app.post('/api/v1/auth/google', async (req, reply): Promise<GoogleAuthResponse> => {
    if (!google) throw new AppError('not_found', 404, 'Chưa bật đăng nhập Google');
    const { idToken, username } = GoogleAuthRequest.parse(req.body);
    const now = app.clock.now();
    const identity = await google.verify(idToken, now);
    let user = await findUserByGoogleSub(app.db, identity.sub);
    let created = false;
    if (!user) {
      if (!username) {
        return {
          data: { status: 'needs_username', suggestedUsername: suggestUsername(identity.email) },
        };
      }
      try {
        user = await createAccount(
          app.db,
          { username, googleSub: identity.sub, email: identity.email },
          now,
        );
        created = true;
      } catch (err) {
        // Hai request cùng `sub` chạy song song: request thua dùng tài khoản request kia vừa tạo.
        if (!isUniqueViolation(err, 'users_google_sub_uq')) throw err;
        user = await findUserByGoogleSub(app.db, identity.sub);
        if (!user) throw err;
      }
    }
    const session = await app.db.transaction(async (tx) => {
      if (!created) await track(tx, user.id, 'login', { method: 'google' }, now);
      return rotateSession(tx, req, user, now);
    });
    setSessionCookie(reply, session.token, session.expiresAt);
    if (created) reply.code(201);
    return { data: { status: 'signed_in', me: await meWithRewards(app, user) } };
  });

  app.post('/api/v1/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await destroySession(app.db, token);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/api/v1/me', { preHandler: requireAuth }, async (req): Promise<MeResponse> => {
    return { data: await meWithRewards(app, req.user!) };
  });
}
