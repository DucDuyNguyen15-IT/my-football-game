import type { FastifyInstance } from 'fastify';
import { LoginRequest, RegisterRequest, type MeResponse } from '@pitch/shared';
import { clearSessionCookie, requireAuth, SESSION_COOKIE, setSessionCookie } from '../plugins/auth';
import { AppError } from '../plugins/errors';
import {
  burnPasswordCheck,
  clearLoginFailures,
  createSession,
  destroySession,
  findUserByUsername,
  loginLockRemainingMs,
  purgeExpiredSessions,
  recordLoginFailure,
  registerUser,
  toMe,
  verifyPassword,
} from '../services/auth';

export function registerAuthRoutes(app: FastifyInstance): void {
  app.post('/api/v1/auth/register', async (req, reply): Promise<MeResponse> => {
    const input = RegisterRequest.parse(req.body);
    const now = app.clock.now();
    const user = await registerUser(app.db, input, now);
    const { token, expiresAt } = await createSession(app.db, user.id, now);
    setSessionCookie(reply, token, expiresAt);
    reply.code(201);
    return { data: toMe(user) };
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
    if (!(await verifyPassword(user.passwordHash, password))) {
      await recordLoginFailure(app.db, user.id, now);
      throw new AppError('invalid_credentials', 401, 'Sai tên đăng nhập hoặc mật khẩu');
    }
    await clearLoginFailures(app.db, user);
    // Xoay token: bỏ phiên cũ trên trình duyệt này (nếu có) rồi cấp phiên mới.
    const old = req.cookies[SESSION_COOKIE];
    if (old) await destroySession(app.db, old);
    await purgeExpiredSessions(app.db, now);
    const { token, expiresAt } = await createSession(app.db, user.id, now);
    setSessionCookie(reply, token, expiresAt);
    return { data: toMe(user) };
  });

  app.post('/api/v1/auth/logout', { preHandler: requireAuth }, async (req, reply) => {
    const token = req.cookies[SESSION_COOKIE];
    if (token) await destroySession(app.db, token);
    clearSessionCookie(reply);
    return reply.code(204).send();
  });

  app.get('/api/v1/me', { preHandler: requireAuth }, async (req): Promise<MeResponse> => {
    return { data: toMe(req.user!) };
  });
}
