# Báo cáo QA & Bảo mật — MFG (My Football Game)

_Tài liệu tổng hợp kiểm thử & rà soát cho Giai đoạn 8 (`docs/plans/phase-8-qa-security.md`). Các mục E2E (8.1), Hiệu năng (8.3) và Tiêu chí chấp nhận (8.4) được bổ sung theo tiến độ từng task._

---

## 1. Bảo mật (Task 8.2)

- **Ngày rà soát:** 2026-11-14
- **Phạm vi:** `apps/server` (auth/session/cookie, CSRF/Origin, IDOR, idempotency, khoá dòng & race condition, CSPRNG, validate đầu vào, HTTP headers, xử lý lỗi, rate limit), `packages/shared` (Zod API schemas), cấu hình môi trường và phụ thuộc npm (`pnpm audit`).
- **Phương pháp:**
  1. Đọc rà soát tĩnh toàn bộ `apps/server/src/{app,server}.ts`, `config/`, `plugins/`, `routes/`, `services/`, `domain/`, `db/schema.ts`, và `packages/shared/src/api/`.
  2. Chạy bộ test bảo mật tự động sẵn có (`auth-hardening.test.ts`, `write-routes-auth.test.ts`, `tamper.test.ts`, `ledger-integrity.test.ts`) và bổ sung `security-review.test.ts`.
  3. Chạy `pnpm audit` kiểm tra lỗ hổng phụ thuộc.
  4. Thử tay trực tiếp qua HTTP bằng `curl.exe` trên server thật (`127.0.0.1:3099`, `pitch_test_c`) với 3 nhóm kịch bản: sửa body (tampering), gửi lại (replay), và gửi song song (race condition).

### 1.1 Đánh giá theo 9 hạng mục kiểm soát

| Hạng mục | Cơ chế hiện tại | Đánh giá |
|---|---|---|
| **Auth / Phiên / Cookie** | Argon2id (`services/auth.ts`), so sánh timing-safe qua `burnPasswordCheck` khi user không tồn tại; token 32 byte lưu hash SHA-256 trong `sessions.id`; cookie `HttpOnly; SameSite=Lax; Path=/`, bật `Secure` ở production; khoá 15' sau 5 lần sai/15' (`FOR UPDATE` trên `users`); Google OAuth kiểm `aud`/`iss`/RS256 qua `jose`; xoay phiên ở cả `login`, `google`, và `register`. | Đạt |
| **Chặn CSRF** | Mọi request `POST`/`PUT`/`PATCH`/`DELETE` tới `/api/*` bắt buộc `Content-Type: application/json` (415 nếu thiếu) và nếu có header `Origin` thì host phải khớp `Host` (403). | Đạt |
| **IDOR mọi route** | Mọi truy vấn tài nguyên người chơi đều lọc theo `req.user!.id` (`matches`, `player_cards`, `squads`, `pack_boxes`, `pack_openings`); tài nguyên không tồn tại hoặc của người khác đều trả `404 not_found` (không lộ sự tồn tại). | Đạt |
| **Idempotency** | `POST /packs/:code/open` và `POST /player-cards/:id/upgrade` bắt buộc `Idempotency-Key` UUID + `UNIQUE (user_id, idempotency_key)`; gửi lại trả nguyên văn `result` cũ, sai body/tham số trả `409 idempotency_conflict`. `POST /matches/:id/result` nộp lại đúng token khi `status = finished` trả lại kết quả cũ, không cộng xu lần 2. | Đạt |
| **Khoá dòng & Race** | Thứ tự khoá cố định `users` (`lockUser` `FOR UPDATE`) → `pack_boxes` → `player_cards` (theo `id` tăng dần) → `squads` / `matches`. DB có `CHECK (coins >= 0)`, `ON DELETE RESTRICT` ở `squad_slots.player_card_id`, và trigger append-only trên `coin_transactions`. | Đạt |
| **CSPRNG** | Dùng `node:crypto` (`randomInt`, `randomBytes`, `createHash`, `timingSafeEqual`). ESLint cấm `Math.random` trong `apps/server/**/*.ts`. | Đạt |
| **Validate đầu vào & Body limit** | Mọi route dùng schema Zod từ `@pitch/shared`; ID kiểm `Number.isSafeInteger` trước khi truy vấn `bigint`; Fastify đặt `bodyLimit: 64 * 1024` (64 KiB). | Đạt |
| **HTTP Headers & Lộ lỗi** | Hook `onSend` gắn `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`, mặc định `Cache-Control: no-store` (trừ endpoint công khai `/cards`, `/config/*`). `errors.ts` chuẩn hoá lỗi 5xx thành `500 internal_error` không lộ stack/SQL. | Đạt |
| **Rate limit** | `@fastify/rate-limit`: `/api/v1/auth/*` giới hạn 10 req/phút/IP; các route có `requireAuth` giới hạn 100 req/phút/người dùng (`429 rate_limited` + `Retry-After`). | Đạt |

### 1.2 Danh sách phát hiện & trạng thái

| ID | Mức độ | Phát hiện | Vị trí | Trạng thái |
|---|---|---|---|---|
| **SEC-01** | Medium | Thiếu HTTP security headers (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `CSP`) và mặc định `Cache-Control: no-store` cho response riêng tư (`/me`, `/packs`, `/player-cards`). | `apps/server/src/app.ts` | **Đã sửa** (hook `onSend` + test trong `security-review.test.ts`) |
| **SEC-02** | Medium | Fastify chưa cấu hình `bodyLimit` tường minh (mặc định 1 MiB); cần giới hạn nhỏ hơn (64 KiB) để hạn chế DoS bộ nhớ và giảm thiểu rủi ro parsing payload lớn với Zod. | `apps/server/src/app.ts` | **Đã sửa** (`BODY_LIMIT_BYTES = 64 * 1024` + test trong `security-review.test.ts`) |
| **SEC-03** | Medium | `matches` chưa kiểm tra hạn 2 giờ ở server (`MATCH_MAX_AGE_SEC = 7200` theo ARCHITECTURE §5.2 #4) khi nộp kết quả và khi dọn lười trận bỏ dở ở `startMatch`. | `apps/server/src/config/economy.ts`, `apps/server/src/services/matches.ts` | **Đã sửa** (kiểm `elapsedMs > MATCH_MAX_AGE_SEC * 1000` → `422 match_token_invalid`, dọn lười sang `expired` trong `startMatch` + test trong `security-review.test.ts`) |
| **SEC-04** | Low | `POST /api/v1/auth/register` dùng `createSession` trực tiếp thay vì `startSession`, chưa huỷ cookie `sid` cũ nếu trình duyệt đã có phiên trước đó. | `apps/server/src/routes/auth.ts` | **Đã sửa** (gọi `startSession` + test trong `security-review.test.ts`) |
| **SEC-05** | Low | `env.ts` chưa chặn tổ hợp `NODE_ENV=production` + `ENABLE_DEV_ROUTES=1` ngay lúc khởi động (`loadEnv`). | `apps/server/src/config/env.ts` | **Đã sửa** (thêm check trong `EnvSchema.superRefine` + test trong `env.test.ts`) |
| **SEC-06** | High (dependency) | `pnpm audit` báo `zod < 4.6.6` (`GHSA-mrhx-c7xc-m3w5`: tiêu tốn bộ nhớ khi validate collection có ràng buộc kích thước quá lớn). | `apps/server/package.json`, `apps/web/package.json`, `packages/shared/package.json`, `pnpm-lock.yaml` | **Đã sửa** (nâng `zod` lên `^4.6.6` → lockfile `4.6.7`, `pnpm audit` còn 0 High/Critical) |
| **SEC-07** | Info (MVP scope) | Trận đấu vs máy chạy ở client nên kết quả (`homeGoals`, `awayGoals`) do client gửi lên sau tối thiểu `MATCH_MIN_DURATION_SEC` (360s), chưa xác minh lại bằng log input ở server; giới hạn rủi ro bằng match token 1 lần, trần 20 bàn/đội, trần 15 trận/ngày. | `apps/server/src/services/matches.ts` | **Ghi nhận theo thiết kế MVP** (đã có trong `docs/PRD.md` §11 và `docs/BACKLOG.md` cho giai đoạn sau MVP) |
| **SEC-08** | Info | `@fastify/rate-limit` lưu đếm trong bộ nhớ tiến trình; phù hợp triển khai 1 node Docker Compose (ADR-0007), cần chuyển sang Redis store nếu mở rộng nhiều instance. Ngoài ra `POST /auth/register` không có CAPTCHA (chống spam dựa vào rate limit 10 req/phút/IP). | `apps/server/src/plugins/rate-limit.ts` | **Ghi nhận theo kiến trúc MVP** |

### 1.3 Kết quả `pnpm audit`

Chạy lại `pnpm audit` ngày 2026-11-14 sau khi nâng `zod` lên `4.6.7`: **0 critical, 0 high — 12 cảnh báo còn lại (`6 moderate | 6 low`)**:
- **Moderate (6):** `esbuild <= 0.24.2` (`GHSA-67mh-4wv8-2f99` qua `drizzle-kit`, chỉ dùng lúc dev/CLI), `fast-uri` (`GHSA-w74x-v6f9-j3xg`, `GHSA-wjr9-j795-jxcr` qua `fastify`/`ajv`), `minimatch` (`GHSA-g3hv-75wg-m249` qua `eslint`/`typescript-eslint`, chỉ dùng lúc lint).
- **Low (6):** `esbuild` (`GHSA-g7r4-m6w7-qqqr` qua `tsup`, chỉ dùng lúc build), `fastify >= 5.12.2 < 5.12.6` (`GHSA-389g-gv7q-r4x8`), `fast-uri` (`GHSA-xhq7-xmqj-769h`, `GHSA-333x-w4r6-6crp`).

### 1.4 Kết quả kiểm thử thủ công bằng `curl`

Thực hiện trên server thật (`127.0.0.1:3099`, `DATABASE_URL=postgres://pitch:pitch@localhost:5432/pitch_test_c`, `ENABLE_DEV_ROUTES=1`, `MATCH_MIN_DURATION_SEC=0`):

1. **Sửa body (`POST /api/v1/auth/register`):** gửi kèm `"coins":999999,"isAdmin":true,"freePack5Credits":99` → server trả `201 Created` với `coins: 0, freePack5Credits: 1`, gắn cookie `HttpOnly; SameSite=Lax` và đầy đủ security headers (`x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer`, `content-security-policy: default-src 'none'; frame-ancestors 'none'`, `cache-control: no-store`).
2. **Sửa body + Replay (`POST /api/v1/packs/pack1/open`):** gửi `"payment":"coins","price":0,"coins":999999,"rarity":"legend"` với cùng `Idempotency-Key` 2 lần → lần 1 trả `200` với `balance: 0` (trừ đúng 100 xu), lần 2 trả `200` với payload giống hệt từng byte (`Replay identical: True`), không trừ thêm xu và không mở thêm thẻ.
3. **Replay kết quả trận (`POST /api/v1/matches/:id/result`):** nộp `0–1` (thua, +15 xu), sau đó gửi lại cùng match token với `20–0` và `"reward":999999` → server vẫn trả kết quả cũ `{"outcome":"loss","reward":15,"balance":15,"missions":[]}`, không cộng thưởng lần 2.
4. **Gửi song song (race condition):** tài khoản có đúng 100 xu, bắn đồng thời 5 request `POST /api/v1/packs/pack1/open` với 5 `Idempotency-Key` khác nhau → đúng 1 request thành công (`HTTP 200`, `balance: 0`), 4 request còn lại bị chặn (`HTTP 409`, `insufficient_coins`), kiểm tra lại `/api/v1/me` cho `coins: 0` (không âm).
