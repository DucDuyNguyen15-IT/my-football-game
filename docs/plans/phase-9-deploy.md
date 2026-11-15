# Giai đoạn 9 — Deploy & bàn giao

**Mục tiêu:** game chạy thật trên Internet, người khác tự dựng lại được.
**Hoàn thành giai đoạn khi** (ROADMAP): có link chạy thật · README đủ để người khác tự chạy.

---

### 9.1 — Đóng gói Docker `[x]`
- **Xong 2026-11-16:** `Dockerfile` (target `server`, `web`), `deploy/Caddyfile`, `deploy/postgres-init/01-app-role.sh`, `docker-compose.yml`, `.env.example` phần Production. Đã kiểm trên máy local: `https://localhost` đăng ký → mở gói → vào trận 3D không lỗi CSP; restart giữ dữ liệu; `/api/v1/dev/grant-coins` → 404; role `pitch_app` tạo bảng bị từ chối. Thiếu `player.glb`/`ball.glb`/`goal.glb` lúc build thì game vẽ bằng code (file nằm trong `apps/web/public/models/` của máy build sẽ được đóng vào image).
- **Phụ thuộc:** GĐ8 xong · **Model:** default
- **Bối cảnh:** ADR-0007; ARCHITECTURE §8; `apps/server/tsup.config.ts`; skill `ecc:docker-patterns`.
- **Việc cần làm:** `apps/server/Dockerfile` multi-stage (`pnpm deploy --prod`, chạy user không phải root, healthcheck `/api/v1/health`); image Caddy chứa build tĩnh của web; `Caddyfile` (HTTPS tự động, `/api/*` → server, còn lại → SPA fallback, header bảo mật, nén); `docker-compose.yml` (caddy + server + postgres, volume, restart policy, secrets qua `.env`); migration tự chạy khi server khởi động; `.env.example` đầy đủ.
- **Kiểm chứng:** `docker compose up --build` trên máy local → mở `https://localhost` đi hết luồng chính; restart container không mất dữ liệu; `curl -X POST https://localhost/api/v1/dev/grant-coins` → 404 (image prod không bật `ENABLE_DEV_ROUTES`); `?autopilot=1` không có tác dụng trên build prod.
- **Xong khi:** một lệnh dựng được toàn hệ thống.

### 9.2 — Chọn nhà cung cấp & deploy `[ ]`
- **Lưu ý (2026-10-14, task 5.18d):** `apps/web/public/models/player.glb` không có trong Git (giấy phép Mixamo, repo public). Khi deploy: chạy `pnpm assets` trên máy có `assets-src/mixamo/` rồi **chép tay** file `player.glb` vào thư mục web tĩnh trên server (hoặc mount volume trong Docker) — agent phải hướng dẫn chủ dự án từng bước. Thiếu file thì game vẫn chạy với cầu thủ khối.
- **Phụ thuộc:** 9.1 · **Model:** strongest
- **Bối cảnh:** ADR-0007 (đang `proposed`); skill `ecc:deployment-patterns`.
- **Việc cần làm:** hỏi người dùng chốt ngân sách/nhà cung cấp → cập nhật ADR-0007 thành `accepted` (hoặc ADR mới nếu đổi hướng). Dựng VPS: firewall (chỉ 22/80/443), SSH key, cập nhật tự động; trỏ domain; deploy; cron `pg_dump` hằng ngày ra nơi lưu trữ ngoài + **thử khôi phục** một lần; ghi quy trình deploy/rollback.
- **Kiểm chứng:** link HTTPS công khai chạy luồng chính; file backup tồn tại và khôi phục được vào DB trống.
- **Xong khi:** tiêu chí "có link chạy thật".

**Checklist bảo mật khi deploy (rà 2026-11-16, phần code server đã đạt — xem `docs/QA-REPORT.md` §1):** áp vào 9.1/9.2.
- Postgres trong `docker-compose.yml` prod **không** khai báo `ports` (chỉ mạng nội bộ Docker); server cũng chỉ lộ qua Caddy.
- Tách user DB: role chủ (chạy migration) và role ứng dụng chỉ có `SELECT/INSERT/UPDATE/DELETE` trên bảng `public` (không DDL, không superuser).
- `TRUST_PROXY=1` chỉ khi server đứng sau Caddy và Caddy đặt lại `X-Forwarded-For`; nếu thêm Cloudflare phía trước thì Caddy chỉ tin IP Cloudflare (`trusted_proxies`) — sai cấu hình là né được rate limit theo IP.
- Caddyfile: HTTPS + chuyển hướng HTTP→HTTPS, HSTS, CSP cho trang SPA (`default-src 'self'`, cho phép `accounts.google.com` nếu bật đăng nhập Google), `X-Frame-Options`/`nosniff`/`Referrer-Policy`.
- Không có CORS (web và API cùng origin) — giữ nguyên, không thêm `@fastify/cors`.
- Backup Postgres tự động (đã có ở 9.2) + theo dõi lỗi: ít nhất cảnh báo khi healthcheck lỗi và gom log `internal_error` của server.

**Checklist pháp lý & dữ liệu trước khi public (rà 2026-11-16):** áp vào 9.2, xong trước khi đưa link công khai.
- [x] (2026-11-16, `/privacy`, `/terms`, liên hệ `nguyenduycn06@gmail.com`; lời hứa "bản sao lưu giữ tối đa 30 ngày" → 9.2 phải cấu hình xoay vòng backup ≤ 30 ngày) Trang **Chính sách bảo mật** (dữ liệu lưu: tên đăng nhập, hash mật khẩu, mã Google + email nếu đăng nhập Google, sự kiện analytics nội bộ; cookie `sid` chỉ để đăng nhập; bên thứ 3 duy nhất: Google Đăng nhập; mục đích; cách yêu cầu xoá) và **Điều khoản sử dụng** (xu/thẻ là tiền ảo, không quy đổi, không hoàn tiền; cầu thủ hư cấu). Link ở màn đăng nhập + chân trang.
- [x] (2026-11-16; bước chọn tên Google ghi câu đồng ý) Form đăng ký: ô đồng ý Điều khoản + Chính sách (Nghị định 13/2023), ghi mục đích thu dữ liệu.
- [x] (2026-11-16, ẩn danh hoá vì sổ cái xu chỉ ghi thêm; trang `/account`, test server + E2E) **Xoá tài khoản** (quyền xoá dữ liệu, NĐ 13): API `DELETE /api/v1/me` (xác nhận mật khẩu, xoá dữ liệu người chơi + phiên) + nút trong game; có test.
- **Bản quyền model 3D:** người dùng tự tìm hiểu giấy phép bóng/khung thành (Sketchfab) và cầu thủ (Mixamo). Chưa rõ giấy phép → bản public không kèm file đó (game tự vẽ bằng code); dùng được → ghi nguồn trong README/trang giới thiệu.
- Sau mỗi lần cập nhật lớn: rà lại checklist bảo mật + checklist này.

### 9.3 — README & bàn giao `[ ]`
- **Phụ thuộc:** 9.2 · **Model:** default
- **Bối cảnh:** `CLAUDE.md` (Lệnh thường dùng), `docs/ARCHITECTURE.md`; skill `ecc:update-docs`.
- **Việc cần làm:** `README.md`: giới thiệu, ảnh chụp màn hình (menu, trận, mở thẻ, đội hình), yêu cầu, cài đặt & chạy dev, test, deploy, kiến trúc (link), tuyên bố dữ liệu hư cấu/không thanh toán thật. Rà CLAUDE.md, ROADMAP, PROGRESS.
- **Kiểm chứng:** làm theo README trên một thư mục clone mới → chạy được dev và test.
- **Xong khi:** tiêu chí "README đủ để người khác tự chạy được" → tick ROADMAP GĐ9.
