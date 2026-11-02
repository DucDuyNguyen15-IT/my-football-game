import Fastify, { type FastifyServerOptions } from 'fastify';
import type { JWTVerifyGetKey } from 'jose';
import type { HealthResponse } from '@pitch/shared';
import { systemClock, type Clock } from './clock';
import { MATCH_MIN_DURATION_SEC } from './config/economy';
import type { Db } from './db/client';
import { cryptoRng, type Rng } from './domain/rng';
import { createGoogleVerifier } from './services/google';
import { pingDb, registerDb } from './plugins/db';
import { AppError, registerErrors } from './plugins/errors';
import { registerAuth } from './plugins/auth';
import { DEFAULT_RATE_LIMIT, registerRateLimit, type RateLimitConfig } from './plugins/rate-limit';
import { registerAuthConfigRoute, registerAuthRoutes } from './routes/auth';
import { registerCardRoutes } from './routes/cards';
import { registerConfigRoutes } from './routes/config';
import { registerDevRoutes } from './routes/dev';
import { registerMatchRoutes } from './routes/matches';
import { registerPackRoutes } from './routes/packs';
import { registerPlayerCardRoutes } from './routes/player-cards';
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
  /** Tin `X-Forwarded-For` từ reverse proxy (Caddy) để rate limit đúng IP người dùng. */
  trustProxy?: boolean;
  /** Giây tối thiểu từ lúc phát match token tới lúc nộp kết quả; mặc định 360 (6 phút). */
  matchMinDurationSec?: number;
  /** OAuth Client ID (Web) cho đăng nhập Google (ADR-0010); không có thì tắt đăng nhập Google. */
  googleClientId?: string | null;
  /** Bộ khoá kiểm ID token Google; mặc định JWKS từ xa của Google (test tiêm khoá cục bộ). */
  googleKeys?: JWTVerifyGetKey;
}

/** Tạo instance Fastify. Tách khỏi `server.ts` để test bằng `app.inject()` mà không mở cổng. */
export function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? false, trustProxy: opts.trustProxy ?? false });
  app.decorate('clock', opts.clock ?? systemClock);
  app.decorate('rng', opts.rng ?? cryptoRng);
  app.decorate('secureCookies', opts.secureCookies ?? true);
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
    });
    if (opts.enableDevRoutes) registerDevRoutes(app);
  }

  return app;
}
