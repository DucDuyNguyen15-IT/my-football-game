# Báo cáo QA & Bảo mật — MFG (My Football Game)

_Tài liệu tổng hợp kiểm thử & rà soát cho Giai đoạn 8 (`docs/plans/phase-8-qa-security.md`). Cập nhật lần cuối: 2026-11-16 (Phần B review; tóm tắt bên dưới là số liệu ngày 2026-11-14 trừ chỗ ghi khác)._

**Tóm tắt (2026-11-14)**

| Hạng mục | Kết quả | Chi tiết |
|---|---|---|
| Bảo mật (8.2) | Không còn lỗi High/Critical; SEC-01…15: 13 đã sửa (gồm SEC-07 bằng replay ADR-0011, SEC-13a cookie thiết bị), 3 ghi nhận/chấp nhận (SEC-08, SEC-13b, SEC-15) (cập nhật 19/11); `pnpm audit` 0 High/Critical | §1 |
| Hiệu năng (8.3) | Bundle, p95 mở gói (41–71 ms), truy vấn retention/onboarding (< 100 ms) đã đo; FPS cả trận trên Intel UHD: **Cao 74,6 · Thấp 166,0 FPS TB** (≥ 55); 20 lần vào/ra trận không rò bộ nhớ | §2 |
| E2E luồng chính (8.1) | `pnpm e2e` xanh 3 lần liên tiếp | §3 |
| Tiêu chí chấp nhận PRD (8.4) | 36 tiêu chí: **36 Đạt**, 0 Chưa đạt, 0 Không áp dụng | §4 |
| Playtest 5–10 người (PRD §10) | Chưa tổ chức; đã có checklist và bảng ghi | §5 |
| PvP đá trực tiếp (cập nhật 2026-11-24) | Đang làm: test tự động cho sim/WS/phiên đã có; chưa đo SC-001/002/009 trên bản hoàn chỉnh, chưa playtest SC-008 | §7 |
| Việc còn tồn | 1 việc chặn phát hành (playtest); T1 (đo FPS/bộ nhớ) đã xong; 1 lỗi giao diện mức trung bình phát hiện ở 8.4 (lưới nguyên liệu màn Ép thẻ lặp thẻ — T3, **đã sửa 15/11**, review B4-01); còn lại mức thấp hoặc ghi nhận | §6 |

**Mục lục**

1. Bảo mật (Task 8.2) — 1.1 Đánh giá theo 9 hạng mục · 1.2 Danh sách phát hiện · 1.3 `pnpm audit` · 1.4 Kiểm thử thủ công bằng `curl`
2. Hiệu năng (Task 8.3) — 2.1 Bundle web · 2.2 Mở gói dưới tải · 2.3 Truy vấn retention/onboarding · 2.4 FPS và rò bộ nhớ
3. E2E luồng chính (Task 8.1)
4. Tiêu chí chấp nhận (Task 8.4) — 4.1 Tổng hợp · 4.2 F1–F3 · 4.3 F5 · 4.4 F6 · 4.5 F10 · 4.6 F11 · 4.7 F7/F9/F12, F8/F13 · 4.8 Chỉ số §9–§10 · 4.9 Nhật ký kiểm tay
5. Checklist playtest 5–10 người (PRD §10)
6. Việc còn tồn
7. PvP đá trực tiếp (`docs/specs/pvp-realtime/`) — 7.1 Kiểm thử đã có · 7.2 Tiêu chí SC-001…009 · 7.3 Khác biệt với đá máy cần nhớ khi kiểm

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
| **SEC-07** | Info (MVP scope) → đã sửa | Trận đấu vs máy chạy ở client nên kết quả (`homeGoals`, `awayGoals`) do client gửi lên, chưa được xác minh ở server: sửa client gửi 20-0 vẫn ăn thưởng và nhiệm vụ. | `apps/server/src/services/matches.ts` | **Đã sửa (19/11, ADR-0011):** client gửi thêm `inputLog` (input theo tick + lượt thay người); server dựng lại `MatchSetup` từ dòng `matches`, chạy lại sim trong `worker_threads` (timeout 5 s, ngoài transaction) và dùng tỉ số replay để thưởng/nhiệm vụ. Tỉ số báo lệch, log hỏng/cụt/của trận khác, hoặc log dài hơn thời gian thực đã trôi → 422 `match_token_invalid` + analytics `match_replay_mismatch`. Test: `routes/matches.replay.test.ts`. Còn lại: bot/macro gửi input hợp lệ vẫn qua được (chỉ giới hạn bởi ≥ 6 phút và trần 15 trận/ngày) |
| **SEC-08** | Info | `@fastify/rate-limit` lưu đếm trong bộ nhớ tiến trình; phù hợp triển khai 1 node Docker Compose (ADR-0007), cần chuyển sang Redis store nếu mở rộng nhiều instance. Ngoài ra `POST /auth/register` không có CAPTCHA (chống spam dựa vào rate limit 10 req/phút/IP). | `apps/server/src/plugins/rate-limit.ts` | **Ghi nhận theo kiến trúc MVP** |
| **SEC-09** | Medium | Giới hạn `/auth/*` 10 req/phút/IP so `req.url` thô; router giải mã `%xx` nên `POST /api/v1/%61uth/login` (và `/register`) vào đúng route mà không bị đếm → dò nhiều tài khoản / spam đăng ký không giới hạn (khoá 5 lần/15' theo tài khoản vẫn còn). Rà 2026-11-16 (B2-01). | `apps/server/src/plugins/rate-limit.ts` | **Đã sửa** (so theo mẫu route `req.routeOptions.url`; test hồi quy B2-01 trong `security-review.test.ts`) |
| **SEC-10** | Low (dev) | `docker-compose.dev.yml` mở Postgres ra `0.0.0.0:5432` với mật khẩu dev công khai `pitch/pitch` → máy cùng mạng LAN đọc/ghi được DB dev. Rà 2026-11-16. | `docker-compose.dev.yml` | **Đã sửa** (`127.0.0.1:5432:5432`). Prod: checklist bảo mật deploy ở `docs/plans/phase-9-deploy.md` |
| **SEC-11** | Medium | Khoá đăng nhập 5 lần/15' kiểm trên bản đọc trước khi chạy argon2 → gửi song song nhiều lần đăng nhập (nhiều IP) thì mọi request đều được kiểm mật khẩu (thử 30 → 21 lần kiểm), và request đúng mật khẩu lọt qua dù tài khoản đã khoá. Audit Sonnet 2026-11-16 (A-1). | `apps/server/src/routes/auth.ts`, `services/auth.ts` | **Đã sửa** (`reserveLoginAttempt`: khoá dòng, kiểm khoá và đếm lượt TRƯỚC khi kiểm mật khẩu; đúng thì xoá bộ đếm; test song song A-1) |
| **SEC-12** | Low | Hook chặn CSRF so `req.url` thô → `POST /%61pi/v1/auth/logout` hay `/%61pi/v1/missions/:code/claim` không cần JSON/Origin; chỉ khai thác được từ trang cùng site (cookie `SameSite=Lax`). Audit 2026-11-16 (I-1). | `apps/server/src/plugins/auth.ts` | **Đã sửa** (so theo mẫu route `req.routeOptions.url`; test I-1) |
| **SEC-13** | Info | (a) Khoá theo tài khoản cho phép người lạ khoá đăng nhập mật khẩu của người khác 15' (Google + phiên đang mở không ảnh hưởng). (b) `POST /matches` gọi liên tục tạo dòng `matches` + `match_start` không xoá (≤ 100/phút/người do rate limit). Audit 2026-11-16 (I-2, M-1). | `routes/auth.ts`, `services/matches.ts` | (a) **Đã sửa** (19/11): cookie thiết bị quen `did` tự ký HMAC, đặt sau đăng nhập/đăng ký; request có `did` hợp lệ của đúng user dùng bộ đếm/khoá riêng (`trusted_*` trên `users`, vẫn 5 lần/15', đếm trước argon2), người lạ không khoá được chủ; test `routes/device-cookie.test.ts`. (b) **Chấp nhận** cho MVP; xem lại nếu playtest thấy lạm dụng (dọn trận `expired` định kỳ ở GĐ9) |
| **SEC-14** | Low | Phiên chỉ có hạn trượt 30 ngày, không có hạn tuyệt đối: cookie `sid` bị lộ mà được dùng ít nhất mỗi 30 ngày thì sống mãi (chỉ chết khi đăng xuất/xoá tài khoản). Audit 2026-11-19. | `apps/server/src/services/auth.ts` | **Đã sửa** (`SESSION_MAX_AGE_MS` 90 ngày tính từ `sessions.created_at`, gia hạn không vượt mốc này; test trong `auth.test.ts`) |
| **SEC-15** | Info | `POST /auth/google` không ràng buộc `nonce`: ai đã trộm được ID token Google còn hạn (~1 giờ) của nạn nhân thì đổi được lấy phiên. Cần chiếm token trước (không có đường lấy qua app). Audit 2026-11-19. | `apps/server/src/services/google.ts` | **Chấp nhận** cho MVP; thêm nonce (cookie httpOnly + so `payload.nonce`) nếu mở rộng đăng nhập Google |

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

## 2. Hiệu năng (Task 8.3)

- **Ngày đo:** 2026-11-14 · **Trạng thái:** đã đo đủ, kể cả FPS và rò bộ nhớ trên laptop thật (mục 2.4).
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

### 2.4 FPS và rò bộ nhớ (đo 2026-11-14)

**Kết quả** — đo tự động bằng Playwright điều khiển **Chrome có giao diện (không headless), GPU thật**: Intel Core i7-13620H, **Intel UHD Graphics** (ANGLE Direct3D11 — GPU tích hợp, đúng đối tượng PRD), màn 1536×960 @ DPR 1,25 (cửa sổ 1536×826), Windows 11. Bản build `vite build --mode test` + `vite preview` (mã giống production, chỉ thêm cho phép `?autopilot=1`), trận Dễ tự đá (`/play?perf=1&autopilot=1`) đủ 2 × 180 s, có phát lại bàn thắng. Kiểm GPU bằng `WEBGL_debug_renderer_info` trước khi đo để loại WebGL phần mềm (SwiftShader).

| Preset | FPS TB | 1% thấp nhất | Khung chậm nhất (ms) | Số khung / thời gian | Đạt ≥ 55? |
|---|---|---|---|---|---|
| Cao | **74,6** | 6,0 | 1000 (trần đo) | 28.213 / 378,0 s | **Đạt** |
| Thấp | **166,0** | 18,9 | 1000 (trần đo) | 68.963 / 415,3 s | **Đạt** |

- Màn hình máy đo có tần số quét cao nên FPS không bị trần ở 60.
- Lần đo Cao đầu tiên cho 48,0 FPS TB (1% thấp 1,3) vì máy đang chạy song song `pnpm check` + Playwright của task 8.4; số trên là lần đo lại khi máy rảnh. Số FPS nhạy với tải nền.
- **Ghi nhận (không chặn):** "1% thấp nhất" thấp (6–19 FPS) và có khung chạm trần 1 s → trận có những lần giật ngắn (nghi: biên dịch shader lần đầu, đổi cảnh phát lại bàn thắng, GC). Không ảnh hưởng tiêu chí PRD (chỉ đòi FPS TB) nhưng nên tìm nguyên nhân bằng DevTools Performance — xem §6 T12.

**Rò bộ nhớ** — 20 vòng: vào `/play?autopilot=1` bằng điều hướng trong ứng dụng (không tải lại trang) → chờ 10 s → Esc → Bỏ trận → về trang chủ. Đo qua CDP: `HeapProfiler.collectGarbage` ×3 rồi `Runtime.getHeapUsage`, kèm số node DOM và số `<canvas>`.

| Mốc | JS heap sau GC (MB) | Node DOM | `<canvas>` còn trong trang |
|---|---|---|---|
| Trước vòng 1 (trang chủ) | 4,7 | 379 | 0 |
| Sau vòng 1 | 8,7 | 383 | 0 |
| Sau vòng 5 | 9,9 | 383 | 0 |
| Sau vòng 10 | 10,7 | 383 | 0 |
| Sau vòng 15 | 10,8 | 383 | 0 |
| Sau vòng 20 | 11,0 | 383 | 0 |

Kết luận: **không rò**. Heap tăng chậm dần rồi gần như đứng (vòng 10 → 20 chỉ +0,3 MB, ~3%, nằm trong ngưỡng ≤ 10%; phần tăng ban đầu là module/cache đã tải), DOM không đổi, canvas WebGL được gỡ hết, không có cảnh báo "Too many active WebGL contexts". Bộ nhớ GPU không đo được qua CDP (không thay bằng số đoán). Console có cảnh báo Three.js `PCFSoftShadowMap has been removed. Using PCFShadowMap instead.` (không ảnh hưởng, §6 T12; số đo 14/11 — cảnh báo đã hết từ 16/11 sau khi bỏ `PCFSoftShadowMap`).

#### A/B chuyển cảnh (đo 2026-11-16, review M3)

Cùng máy, Chromium có giao diện + GPU thật (Intel UHD, ANGLE D3D11), bản `vite build --mode test` + `vite preview`, tắt vsync (`--disable-gpu-vsync --disable-frame-rate-limit`) để FPS không bị trần; trận Dễ tự đá `/play?perf=1&autopilot=1&half=60`, A = có chuyển cảnh, B = `&stinger=0`, chạy xen kẽ A/B/A/B/A/B.

| Lần | A: FPS TB | A: ngoài lúc chuyển cảnh | A: 1% thấp | B: FPS TB | B: 1% thấp |
|---|---|---|---|---|---|
| 1 | 158,8 | 132,3 | 7,7 | 136,6 | 9,6 |
| 2 | 158,9 | 134,1 | 8,6 | 135,0 | 9,2 |
| 3 | 163,1 | 133,3 | 7,9 | 136,7 | 9,8 |

- FPS TB của A cao hơn ~17% **chỉ vì** khung lúc màn che kín rất rẻ (~500 FPS, chiếm 6–7% thời gian trận) kéo trung bình lên. Bỏ các khung đó ra thì A ≈ 133 so với B ≈ 136: **chuyển cảnh không làm tăng FPS lúc chơi**, lệch ~2% nằm trong sai số. Con số "FPS tăng 4–6" trong báo cáo chuyển cảnh không đúng.
- "1% thấp nhất" của A thấp hơn B một chút (7,7–8,6 so với 9,2–9,8) và cả hai có khung đứng 0,6–0,8 s: giật ngắn §6 T12 vẫn còn, chuyển cảnh có thể góp thêm một ít.

#### Hướng dẫn tự đo lại (cách cũ, thủ công)

Mục tiêu PRD §10: **≥ 55 FPS trung bình** cả trận trên laptop tầm trung (GPU tích hợp), Chrome; không rò bộ nhớ sau 20 lần vào/ra trận.

Công cụ có sẵn trong game (8.3 thêm): mở trận với **`?perf=1`** (VD `/play?perf=1`). Góc trên trái hiện FPS tức thời; khi hết trận (hoặc khi thoát trận giữa chừng) console in một dòng dạng:
`[perf] FPS TB 58.7 · 1% thấp nhất 41.2 · khung chậm nhất 35.1 ms · 20540 khung / 350.0 s` (số minh hoạ).
"1% thấp nhất" = FPS trung bình của 1% khung hình chậm nhất. Không tính lúc tạm dừng và khung dài hơn 1 giây (tab bị ẩn); có tính đoạn phát lại bàn thắng. Không có `?perf=1` thì game không đo gì. `?perf=1` cố ý bật được cả ở bản production (R78-4) để người chơi thử đo trên máy mình (§5 bước 7); chỉ đọc thời gian khung hình, không gửi đi đâu.

**Chuẩn bị**
1. Cắm sạc, chế độ nguồn Windows "Hiệu suất tốt nhất", đóng ứng dụng nặng. Chrome bản mới, bật tăng tốc phần cứng (`chrome://settings/system`), kiểm `chrome://gpu` thấy "WebGL: Hardware accelerated". Dùng cửa sổ ẩn danh (không extension), phóng to toàn màn hình.
2. Chạy bản build (số đo sát thực tế hơn bản dev): `docker compose -f docker-compose.dev.yml up -d`, `pnpm build`, rồi mở 2 terminal: `pnpm --filter @pitch/server dev` và `pnpm --filter @pitch/web preview` → mở `http://localhost:4173`, đăng nhập. (Muốn trận ngắn để thử nhanh thì dùng `pnpm dev` và `http://localhost:5173/play?perf=1&autopilot=1&half=60`; số chính thức lấy từ bản build, trận đủ thời lượng, tự chơi.)

**Đo FPS** (mỗi preset đồ hoạ một trận: Cao và Thấp — đổi trong menu tạm dừng → Đồ hoạ)
1. Mở DevTools (F12) → tab Console, rồi vào `http://localhost:4173/play?perf=1`, chọn độ khó, chơi hết trận.
2. Hết trận, chép dòng `[perf] …` vào bảng dưới.
3. (Tuỳ chọn, để tìm điểm nghẽn nếu < 55 FPS) DevTools → Performance → Record khoảng 20 giây giữa trận → xem biểu đồ Frames và phần Main/GPU.

| Preset | Máy (CPU / GPU / độ phân giải) | FPS TB | 1% thấp nhất | Khung chậm nhất (ms) | Đạt ≥ 55? |
|---|---|---|---|---|---|
| Cao | i7-13620H / Intel UHD / 1536×960 | 74,6 | 6,0 | 1000 | Đạt |
| Thấp | i7-13620H / Intel UHD / 1536×960 | 166,0 | 18,9 | 1000 | Đạt |

**Kiểm rò bộ nhớ (vào/ra trận 20 lần)**
1. Mở `http://localhost:4173` (trang chủ), DevTools → tab Memory, chọn "Heap snapshot".
2. Một vòng = vào `/play` → bắt đầu trận → chờ khoảng 10 giây → Esc → thoát trận về trang chủ.
3. Sau vòng 1: bấm biểu tượng thùng rác (Collect garbage) rồi "Take snapshot", ghi dung lượng snapshot (MB). Lặp lại sau vòng 10 và vòng 20 (luôn bấm thùng rác trước khi chụp).
4. Đồng thời mở Trình quản lý tác vụ của Chrome (Shift+Esc), bật cột "Bộ nhớ GPU", ghi số của tab ở 3 mốc.
5. Đạt nếu heap và bộ nhớ GPU sau vòng 20 không tăng đều so với vòng 10 (chênh ≤ ~10% hoặc vài MB). Nếu tăng đều: trong tab Memory chọn snapshot 20 → "Comparison" với snapshot 1, lọc `WebGL`, `Texture`, `BufferGeometry`, `MatchRenderer`, `Detached` để tìm đối tượng còn bị giữ; console báo "Too many active WebGL contexts" cũng là dấu hiệu rò.

| Mốc | JS heap sau GC (MB) | Bộ nhớ GPU của tab (MB) | Ghi chú |
|---|---|---|---|
| Sau 1 lần vào/ra | 8,7 | không đo | |
| Sau 10 lần | 10,7 | không đo | |
| Sau 20 lần | 11,0 | không đo | Không rò |

Rà tĩnh phía code (không thay cho số đo): `MatchCanvas` huỷ renderer khi unmount; `MatchRenderer.dispose()` huỷ vòng `requestAnimationFrame`, listener phím/blur, `ResizeObserver`, hậu kỳ, toàn bộ geometry/material/texture của scene và model cầu thủ, gọi `renderer.dispose()` + `forceContextLoss()` và gỡ canvas.

## 3. E2E luồng chính (Task 8.1)

- **Ngày chạy:** 2026-11-14 · **Công cụ:** Playwright 1.65 (`@playwright/test`, Chromium headless) · **File:** `playwright.config.ts`, `e2e/main-flow.spec.ts`.
- **Cách chạy:** `pnpm e2e` ở gốc repo (lần đầu: `pnpm exec playwright install chromium`; cần Postgres dev đang chạy). Playwright tự migrate + seed DB test rồi bật server Fastify `:3101` (`NODE_ENV=test`, `MATCH_MIN_DURATION_SEC=1`) và web Vite `:5174` (`--mode test`, proxy `/api` → `:3101` qua `API_PROXY_TARGET`), xong thì tắt. DB lấy theo `E2E_DATABASE_URL` → `DATABASE_URL_TEST` → `pitch_test`; cấu hình từ chối DB dev `pitch`. Đổi cổng bằng `E2E_SERVER_PORT` / `E2E_WEB_PORT`. Không xoá dữ liệu: mỗi lần chạy đăng ký một tài khoản mới (`e2e_<thời gian>`). `pnpm check` không chạy E2E (Vitest chỉ quét `apps/*`, `packages/*`), nhưng vẫn lint + typecheck thư mục `e2e/`.
- **Kịch bản (1 test, 6 bước, thao tác trên giao diện thật, không gọi API tắt):**
  1. Đăng ký tài khoản mới → được đưa sang `/shop?onboarding=1`, hiện thanh "Luồng tân thủ".
  2. Mở gói 5 thẻ miễn phí (xé gói → lật tất cả) → "Đã nhận 5 thẻ", số xu không đổi → "Xếp đội".
  3. Đội hình: chọn ô dự bị đầu tiên → bấm một thẻ trong Kho → Lưu → "Đã lưu đội hình"; tải lại trang thẻ vẫn ở ô đó.
  4. `/play?difficulty=easy&autopilot=1&half=10` (đồ hoạ Thấp, tắt phát lại): trận tự đá hết 2 hiệp (+ luân lưu nếu hoà) → màn kết quả hiện `+N` xu, ví = số dư cũ + N, "trận có thưởng 1/15".
  5. Nhiệm vụ ngày: màn kết quả và trang chủ hiện 3 nhiệm vụ kèm tiến độ; mỗi nhiệm vụ đã đạt thì bấm "Nhận" và số xu trên thanh trên tăng đúng phần thưởng.
  6. Đăng xuất → đăng nhập lại: số xu đúng, trang chủ báo kho 16 thẻ (11 thẻ tân thủ + 5 thẻ vừa mở), mở được Kho thẻ.
- **Kết quả 3 lần liên tiếp (cùng mã nguồn, DB `pitch_test_a`):**

  | Lần | Kết quả     | Thời gian test | Riêng bước trận | Nhiệm vụ đã nhận thưởng |
  | --- | ----------- | -------------- | --------------- | ----------------------- |
  | 1   | ✅ 1 passed | 114 s          | 108 s           | 1                       |
  | 2   | ✅ 1 passed | 113 s          | 108 s           | 1                       |
  | 3   | ✅ 1 passed | 98 s           | 92 s            | 2                       |

- **Ghi chú:**
  - Không phát hiện lỗi ứng dụng. Thay đổi duy nhất trong mã app: `apps/web/vite.config.ts` đọc `API_PROXY_TARGET` (mặc định vẫn `http://127.0.0.1:3000`).
  - Nút gói thẻ có hiệu ứng "thở" lặp vô hạn nên Playwright không coi là đứng yên để click chuột → test xé gói bằng phím Enter (đường bàn phím của DESIGN §6.3).
  - Trận `half=10` mất ~90–110 s trên WebGL phần mềm của Chromium headless (giới hạn chờ màn kết quả: 270 s; cả test: 360 s). Máy CI chậm hơn nhiều có thể cần nới giới hạn.
  - Bộ 3 nhiệm vụ ngày chọn theo `(người chơi, ngày)` nên số nhiệm vụ nhận thưởng thay đổi theo lần chạy; test chỉ bấm "Nhận" khi có nhiệm vụ đã đạt.
  - Rate limit giữ nguyên mặc định (kịch bản chỉ gọi `/auth/*` 3 lần, ngưỡng 10 lần/phút/IP; mỗi lần `pnpm e2e` bật server mới nên bộ đếm về 0).

---

## 4. Tiêu chí chấp nhận (Task 8.4)

- **Ngày rà:** 2026-11-14 · **Nguồn:** mọi mục "Tiêu chí chấp nhận" trong `docs/PRD.md` (§5, §6.3–§6.6, §7, §8) — 36 tiêu chí — cùng mục tiêu ở §9 và bảng chỉ số §10.
- **Cách rà:** với từng tiêu chí, mở file test và đọc phần thân test để chắc test kiểm đúng điều tiêu chí yêu cầu (không suy theo tên file). Tiêu chí về giao diện chưa có test tự động thì kiểm tay bằng Playwright trên giao diện thật (nhật ký ở 4.9). Đường dẫn test tính từ gốc repo; tên trong ngoặc kép là tên `it(...)`.
- **Trạng thái nền:** `pnpm check` xanh (lint + typecheck + 87 file / 852 test Vitest) ngày 2026-11-14 (ngày 2026-11-16: 94 file / 979 test) trên DB `pitch_test_a`; mọi test nêu dưới đây nằm trong `pnpm check`, trừ chỗ ghi rõ "chạy riêng".

### 4.1 Tổng hợp

| Nhóm | Số tiêu chí | Đạt | Chưa đạt | Không áp dụng |
|---|---|---|---|---|
| F1–F3 Trận đấu (PRD §5) | 8 | 8 | 0 | 0 |
| F5 Mở gói (PRD §6.3) | 8 | 8 | 0 | 0 |
| F6 Đội hình (PRD §6.4) | 5 | 5 | 0 | 0 |
| F10 Ép thẻ (PRD §6.5) | 5 | 5 | 0 | 0 |
| F11 Bán thẻ (PRD §6.6) | 2 | 2 | 0 | 0 |
| F7, F9, F12 Kinh tế (PRD §7) | 5 | 5 | 0 | 0 |
| F8, F13 Tài khoản & phân tích (PRD §8) | 3 | 3 | 0 | 0 |
| **Tổng** | **36** | **36** | **0** | **0** |

AC-F1-1 (vế ≥ 55 FPS) được xác nhận sau khi đo §2.4 (2026-11-14). Cả 36 tiêu chí đã được tick `[x]` trong `docs/PRD.md`. Chỉ số §9–§10 (không phải checkbox) rà riêng ở 4.8.

### 4.2 F1–F3 — Trận đấu (PRD §5)

| Mã | Tiêu chí | Cách kiểm | Kết quả |
|---|---|---|---|
| AC-F1-1 | Trận đủ 2 hiệp × 3 phút + bù giờ (±1 giây), đổi sân sau hiệp 1, ≥ 55 FPS TB trên laptop tầm trung (Chrome, GPU tích hợp) với 14 cầu thủ | **Tự động (thời lượng theo tick, đổi sân):** `packages/sim/src/match.rules.test.ts` — "hiệp 1 kết thúc đúng 180 s (10.800 tick) khi không có bù giờ → nghỉ giữa hiệp", "sang hiệp 2: đổi sân, đội khách giao bóng, đồng hồ về 45'", "trận đủ 2 × 180 s: hết giờ hiệp 2 → full_time; sau đó step không đổi gì", "chờ giao bóng quá 3 s bị tính bù giờ: hiệp kéo dài thêm đúng số phút bù"; `packages/sim/src/rules/clock.test.ts` (công thức bù giờ, tối đa 3'); `packages/sim/src/match.test.ts` — "mỗi đội 7 cầu thủ trên sân…" (14 cầu thủ). **Kiểm tay (đồng hồ thật, 2026-11-14):** trận tự đá đủ thời lượng trên Chromium (GPU Intel UHD qua ANGLE D3D11), ghi thời điểm thật mỗi lần đồng hồ HUD đổi phút: hiệp 1 từ 1' → 44' mất 172,00 s, hiệp 2 từ 46' → 89' mất 171,99 s (chuẩn 43 phút game × 4 s = 172,00 s) → lệch ≤ 0,01 s, trong ngưỡng ±1 giây; hiệp 1 có bù giờ 45+1' → 45+3' (4.9, KT-6). Vòng lặp chỉ chậm hơn đồng hồ thật khi một khung hình dài hơn 0,25 s (`MAX_FRAME_SEC` trong `apps/web/src/game/three/MatchRenderer.ts`, tức dưới 4 FPS). **FPS (2026-11-14, §2.4):** Chrome, Intel UHD (GPU tích hợp), trận đủ thời lượng: preset Cao 74,6 FPS TB, Thấp 166,0 FPS TB. | **Đạt** |
| AC-F1-2 | Vật lý bóng theo bước cố định 60 tick/s; cùng trạng thái đầu + cùng chuỗi input → cùng kết quả (test tự động) | `packages/sim/src/tick.ts` (`TICK_RATE = 60`). `packages/sim/src/match.test.ts` — "2 lần chạy 600 tick cùng seed + cùng input → state giống hệt"; `packages/sim/src/physics/ball.test.ts` — "cùng đầu vào → cùng kết quả"; `packages/sim/src/match.ai.test.ts` — "cùng seed + cùng input cho kết quả y hệt, kể cả sau JSON khứ hồi (AI tất định)". Vòng lặp web gom thời gian thực rồi chạy `step` theo `TICK_DT` (`apps/web/src/game/three/MatchRenderer.ts`). ESLint cấm `Math.random` trong `packages/sim`. | **Đạt** |
| AC-F1-3 | Bóng qua vạch biên dọc → ném biên cho đội không chạm cuối; qua vạch cuối → phạt góc hoặc phát bóng đúng luật (test cả 3 trường hợp) | `packages/sim/src/match.rules.test.ts` — "qua vạch biên, đội nhà chạm cuối → ném biên cho đội khách tại điểm bóng ra", "qua vạch cuối ngoài khung thành, đội tấn công chạm cuối → phát bóng cho đội phòng ngự", "qua vạch cuối ngoài khung thành, đội phòng ngự chạm cuối → phạt góc cho đội tấn công" (+ "hiệp 2 đổi sân…"); `packages/sim/src/rules/restarts.test.ts` (`decideRestart`, cùng 3 trường hợp); `packages/sim/src/physics/ball.test.ts` — "qua hẳn vạch biên dọc → ball_out touch…", "bóng đè vạch … vẫn trong sân". | **Đạt** |
| AC-F1-4 | Xoạc không chạm bóng trước → phạm lỗi, đá phạt; trong vòng cấm → phạt đền; vàng thứ 2 → đỏ và rời sân (test tự động) | `packages/sim/src/match.fouls.test.ts` — "trượt bóng (không chạm bóng trước) → phạm lỗi, đội khách đá phạt tại chỗ, không thẻ", "phạm lỗi trong vòng cấm đội nhà → phạt đền cho đội khách", "vàng thứ hai → đỏ, cầu thủ rời sân, đội nhà còn 6 người, người chơi được đổi sang người khác"; `packages/sim/src/rules/fouls.test.ts` (`foulRestart`, `decideCards`). | **Đạt** |
| AC-F1-5 | Hoà sau 2 hiệp → luân lưu 5 lượt, rồi sudden death tới khi có kết quả | `packages/sim/src/rules/shootout.test.ts` — "hết 5 lượt hơn nhau thì xong; hoà thì sudden death", "sudden death: chỉ phân định khi đã sút bằng số lượt", "1.000 loạt ngẫu nhiên (xác suất vào 75%) đều kết thúc", "hoà sau 2 hiệp → luân lưu; tự đá tới khi có đội thắng, tỉ số trận giữ nguyên"; `packages/sim/src/match.rules.test.ts` — "hoà khi hết hiệp 2 → luân lưu, đồng hồ dừng". | **Đạt** |
| AC-F1-6 | Thay người chỉ khi bóng chết, tối đa 3 lượt, cầu thủ bị thẻ đỏ không được thay | `packages/sim/src/rules/substitution.test.ts` — "bóng sống → từ chối", "tối đa 3 lượt: lượt thứ 4 bị từ chối", "người đã bị thẻ đỏ (rời sân) không thay được"; giao diện: `apps/web/src/features/play/MatchHud.test.tsx` — "bóng sống: nút thay người mờ kèm lời nhắc", "bóng chết: nút thay người bật". | **Đạt** |
| AC-F1-7 | Mô phỏng AI-vs-AI 100 trận, đội "người" dùng đội khởi đầu: thắng máy Dễ ≥ 60%, thắng máy Khó ≤ 30% | **Tự động, chạy riêng (chậm, không nằm trong `pnpm check`):** `packages/sim/src/balance.slow.test.ts` — "người chơi trung bình thắng máy Dễ ≥ 60%", "… thắng máy Khó ≤ 30%" (`pnpm --filter @pitch/sim test:slow`, 100 seed cố định, đội mẫu): chạy 2026-11-14 → 2/2 xanh (180 s). **Đội thật** (11 thẻ khởi đầu + đội máy do server sinh): `pnpm --filter @pitch/server balance` ngày 2026-11-14 → Dễ **79%** (T79/H18/B3), Khó **13%** (T13/H25/B62). | **Đạt** |
| AC-F1-8 | Cùng tình huống sút, Sút 90 vào khung thành nhiều hơn Sút 55 ít nhất 25 điểm % (1.000 cú sút) | `packages/sim/src/actions/shoot.test.ts` — "PRD §5: Sút 90 vào khung thành nhiều hơn Sút 55 ít nhất 25 điểm %" (1.000 seed mỗi cầu thủ, cùng vị trí và mục tiêu). | **Đạt** |

### 4.3 F5 — Mở gói box draw (PRD §6.3)

| Mã | Tiêu chí | Cách kiểm | Kết quả |
|---|---|---|---|
| AC-F5-1 | Bốc thẻ, trừ xu, thêm thẻ vào kho chạy ở server trong một DB transaction; client chỉ gửi "mua gói X" | Code: `apps/server/src/services/packs.ts` (`db.transaction` → `openInTx`: khoá `users` → `pack_boxes`). `apps/server/src/routes/packs.test.ts` — "mở bằng xu: trừ giá, ledger pack_purchase trỏ tới pack_opening, tổng ledger = coins", "không đủ xu → 409 insufficient_coins; xu, hộp, kho không đổi"; `apps/server/src/routes/tamper.test.ts` — "price: 0 / rarity: legend / userId người khác → vẫn trừ đủ giá, thẻ theo phiếu trong hộp của mình". Thử tay bằng curl: §1.4 mục 2. | **Đạt** |
| AC-F5-2 | Không đủ xu → server từ chối, xu và hộp giữ nguyên | `apps/server/src/routes/packs.test.ts` — "không đủ xu → 409 insufficient_coins; xu, hộp, kho không đổi"; `apps/server/src/routes/tamper.test.ts` — "không đủ xu thì price: 0 cũng không cứu được…". | **Đạt** |
| AC-F5-3 | Mở hết 100 phiếu nhận đúng 2/10/30/58 (test trên nhiều hộp) | `apps/server/src/domain/gacha.test.ts` — "bốc hết 100 phiếu → đúng 2/10/30/58, lặp nhiều hộp (gói 1 và gói 5)" (50 hộp mỗi loại gói); qua API: `apps/server/src/routes/packs.test.ts` — "mở liên tục hết hộp → hộp tự làm mới (cycle 2), đúng 2/10/30/58 trong 100 phiếu đầu". | **Đạt** |
| AC-F5-4 | Mô phỏng 10.000 hộp: tần suất độ hiếm từng vị trí bốc khớp lý thuyết (chi-bình phương, p > 0,01) | `apps/server/src/domain/gacha.test.ts` — "10.000 hộp: tần suất độ hiếm ở từng vị trí bốc khớp lý thuyết (chi-bình phương)": p gộp 100 vị trí > 0,01; từng vị trí > 0,01/100 (hiệu chỉnh Bonferroni cho 100 phép thử). | **Đạt** |
| AC-F5-5 | Gói 5 không bao giờ ra 5 Đồng khi hộp còn ≥ 1 phiếu Bạc+ | `apps/server/src/domain/gacha.test.ts` — "gói 5 không bao giờ ra 5 Đồng khi hộp còn Bạc+" (5.000 hộp ngẫu nhiên), "phiếu bảo đảm bốc trong nhóm Bạc+ theo tỉ lệ số còn lại", "hộp chỉ còn Đồng → không bảo đảm"; UI báo trước: `apps/web/src/features/shop/BoxMeter.test.tsx` — "hộp chỉ còn Đồng → cảnh báo gói 5 không bảo đảm". | **Đạt** |
| AC-F5-6 | Server dùng CSPRNG (`crypto`), không dùng `Math.random` | `apps/server/src/domain/rng.test.ts` — "dùng crypto.randomInt (CSPRNG) và trả giá trị trong [0, max)"; `cryptoRng` là mặc định của `openPack`, `upgradeCard`, `startMatch` và `app.rng`; ESLint cấm `Math.random` trong `apps/server` (`eslint.config.js`, chạy trong `pnpm check`). | **Đạt** |
| AC-F5-7 | Gửi trùng request không mở 2 lần (idempotency key) | `apps/server/src/routes/packs.test.ts` — "gửi lại cùng key → cùng kết quả, chỉ trừ xu một lần", "2 request song song cùng key → một kết quả, mở một lần", "cùng key nhưng khác gói hoặc cách trả → 409 idempotency_conflict", "request sai: thiếu/hỏng Idempotency-Key → 400…"; phía web: `apps/web/src/features/shop/BoxMeter.test.tsx` — "lần mua mới → key mới; thử lại cùng gói + cách trả → giữ key". | **Đạt** |
| AC-F5-8 | Sau khi mở, kho thẻ và số phiếu còn lại hiển thị đúng, không cần tải lại trang | **Kiểm tay 2026-11-14 (4.9, KT-1):** hộp 100/100 → mở gói 5 → hộp hiện 95/100, tổng 4 dòng độ hiếm = 95, tỉ lệ lần bốc kế tính lại; sang Kho thẻ / Đội hình bằng điều hướng trong trang thấy đủ 5 thẻ mới; không có sự kiện tải lại trang. Phần hiển thị: `apps/web/src/features/shop/BoxMeter.test.tsx` — "hiện số phiếu còn và tỉ lệ lần bốc kế (1 chữ số thập phân)". | **Đạt** |

### 4.4 F6 — Đội hình (PRD §6.4)

| Mã | Tiêu chí | Cách kiểm | Kết quả |
|---|---|---|---|
| AC-F6-1 | Kéo-thả thẻ từ kho vào ô; đổi sơ đồ giữ thẻ còn hợp lệ, thẻ thừa về dự bị hoặc kho | **Kiểm tay 2026-11-14 (KT-2):** kéo chuột một thẻ từ Kho thả vào ô GK → ô GK nhận thẻ mới, thủ môn cũ về Kho; đổi 2-3-1 → 2-2-2 → thông báo "1 thẻ không còn chỗ trong sơ đồ 2-2-2 … xuống dự bị". Logic: `apps/web/src/features/squad/squad.test.ts` — "thẻ từ kho thay người đang ở ô (người cũ về kho)", "2-3-1 → 3-2-1: thẻ hợp vị trí giữ ô, tiền vệ thừa xuống dự bị", "dự bị đầy → thẻ thừa về kho", "không mất và không nhân đôi thẻ nào". | **Đạt** |
| AC-F6-2 | Không vào được trận nếu thiếu thủ môn hoặc chưa đủ 7 người đá chính (thông báo rõ thiếu gì) | `apps/server/src/routes/matches.test.ts` — "đội thiếu thủ môn → 422 invalid_squad nêu rõ, không tạo trận", "thiếu người đá chính (đủ GK) → 422 nêu số người và ô trống". **Kiểm tay 2026-11-14 (KT-3):** gỡ thủ môn → màn Đội hình báo ngay "Mới có 5/7 người đá chính · Chưa có thủ môn. Cần đủ 7 người, có 1 GK, để vào trận.", nút "Đá với máy – Dễ" bị khoá; vào thẳng `/play` → màn "Đội hình chưa đủ": "Đội hình thiếu thủ môn — cần đủ 7 người đá chính (ô trống: GK, P5)" + nút "Sửa đội hình". | **Đạt** |
| AC-F6-3 | Chỉ số đội và cảnh báo sai vị trí cập nhật ngay khi thay đổi | **Kiểm tay 2026-11-14 (KT-2):** thả một thẻ không phải thủ môn vào ô GK → ngay lập tức (chưa bấm Lưu) OVR đội đổi 55 → 56, nhãn ô "sai vị trí −15%", cảnh báo đỏ "… đang đá GK: mọi chỉ số −15% (OVR 71 → 61)". Công thức: `packages/shared/src/squad.test.ts` — "sai vị trí → cảnh báo + chỉ số người đó −15%, rating giảm theo", "thiếu thủ môn / thiếu người đá chính → cảnh báo, ô trống tính 0 vào rating"; `packages/shared/src/domain.test.ts` — "sai vị trí → −15% mọi chỉ số (sau khi cộng cấp), làm tròn". | **Đạt** |
| AC-F6-4 | Đội hình lưu ở server, đăng nhập máy khác vẫn còn | `apps/server/src/routes/squad.test.ts` — "đổi chỗ thủ môn ↔ hậu vệ → cảnh báo sai vị trí, rating giảm; đăng nhập lại vẫn còn" (phiên mới đọc lại đúng đội đã lưu); `apps/server/src/routes/auth-hardening.test.ts` — "đăng xuất → cookie cũ không dùng được; đăng nhập lại → thẻ, xu, đội hình giữ nguyên"; E2E `e2e/main-flow.spec.ts` bước 3 (lưu → tải lại trang vẫn còn). | **Đạt** |
| AC-F6-5 | Thẻ trong đội hình không thể bán hay dùng làm nguyên liệu ép | `apps/server/src/routes/player-cards.test.ts` — "có thẻ trong đội hình → 409 card_in_squad, không thẻ nào bị bán"; `apps/server/src/routes/upgrade.test.ts` — "nguyên liệu trong đội hình → 409 card_in_squad; thẻ được ép trong đội hình thì vẫn ép được"; DB: `apps/server/src/db/schema.test.ts` — "xoá player_cards đang trong squad_slots bị FK RESTRICT chặn"; web: `apps/web/src/features/upgrade/upgrade.test.ts` — "bỏ chính thẻ được ép, thẻ thấp độ hiếm hơn, thẻ trong đội hình". Kiểm tay KT-4: ở chế độ chọn bán, 11 thẻ trong đội hình bị khoá. | **Đạt** |

### 4.5 F10 — Ép thẻ (PRD §6.5)

| Mã | Tiêu chí | Cách kiểm | Kết quả |
|---|---|---|---|
| AC-F10-1 | Trước khi ép, UI hiển thị: tỉ lệ = cơ bản + may mắn, phí, chỉ số sau khi ép | `apps/web/src/features/upgrade/upgrade.test.ts` — "tỉ lệ = cơ bản + may mắn, phí = phí cơ bản × hệ số độ hiếm", "chỉ số sau ép = chỉ số gốc + điểm cộng của cấp đích (không cộng dồn), tối đa 99"; `apps/web/src/features/upgrade/UpgradeStats.test.tsx` — "+3 → +4: mỗi chỉ số cộng 5 thay vì 3 (tăng 2), kẹp 99". **Kiểm tay 2026-11-14 (KT-5):** màn Ép thẻ hiện "Tỉ lệ thành công 100% · Cơ bản +1: 100%", "Phí ép (50 × Đồng ×1) 50 xu", bảng chỉ số +0 → +1 từng dòng (OVR 56 → 57, PAC 55 → 56…), cảnh báo mất nguyên liệu. | **Đạt** |
| AC-F10-2 | Ép chạy hoàn toàn ở server trong 1 DB transaction (trừ xu, xoá nguyên liệu, quay tỉ lệ, cập nhật cấp/may mắn, ghi giao dịch) | Code: `apps/server/src/services/upgrade.ts` (`db.transaction` → `upgradeInTx`). `apps/server/src/routes/upgrade.test.ts` — "thành công: lên cấp, may mắn về 0, xoá nguyên liệu, trừ phí, ghi sổ cái + lịch sử + analytics", "thất bại: giữ cấp, +10 may mắn, vẫn mất nguyên liệu và phí", "2 lần ép song song dùng cùng nguyên liệu → đúng 1 thành công; sổ cái khớp số dư"; `apps/server/src/routes/tamper.test.ts` — "gửi success / level / fee / rate → kết quả vẫn do server quay, phí vẫn trừ đủ". | **Đạt** |
| AC-F10-3 | 10.000 lần ép mỗi cấp (may mắn 0) lệch ≤ ±1,5 điểm % so với bảng | `apps/server/src/domain/upgrade.test.ts` — "10.000 lần ép mỗi cấp (may mắn 0) lệch ≤ ±1,5 điểm % so với bảng"; bảng: "khớp bảng PRD §6.5". | **Đạt** |
| AC-F10-4 | Sau 3 lần trượt liên tiếp ở +5, lần thứ 4 có tỉ lệ 55% | `apps/server/src/domain/upgrade.test.ts` — "3 lần trượt liên tiếp ở +5 → lần thứ 4 tỉ lệ 55%"; qua API: `apps/server/src/routes/upgrade.test.ts` — "3 lần trượt ở +5 → lần thứ 4 tỉ lệ 55%"; web: `apps/web/src/features/upgrade/upgrade.test.ts` — "tỉ lệ kẹp ở 100%; sau 3 lần trượt ở +5 thì lần 4 là 55%". | **Đạt** |
| AC-F10-5 | Không ép được thẻ đã +5; không ép khi thiếu xu hoặc nguyên liệu không hợp lệ | `apps/server/src/routes/upgrade.test.ts` — "thẻ đã +5 → 422 max_level, không thay đổi gì", "thiếu xu → 409 insufficient_coins, không thay đổi gì", "nguyên liệu thấp độ hiếm hơn hoặc chính thẻ được ép → 422 invalid_material", "thẻ không tồn tại hoặc của người khác → 404"; DB: `apps/server/src/db/schema.test.ts` — "player_cards.level ngoài 0…5 bị CHECK chặn". | **Đạt** |

### 4.6 F11 — Bán thẻ (PRD §6.6)

| Mã | Tiêu chí | Cách kiểm | Kết quả |
|---|---|---|---|
| AC-F11-1 | Bán một hoặc nhiều thẻ cùng lúc, có hộp xác nhận nếu có thẻ Vàng+ hoặc thẻ đã + | `apps/server/src/routes/player-cards.test.ts` — "bán nhiều thẻ: cộng xu theo độ hiếm, xoá thẻ, mỗi thẻ một dòng sổ cái khớp số dư"; `apps/web/src/features/collection/collection.test.ts` — "cần bấm giữ khi có Vàng+ hoặc thẻ đã +", "tổng giá theo độ hiếm, không phụ thuộc cấp +". **Kiểm tay 2026-11-14 (KT-4):** chọn 4 thẻ (Huyền thoại, Vàng, Bạc, Đồng) → thanh "Đã chọn 4 thẻ · nhận 415 xu" → hộp "Bán 4 thẻ? … Có 2 thẻ Vàng/Huyền thoại." với nút "Giữ 1 giây để bán" → giữ chuột 1 giây → kho còn 12 thẻ, ví 0 → 415 xu (300 + 80 + 25 + 10). Lưu ý: mọi lần bán đều có hộp xác nhận; bán thẻ Vàng+/đã + phải bấm giữ. | **Đạt** |
| AC-F11-2 | Không bán được thẻ trong đội hình; bán thẻ và cộng xu trong cùng 1 DB transaction | Code: `apps/server/src/services/player-cards.ts` (`sellPlayerCards`: một `db.transaction`, khoá `users` → `player_cards`). `apps/server/src/routes/player-cards.test.ts` — "có thẻ trong đội hình → 409 card_in_squad, không thẻ nào bị bán", "2 request bán cùng một thẻ song song → xu chỉ cộng một lần, request kia 404", "thẻ của người khác → 404, không thay đổi gì". | **Đạt** |

### 4.7 F7, F9, F12 — Kinh tế · F8, F13 — Tài khoản & phân tích (PRD §7, §8)

| Mã | Tiêu chí | Cách kiểm | Kết quả |
|---|---|---|---|
| AC-F7-1 | Số dư xu luôn bằng tổng các bản ghi giao dịch (test đối soát) | `apps/server/src/routes/ledger-integrity.test.ts` — "mọi người chơi: coins = SUM(ledger.amount), balance_after liên tục, không âm" (260 thao tác ngẫu nhiên, 5 người chơi), "sổ sạch → rỗng, exit 0; sửa tay số dư hoặc sổ cái → nêu đúng người lệch, exit ≠ 0" (script `ledger:check`); DB: `apps/server/src/db/schema.test.ts` — "coin_transactions append-only: UPDATE và DELETE bị trigger chặn". Đo tải §2.2: 0 lệch sau hơn 20.000 lượt mở gói. | **Đạt** |
| AC-F7-2 | Số dư không bao giờ âm, kể cả 2 request mua gói gần như cùng lúc (test đồng thời) | `apps/server/src/routes/packs.test.ts` — "2 request song song khác key khi chỉ đủ xu cho 1 → đúng 1 thành công, số dư ≥ 0"; `apps/server/src/routes/ledger-integrity.test.ts` — "mở gói + bán + ép + lưu đội hình song song: không 500, không âm, không tiêu một thẻ hai lần"; DB: `apps/server/src/db/schema.test.ts` — "users.coins âm bị CHECK chặn". Thử tay curl §1.4 mục 4 (5 request song song). | **Đạt** |
| AC-F7-3 | Thưởng trận chỉ cấp khi: có match token do server phát; token dùng 1 lần; ≥ 6 phút từ lúc phát; mỗi đội ≤ 20 bàn; chưa vượt 15 trận có thưởng/ngày | `apps/server/src/routes/matches.test.ts` — "thắng Dễ sau 6 phút: +60 xu, trận finished, ledger match_reward đúng", nhóm "từ chối (422 match_token_invalid, không đổi xu/trận)": "token sai", "chưa đủ 6 phút", "tỉ số 21"; "gửi lại cùng token → cùng kết quả, xu chỉ cộng một lần"; "trần 15 trận/ngày GMT+7: trận 16 thưởng 0; 23:59 và 00:01 là hai ngày khác nhau". `apps/server/src/routes/tamper.test.ts` — "nộp sớm hơn 6 phút / bịa token / dùng token của trận khác → 422, không thưởng", "thua xong nộp lại "thắng 20–0" cùng token → vẫn kết quả cũ, xu cộng đúng một lần". `apps/server/src/routes/security-review.test.ts` — "nộp sau quá 2 giờ → 422 match_token_invalid, xu giữ nguyên 0". | **Đạt** |
| AC-F7-4 | Tài khoản mới nhận đúng 11 thẻ khởi đầu + 1 gói 5 miễn phí, đúng một lần | `apps/server/src/routes/register.test.ts` — "11 thẻ Đồng khác nhau: 1 TM, 3 HV, 4 TV, 3 TĐ; ô đá chính đúng vị trí trong 2-3-1", "201 + cookie; nhận đúng 11 thẻ, hộp 58/30/10/2, 1 gói 5 miễn phí, đội hình xếp sẵn"; `apps/server/src/routes/tamper.test.ts` — "lượt miễn phí chỉ có một: lần hai (kể cả kèm freePack5Credits: 99) → 409", "gửi thêm coins / isAdmin / freePack5Credits / id → bị bỏ qua, chỉ nhận đúng quà tân thủ"; `apps/server/src/routes/packs.test.ts` — "lượt miễn phí: giá 0, credit − 1, 5 thẻ (≥ 1 Bạc+)…". E2E `e2e/main-flow.spec.ts` (kho 16 thẻ sau gói miễn phí). | **Đạt** |
| AC-F7-5 | Nhiệm vụ ngày cập nhật tiến độ theo sự kiện ở server, nhận thưởng một lần, reset 00:00 GMT+7 | `apps/server/src/routes/missions.test.ts` — "đá trận TRƯỚC KHI mở màn nhiệm vụ vẫn tạo & tăng tiến độ; trả về trong match result", "mở gói … vẫn tăng open_pack; gửi lại cùng Idempotency-Key không tăng lần 2", "claim: chưa xong → 422; sai mã → 404; đủ điều kiện → +xu + ledger; nhận 2 lần → 409", "2 request claim song song → đúng 1 thành công…", "reset lúc 00:00 GMT+7 (FakeClock): 23:59 và 00:01 là hai ngày riêng biệt"; `apps/server/src/domain/missions.test.ts`. E2E `e2e/main-flow.spec.ts` bước 5 (nhận thưởng trên giao diện). | **Đạt** |
| AC-F8-1 | Đăng ký → đăng nhập → đăng xuất hoạt động; sai mật khẩu 5 lần trong 15 phút → khoá 15 phút | `apps/server/src/routes/register.test.ts` — "đăng nhập lại được bằng tài khoản vừa tạo"; `apps/server/src/routes/auth.test.ts` — "đúng mật khẩu → Me + cookie phiên an toàn; DB chỉ giữ hash token", "xoá phiên, cookie cũ hết dùng"; `apps/server/src/routes/auth-hardening.test.ts` — "5 lần sai → lần 6 bị khoá kể cả đúng mật khẩu; sau 15 phút đăng nhập được", "lần sai cách nhau hơn 15 phút không cộng dồn". E2E `e2e/main-flow.spec.ts` bước 1 và 6 (trên giao diện). | **Đạt** |
| AC-F8-2 | Mọi API thay đổi dữ liệu yêu cầu đăng nhập và chỉ tác động lên tài khoản người gọi | `apps/server/src/routes/write-routes-auth.test.ts` — "không cookie → 401 unauthenticated với mọi route ghi (trừ ngoại lệ)" (danh sách route lấy từ Fastify nên route mới tự được kiểm), "cookie phiên bịa / rỗng → 401…", "ngoại lệ công khai chỉ gồm route /auth/* có thật"; IDOR: `apps/server/src/routes/tamper.test.ts` — "bán playerCardId của người khác … → 404, không ai đổi gì", "nguyên liệu hoặc thẻ đích là của người khác → 404…", "xếp thẻ của người khác vào đội mình → 404…", "nộp trận của người khác (kể cả có token thật của họ) → 404…". Rà tay: §1.1 (IDOR). | **Đạt** |
| AC-F8-3 | Có truy vấn hoặc trang admin cho ra D7 retention theo nhóm ngày đăng ký | `apps/server/src/routes/admin.test.ts` — "tính D1/D7 đúng qua 3 nhóm ngày đăng ký; giữ cookie không cần login ngày 7 vẫn tính D7", "chưa đăng nhập → 401; không phải admin → 403; query sai → 400", "ghi đủ sự kiện analytics trong transaction và session_seen tối đa 1 lần/ngày GMT+7"; trang `/admin`: `apps/web/src/features/admin/AdminPage.test.tsx` — "render đầy đủ dữ liệu mẫu: tổng đăng ký, D1/D7 trung bình…". Hiệu năng truy vấn: §2.3. | **Đạt** |

### 4.8 Mục tiêu §9 và chỉ số thành công §10 (không phải checkbox)

Các chỉ số này đo trên người chơi thật nên chưa thể kết luận trước playtest/phát hành; bảng dưới ghi công cụ đo đã sẵn sàng hay chưa.

| Chỉ số (PRD) | Mục tiêu | Công cụ đo | Trạng thái 2026-11-14 |
|---|---|---|---|
| Retention D7 (§10) | ≥ 15% | Trang `/admin` + `GET /api/v1/admin/retention` (test: AC-F8-3) | **Không áp dụng** trước phát hành — công cụ sẵn sàng |
| Người chơi thật tháng đầu (§10) | ≥ 50 tài khoản có ≥ 1 trận | Bảng `analytics_events` (`match_start`) | **Không áp dụng** trước phát hành — chưa có truy vấn/trang riêng, đếm bằng SQL (§6, T4) |
| Hiệu năng trận (§10) | ≥ 55 FPS TB, laptop tầm trung | `/play?perf=1` (§2.4) | **Đạt** — Cao 74,6 / Thấp 166,0 FPS TB trên Intel UHD |
| Thời gian tới trận đầu (§9, §10) | ≤ 2 phút (trung vị) | `GET /api/v1/admin/onboarding` + thẻ phễu ở `/admin` (`apps/server/src/routes/admin.test.ts` — "tính trung vị register -> match_start chính xác bằng FakeClock, bỏ qua user chưa đá") | **Không áp dụng** trước khi có người chơi thật — đo ở playtest (§5) |
| Playtest trước phát hành (§10) | ≥ 7/10 người thấy "thẻ tốt khác biệt rõ trên sân" | Checklist §5 | **Chưa đạt** — chưa tổ chức playtest (§6, T3) |

### 4.9 Nhật ký kiểm tay (2026-11-14)

Môi trường: Playwright 1.65, Chromium headless, cửa sổ 1440 × 900, tiếng Việt; server Fastify `NODE_ENV=test` + web Vite `--mode test` do cấu hình `pnpm e2e` dựng, DB `pitch_test_a`. Mỗi lượt đăng ký một tài khoản mới và thao tác trên giao diện thật (chuột/bàn phím), không gọi API tắt. Kịch bản kiểm tay là file tạm, không nằm trong repo.

| Mã | Thao tác | Quan sát | Kết luận |
|---|---|---|---|
| KT-1 | Đăng ký → Cửa hàng → mở gói 5 miễn phí → quay lại Cửa hàng → sang Đội hình bằng menu | Hộp "100/100 phiếu" → "95/100 phiếu"; 4 dòng: "Huyền thoại: còn 2 phiếu, lần bốc kế 2,1%", "Vàng: còn 10 phiếu, … 10,5%", "Bạc: còn 29 phiếu, … 30,5%", "Đồng: còn 54 phiếu, … 56,8%" (tổng 95); Kho ở màn Đội hình báo "5 thẻ"; 0 lần tải lại trang | AC-F5-8 đạt |
| KT-2 | Màn Đội hình: kéo chuột thẻ đầu tiên trong Kho thả vào ô GK; rồi chọn sơ đồ 2-2-2 | Ô GK: "Sigar Lundvall" → "Cleraldo Rozeira, sai vị trí −15%"; thủ môn cũ về Kho (Kho vẫn 5 thẻ); OVR đội 55 → 56 ngay, cảnh báo đỏ "Cleraldo Rozeira (MF) đang đá GK: mọi chỉ số −15% (OVR 71 → 61). Kéo một thủ môn vào ô này để bỏ phạt."; đổi sơ đồ: "1 thẻ không còn chỗ trong sơ đồ 2-2-2 — Bjørar Vikqvist xuống dự bị.", OVR tính lại 48 | AC-F6-1, AC-F6-3 đạt |
| KT-3 | Gỡ thẻ ở ô GK → Lưu → mở `/play?difficulty=easy` → Tiếp tục | Màn Đội hình: "Mới có 5/7 người đá chính · Chưa có thủ môn. Cần đủ 7 người, có 1 GK, để vào trận."; nút "Đá với máy – Dễ" bị khoá; lưu được ("Đã lưu đội hình"); màn trận: tiêu đề "Đội hình chưa đủ", "Đội hình thiếu thủ môn — cần đủ 7 người đá chính (ô trống: GK, P5)", nút "Sửa đội hình"; không vào được trận | AC-F6-2 đạt. Ghi chú: màn "Chọn độ khó" không báo trước đội thiếu người, lỗi chỉ hiện sau khi bấm Tiếp tục (đã có ý tương tự trong `docs/BACKLOG.md`) |
| KT-4 | Kho thẻ → "Chọn để bán" → chọn 4 thẻ không trong đội hình → "Bán 4 thẻ" → giữ nút 1 giây | 11 thẻ trong đội hình bị khoá, 5 thẻ chọn được; thanh "Đã chọn 4 thẻ · nhận 415 xu"; hộp "Bán 4 thẻ? Bạn nhận 415 xu. Thẻ đã bán không lấy lại được. Có 2 thẻ Vàng/Huyền thoại." + nút "Giữ 1 giây để bán"; sau khi giữ: kho 16 → 12 thẻ, ví 0 → 415 xu. Lượt chạy thứ hai (Vàng + 2 Bạc + Đồng): 140 xu, cũng đòi bấm giữ. Lượt thứ ba (3 Bạc + Đồng, không có thẻ Vàng+/đã +): 85 xu, hộp xác nhận chỉ có nút "Bán" thường | AC-F11-1, AC-F6-5 (phần bán) đạt |
| KT-5 | `/upgrade` → chọn một thẻ Đồng trong đội hình làm thẻ cần ép → chọn nguyên liệu → Ép | Trước khi ép: "+0 → +1", "+1 = cộng tổng +1 vào mọi chỉ số (tối đa 99)", "Tỉ lệ thành công 100% · Cơ bản +1: 100%", "Phí ép (50 × Đồng ×1) 50 xu", bảng "OVR 56 → 57, PAC 55 → 56, SHO 49 → 50, PAS 56 → 57, DRI 54 → 55, DEF 56 → 57, STA 64 → 65", "Nguyên liệu … sẽ mất dù ép thành công hay thất bại. Thất bại: giữ cấp +0, may mắn +10%."; sau khi ép: "Thành công … lên +1 (từ +0) · may mắn về 0% · Tỉ lệ đã áp 100% · phí 50 xu · còn 365 xu", ví 415 → 365 | AC-F10-1 đạt. **Phát hiện lỗi giao diện T3:** lưới nguyên liệu có 12 ô thay vì 11 — thẻ nguyên liệu hợp lệ hiện 2 lần ("Hợp lệ" và một bản bị khoá ghi "Thấp hơn Đồng"), console báo trùng key (xem §6) |
| KT-6 | Trận tự đá đủ thời lượng (`/play?difficulty=easy&autopilot=1&perf=1`, hiệp 180 s, đồ hoạ Thấp, tắt phát lại), ghi thời điểm thật mỗi lần đồng hồ HUD đổi phút | GPU: ANGLE (Intel UHD Graphics, Direct3D11). Hiệp 1: 1' → 44' = 172,00 s; hiệp 2: 46' → 89' = 171,99 s (chuẩn 172,00 s vì 1 phút game = 4 s thật). Đồng hồ chạy đủ 0' → 45', bù giờ 45+1', 45+2', 45+3', sang hiệp 2 bắt đầu lại ở 45'. Không lấy số FPS từ lượt này (trình duyệt không cửa sổ, không phải điều kiện đo của §2.4) | Phần thời lượng của AC-F1-1 đạt |

---

## 5. Checklist playtest 5–10 người (PRD §10)

**Trạng thái: chưa tổ chức** (2026-11-14). Phải làm trước khi phát hành (GĐ9). Mục tiêu PRD §10: **≥ 7/10 người thấy "thẻ tốt khác biệt rõ trên sân"**; kèm đo **thời gian tới trận đầu ≤ 2 phút (trung vị)** (PRD §9) và thu ý kiến cho các câu hỏi mở PRD §12 (phím điều khiển, độ khó máy) và rủi ro §11 (tên hư cấu có đủ "quen").

### 5.1 Chuẩn bị

- [ ] **Người chơi:** 5–10 người, là fan FC Online chơi casual (PRD §2), chưa từng thấy game. Ghi mã P01…P10, không ghi tên thật vào repo.
- [ ] **Bản chơi:** bản build (`pnpm build` + server), không bật `ENABLE_DEV_ROUTES`; mỗi người một tài khoản mới tự đăng ký (để analytics ghi `register` → `match_start`).
- [ ] **Máy:** laptop tầm trung, GPU tích hợp, Chrome bản mới, bàn phím thật (MVP không hỗ trợ cảm ứng). Ghi CPU/GPU/độ phân giải.
- [ ] **Tài khoản so sánh (cho bước 5):** người tổ chức chuẩn bị sẵn 1 tài khoản "đội mạnh" có 7 thẻ đá chính Vàng/Huyền thoại (tạo trên máy tổ chức bằng server bật `ENABLE_DEV_ROUTES=1`, cấp xu qua `POST /api/v1/dev/grant-coins`, mở gói, xếp đội; hoặc cày thật). Không nói trước cho người chơi đội nào mạnh hơn.
- [ ] **Ghi nhận:** người quan sát ngồi cạnh, bấm giờ, không hướng dẫn trừ khi người chơi kẹt quá 60 giây (ghi lại chỗ kẹt). Xin phép trước nếu quay màn hình.
- [ ] Đọc cho người chơi: "Đây là bản thử, không có tiền thật; cứ nói to điều bạn đang nghĩ."

### 5.2 Kịch bản (mỗi người khoảng 35–45 phút)

| Bước | Việc người chơi làm | Người quan sát ghi |
|---|---|---|
| 1 | Mở trang, tự đăng ký tài khoản, làm theo luồng tân thủ tới khi bắt đầu trận đầu | Thời gian từ lúc bấm "Tạo tài khoản" tới lúc trận đầu bắt đầu (giây); chỗ ngập ngừng |
| 2 | Đá trận đầu mức Dễ bằng đội khởi đầu (thẻ Đồng), có hướng dẫn phím trong trận | Tỉ số; có hoàn thành hướng dẫn không; phím nào bấm nhầm; có dùng thay người không |
| 3 | Vào Cửa hàng mở gói (gói miễn phí + gói mua bằng xu vừa kiếm), đọc bảng hộp phiếu | Có hiểu "hộp 100 phiếu" và tỉ lệ lần bốc kế không (hỏi lại bằng lời) |
| 4 | Xếp thẻ mới vào đội hình, thử ép 1 thẻ, bán 1 thẻ thừa | Có hiểu cảnh báo sai vị trí, tỉ lệ ép, mất nguyên liệu không; lỗi gặp phải |
| 5 | **So sánh thẻ:** đá 1 trận Dễ bằng đội khởi đầu, rồi 1 trận Dễ bằng tài khoản "đội mạnh" (đổi thứ tự xen kẽ giữa các người chơi: P lẻ đá đội yếu trước, P chẵn đá đội mạnh trước) | Tỉ số 2 trận; nhận xét tự phát về tốc độ, sút, chuyền; hỏi câu Q1–Q3 ngay sau 2 trận |
| 6 | Đá 1 trận mức Khó bằng đội tuỳ chọn | Tỉ số; cảm nhận độ khó (Q6) |
| 7 | Trả lời bảng hỏi 5.3; mở `/play?perf=1` đá 1 trận ngắn nếu máy là máy riêng của người chơi | Dòng `[perf]` trong console (FPS TB, 1% thấp nhất) |
| Sau 1 và 7 ngày | Không nhắc; kiểm xem người chơi có tự quay lại không | Trang `/admin`: D1, D7 của nhóm ngày playtest |

### 5.3 Câu hỏi sau khi chơi

Thang 1–5 (1 = hoàn toàn không, 5 = rất rõ/rất đồng ý), trừ câu ghi khác.

| Mã | Câu hỏi | Dùng cho |
|---|---|---|
| Q1 | Trong 2 trận so sánh, bạn có thấy đội thẻ tốt **khác biệt rõ trên sân** không? (Có / Không) — **câu chính của PRD §10** | Mục tiêu ≥ 7/10 "Có" |
| Q2 | Khác biệt đó rõ ở mức nào? (1–5) Rõ nhất ở đâu: tốc độ / sút / chuyền / giữ bóng / thủ môn / không rõ | PRD §6.2 — chỉ số nào "thấy được" |
| Q3 | Không được nói trước: bạn đoán đội nào là đội thẻ tốt hơn? (trận 1 / trận 2 / không biết) | Kiểm chéo Q1 |
| Q4 | Phím điều khiển có dễ làm quen không? (1–5) Phím nào khó nhất? | PRD §12 — phím điều khiển |
| Q5 | Bạn có hiểu mình có bao nhiêu cơ hội ra thẻ hiếm khi mở gói không? (1–5) Có thấy "bị lừa" không? (Có / Không) | US-04, gacha minh bạch |
| Q6 | Mức Dễ: quá dễ / vừa / quá khó. Mức Khó: quá dễ / vừa / quá khó | PRD §12 — OVR và độ trễ AI |
| Q7 | Trận 6 phút: quá ngắn / vừa / quá dài | PRD §13 — thời lượng trận |
| Q8 | Tên cầu thủ hư cấu có "quen tai", dễ nhớ không? (1–5) | Rủi ro PRD §11 |
| Q9 | Bạn có muốn chơi lại vào ngày mai không? (1–5) Vì sao? | Giả thuyết giữ chân (D7) |
| Q10 | Điều khó chịu nhất? Điều thích nhất? (trả lời tự do) | Việc còn tồn, BACKLOG |

### 5.4 Chỉ số cần ghi và ngưỡng

| Chỉ số | Cách lấy | Ngưỡng đạt |
|---|---|---|
| Tỉ lệ Q1 = "Có" | Đếm trên số người chơi | ≥ 70% (≥ 7/10; với 5 người: ≥ 4/5) |
| Thời gian tới trận đầu (trung vị) | Bấm giờ ở bước 1; đối chiếu thẻ phễu `register → match_start` ở `/admin` | ≤ 120 giây |
| Hoàn thành luồng chính không cần trợ giúp | Bước 1–4 không bị người quan sát gỡ kẹt | Ghi nhận (không có ngưỡng PRD) |
| Kết quả trận Dễ / Khó | Tỉ số bước 2, 5, 6 | Tham khảo cân bằng: PRD §5 kỳ vọng thắng Dễ ≥ 60%, thắng Khó ≤ 30% |
| FPS trung bình | Dòng `[perf]` (bước 7) | ≥ 55 FPS |
| Lỗi gặp phải | Mô tả + bước tái hiện | Không có lỗi chặn luồng chính |
| D1 / D7 của nhóm playtest | Trang `/admin` sau 1 và 7 ngày | Tham khảo (mục tiêu phát hành: D7 ≥ 15%) |

### 5.5 Bảng ghi kết quả (để trống — điền khi playtest)

Ngày playtest: ……………… · Bản build (commit): ……………… · Người tổ chức: ………………

| Người chơi | Máy (CPU / GPU) | Tới trận đầu (s) | Trận Dễ đội yếu | Trận Dễ đội mạnh | Trận Khó | Q1 (Có/Không) | Q2 (1–5, rõ nhất ở) | Q3 đoán đúng? | Q4 | Q5 | Q6 (Dễ / Khó) | Q7 | Q8 | Q9 | FPS TB | Lỗi / ghi chú (Q10) |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| P01 | | | | | | | | | | | | | | | | |
| P02 | | | | | | | | | | | | | | | | |
| P03 | | | | | | | | | | | | | | | | |
| P04 | | | | | | | | | | | | | | | | |
| P05 | | | | | | | | | | | | | | | | |
| P06 | | | | | | | | | | | | | | | | |
| P07 | | | | | | | | | | | | | | | | |
| P08 | | | | | | | | | | | | | | | | |
| P09 | | | | | | | | | | | | | | | | |
| P10 | | | | | | | | | | | | | | | | |

| Tổng kết | Giá trị | Đạt? |
|---|---|---|
| Số người chơi | | (5–10) |
| Q1 = "Có" | …/… = …% | (≥ 70%) |
| Thời gian tới trận đầu — trung vị | … s | (≤ 120 s) |
| FPS trung bình — thấp nhất trong nhóm | | (≥ 55) |
| D1 / D7 của nhóm | | (tham khảo) |
| 3 vấn đề được nhắc nhiều nhất | | → `docs/BACKLOG.md` |

---

## 6. Việc còn tồn

Trạng thái 2026-11-14. Mức độ: **Chặn** = phải xong mới đóng được Giai đoạn 8 / phát hành; **Trung bình / Thấp** = lỗi hoặc thiếu sót không chặn; **Ghi nhận** = chấp nhận theo thiết kế MVP.

| Mã | Mức | Việc | Nguồn | Cách tái hiện / việc cần làm |
|---|---|---|---|---|
| T1 | ~~Chặn (đóng GĐ8)~~ **Xong** | Đo FPS và rò bộ nhớ trên laptop thật | §2.4, §4.2 | Đã đo 2026-11-14: Cao 74,6 / Thấp 166,0 FPS TB, không rò bộ nhớ sau 20 lần vào/ra trận; AC-F1-1 đã tick |
| T2 | Chặn (trước phát hành) | Chưa tổ chức playtest 5–10 người (PRD §10: ≥ 7/10 thấy "thẻ tốt khác biệt rõ trên sân"; thời gian tới trận đầu ≤ 2 phút) | §4.8, §5 | Làm theo checklist §5, điền bảng 5.5 |
| T3 | ~~Trung bình~~ **Xong (15/11, B4-01)** | **Lỗi giao diện màn Ép thẻ:** trong lưới "Chọn nguyên liệu", mỗi thẻ nguyên liệu hợp lệ hiện **hai lần** — một ô "Hợp lệ" (chọn được) và một ô bị khoá với nhãn sai "Thấp hơn … (tên độ hiếm)"; React báo lỗi console "Encountered two children with the same key". Không ảnh hưởng dữ liệu (ép vẫn đúng, server tự kiểm nguyên liệu) nhưng gây khó hiểu cho người chơi. Nguyên nhân: `apps/web/src/features/upgrade/UpgradePage.tsx` lọc danh sách thẻ khoá bằng `!materials.includes(it)`, trong khi `materialCandidates` (`upgrade.ts`) trả về object `{ pc, card }` mới nên so sánh theo tham chiếu không bao giờ khớp | §4.9 KT-5 | Đăng ký → mở gói 5 miễn phí → `/upgrade` → chọn một thẻ Đồng làm thẻ cần ép → nhìn lưới nguyên liệu: mỗi thẻ vừa mở xuất hiện 2 lần (lần kiểm 2026-11-14: 1 ô hợp lệ + 11 ô khoá = 12 ô, đúng ra 11), console có lỗi trùng key. Hướng sửa: lọc theo `pc.id` (tập id của `materials`) và thêm test cho lưới nguyên liệu |
| T4 | Đã có số | Chỉ số "≥ 50 tài khoản có ≥ 1 trận trong tháng đầu" (PRD §10) đọc được từ `GET /admin/onboarding?from=…&to=…` (khoảng 30 ngày): `completedUsers` = số tài khoản đăng ký trong khoảng đó đã **bắt đầu** ≥ 1 trận (`match_start`). Muốn "đá xong" thì đếm `matches.status = 'finished'` (review B3-08, 15/11) | §4.8 | Chỉ có ý nghĩa sau phát hành |
| T5 | Thấp | Tên test trong `apps/server/src/routes/google-auth.test.ts` bị hỏng mã hoá (UTF-8 bị đọc thành Latin-1 rồi lưu lại: "cÃ³ GOOGLE_CLIENT_ID â†’ …") từ commit 7.7; test vẫn chạy và xanh, chỉ khó đọc báo cáo test | Rà 8.4 | Mở file thấy ngay ở các dòng `describe`/`it`; sửa bằng cách chuyển ngược mã hoá các chuỗi tiếng Việt trong file |
| T6 | Thấp | Test cân bằng độ khó (AC-F1-7) không nằm trong `pnpm check` vì chậm (~3 phút) → đổi tham số sim/AI có thể làm lệch ngưỡng 60%/30% mà không ai biết | §4.2 | Chạy `pnpm --filter @pitch/sim test:slow` và `pnpm --filter @pitch/server balance` mỗi khi đổi `packages/sim` (AI, chỉ số, vật lý) và trước phát hành |
| T7 | Thấp | E2E chỉ chạy Chromium, chạy tay (`pnpm e2e`), chưa gắn CI; các tiêu chí giao diện AC-F5-8, AC-F6-1…3, AC-F10-1, AC-F11-1 mới kiểm tay một lần (§4.9), chưa có test hồi quy tự động trên giao diện | §3, §4.9 | Khi có CI: thêm bước `pnpm e2e`; cân nhắc chuyển kịch bản KT-1…KT-5 thành test Playwright cố định |
| T8 | Ghi nhận | SEC-07 **đã sửa** bằng replay log input ở server (ADR-0011); còn lại: bot/macro gửi input hợp lệ vẫn ăn thưởng tới trần 15 trận/ngày (nhiệm vụ `win_match`/`score_goals`/`clean_sheet` thêm tối đa ~150 xu/ngày, B3-03); SEC-08: rate limit lưu trong bộ nhớ một tiến trình, đăng ký không có CAPTCHA | §1.2 | Theo thiết kế MVP (PRD §11); xem lại khi chạy nhiều instance |
| T9 | Ghi nhận | `pnpm audit`: còn 6 moderate + 6 low (đa số ở công cụ dev/build; `fastify`/`fast-uri` ở runtime mức low/moderate) | §1.3 | Nâng phiên bản khi có bản vá; chạy lại `pnpm audit` trước phát hành |
| T10 | Ghi nhận | Hiệu năng: `getRetentionCohorts` quét toàn bộ `analytics_events` (ước chạm 500 ms ở ~1 triệu sự kiện); `index-*.js` 511 kB chưa lazy-load màn menu | §2.1, §2.3 | Đã có trong `docs/BACKLOG.md`; làm khi dữ liệu/bundle tới ngưỡng |
| T11 | Ghi nhận | Câu hỏi mở PRD §12 chưa chốt: phím điều khiển chi tiết, OVR/độ trễ AI (chờ playtest), hosting, chính sách quyền riêng tư khi thu analytics | PRD §12 | Phím/AI: lấy từ playtest §5 (Q4, Q6); hosting và quyền riêng tư: Giai đoạn 9 |
| T12 | ~~Thấp~~ **Xong (16/11)** | Trận có giật ngắn | §2.4 | Đo lại 16/11 bằng trace Chrome + `PerformanceObserver(longtask)`, vsync bình thường, 3 trận autopilot (có 2 bàn thắng + phát lại, chuyển cảnh, luân lưu): **giữa trận không còn khung đứng** — 1% thấp nhất 35–45 FPS, khung chậm nhất lúc chuyển cảnh 22–78 ms. Khung đứng 0,6–1 s ở các lần đo trước chỉ xuất hiện khi tắt vsync (`--disable-gpu-vsync`): GPU bị dồn việc, `Present` chặn tới 127 ms — không phải lỗi game. Còn lại: lúc vào trận có 2 tác vụ dài (170–500 ms rồi 70–200 ms, biên dịch shader lần đầu) trong lúc đếm ngược giao bóng; đã thử biên dịch trước model cầu thủ bằng `compileAsync` nhưng không giảm nên không giữ. Đã bỏ `PCFSoftShadowMap` (Three r18x đã bỏ, hết cảnh báo console) |
| T13 | Ghi nhận | Mở trận **vs máy** ở tab thứ hai huỷ trận đang đá ở tab đầu (một người chỉ có 1 trận đang đá, B3-02; PvP đá trực tiếp xử lý khác, xem §7.3): nộp kết quả trận cũ bị từ chối "Trận đã hết hạn", không có thưởng. Trong DB trận bị huỷ kiểu này và trận hết hạn thật cùng trạng thái `expired` | Review batch-1 T3 | Theo thiết kế; nếu cần phân biệt thì thêm trạng thái `superseded` |
| T14 | Ghi nhận | Migration `0003_analytics_user_name_idx.sql` dựng lại index `analytics_events` không `CONCURRENTLY` (trong transaction), khoá ghi bảng trong lúc dựng. Bảng hiện nhỏ nên an toàn | Review batch-1 T6 | Migration index tương lai trên bảng lớn: chạy lúc vắng hoặc tách ra `CREATE INDEX CONCURRENTLY` ngoài transaction |

---

## 7. PvP đá trực tiếp (`docs/specs/pvp-realtime/`)

_Trạng thái 2026-11-24: phần nền (sim hai đội, WebSocket, phiên có sim bóng, client `useNetMatch`) đã có test; ghép cặp, phòng, rớt mạng, thay người (US1–US4) và e2e hai trình duyệt đang làm nên chưa nằm trong số liệu dưới đây. Bước đo cuối và playtest là T045, T046 trong `tasks.md` — số đo ghi vào bảng 7.2 khi làm._

### 7.1 Kiểm thử đã có

Mọi test dưới nằm trong `pnpm check` (trừ khi ghi khác); chạy riêng bằng `pnpm --filter <package> exec vitest run <tên file>`.

| Phạm vi | File test | Kiểm điều gì |
|---|---|---|
| Sim | `packages/sim/src/hash.test.ts`, `golden-hash.json`, `match.pvp.test.ts` | Golden `stateHash` của trận một người giữ nguyên sau khi tách hai đội; `stepBoth` áp luật cho cả đội khách (SC-007) |
| Shared | `packages/shared/src/api/pvp.test.ts` | Schema Zod của mọi tin nhắn WS (client→server, server→client) |
| Server | `apps/server/src/routes/pvp.ws-auth.test.ts` | `Origin` thiếu/sai bị 403, chưa đăng nhập bị 401, **trước** upgrade (FR-020) |
| Server | `apps/server/src/routes/pvp.ws.test.ts` | Giới hạn WS: tin sai schema đóng 4400, `maxPayload` 512 byte, kết nối thứ 5 cùng IP bị từ chối, `bufferedAmount` > 256 KB đóng 4408; socket đóng thì xoá hàng chờ / đóng phòng; đăng xuất và xoá tài khoản đóng mọi WS PvP; quá `PVP_MAX_SESSIONS` thì `server_busy` |
| Server | `apps/server/src/services/pvp/session.test.ts` | Phiên lockstep với client giả: khung đúng thứ tự và quy ước tick, input giữ tới khi đổi, kết thúc ở `full_time` với tỉ số bằng `replayMatch`, 30 s chưa đủ `ready` thì `void_not_ready`, một socket giữ mỗi user (`busy`); `finishPvpMatch`: chạy hai lần chỉ thưởng một lần, ranked thưởng như máy Khó, dòng đội khách đảo tỉ số, xử thua 3-0 (0 xu nhưng tốn lượt), friendly 0 xu; bộ giữ nhịp |
| Server | `apps/server/src/services/matches.pvp-db.test.ts` | `countRewardedMatches` đếm `reward > 0` hoặc `consumes_daily_cap`; ràng buộc `pvp_matches` và `UNIQUE (pvp_match_id, user_id)` (cần Postgres test) |
| Web | `apps/web/src/features/pvp/netCore.test.ts` | Lõi client: bộ đệm jitter 3–6 khung, thứ tự/bỏ khung cũ/báo hụt, `stepBoth` đúng một lần mỗi khung, gửi `hash` mỗi 60 tick, `catchup` xếp hàng khung tới |
| Tất định | `e2e/determinism.spec.ts` (`pnpm e2e:determinism`, **không** nằm trong `pnpm check`) | Mã băm mỗi 60 tick giống nhau trên Chromium, Firefox, WebKit (SC-003) |
| Hiệu năng | `apps/server/scripts/perf-pvp-sim.ts` (`pnpm --filter @pitch/server bench:pvp-sim`) | p99 thời gian `stepBoth` (SC-009) |

Chưa có test (chờ US1–US4): ghép cặp và phòng (mã lỗi, mã phòng, hết hạn 10 phút, trùng cặp quá 3 trận), rớt mạng 30 s / 60 s cộng dồn, lệch mã băm lần một và lần hai, thay người qua WS, vào lại trận đã xong, thưởng đúng một lần khi vào lại/gửi lặp, `e2e/pvp.spec.ts`.

### 7.2 Tiêu chí thành công (spec §Tiêu chí thành công)

| Mã | Tiêu chí | Kết quả | Ghi chú |
|---|---|---|---|
| SC-001 | Từ lúc người thứ hai nhập mã tới lúc trận bắt đầu < 10 s | Chưa đo | T045 |
| SC-002 | RTT 100 ms: phím phản ứng ≤ 200 ms, không khựng | Chưa đo | T045; thiết kế dự kiến ~150 ms (RTT + bộ đệm tối thiểu 3 khung, research R2) |
| SC-003 | 100 trận tự động trên 3 nhóm trình duyệt: 0 lần lệch | Có `e2e:determinism`, chưa ghi số lần chạy đầy đủ | T006 đã tick; ghi kết quả khi chạy T045 |
| SC-004 | 100% trận kết thúc: hai màn cùng tỉ số, trùng tỉ số server | Chưa đo | Cần e2e hai context (T029) |
| SC-005 | Rời trận > 30 s luôn bị xử thua đúng FR-023 | Chưa đo | Chờ US3 |
| SC-006 | Không ai được thưởng hai lần cho một trận | Một phần: `UNIQUE (pvp_match_id, user_id)` + test `finishPvpMatch` chạy hai lần chỉ thưởng một lần | Hoàn tất khi có test gửi lặp/vào lại (US3) |
| SC-007 | Đá máy không đổi kết quả hay cảm giác | Đạt ở mức sim: golden hash một người giữ nguyên; `pnpm check` xanh | Kiểm tay cảm giác ở T045 |
| SC-008 | ≥ 3 người lần đầu tạo/vào phòng không cần hướng dẫn | Chưa làm | T046 |
| SC-009 | p99 `stepBoth` trong ngưỡng, tổng ≤ 40% một lõi ở số phiên tối đa | Đạt trên máy dev (20/11/2026): p99 0,0455–0,0506 ms, ước tính 131–146 phiên theo p99 so với `PVP_MAX_SESSIONS` = 50 (dư ~2,6 lần) | Máy i7-13620H, Node v26 (chưa có Node 24); chưa tính chi phí mạng/JSON; đo lại trên máy chủ thật sau deploy 9.2 |

### 7.3 Khác biệt với đá máy cần nhớ khi kiểm

- Một người có thể có **một** trận hoặc lượt chờ tại một thời điểm, nhưng mở tab thứ hai **không** huỷ trận ở tab đầu (khác trận vs máy, mục T13 ở §6): tab hai chỉ được `rejoin`, bị `busy` nếu tab một còn sống.
- Không có tạm dừng; mất focus gửi input rỗng. Nghỉ giữa hiệp cần cả hai bấm chuyền (không thì tự đá sau 30 s).
- Trận bị xử thua chỉ tính nhiệm vụ "chơi trận" / "thắng trận"; trận PvP không tính nhiệm vụ "đá trận máy Khó".
- Trận giao hữu: 0 xu, không tính 15 trận/ngày. Trận ghép ngẫu nhiên giữa cùng hai tài khoản quá 3 trận/ngày: không thưởng.
- Kiểm qua Internet thật cần server đã deploy (giai đoạn 9.2); trước đó chỉ thử được ở máy cục bộ/LAN và throttling DevTools.
