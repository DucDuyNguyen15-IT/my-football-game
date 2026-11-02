import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import {
  GoogleAuthRequest,
  LoginRequest,
  RegisterRequest,
  type AuthConfigResponse,
  type GoogleAuthResponse,
  type MeResponse,
} from '@pitch/shared';
import { clearSessionCookie, requireAuth, SESSION_COOKIE, setSessionCookie } from '../plugins/auth';
import { AppError } from '../plugins/errors';
import {
  burnPasswordCheck,
  clearLoginFailures,
  createAccount,
  createSession,
  destroySession,
  findUserByGoogleSub,
  findUserByUsername,
  isUniqueViolation,
  loginLockRemainingMs,
  purgeExpiredSessions,
  recordLoginFailure,
  registerUser,
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
async function startSession(
  app: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
  user: UserRow,
  now: Date,
): Promise<void> {
  const old = req.cookies[SESSION_COOKIE];
  if (old) await destroySession(app.db, old);
  await purgeExpiredSessions(app.db, now);
  const { token, expiresAt } = await createSession(app.db, user.id, now);
  setSessionCookie(reply, token, expiresAt);
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
    const { token, expiresAt } = await createSession(app.db, user.id, now);
    setSessionCookie(reply, token, expiresAt);
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
    // Đang khoá thì từ chối trước khi kiểm mật khẩu — kể cả mật khẩu đúng (PRD §8).
    const lockedMs = loginLockRemainingMs(user, now);
    if (lockedMs > 0) {
      reply.header('retry-after', String(Math.ceil(lockedMs / 1000)));
      throw new AppError('login_locked', 429, 'Đăng nhập sai quá nhiều lần, thử lại sau 15 phút');
    }
    // Tài khoản chỉ có Google (không mật khẩu): từ chối như sai mật khẩu, không đếm vào khoá.
    if (user.passwordHash === null) {
      await burnPasswordCheck(password);
      throw new AppError('invalid_credentials', 401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      await recordLoginFailure(app.db, user.id, now);
      throw new AppError('invalid_credentials', 401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    await clearLoginFailures(app.db, user);
    await startSession(app, req, reply, user, now);
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
    await startSession(app, req, reply, user, now);
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
