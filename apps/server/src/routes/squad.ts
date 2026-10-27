import type { FastifyInstance } from 'fastify';
import { PutSquadRequest, type SquadResponse } from '@pitch/shared';
import { requireAuth } from '../plugins/auth';
import { getSquad, putSquad } from '../services/squad';

export function registerSquadRoutes(app: FastifyInstance): void {
  app.get('/api/v1/squad', { preHandler: requireAuth }, async (req): Promise<SquadResponse> => {
    return { data: await getSquad(app.db, await app.cardCatalog(), req.user!.id) };
  });

  app.put('/api/v1/squad', { preHandler: requireAuth }, async (req): Promise<SquadResponse> => {
    const body = PutSquadRequest.parse(req.body);
    const data = await putSquad(
      app.db,
      await app.cardCatalog(),
      req.user!.id,
      body,
      app.clock.now(),
    );
    return { data };
  });
}
