import { runMigrations } from '../src/db/migrate';
import { TEST_DATABASE_URL } from './db-url';

/** Trước mọi file test của server: đưa DB test lên migration mới nhất. */
export default async function setup(): Promise<void> {
  await runMigrations(TEST_DATABASE_URL);
}
