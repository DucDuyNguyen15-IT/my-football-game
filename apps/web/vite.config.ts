import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // Dev: chuyển /api sang Fastify để cookie phiên cùng origin (docs/ARCHITECTURE.md §2).
    proxy: { '/api': 'http://127.0.0.1:3000' },
  },
  test: {
    environment: 'node',
  },
});
