import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type {
  ClaimMissionResponse,
  ExpiredClaimResponse,
  TodayMissionsResponse,
} from '@pitch/shared';
import { requireAuth } from '../plugins/auth';
import { claimExpiredMissions, claimMission, getTodayMissions } from '../services/missions';

const ClaimParams = z.object({ code: z.string().min(1).max(64) });

export function registerMissionRoutes(app: FastifyInstance): void {
  app.get(
    '/api/v1/missions/today',
    { preHandler: requireAuth },
    async (req): Promise<TodayMissionsResponse> => {
      return { data: await getTodayMissions(app.db, req.user!.id, app.clock.now()) };
    },
  );

  // Đăng ký trước route có tham số `:code` cho rõ ràng (Fastify vẫn ưu tiên đường tĩnh).
  app.post(
    '/api/v1/missions/expired/claim',
    { preHandler: requireAuth },
    async (req): Promise<ExpiredClaimResponse> => {
      return { data: await claimExpiredMissions(app.db, req.user!.id, app.clock.now()) };
    },
  );

  app.post(
    '/api/v1/missions/:code/claim',
    { preHandler: requireAuth },
    async (req): Promise<ClaimMissionResponse> => {
      const { code } = ClaimParams.parse(req.params);
      const data = await claimMission(app.db, req.user!.id, code, app.clock.now());
      return { data };
    },
  );
}
