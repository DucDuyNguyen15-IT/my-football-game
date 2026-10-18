import { configDefaults, defineConfig } from 'vitest/config';

// Test chậm (*.slow.test.ts, VD cân bằng 200 trận) không chạy trong `pnpm test`; chạy bằng
// `pnpm --filter @pitch/sim test:slow`.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, '**/*.slow.test.ts'],
  },
});
