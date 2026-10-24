import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  IdempotencyKey,
  OpenPackRequest,
  type OpenPackResponse,
  type PacksResponse,
} from '@pitch/shared';
import { requireAuth } from '../plugins/auth';
import { AppError } from '../plugins/errors';
import { getPacks, isPackCode, openPack } from '../services/packs';

const OpenParams = z.object({ code: z.string() });
const IdemHeaders = z.object({ 'idempotency-key': IdempotencyKey });

export function registerPackRoutes(app: FastifyInstance): void {
  app.get('/api/v1/packs', { preHandler: requireAuth }, async (req): Promise<PacksResponse> => {
    return { data: await getPacks(app.db, req.user!.id) };
  });

  app.post(
    '/api/v1/packs/:code/open',
    { preHandler: requireAuth },
    async (req): Promise<OpenPackResponse> => {
      const { code } = OpenParams.parse(req.params);
      if (!isPackCode(code)) throw new AppError('not_found', 404, 'Không có gói này');
      const { 'idempotency-key': idempotencyKey } = IdemHeaders.parse(req.headers);
      const { payment } = OpenPackRequest.parse(req.body);
      const data = await openPack(app.db, await app.cardCatalog(), {
        userId: req.user!.id,
        packCode: code,
        payment,
        idempotencyKey,
        now: app.clock.now(),
      });
      return { data };
    },
  );
}
