import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Soi chuyển động (review C5): cùng server/web/DB test như `pnpm e2e`, chỉ chạy `motion.spec.ts`. `pnpm motion`. */
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: 'motion.spec.ts',
  reporter: [['list']],
});
