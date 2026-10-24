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
    // Chunk trận đấu chứa Three.js (~600 KB, ADR-0009), chỉ tải khi vào /play.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'node',
  },
});
