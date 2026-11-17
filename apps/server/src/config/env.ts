import { z } from 'zod';
import { MATCH_MAX_AGE_SEC, MATCH_MIN_DURATION_SEC } from './economy';

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
    // Trên MATCH_MAX_AGE_SEC thì không trận nào nộp kịp (R78-3 / B3-01).
    MATCH_MIN_DURATION_SEC: z.coerce
      .number()
      .int()
      .min(0)
      .max(MATCH_MAX_AGE_SEC - 1)
      .default(MATCH_MIN_DURATION_SEC),
    ENABLE_DEV_ROUTES: flag,
    TRUST_PROXY: flag,
    /** OAuth Client ID (Web) của Google (ADR-0010); để trống = tắt đăng nhập Google. */
    GOOGLE_CLIENT_ID: z
      .string()
      .trim()
      .transform((v) => v || undefined)
      .pipe(
        z
          .string()
          .regex(/^[\w.-]+\.apps\.googleusercontent\.com$/)
          .optional(),
      )
      .optional(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV !== 'production') return;
    for (const key of ['DATABASE_URL', 'SESSION_SECRET'] as const) {
      if (!env[key])
        ctx.addIssue({ code: 'custom', path: [key], message: 'bắt buộc ở production' });
    }
    // `cp .env.example .env` rồi quên đổi: giá trị mẫu ai cũng biết, không được dùng ở production.
    if (env.SESSION_SECRET === DEV_SESSION_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_SECRET'],
        message: 'đang là giá trị mẫu của .env.example, hãy đổi thành chuỗi ngẫu nhiên',
      });
    }
    // Chốt thời lượng là lớp chống nộp trận giả duy nhất (SEC-07): production không được hạ dưới mặc định.
    if (env.MATCH_MIN_DURATION_SEC < MATCH_MIN_DURATION_SEC) {
      ctx.addIssue({
        code: 'custom',
        path: ['MATCH_MIN_DURATION_SEC'],
        message: `production tối thiểu ${MATCH_MIN_DURATION_SEC}`,
      });
    }
    if (env.ENABLE_DEV_ROUTES) {
      ctx.addIssue({
        code: 'custom',
        path: ['ENABLE_DEV_ROUTES'],
        message: 'không được bật ở production',
      });
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
    trustProxy: env.TRUST_PROXY,
    googleClientId: env.GOOGLE_CLIENT_ID ?? null,
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
