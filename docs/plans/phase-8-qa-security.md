# Giai đoạn 8 — Kiểm thử, bảo mật, tối ưu

**Mục tiêu:** chứng minh MVP đạt các tiêu chí PRD và an toàn trước khi phát hành.
**Hoàn thành giai đoạn khi** (ROADMAP): E2E luồng chính xanh · không còn lỗi bảo mật mức cao · có `docs/QA-REPORT.md`.

**Tiến độ (2026-11-14):** xong 8.2 (gộp `main`): body limit 64 KiB, security headers + `cache-control: no-store`, match token hết hạn sau 2 giờ, chặn `ENABLE_DEV_ROUTES` ở production, rate limit chạy trước 401, gia hạn phiên sau rate limit, thứ tự khoá `putSquad`, nâng zod 4.6.7 (`pnpm audit` 0 High/Critical); chi tiết `docs/QA-REPORT.md` §1. Xong 8.1 (gộp `main`): Playwright + `pnpm e2e` (`playwright.config.ts`, `e2e/main-flow.spec.ts`) chạy server :3101 + web :5174 trên DB test, kịch bản đăng ký → mở gói miễn phí → xếp đội → trận Dễ autopilot → thưởng trận → nhiệm vụ ngày → đăng nhập lại; xanh 3 lần liên tiếp, chi tiết `docs/QA-REPORT.md` §3. **8.3 phần tự động xong, chờ người dùng đo FPS/bộ nhớ** (bundle, p95 mở gói, truy vấn retention/onboarding đã có số; hướng dẫn + bảng trống ở `docs/QA-REPORT.md` §2.4, đo bằng `/play?perf=1`). Tiếp theo: 8.4 (song song chờ người dùng đo FPS để đóng 8.3). Ghi chú còn mở: cookie `sid` giả vẫn tra DB một lần trước khi bị rate limit (chấp nhận được).

---

### 8.1 — E2E luồng chính `[x]`
- **Phụ thuộc:** GĐ7 xong · **Model:** default
- **Bối cảnh:** PRD §9; ARCHITECTURE §8 (`MATCH_MIN_DURATION_SEC`); `docs/plans/phase-5-match-offline.md` task 5.10 (tham số `?half=` và `?autopilot=1`); skill `ecc:e2e-testing`.
- **Việc cần làm:** cài Playwright; cấu hình chạy server + web + DB test (`DATABASE_URL_TEST`, `MATCH_MIN_DURATION_SEC=1`, web ở mode test). Kịch bản: đăng ký → mở gói miễn phí → đổi 1 thẻ vào đội hình → đá trận Dễ với `?autopilot=1&half=10` → nhận thưởng → số dư tăng → đăng xuất/đăng nhập lại còn thẻ và xu. Script `pnpm e2e`.
- **Kiểm chứng:** `pnpm e2e` xanh 3 lần liên tiếp (không flaky).
- **Xong khi:** tiêu chí ROADMAP "E2E luồng chính chạy xanh".

### 8.2 — Security review gacha, ví, API `[x]`
- **Phụ thuộc:** 8.1 · **Song song với:** 8.3 · **Model:** strongest
- **Bối cảnh:** ARCHITECTURE §7; PRD §6.3, §7.4, §8; skill `ecc:security-review`, agent `ecc:security-reviewer`.
- **Việc cần làm:** review `apps/server` tập trung: auth/phiên/cookie, IDOR mọi route, idempotency, khoá dòng & race, CSPRNG, validate đầu vào, header bảo mật, lộ lỗi, rate limit; `pnpm audit`. Thử tay bằng curl: sửa body, replay, gửi song song. Sửa mọi lỗi High/Critical (mỗi lỗi một commit có test hồi quy).
- **Kiểm chứng:** báo cáo không còn High/Critical; test hồi quy xanh.
- **Xong khi:** phần "Bảo mật" trong `docs/QA-REPORT.md` có danh sách phát hiện + trạng thái.

### 8.3 — Hiệu năng `[x]`
- **Phụ thuộc:** 8.1 · **Model:** default
- **Bối cảnh:** PRD §10 (≥ 55 FPS TB, laptop tầm trung, GPU tích hợp); agent `ecc:performance-optimizer`.
- **Việc cần làm:** đo FPS trung bình/1% thấp nhất cả trận trên Chrome; đo kích thước bundle (Three.js tách chunk, chỉ tải khi vào trận); đo p95 `POST /packs/:code/open` dưới tải nhẹ (autocannon, 20 kết nối); kiểm rò bộ nhớ vào/ra trận 20 lần. Tối ưu điểm nghẽn.
- **Kiểm chứng:** số đo trước/sau ghi vào QA-REPORT.
- **Xong khi:** ≥ 55 FPS TB; không rò bộ nhớ.

### 8.4 — Rà tiêu chí chấp nhận & QA-REPORT `[x]`
- **Phụ thuộc:** 8.2, 8.3 · **Model:** default
- **Bối cảnh:** mọi mục "Tiêu chí chấp nhận" trong `docs/PRD.md`.
- **Việc cần làm:** bảng: từng tiêu chí → test tự động (đường dẫn) hoặc kiểm tay (kết quả, ngày). Tick tiêu chí trong PRD. Lập checklist playtest 5–10 người (PRD §10). Viết `docs/QA-REPORT.md` (E2E, bảo mật, hiệu năng, tiêu chí, việc còn tồn).
- **Xong khi:** đủ 3 tiêu chí ROADMAP GĐ8 → tick ROADMAP, cập nhật CLAUDE.md, PROGRESS.
