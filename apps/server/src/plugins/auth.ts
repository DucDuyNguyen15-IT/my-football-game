import cookie from '@fastify/cookie';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { resolveSession, type UserRow } from '../services/auth';
import { AppError } from './errors';

export const SESSION_COOKIE = 'sid';

declare module 'fastify' {
  interface FastifyRequest {
    /** Có sau `requireAuth`. */
    user: UserRow | null;
  }
  interface FastifyInstance {
    /** Cookie phiên có cờ `Secure` (bật ở production — ARCHITECTURE §4.1). */
    secureCookies: boolean;
  }
}

const MUTATING = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const cookieOpts = (reply: FastifyReply) =>
  ({ httpOnly: true, secure: reply.server.secureCookies, sameSite: 'lax', path: '/' }) as const;

export function setSessionCookie(reply: FastifyReply, token: string, expiresAt: Date): void {
  reply.setCookie(SESSION_COOKIE, token, { ...cookieOpts(reply), expires: expiresAt });
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, cookieOpts(reply));
}

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null; // Origin hỏng (VD "null")
  }
}

/**
 * Cookie + chặn CSRF đơn giản (ARCHITECTURE §4.1): request đổi dữ liệu phải gửi
 * `Content-Type: application/json`, và nếu có `Origin` thì phải khớp `Host`.
 */
export function registerAuth(app: FastifyInstance): void {
  app.register(cookie);
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req) => {
    if (!MUTATING.has(req.method) || !req.url.startsWith('/api/')) return;
    if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) {
      throw new AppError('validation_error', 415, 'Cần Content-Type: application/json');
    }
    const origin = req.headers.origin;
    if (origin !== undefined && originHost(origin) !== req.headers.host) {
      throw new AppError('forbidden', 403, 'Nguồn yêu cầu không hợp lệ');
    }
  });
}

/** preHandler: bắt buộc đăng nhập, gắn `request.user`. */
export async function requireAuth(
  this: FastifyInstance,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  const session = token ? await resolveSession(this.db, token, this.clock.now()) : null;
  if (!token || !session) throw new AppError('unauthenticated', 401, 'Chưa đăng nhập');
  if (session.renewedUntil) setSessionCookie(reply, token, session.renewedUntil);
  req.user = session.user;
  await this.userRateLimit(req, reply);
}
