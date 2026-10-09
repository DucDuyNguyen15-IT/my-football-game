import { defineConfig } from 'vitest/config';

// Mỗi package/app là một "project" của Vitest; `pnpm test` ở gốc chạy tất cả.
export default defineConfig({
  test: {
    projects: ['packages/*', 'apps/*'],
  },
});
