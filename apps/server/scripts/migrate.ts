// pnpm --filter @pitch/server db:migrate — áp các migration chưa chạy lên DATABASE_URL.
import { loadEnv } from '../src/config/env';
import { runMigrations } from '../src/db/migrate';

const env = loadEnv();
await runMigrations(env.databaseUrl);
console.log('Đã chạy migration.');
