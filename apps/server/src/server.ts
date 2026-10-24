import { buildApp } from './app';
import { loadEnv } from './config/env';

const env = loadEnv();
const app = buildApp({
  databaseUrl: env.databaseUrl,
  logger: true,
  enableDevRoutes: env.enableDevRoutes,
});

try {
  await app.listen({ port: env.port, host: env.host });
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
