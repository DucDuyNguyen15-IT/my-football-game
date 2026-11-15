# Image production (GĐ9.1, ADR-0007). Hai target dùng chung bước build:
#   server: Fastify (Node 24), chạy user `node`; dịch vụ `migrate` dùng lại image này với lệnh khác.
#   web: Caddy phục vụ build tĩnh của apps/web + reverse proxy /api.
# Dựng: `docker compose up -d --build` (docker-compose.yml).

FROM node:24-slim AS build
WORKDIR /repo
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @pitch/server build && pnpm --filter @pitch/web build
# Chỉ dependency production của server (workspace @pitch/* đã được tsup bundle vào dist).
RUN pnpm --filter @pitch/server deploy --prod --legacy /out/server

FROM node:24-slim AS server
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 TRUST_PROXY=1
# Bố cục giữ đúng đường dẫn tương đối trong code: dist/../../drizzle (MIGRATIONS_FOLDER) = /app/drizzle,
# dist/seed/cards.json (CARDS_SEED_FILE). File do root sở hữu, tiến trình chạy bằng `node` → chỉ đọc.
WORKDIR /app/server
COPY --from=build /out/server/package.json ./package.json
COPY --from=build /out/server/node_modules ./node_modules
COPY --from=build /repo/apps/server/dist ./dist
COPY --from=build /repo/apps/server/src/db/seed/cards.json ./dist/seed/cards.json
COPY --from=build /repo/apps/server/drizzle /app/drizzle
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/v1/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "dist/server.js"]

FROM caddy:2-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /repo/apps/web/dist /srv
