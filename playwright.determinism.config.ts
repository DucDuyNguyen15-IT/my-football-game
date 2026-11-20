import { defineConfig, devices } from '@playwright/test';

/** T006: tất định giữa trình duyệt. Không cần server/DB. `pnpm e2e:determinism`. */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'determinism.spec.ts',
  timeout: 3_600_000,
  workers: 1,
  reporter: [['list']],
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
});
