import type { FastifyInstance } from 'fastify';
import { GrantCoinsRequest, type GrantCoinsResponse } from '@pitch/shared';
import { requireAuth } from '../plugins/auth';
import { applyCoinDelta, lockUser } from '../services/wallet';

/**
 * Route `/api/v1/dev/*` cho chơi thử khi phát triển. `app.ts` **chỉ đăng ký khi `ENABLE_DEV_ROUTES=1`**
 * (ARCHITECTURE §8) — không suy ra từ `NODE_ENV`.
 */
export function registerDevRoutes(app: FastifyInstance): void {
  app.post(
    '/api/v1/dev/grant-coins',
    { preHandler: requireAuth },
    async (req): Promise<GrantCoinsResponse> => {
      const { amount } = GrantCoinsRequest.parse(req.body);
      const userId = req.user!.id;
      const balance = await app.db.transaction(async (tx) => {
        await lockUser(tx, userId);
        return applyCoinDelta(tx, userId, amount, 'admin_adjust', null);
      });
      return { data: { balance } };
    },
  );
}
