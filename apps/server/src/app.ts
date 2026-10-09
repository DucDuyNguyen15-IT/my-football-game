import Fastify, { type FastifyServerOptions } from 'fastify';
import type { HealthResponse } from '@pitch/shared';

/** Tạo instance Fastify. Tách khỏi `server.ts` để test bằng `app.inject()` mà không mở cổng. */
export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  app.get('/api/v1/health', async (): Promise<HealthResponse> => ({ data: { status: 'ok' } }));

  return app;
}
