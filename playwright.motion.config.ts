import { defineConfig } from '@playwright/test';
import base from './playwright.config';

/** Soi chuyển động (review C5): cùng server/web/DB test như `pnpm e2e`. `pnpm motion` = đấu máy (motion.spec), `pnpm motion:pvp` = PvP hai bên (motion-pvp.spec); script lọc theo tên. */
export default defineConfig({
  ...base,
  testIgnore: undefined,
  testMatch: 'motion*.spec.ts',
  reporter: [['list']],
});
