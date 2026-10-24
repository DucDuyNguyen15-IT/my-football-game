import { defineConfig } from 'drizzle-kit';

// `db:generate` chỉ đọc schema → sinh SQL vào `drizzle/`; `dbCredentials` dùng cho lệnh studio/check.
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'postgres://pitch:pitch@localhost:5432/pitch',
  },
});
