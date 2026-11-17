import { defineConfig } from 'tsup';

// Gói server thành 1 file ESM; các package workspace (@pitch/*) là TS nguồn nên phải bundle vào.
export default defineConfig({
  // migrate/seed: dịch vụ `migrate` trong docker-compose.yml chạy chúng trước khi bật server (GĐ9.1).
  // ledger-check: đối soát sổ cái trên DB production (`node dist/ledger-check.js`, chỉ đọc).
  entry: {
    server: 'src/server.ts',
    migrate: 'scripts/migrate.ts',
    seed: 'scripts/seed.ts',
    'ledger-check': 'scripts/ledger-check.ts',
  },
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  noExternal: [/^@pitch\//],
});
