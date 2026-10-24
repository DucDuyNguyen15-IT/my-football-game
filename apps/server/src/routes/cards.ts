import type { FastifyInstance } from 'fastify';
import type { CardsResponse } from '@pitch/shared';
import { loadCardCatalog, type CardCatalog } from '../services/cards';

declare module 'fastify' {
  interface FastifyInstance {
    /** Danh mục thẻ, nạp một lần rồi giữ trong bộ nhớ (làm nóng ở `onReady`). */
    cardCatalog(): Promise<CardCatalog>;
  }
}

export function registerCardRoutes(app: FastifyInstance): void {
  let cached: Promise<CardCatalog> | null = null;
  app.decorate('cardCatalog', () => {
    cached ??= loadCardCatalog(app.db).catch((err: unknown) => {
      cached = null; // lỗi DB tạm thời → lần sau thử lại
      throw err;
    });
    return cached;
  });
  app.addHook('onReady', async () => {
    // Không chặn khởi động khi DB chưa sẵn sàng; /health sẽ báo lỗi.
    await app
      .cardCatalog()
      .catch((err: unknown) => app.log.warn({ err }, 'Chưa nạp được danh mục thẻ'));
  });

  app.get('/api/v1/cards', async (req, reply) => {
    const { all, etag } = await app.cardCatalog();
    reply.header('etag', etag).header('cache-control', 'public, max-age=3600');
    if (req.headers['if-none-match'] === etag) return reply.code(304).send();
    const body: CardsResponse = { data: [...all] };
    return body;
  });
}
