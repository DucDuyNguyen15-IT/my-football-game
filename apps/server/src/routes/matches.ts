import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import {
  Id,
  StartMatchRequest,
  SubmitMatchResultRequest,
  type MatchResultResponse,
  type StartMatchResponse,
} from '@pitch/shared';
import { requireAuth } from '../plugins/auth';
import { AppError } from '../plugins/errors';
import { startMatch, submitMatchResult } from '../services/matches';

export function registerMatchRoutes(app: FastifyInstance, opts: { minDurationSec: number }): void {
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

  app.post(
    '/api/v1/matches/:id/result',
    { preHandler: requireAuth },
    async (req): Promise<MatchResultResponse> => {
      const params = z.object({ id: Id }).safeParse(req.params);
      const matchId = params.success ? Number(params.data.id) : NaN;
      // Id ngoài phạm vi số nguyên an toàn không thể là trận có thật.
      if (!Number.isSafeInteger(matchId))
        throw new AppError('not_found', 404, 'Không tìm thấy trận');
      const body = SubmitMatchResultRequest.parse(req.body);
      const data = await submitMatchResult(app.db, {
        ...body,
        userId: req.user!.id,
        matchId,
        now: app.clock.now(),
        minDurationSec: opts.minDurationSec,
      });
      return { data };
    },
  );
}
