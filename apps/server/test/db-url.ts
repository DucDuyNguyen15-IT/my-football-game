/** DB test: `DATABASE_URL_TEST`, mặc định DB `pitch_test` của `docker-compose.dev.yml`. */
export const TEST_DATABASE_URL =
  process.env.DATABASE_URL_TEST ?? 'postgres://pitch:pitch@localhost:5432/pitch_test';
