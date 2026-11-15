#!/bin/sh
# Chạy một lần khi volume Postgres còn trống. Tách quyền (checklist bảo mật GĐ9):
#   pitch_owner (POSTGRES_USER): chủ DB, chạy migration + seed (dịch vụ `migrate`).
#   pitch_app: server dùng, chỉ SELECT/INSERT/UPDATE/DELETE, không DDL, không superuser.
set -eu
psql -v ON_ERROR_STOP=1 -v app_pw="$APP_DB_PASSWORD" --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
CREATE ROLE pitch_app LOGIN PASSWORD :'app_pw';
GRANT CONNECT ON DATABASE pitch TO pitch_app;
GRANT USAGE ON SCHEMA public TO pitch_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pitch_owner IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO pitch_app;
ALTER DEFAULT PRIVILEGES FOR ROLE pitch_owner IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO pitch_app;
SQL
