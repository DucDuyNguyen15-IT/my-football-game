# Báo cáo QA & Bảo mật — MFG (My Football Game)

_Tài liệu tổng hợp kiểm thử & rà soát cho Giai đoạn 8 (`docs/plans/phase-8-qa-security.md`). Đã có: Bảo mật (8.2), Hiệu năng (8.3 — phần đo tự động; FPS/bộ nhớ chờ người dùng đo). Các mục E2E (8.1) và Tiêu chí chấp nhận (8.4) được bổ sung theo tiến độ từng task._

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

---

## 2. Hiệu năng (8.3)

- **Ngày đo:** 2026-11-14 · **Trạng thái:** phần đo tự động xong; **FPS và rò bộ nhớ chờ người dùng đo trên laptop thật** (mục 2.4).
- **Máy đo:** Intel Core i7-13620H (16 luồng), 16 GB RAM, Windows 11, Node 26.13, PostgreSQL 16.15 (Docker). Server và công cụ bắn tải chạy cùng máy, lúc đo có tiến trình khác chạy song song nên số dao động giữa các lần.
- **Script đo** (không nằm trong `pnpm check`; chỉ chạy trên DB tên chứa `perf`, từ chối DB khác):
  - `DATABASE_URL=postgres://pitch:pitch@localhost:5432/pitch_perf_b pnpm --filter @pitch/server bench:packs`
  - `DATABASE_URL=postgres://pitch:pitch@localhost:5432/pitch_perf_b pnpm --filter @pitch/server bench:analytics` (xoá sạch dữ liệu DB đó rồi sinh lại)

### 2.1 Kích thước bundle web (`pnpm build`, Vite 8)

Kết luận: Three.js và màn trận **đã được tách chunk và chỉ tải khi cần** từ trước 8.3 (`router.tsx` dùng `React.lazy` cho `PlayPage`, `IntroGate` dùng `import()` cho `IntroRenderer`). `dist/index.html` chỉ nạp `index-*.js` và `modulepreload` `src-*.js`; các chunk 3D chỉ nằm trong danh sách `import()` động. Lưu ý: intro 3D ở lần mở đầu tiên của phiên cũng tải Three.js (theo thiết kế, tải song song với màn đăng nhập/menu; bỏ qua khi `prefers-reduced-motion`).

Thay đổi ở 8.3: tách thư viện Three.js khỏi mã cảnh của game thành chunk `three-*.js` riêng (`build.rolldownOptions.output.codeSplitting.groups` trong `apps/web/vite.config.ts`). Tổng dung lượng gần như không đổi; lợi ích là tên chunk rõ ràng và trình duyệt giữ cache thư viện (~216 kB gzip) khi chỉ mã game đổi giữa các lần phát hành.

| Chunk | Khi nào tải | Trước (raw / gzip) | Sau (raw / gzip) |
|---|---|---|---|
| `index-*.js` (React, router, TanStack Query, dnd-kit, mọi màn ngoài trận) | Ngay khi mở trang | 510,81 kB / 157,99 kB | 510,66 kB / 157,93 kB |
| `src-*.js` (Zod, `@pitch/shared`, phần `@pitch/sim` dùng chung) | Ngay (modulepreload) | 140,07 kB / 44,63 kB | 140,07 kB / 44,63 kB |
| `index-*.css` | Ngay | 68,38 kB / 14,02 kB | 68,38 kB / 14,02 kB |
| `PlayPage-*.js` (màn trận, HUD, renderer) | Vào `/play` | 72,97 kB / 24,45 kB | 74,00 kB / 24,82 kB |
| `PlayPage-*.css` | Vào `/play` | 13,46 kB / 3,45 kB | 13,46 kB / 3,45 kB |
| `lighting-*.js` | Vào `/play` hoặc intro 3D | 781,24 kB / 222,38 kB (Three.js + mã cảnh dùng chung) | 12,20 kB / 5,66 kB (chỉ còn mã cảnh dùng chung) |
| `three-*.js` (thư viện Three.js) | Vào `/play` hoặc intro 3D | — (nằm trong `lighting`) | 768,73 kB / 216,32 kB |
| `IntroRenderer-*.js` | Intro 3D | 6,48 kB / 2,78 kB | 6,51 kB / 2,80 kB |
| **JS tải ban đầu** | | **650,88 kB / 202,62 kB** | **650,73 kB / 202,56 kB** |
| **JS chỉ tải khi vào trận/intro** | | **860,69 kB / 249,61 kB** | **861,44 kB / 249,60 kB** |

Font (`@fontsource`, woff/woff2 6–22 kB mỗi file): trình duyệt chỉ tải subset đang dùng. Chưa làm: lazy-load từng màn menu (Đội hình có dnd-kit, Admin) để giảm `index-*.js` — đã ghi `docs/BACKLOG.md`.

### 2.2 `POST /api/v1/packs/:code/open` dưới tải (autocannon)

Cấu hình: `apps/server/scripts/bench-pack-open.ts`, autocannon 9, **20 kết nối × 15 giây**, bắn liên tục không giới hạn tốc độ (nặng hơn "tải nhẹ" thực tế). Mỗi kết nối là một người chơi riêng (đăng ký qua `POST /auth/register`, cấp 5.000.000 xu qua `POST /dev/grant-coins` — có ghi sổ cái), mỗi request một `Idempotency-Key` mới, trả bằng xu. Server dựng trong cùng tiến trình ở `127.0.0.1:3102`, DB `pitch_perf_b` (đang chứa sẵn 5.000 user + 204.000 `analytics_events` của mục 2.3), pool Postgres 10 kết nối (mặc định). **Rate limit tắt** qua option có sẵn `buildApp({ rateLimit: false })` (bật thì mỗi người chơi chỉ được 100 req/phút nên không đo được); route dev bật qua `enableDevRoutes: true`. Phân vị tính từ thời gian phản hồi của từng request (nearest-rank).

| Lần đo | Gói | Số request | req/s | p50 | p95 | p99 | max | Không phải 2xx / lỗi / timeout | Sổ cái lệch sau đo |
|---|---|---|---|---|---|---|---|---|---|
| 1 | `pack1` | 8.791 | 586 | 33,5 ms | **41,5 ms** | 48,7 ms | 73,7 ms | 0 / 0 / 0 | 0 |
| 2 | `pack1` | 6.066 | 404 | 48,0 ms | **61,4 ms** | 74,3 ms | 95,2 ms | 0 / 0 / 0 | 0 |
| 3 | `pack5` | 5.468 | 365 | 52,8 ms | **71,0 ms** | 83,9 ms | 116,0 ms | 0 / 0 / 0 | 0 |

Kết luận: p95 41–71 ms khi 20 người chơi mở gói liên tục, không lỗi, `findLedgerMismatches` = 0 sau hơn 20.000 lượt mở. Không có điểm nghẽn cần tối ưu nên **không đổi code mở gói** (không có số "sau"). Độ trễ chủ yếu do xếp hàng: 20 kết nối HTTP dùng chung 10 kết nối DB, mỗi lượt mở là một transaction khoảng 12 câu lệnh.

### 2.3 Truy vấn retention / onboarding trên dữ liệu lớn

Cấu hình: `apps/server/scripts/bench-analytics.ts` sinh dữ liệu giả tất định trong `pitch_perf_b`: **5.000 user** đăng ký rải đều 60 ngày, **204.000 `analytics_events`** (5.000 `register`, 4.000 `match_start` đầu tiên, còn lại rải theo ngày từ lúc đăng ký tới hôm nay). Mỗi truy vấn chạy 1 lần làm nóng + 7 lần đo, lấy trung vị (thời gian đo ở Node, gồm cả đường đi tới Postgres).

| Khoảng | `getRetentionCohorts` p50 / max | `getOnboardingStats` p50 / max |
|---|---|---|
| `days=7` (6 cohort) | 84,9 ms / 90,8 ms | 5,1 ms / 5,3 ms |
| `days=30` (29 cohort) | 90,9 ms / 99,4 ms | 8,1 ms / 8,4 ms |
| Không lọc (60 cohort) | 92,0 ms / 97,1 ms | 12,7 ms / 13,3 ms |

`EXPLAIN (ANALYZE, BUFFERS)` với `days=30`:
- **Retention** (114 ms, gồm cả chi phí đo của EXPLAIN): CTE `activity` quét tuần tự song song toàn bộ `analytics_events` (204.000 dòng, 1.801 buffer, ~12 ms) → `HashAggregate` còn 126.079 cặp (user, ngày) (xong ở ~72 ms, tràn 3,5 MB ra đĩa do `work_mem` mặc định 4 MB) → hai `Hash Right Join` với 2.427 user của khoảng → `GroupAggregate` 29 dòng. Lọc `users.created_at` dùng `Seq Scan` (5.000 dòng, 0,3 ms).
- **Onboarding** (10 ms): `Bitmap Index Scan` trên `analytics_events_name_created_idx` cho `register` trong khoảng (2.427 dòng) và cho `match_start` (39.000 dòng) → `Hash Right Join` → phân vị.

Kết luận: cả hai thấp hơn nhiều so với ngưỡng 500 ms nên **không đổi câu truy vấn, không thêm index/migration** (không có số "sau"). Thay đổi code duy nhất ở server: tách phần dựng SQL thành `retentionCohortsQuery` / `onboardingStatsQuery` (giữ nguyên câu SQL) để script chạy được `EXPLAIN`. Ghi chú mở: thời gian retention tỉ lệ với **tổng** số sự kiện chứ không theo khoảng `days` (CTE `activity` không lọc `created_at`); ước lượng tuyến tính chạm 500 ms ở khoảng 1 triệu sự kiện. Khi tới gần mức đó: giới hạn `activity` theo `created_at` trong `[from + 1 ngày, to + 8 ngày)` — đã ghi `docs/BACKLOG.md`.

### 2.4 FPS và rò bộ nhớ — người dùng tự đo trên laptop thật

Mục tiêu PRD §10: **≥ 55 FPS trung bình** cả trận trên laptop tầm trung (GPU tích hợp), Chrome; không rò bộ nhớ sau 20 lần vào/ra trận.

Công cụ có sẵn trong game (8.3 thêm): mở trận với **`?perf=1`** (VD `/play?perf=1`). Góc trên trái hiện FPS tức thời; khi hết trận (hoặc khi thoát trận giữa chừng) console in một dòng dạng:
`[perf] FPS TB 58.7 · 1% thấp nhất 41.2 · khung chậm nhất 35.1 ms · 20540 khung / 350.0 s` (số minh hoạ).
"1% thấp nhất" = FPS trung bình của 1% khung hình chậm nhất. Không tính lúc tạm dừng và khung dài hơn 1 giây (tab bị ẩn); có tính đoạn phát lại bàn thắng. Không có `?perf=1` thì game không đo gì.

**Chuẩn bị**
1. Cắm sạc, chế độ nguồn Windows "Hiệu suất tốt nhất", đóng ứng dụng nặng. Chrome bản mới, bật tăng tốc phần cứng (`chrome://settings/system`), kiểm `chrome://gpu` thấy "WebGL: Hardware accelerated". Dùng cửa sổ ẩn danh (không extension), phóng to toàn màn hình.
2. Chạy bản build (số đo sát thực tế hơn bản dev): `docker compose -f docker-compose.dev.yml up -d`, `pnpm build`, rồi mở 2 terminal: `pnpm --filter @pitch/server dev` và `pnpm --filter @pitch/web preview` → mở `http://localhost:4173`, đăng nhập. (Muốn trận ngắn để thử nhanh thì dùng `pnpm dev` và `http://localhost:5173/play?perf=1&autopilot=1&half=60`; số chính thức lấy từ bản build, trận đủ thời lượng, tự chơi.)

**Đo FPS** (mỗi preset đồ hoạ một trận: Cao và Thấp — đổi trong menu tạm dừng → Đồ hoạ)
1. Mở DevTools (F12) → tab Console, rồi vào `http://localhost:4173/play?perf=1`, chọn độ khó, chơi hết trận.
2. Hết trận, chép dòng `[perf] …` vào bảng dưới.
3. (Tuỳ chọn, để tìm điểm nghẽn nếu < 55 FPS) DevTools → Performance → Record khoảng 20 giây giữa trận → xem biểu đồ Frames và phần Main/GPU.

| Preset | Máy (CPU / GPU / độ phân giải) | FPS TB | 1% thấp nhất | Khung chậm nhất (ms) | Đạt ≥ 55? |
|---|---|---|---|---|---|
| Cao | | | | | |
| Thấp | | | | | |

**Kiểm rò bộ nhớ (vào/ra trận 20 lần)**
1. Mở `http://localhost:4173` (trang chủ), DevTools → tab Memory, chọn "Heap snapshot".
2. Một vòng = vào `/play` → bắt đầu trận → chờ khoảng 10 giây → Esc → thoát trận về trang chủ.
3. Sau vòng 1: bấm biểu tượng thùng rác (Collect garbage) rồi "Take snapshot", ghi dung lượng snapshot (MB). Lặp lại sau vòng 10 và vòng 20 (luôn bấm thùng rác trước khi chụp).
4. Đồng thời mở Trình quản lý tác vụ của Chrome (Shift+Esc), bật cột "Bộ nhớ GPU", ghi số của tab ở 3 mốc.
5. Đạt nếu heap và bộ nhớ GPU sau vòng 20 không tăng đều so với vòng 10 (chênh ≤ ~10% hoặc vài MB). Nếu tăng đều: trong tab Memory chọn snapshot 20 → "Comparison" với snapshot 1, lọc `WebGL`, `Texture`, `BufferGeometry`, `MatchRenderer`, `Detached` để tìm đối tượng còn bị giữ; console báo "Too many active WebGL contexts" cũng là dấu hiệu rò.

| Mốc | JS heap sau GC (MB) | Bộ nhớ GPU của tab (MB) | Ghi chú |
|---|---|---|---|
| Sau 1 lần vào/ra | | | |
| Sau 10 lần | | | |
| Sau 20 lần | | | |

Rà tĩnh phía code (không thay cho số đo): `MatchCanvas` huỷ renderer khi unmount; `MatchRenderer.dispose()` huỷ vòng `requestAnimationFrame`, listener phím/blur, `ResizeObserver`, hậu kỳ, toàn bộ geometry/material/texture của scene và model cầu thủ, gọi `renderer.dispose()` + `forceContextLoss()` và gỡ canvas.
