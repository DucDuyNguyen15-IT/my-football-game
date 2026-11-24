import { defineConfig, devices } from '@playwright/test';

/**
 * E2E luồng chính (task 8.1). `pnpm e2e` tự bật server Fastify + web Vite trên cổng riêng, không đụng
 * `pnpm dev` (:3000/:5173) và KHÔNG dùng DB dev `pitch`.
 * - DB: `E2E_DATABASE_URL` → `DATABASE_URL_TEST` → `pitch_test` (migrate + seed trước khi bật server;
 *   không xoá dữ liệu — mỗi lần chạy đăng ký tài khoản mới).
 * - `MATCH_MIN_DURATION_SEC=1` để trận `?half=10` được nhận thưởng; web chạy Vite `--mode test`
 *   (cho phép `?half=` và `?autopilot=1`, task 5.10).
 */
const SERVER_PORT = Number(process.env.E2E_SERVER_PORT ?? 3101);
const WEB_PORT = Number(process.env.E2E_WEB_PORT ?? 5174);
const DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  process.env.DATABASE_URL_TEST ??
  'postgres://pitch:pitch@localhost:5432/pitch_test';

// E2E migrate + seed DB này: chỉ cho DB test trên máy (R78-2), không bao giờ DB dev `pitch` hay DB thật.
const dbUrl = new URL(DATABASE_URL);
if (
  !['localhost', '127.0.0.1'].includes(dbUrl.hostname) ||
  !dbUrl.pathname.startsWith('/pitch_test')
) {
  throw new Error(
    'E2E chỉ chạy trên DB test cục bộ (host localhost/127.0.0.1, tên bắt đầu `pitch_test`) — đặt E2E_DATABASE_URL.',
  );
}

const API_ORIGIN = `http://127.0.0.1:${SERVER_PORT}`;
const WEB_ORIGIN = `http://localhost:${WEB_PORT}`;

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['determinism.spec.ts', 'motion.spec.ts'],
  // Một trận autopilot `?half=10` mất ~1 phút (lâu hơn nếu hoà → luân lưu) trên WebGL phần mềm.
  timeout: 360_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: WEB_ORIGIN,
    locale: 'vi-VN',
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
  ],
  webServer: [
    {
      name: 'server',
      command:
        'pnpm --filter @pitch/server db:migrate && pnpm --filter @pitch/server db:seed && pnpm --filter @pitch/server exec tsx src/server.ts',
      url: `${API_ORIGIN}/api/v1/health`,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: {
        DATABASE_URL,
        NODE_ENV: 'test',
        HOST: '127.0.0.1',
        PORT: String(SERVER_PORT),
        MATCH_MIN_DURATION_SEC: '1',
        // Server replay đúng trận `?half=10&autopilot=1` của web (SEC-07).
        REPLAY_TEST_HALF_LENGTH_SEC: '10',
        REPLAY_TEST_AUTOPILOT: '1',
        ENABLE_DEV_ROUTES: '0',
        // Không bật đăng nhập Google dù `.env` có Client ID (kịch bản chỉ dùng tên + mật khẩu).
        GOOGLE_CLIENT_ID: '',
      },
    },
    {
      name: 'web',
      command: `pnpm --filter @pitch/web exec vite --mode test --port ${WEB_PORT} --strictPort`,
      url: WEB_ORIGIN,
      reuseExistingServer: false,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'pipe',
      env: { API_PROXY_TARGET: API_ORIGIN },
    },
  ],
});
