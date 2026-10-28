import type { FastifyInstance } from 'fastify';
import { StartMatchRequest, type StartMatchResponse } from '@pitch/shared';
import { requireAuth } from '../plugins/auth';
import { startMatch } from '../services/matches';

export function registerMatchRoutes(app: FastifyInstance): void {
  app.post('/api/v1/matches', { preHandler: requireAuth }, async (req, reply) => {
    const { difficulty } = StartMatchRequest.parse(req.body);
    const data = await startMatch(
      app.db,
      await app.cardCatalog(),
      req.user!.id,
      difficulty,
      app.clock.now(),
      app.rng,
    );
    const body: StartMatchResponse = { data };
    return reply.status(201).send(body);
  });
}
