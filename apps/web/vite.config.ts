import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev: chuyển /api sang Fastify để cookie phiên cùng origin (docs/ARCHITECTURE.md §2).
    // Giữ nguyên Host (changeOrigin: false) để server so khớp Origin ↔ Host khi chặn CSRF (§4.1).
    proxy: { '/api': { target: 'http://127.0.0.1:3000', changeOrigin: false } },
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
});
