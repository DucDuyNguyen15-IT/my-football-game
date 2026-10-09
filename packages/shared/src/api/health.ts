import { z } from 'zod';
import { dataEnvelope } from './common';

/** GET /api/v1/health */
export const HealthResponse = dataEnvelope(z.object({ status: z.literal('ok') }));
export type HealthResponse = z.infer<typeof HealthResponse>;
