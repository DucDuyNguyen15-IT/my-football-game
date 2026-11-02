import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { buildApp } from './app';
import { loadEnv } from './config/env';
import { purgeExpiredSessions } from './services/auth';

// Nạp `.env` ở gốc repo nếu có (VD `GOOGLE_CLIENT_ID`); biến đã đặt sẵn trong môi trường được ưu tiên.
const envFile = new URL('../../../.env', import.meta.url);
if (existsSync(envFile)) {
  for (const [key, value] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) {
    process.env[key] ??= value;
  }
}

const env = loadEnv();
const app = buildApp({
  databaseUrl: env.databaseUrl,
  logger: true,
  enableDevRoutes: env.enableDevRoutes,
  secureCookies: env.nodeEnv === 'production',
  trustProxy: env.trustProxy,
  googleClientId: env.googleClientId,
});

// Dọn phiên hết hạn mỗi giờ (đăng nhập cũng dọn); lỗi chỉ ghi log, không làm sập server.
const SESSION_PURGE_INTERVAL_MS = 60 * 60 * 1000;
const purgeTimer = setInterval(() => {
  purgeExpiredSessions(app.db, app.clock.now()).catch((err: unknown) => app.log.error(err));
}, SESSION_PURGE_INTERVAL_MS);
purgeTimer.unref();
app.addHook('onClose', async () => clearInterval(purgeTimer));

try {
  await app.listen({ port: env.port, host: env.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
