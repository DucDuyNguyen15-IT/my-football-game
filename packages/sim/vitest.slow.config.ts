import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.slow.test.ts'],
    testTimeout: 30 * 60 * 1000,
  },
});
