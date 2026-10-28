import { buildApp } from './app';
import { loadEnv } from './config/env';
import { purgeExpiredSessions } from './services/auth';

const env = loadEnv();
const app = buildApp({
  databaseUrl: env.databaseUrl,
  logger: true,
  enableDevRoutes: env.enableDevRoutes,
  secureCookies: env.nodeEnv === 'production',
  trustProxy: env.trustProxy,
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
