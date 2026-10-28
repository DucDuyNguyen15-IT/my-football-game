import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  Id,
  IdempotencyKey,
  PlayerCardsQuery,
  SellCardsRequest,
  UpgradeCardRequest,
  type PlayerCardsResponse,
  type SellCardsResponse,
  type UpgradeCardResponse,
} from '@pitch/shared';
import { requireAuth } from '../plugins/auth';
import { AppError } from '../plugins/errors';
import { listPlayerCards, sellPlayerCards } from '../services/player-cards';
import { upgradeCard } from '../services/upgrade';

const IdemHeaders = z.object({ 'idempotency-key': IdempotencyKey });

export function registerPlayerCardRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/player-cards',
    { preHandler: requireAuth },
    async (req): Promise<PlayerCardsResponse> => {
      const query = PlayerCardsQuery.parse(req.query);
      const data = await listPlayerCards(app.db, await app.cardCatalog(), {
        userId: req.user!.id,
        ...query,
      });
      return { data };
    },
  );

  app.post(
    '/api/v1/player-cards/sell',
    { preHandler: requireAuth },
    async (req): Promise<SellCardsResponse> => {
      const { playerCardIds } = SellCardsRequest.parse(req.body);
      const data = await sellPlayerCards(
        app.db,
        await app.cardCatalog(),
        req.user!.id,
        playerCardIds.map(Number),
      );
      return { data };
    },
  );

  app.post(
    '/api/v1/player-cards/:id/upgrade',
    { preHandler: requireAuth },
    async (req): Promise<UpgradeCardResponse> => {
      const params = z.object({ id: Id }).safeParse(req.params);
      if (!params.success) throw new AppError('not_found', 404, 'Không tìm thấy thẻ');
      const { 'idempotency-key': idempotencyKey } = IdemHeaders.parse(req.headers);
      const { materialId } = UpgradeCardRequest.parse(req.body);
      const playerCardId = Number(params.data.id);
      const material = Number(materialId);
      // Id ngoài phạm vi số nguyên an toàn không thể là thẻ có thật.
      if (!Number.isSafeInteger(playerCardId) || !Number.isSafeInteger(material)) {
        throw new AppError('not_found', 404, 'Không tìm thấy thẻ');
      }
      const data = await upgradeCard(
        app.db,
        await app.cardCatalog(),
        { userId: req.user!.id, playerCardId, materialId: material, idempotencyKey },
        app.rng,
      );
      return { data };
    },
  );
}
