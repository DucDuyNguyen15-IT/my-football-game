import { z } from 'zod';

/** Giá trị dev khớp `docker-compose.dev.yml`; production bắt buộc đặt biến thật. */
const DEV_DATABASE_URL = 'postgres://pitch:pitch@localhost:5432/pitch';
const DEV_SESSION_SECRET = 'dev-only-session-secret-change-me-please';

const flag = z
  .enum(['0', '1', 'true', 'false'])
  .default('0')
  .transform((v) => v === '1' || v === 'true');

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    DATABASE_URL: z.string().url().optional(),
    SESSION_SECRET: z.string().min(32).optional(),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    HOST: z.string().min(1).default('127.0.0.1'),
    MATCH_MIN_DURATION_SEC: z.coerce.number().int().min(0).default(360),
    ENABLE_DEV_ROUTES: flag,
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['DATABASE_URL', 'SESSION_SECRET'] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'bắt buộc ở production' });
    }
  })
  .transform((env) => ({
    nodeEnv: env.NODE_ENV,
    databaseUrl: env.DATABASE_URL ?? DEV_DATABASE_URL,
    sessionSecret: env.SESSION_SECRET ?? DEV_SESSION_SECRET,
    port: env.PORT,
    host: env.HOST,
    matchMinDurationSec: env.MATCH_MIN_DURATION_SEC,
    enableDevRoutes: env.ENABLE_DEV_ROUTES,
  }));

export type Env = z.infer<typeof EnvSchema>;

/** Đọc biến môi trường; sai thì ném lỗi liệt kê từng biến (server không khởi động). */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = EnvSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(`Biến môi trường không hợp lệ:\n${lines.join('\n')}`);
  }
  return parsed.data;
}
