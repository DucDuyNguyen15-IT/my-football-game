import { loadEnv } from 'vite';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  // E2E (task 8.1) trỏ proxy sang server riêng bằng biến môi trường `API_PROXY_TARGET`;
  // không đặt thì vẫn là server dev :3000.
  const apiTarget = loadEnv(mode, '.', 'API_PROXY_').API_PROXY_TARGET || 'http://127.0.0.1:3000';
  return {
    plugins: [react()],
    server: {
      port: 5173,
      // Dev: chuyển /api sang Fastify để cookie phiên cùng origin (docs/ARCHITECTURE.md §2).
      // Giữ nguyên Host (changeOrigin: false) để server so khớp Origin ↔ Host khi chặn CSRF (§4.1).
      proxy: { '/api': { target: apiTarget, changeOrigin: false } },
    },
    build: {
      // Three.js (ADR-0009) nằm riêng một chunk `three-*.js`, chỉ tải khi vào /play hoặc chạy intro 3D;
      // tách khỏi mã cảnh của game để trình duyệt giữ cache thư viện qua các lần phát hành (task 8.3).
      chunkSizeWarningLimit: 800,
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [{ name: 'three', test: /[\\/]node_modules[\\/]three[\\/]/ }],
          },
        },
      },
    },
    test: {
      environment: 'node',
    },
  };
});
