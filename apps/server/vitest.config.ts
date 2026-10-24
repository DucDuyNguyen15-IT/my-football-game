import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['./test/global-setup.ts'],
    // Các file test dùng chung một DB test (xoá dữ liệu giữa các file) → chạy tuần tự.
    fileParallelism: false,
  },
});
