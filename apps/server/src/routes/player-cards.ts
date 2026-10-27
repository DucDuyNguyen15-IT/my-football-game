import type { FastifyInstance } from 'fastify';
import {
  PlayerCardsQuery,
  SellCardsRequest,
  type PlayerCardsResponse,
  type SellCardsResponse,
} from '@pitch/shared';
import { requireAuth } from '../plugins/auth';
import { listPlayerCards, sellPlayerCards } from '../services/player-cards';

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
}
