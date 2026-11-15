import rateLimit from '@fastify/rate-limit';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from './errors';

/** Giới hạn tần suất (ARCHITECTURE §4.1): 100 req/phút/người dùng; `/auth/*` 10 req/phút/IP. */
export interface RateLimitConfig {
  userPerMinute: number;
  authPerMinute: number;
}

export const DEFAULT_RATE_LIMIT: RateLimitConfig = { userPerMinute: 100, authPerMinute: 10 };

type Limiter = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

declare module 'fastify' {
  interface FastifyInstance {
    /** Bộ giới hạn theo người dùng — `requireAuth` gọi sau khi đã biết `request.user`. */
    userRateLimit: Limiter;
  }
}

const AUTH_PREFIX = '/api/v1/auth/';
const noop: Limiter = async () => {};
// So theo mẫu route đã khớp, không theo `req.url` thô: router giải mã `%xx` nên `/api/v1/%61uth/login`
// vẫn vào route đăng nhập mà `req.url` không bắt đầu bằng AUTH_PREFIX (né giới hạn /auth).
const isAuthRoute = (req: FastifyRequest) => req.routeOptions.url?.startsWith(AUTH_PREFIX) ?? false;

/**
 * Đăng ký `@fastify/rate-limit` ở chế độ `global: false` và tự gọi limiter trong hook: route khai báo
 * đồng bộ trong `buildApp` chạy trước khi plugin nạp xong nên `config.rateLimit` theo route không có
 * tác dụng. Mỗi request chỉ bị tính một lần (plugin tự đánh dấu): `/auth/*` tính theo IP, còn lại
 * tính theo người dùng trong `requireAuth`. Vượt giới hạn → 429 `rate_limited` kèm `Retry-After`.
 * Store trong bộ nhớ — đủ cho một tiến trình server (ADR-0007).
 */
export function registerRateLimit(app: FastifyInstance, config: RateLimitConfig | false): void {
  app.decorate('userRateLimit', noop);
  if (config === false) return;

  let authLimit: Limiter = noop;
  app.register(rateLimit, {
    global: false,
    timeWindow: 60_000,
    errorResponseBuilder: (_req, ctx) =>
      new AppError('rate_limited', 429, `Quá nhiều yêu cầu, thử lại sau ${ctx.after}`),
  });
  app.after(() => {
    authLimit = app.rateLimit({
      max: config.authPerMinute,
      keyGenerator: (req) => `ip:${req.ip}`,
    });
    const userLimiter = app.rateLimit({
      max: config.userPerMinute,
      keyGenerator: (req) => `user:${req.user?.id ?? `ip:${req.ip}`}`,
    });
    // Các route `/api/v1/auth/*` (kể cả `/logout`) đã qua `authLimit` ở `onRequest` nên không đếm lần 2.
    app.userRateLimit = async (req, reply) => {
      if (isAuthRoute(req)) return;
      return userLimiter.call(app, req, reply);
    };
  });
  app.addHook('onRequest', async (req, reply) => {
    if (isAuthRoute(req)) await authLimit(req, reply);
  });
}
