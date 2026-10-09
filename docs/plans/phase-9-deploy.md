# Giai đoạn 9 — Deploy & bàn giao

**Mục tiêu:** game chạy thật trên Internet, người khác tự dựng lại được.
**Hoàn thành giai đoạn khi** (ROADMAP): có link chạy thật · README đủ để người khác tự chạy.

---

### 9.1 — Đóng gói Docker `[ ]`
- **Phụ thuộc:** GĐ8 xong · **Model:** default
- **Bối cảnh:** ADR-0007; ARCHITECTURE §8; `apps/server/tsup.config.ts`; skill `ecc:docker-patterns`.
- **Việc cần làm:** `apps/server/Dockerfile` multi-stage (`pnpm deploy --prod`, chạy user không phải root, healthcheck `/api/v1/health`); image Caddy chứa build tĩnh của web; `Caddyfile` (HTTPS tự động, `/api/*` → server, còn lại → SPA fallback, header bảo mật, nén); `docker-compose.yml` (caddy + server + postgres, volume, restart policy, secrets qua `.env`); migration tự chạy khi server khởi động; `.env.example` đầy đủ.
- **Kiểm chứng:** `docker compose up --build` trên máy local → mở `https://localhost` đi hết luồng chính; restart container không mất dữ liệu; `curl -X POST https://localhost/api/v1/dev/grant-coins` → 404 (image prod không bật `ENABLE_DEV_ROUTES`); `?autopilot=1` không có tác dụng trên build prod.
- **Xong khi:** một lệnh dựng được toàn hệ thống.

### 9.2 — Chọn nhà cung cấp & deploy `[ ]`
- **Phụ thuộc:** 9.1 · **Model:** strongest
- **Bối cảnh:** ADR-0007 (đang `proposed`); skill `ecc:deployment-patterns`.
- **Việc cần làm:** hỏi người dùng chốt ngân sách/nhà cung cấp → cập nhật ADR-0007 thành `accepted` (hoặc ADR mới nếu đổi hướng). Dựng VPS: firewall (chỉ 22/80/443), SSH key, cập nhật tự động; trỏ domain; deploy; cron `pg_dump` hằng ngày ra nơi lưu trữ ngoài + **thử khôi phục** một lần; ghi quy trình deploy/rollback.
- **Kiểm chứng:** link HTTPS công khai chạy luồng chính; file backup tồn tại và khôi phục được vào DB trống.
- **Xong khi:** tiêu chí "có link chạy thật".

### 9.3 — README & bàn giao `[ ]`
- **Phụ thuộc:** 9.2 · **Model:** default
- **Bối cảnh:** `CLAUDE.md` (Lệnh thường dùng), `docs/ARCHITECTURE.md`; skill `ecc:update-docs`.
- **Việc cần làm:** `README.md`: giới thiệu, ảnh chụp màn hình (menu, trận, mở thẻ, đội hình), yêu cầu, cài đặt & chạy dev, test, deploy, kiến trúc (link), tuyên bố dữ liệu hư cấu/không thanh toán thật. Rà CLAUDE.md, ROADMAP, PROGRESS.
- **Kiểm chứng:** làm theo README trên một thư mục clone mới → chạy được dev và test.
- **Xong khi:** tiêu chí "README đủ để người khác tự chạy được" → tick ROADMAP GĐ9.
