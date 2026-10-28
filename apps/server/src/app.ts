import Fastify, { type FastifyServerOptions } from 'fastify';
import type { HealthResponse } from '@pitch/shared';
import { systemClock, type Clock } from './clock';
import type { Db } from './db/client';
import { cryptoRng, type Rng } from './domain/rng';
import { pingDb, registerDb } from './plugins/db';
import { AppError, registerErrors } from './plugins/errors';
import { registerAuth } from './plugins/auth';
import { registerAuthRoutes } from './routes/auth';
import { registerCardRoutes } from './routes/cards';
import { registerConfigRoutes } from './routes/config';
import { registerDevRoutes } from './routes/dev';
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
}

/** Tạo instance Fastify. Tách khỏi `server.ts` để test bằng `app.inject()` mà không mở cổng. */
export function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? false });
  app.decorate('clock', opts.clock ?? systemClock);
  app.decorate('rng', opts.rng ?? cryptoRng);
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

  if (app.hasDecorator('db')) {
    registerAuth(app);
    registerAuthRoutes(app);
    registerCardRoutes(app);
    registerPackRoutes(app);
    registerPlayerCardRoutes(app);
    registerSquadRoutes(app);
    if (opts.enableDevRoutes) registerDevRoutes(app);
  }

  return app;
}
