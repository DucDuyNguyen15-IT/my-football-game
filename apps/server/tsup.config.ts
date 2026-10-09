import { defineConfig } from 'tsup';

// Gói server thành 1 file ESM; các package workspace (@pitch/*) là TS nguồn nên phải bundle vào.
export default defineConfig({
  entry: ['src/server.ts'],
  format: ['esm'],
  target: 'node24',
  platform: 'node',
  clean: true,
  sourcemap: true,
  noExternal: [/^@pitch\//],
});
