import type { FastifyInstance } from 'fastify';
import { RetentionQuery, type RetentionResponse } from '@pitch/shared';
import { requireAdmin } from '../plugins/auth';
import { getRetentionCohorts } from '../services/analytics';

export function registerAdminRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/admin/retention',
    { preHandler: requireAdmin },
    async (req): Promise<RetentionResponse> => {
      const query = RetentionQuery.parse(req.query);
      const data = await getRetentionCohorts(app.db, app.clock.now(), query);
      return { data };
    },
  );
}
