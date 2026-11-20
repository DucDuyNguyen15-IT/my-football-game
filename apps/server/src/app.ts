import { randomBytes } from 'node:crypto';
import Fastify, { type FastifyServerOptions, type RouteOptions } from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import type { HealthResponse } from '@pitch/shared';
import { systemClock, type Clock } from './clock';
import { MATCH_MIN_DURATION_SEC } from './config/economy';
import type { Db } from './db/client';
import { cryptoRng, type Rng } from './domain/rng';
import { createGoogleVerifier } from './services/google';
import type { ReplayOptions } from './services/matches';
import { cancelLiveMatches } from './services/pvp/finish';
import { runReplayInWorker } from './services/replay';
import { pingDb, registerDb } from './plugins/db';
import { AppError, registerErrors } from './plugins/errors';
import { registerAuth } from './plugins/auth';
import { DEFAULT_RATE_LIMIT, registerRateLimit, type RateLimitConfig } from './plugins/rate-limit';
import { registerAdminRoutes } from './routes/admin';
import { registerAuthConfigRoute, registerAuthRoutes } from './routes/auth';
import { registerCardRoutes } from './routes/cards';
import { registerConfigRoutes } from './routes/config';
import { registerDevRoutes } from './routes/dev';
import { registerMatchRoutes } from './routes/matches';
import { registerMissionRoutes } from './routes/missions';
import { registerPackRoutes } from './routes/packs';
import { registerPlayerCardRoutes } from './routes/player-cards';
import { registerPvpRoutes, type PvpRouteOptions } from './routes/pvp';
import { registerSquadRoutes } from './routes/squad';

declare module 'fastify' {
  interface FastifyInstance {
    clock: Clock;
    /** Nguồn ngẫu nhiên cho ép thẻ; mặc định CSPRNG (`node:crypto`). */
    rng: Rng;
  }
}

export interface BuildAppOptions {
  /** DB dùng chung (test); không có thì tạo pool từ `databaseUrl`. */
  db?: Db;
  databaseUrl?: string;
  /** Đồng hồ nghiệp vụ; mặc định đồng hồ thật. */
  clock?: Clock;
  logger?: FastifyServerOptions['logger'];
  /** Đăng ký `/api/v1/dev/*` (từ `ENABLE_DEV_ROUTES=1`); mặc định tắt. */
  enableDevRoutes?: boolean;
  /** Nguồn ngẫu nhiên tiêm được (test ép thẻ); mặc định `cryptoRng`. */
  rng?: Rng;
  /** Giới hạn tần suất; `false` để tắt (test). Mặc định {@link DEFAULT_RATE_LIMIT}. */
  rateLimit?: RateLimitConfig | false;
  /** Cookie phiên có `Secure`; mặc định bật, `server.ts` chỉ bật ở production. */
  secureCookies?: boolean;
  /** Khoá ký cookie thiết bị quen `did`; mặc định ngẫu nhiên mỗi lần chạy (cookie mất hiệu lực khi khởi động lại). */
  sessionSecret?: string;
  /** Tin `X-Forwarded-For` từ reverse proxy (Caddy) để rate limit đúng IP người dùng. */
  trustProxy?: boolean;
  /** Giây tối thiểu từ lúc phát match token tới lúc nộp kết quả; mặc định 360 (6 phút). */
  matchMinDurationSec?: number;
  /** Chạy lại trận khi nộp kết quả; mặc định worker thread. Test tiêm tham số dev (SEC-07). */
  replay?: ReplayOptions;
  /** OAuth Client ID (Web) cho đăng nhập Google (ADR-0010); không có thì tắt đăng nhập Google. */
  googleClientId?: string | null;
  /** Bộ khoá kiểm ID token Google; mặc định JWKS từ xa của Google (test tiêm khoá cục bộ). */
  googleKeys?: JWTVerifyGetKey;
  /** Tuỳ chọn PvP (test tiêm nguồn thời gian giả, trần phiên, trần kết nối/IP). */
  pvp?: PvpRouteOptions;
  /** Gọi cho mỗi route được đăng ký (test rà soát: mọi route ghi phải yêu cầu đăng nhập). */
  onRoute?: (route: RouteOptions) => void;
}

/** Giới hạn kích thước body JSON (64 KiB) để tránh payload phình to. */
export const BODY_LIMIT_BYTES = 64 * 1024;

/** Tạo instance Fastify. Tách khỏi `server.ts` để test bằng `app.inject()` mà không mở cổng. */
export function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({
    logger: opts.logger ?? false,
    trustProxy: opts.trustProxy ?? false,
    bodyLimit: BODY_LIMIT_BYTES,
  });
  if (opts.onRoute) app.addHook('onRoute', opts.onRoute);
  app.addHook('onSend', async (_req, reply) => {
    reply
      .header('x-content-type-options', 'nosniff')
      .header('x-frame-options', 'DENY')
      .header('referrer-policy', 'no-referrer')
      .header('content-security-policy', "default-src 'none'; frame-ancestors 'none'");
    if (!reply.hasHeader('cache-control')) {
      reply.header('cache-control', 'no-store');
    }
  });
  app.decorate('clock', opts.clock ?? systemClock);
  app.decorate('rng', opts.rng ?? cryptoRng);
  app.decorate('secureCookies', opts.secureCookies ?? true);
  app.decorate('sessionSecret', opts.sessionSecret ?? randomBytes(32).toString('hex'));
  registerErrors(app);
  if (opts.db) registerDb(app, { db: opts.db });
  else if (opts.databaseUrl) registerDb(app, { url: opts.databaseUrl });

  app.get('/api/v1/health', async (): Promise<HealthResponse> => {
    if (app.hasDecorator('db')) {
      try {
        await pingDb(app.db);
      } catch {
        throw new AppError('internal_error', 503, 'Không kết nối được cơ sở dữ liệu');
      }
    }
    return { data: { status: 'ok' } };
  });

  registerConfigRoutes(app);
  const google = opts.googleClientId
    ? {
        clientId: opts.googleClientId,
        verify: createGoogleVerifier(opts.googleClientId, opts.googleKeys),
      }
    : null;
  registerAuthConfigRoute(app, google);

  if (app.hasDecorator('db')) {
    registerRateLimit(app, opts.rateLimit ?? DEFAULT_RATE_LIMIT);
    registerAuth(app);
    registerAuthRoutes(app, google);
    registerCardRoutes(app);
    registerPackRoutes(app);
    registerPlayerCardRoutes(app);
    registerSquadRoutes(app);
    registerMatchRoutes(app, {
      minDurationSec: opts.matchMinDurationSec ?? MATCH_MIN_DURATION_SEC,
      replay: opts.replay ?? { run: runReplayInWorker },
    });
    registerMissionRoutes(app);
    registerPvpRoutes(app, opts.pvp);
    // shortcut: trạng thái trong bộ nhớ một tiến trình, nâng cấp khi chạy nhiều instance.
    // Khởi động lại làm mất mọi phiên đang đá: huỷ các trận `live` (server_restart).
    app.addHook('onReady', async () => {
      await cancelLiveMatches(app.db, app.clock.now(), (err) =>
        app.log.error({ err }, 'huỷ trận live thất bại'),
      );
    });
    registerAdminRoutes(app);
    if (opts.enableDevRoutes) registerDevRoutes(app);
  }

  return app;
}
