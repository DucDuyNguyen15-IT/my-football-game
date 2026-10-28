import type { FastifyInstance } from 'fastify';
import type { EconomyConfigResponse } from '@pitch/shared';
import { CARD_SALE_PRICE, UPGRADE } from '../config/economy';

/** Số liệu kinh tế công khai cho UI (ARCHITECTURE §4.3 #10). */
export function registerConfigRoutes(app: FastifyInstance): void {
  app.get('/api/v1/config/economy', async (_req, reply): Promise<EconomyConfigResponse> => {
    reply.header('cache-control', 'public, max-age=300');
    return {
      data: {
        cardSalePrice: { ...CARD_SALE_PRICE },
        upgrade: {
          maxLevel: UPGRADE.maxLevel,
          luckPerFail: UPGRADE.luckPerFail,
          steps: UPGRADE.steps.map((s) => ({ ...s })),
          rarityFeeMultiplier: { ...UPGRADE.rarityFeeMultiplier },
        },
      },
    };
  });
}
