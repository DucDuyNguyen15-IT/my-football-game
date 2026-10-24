import { z } from 'zod';
import { dataEnvelope } from './common';

/** POST /api/v1/dev/grant-coins — chỉ có khi server bật `ENABLE_DEV_ROUTES=1` (ARCHITECTURE §8). */
export const GrantCoinsRequest = z.object({
  amount: z
    .number()
    .int()
    .min(-1_000_000)
    .max(1_000_000)
    .refine((v) => v !== 0, 'amount khác 0'),
});
export type GrantCoinsRequest = z.infer<typeof GrantCoinsRequest>;

export const GrantCoinsResponse = dataEnvelope(z.object({ balance: z.number().int().min(0) }));
export type GrantCoinsResponse = z.infer<typeof GrantCoinsResponse>;
