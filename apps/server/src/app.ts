import Fastify, { type FastifyServerOptions } from 'fastify';
import type { HealthResponse } from '@pitch/shared';
import { systemClock, type Clock } from './clock';
import type { Db } from './db/client';
import { pingDb, registerDb } from './plugins/db';
import { AppError, registerErrors } from './plugins/errors';
import { registerAuth } from './plugins/auth';
import { registerAuthRoutes } from './routes/auth';
import { registerCardRoutes } from './routes/cards';

declare module 'fastify' {
  interface FastifyInstance {
    clock: Clock;
  }
}

export interface BuildAppOptions {
  /** DB dùng chung (test); không có thì tạo pool từ `databaseUrl`. */
  db?: Db;
  databaseUrl?: string;
  /** Đồng hồ nghiệp vụ; mặc định đồng hồ thật. */
  clock?: Clock;
  logger?: FastifyServerOptions['logger'];
}

/** Tạo instance Fastify. Tách khỏi `server.ts` để test bằng `app.inject()` mà không mở cổng. */
export function buildApp(opts: BuildAppOptions = {}) {
  const app = Fastify({ logger: opts.logger ?? false });
  app.decorate('clock', opts.clock ?? systemClock);
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

  if (app.hasDecorator('db')) {
    registerAuth(app);
    registerAuthRoutes(app);
    registerCardRoutes(app);
  }

  return app;
}
