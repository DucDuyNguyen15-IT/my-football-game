# Giai đoạn 6 — Thẻ, đội hình (+ nền server & tài khoản cơ bản)

**Mục tiêu:** mở thẻ ở server → thẻ vào kho → xếp đội hình → đá trận bằng đội đó. Chỉ số thẻ ảnh hưởng trận.
**Hoàn thành giai đoạn khi** (ROADMAP): luồng mở → kho → đội hình → đá trận chạy được · test phân phối tỉ lệ rơi (10.000 hộp) khớp PRD.
**Tài liệu nền:** `docs/ARCHITECTURE.md` §3 (schema), §4 (API), §5 (luồng server); `docs/PRD.md` §6.
**Tiên quyết:** Postgres 16 (Docker Desktop hoặc bản cài). Lý do đưa tài khoản cơ bản vào đây: `docs/plans/README.md` mục "Điều chỉnh".

---

### 6.1a — Hạ tầng server: Postgres dev, env, plugin, đồng hồ `[ ]`
- **Phụ thuộc:** — · **Model:** default
- **Bối cảnh:** ADR-0004, ADR-0005; ARCHITECTURE §3.4 (đoạn "Thời gian nghiệp vụ"), §4.1–4.2, §8; `apps/server/src/app.ts`; `packages/shared/src/api/common.ts`.
- **Việc cần làm:**
  - `docker-compose.dev.yml` (postgres:16, volume, cổng 5432) + `.env.example` (`DATABASE_URL`, `DATABASE_URL_TEST`, `SESSION_SECRET`, `PORT`, `MATCH_MIN_DURATION_SEC`, `ENABLE_DEV_ROUTES`).
  - Cài `drizzle-orm`, `pg`, `drizzle-kit`; `src/config/env.ts` parse env bằng Zod.
  - `buildApp({ db?, clock? })`: `app.clock = { now(): Date }` (mặc định đồng hồ thật); `plugins/db.ts` (pool, `app.db`); `plugins/errors.ts` (Zod → 400 `validation_error`; `AppError(code, status)`; lỗi lạ → 500 `internal_error` không lộ chi tiết).
  - `test/helpers.ts`: tạo app với `DATABASE_URL_TEST` + `FakeClock` (`set`, `advance`), truncate giữa các file test.
  - `/api/v1/health` kiểm thêm kết nối DB.
- **Kiểm chứng:** route thử ném `AppError` trả đúng envelope `ApiError`; body sai → 400 có `details`; `FakeClock.advance` đổi `app.clock.now()`.
- **Xong khi:** server kết nối Postgres dev, lỗi theo chuẩn, có đồng hồ tiêm được.

### 6.1b — Schema DB & migration nền `[ ]`
- **Phụ thuộc:** 6.1a · **Model:** strongest
- **Bối cảnh:** ARCHITECTURE §3.1–3.4 (toàn bộ); `apps/server/src/plugins/db.ts`.
- **Việc cần làm:** `src/db/schema.ts`: **mọi bảng, enum, CHECK, UNIQUE, index** ở §3.2 (kể cả bảng dùng ở GĐ7, để có một migration nền); migration SQL tay cho trigger append-only của `coin_transactions`; script `db:generate`, `db:migrate`, `db:seed`, `db:reset` (dev), `admin:grant <username>`.
- **Kiểm chứng:** `pnpm --filter @pitch/server db:migrate` trên DB trống thành công; test: chèn `coins = -1` bị CHECK chặn; UPDATE/DELETE `coin_transactions` bị trigger chặn; `squad_slots` trùng `player_card_id` bị UNIQUE chặn; xoá `player_cards` đang trong `squad_slots` bị FK RESTRICT chặn.
- **Xong khi:** ARCHITECTURE §3 và `schema.ts` khớp (sửa tài liệu nếu phải đổi).
- **Rollback:** `db:reset` + revert commit.

### 6.2 — Dữ liệu thẻ hư cấu & luật dùng chung `[ ]`
- **Phụ thuộc:** 6.1b · **Model:** default
- **Bối cảnh:** PRD §6.1, §6.2 (công thức OVR), §6.4 (sơ đồ, −15%), §6.5 (bảng cộng chỉ số theo cấp); ARCHITECTURE §3.2 bảng `cards`, §3.3.
- **Việc cần làm:**
  - `packages/shared/src/domain.ts`: `computeOvr(position, stats)`, `FORMATIONS` (ô → nhóm vị trí cho 2-3-1, 3-2-1, 2-2-2), `MISPOSITION_PENALTY = 0.15`, `LEVEL_STAT_BONUS = [0, 1, 2, 3, 5, 7]` (tổng cộng ở mỗi cấp, PRD §6.5), `effectiveStats(card, level, slotRole)` (kẹp tối đa 99).
  - Script `apps/server/scripts/generate-cards.ts` (seed PRNG cố định): ~150 thẻ 60/45/30/15 theo độ hiếm, vị trí ~12/30/30/28%, tên ghép từ danh sách âm tiết theo "quốc tịch" hư cấu + biệt danh lối chơi, `avatar_seed`; ghi `src/db/seed/cards.json`. **Không** dùng tên cầu thủ thật hay tên nhại.
  - `db:seed` nạp `cards`; `services/cards.ts` cache danh mục theo độ hiếm khi khởi động; route `GET /cards` (contract `packages/shared/src/api/cards.ts`, có `ETag`).
- **Kiểm chứng:** test: đếm theo độ hiếm/vị trí; mọi OVR nằm trong khoảng của độ hiếm; `ovr` trong seed = `computeOvr`; tên không trùng; `effectiveStats` áp cấp + và −15% đúng, không vượt 99; response `GET /cards` parse được bằng schema. Người dùng xem nhanh 20 tên ngẫu nhiên để duyệt "quen tai".
- **Xong khi:** seed tất định, test xanh.

### 6.3a — Phiên đăng nhập & plugin xác thực `[ ]`
- **Phụ thuộc:** 6.1b · **Model:** strongest
- **Bối cảnh:** ADR-0004 (session cookie, argon2); ARCHITECTURE §3.2 `users`, `sessions`; §4.1 (cookie, Origin, Content-Type, body `{}`); §4.3 #3–5; §7.
- **Việc cần làm:** contract `api/auth.ts`, `api/me.ts`; cài `argon2`, `@fastify/cookie`; `plugins/auth.ts` (đọc cookie `sid`, tra `sessions` theo SHA-256 token, gắn `request.user`; `requireAuth`); kiểm `Origin` + `Content-Type: application/json` cho request đổi dữ liệu; `services/auth.ts` (`hashPassword`, `verifyPassword`, `createSession`, `destroySession`); `POST /auth/login`, `POST /auth/logout`, `GET /me`. (Tạo user tạm bằng helper test cho tới 6.3b.)
- **Kiểm chứng:** test: sai mật khẩu → 401 `invalid_credentials`; `/me` không cookie → 401; logout → cookie cũ hết dùng; request đổi dữ liệu thiếu JSON content-type hoặc sai Origin → bị từ chối; DB chỉ chứa hash token, mật khẩu dạng argon2id.
- **Xong khi:** đăng nhập/đăng xuất/me chạy với user tạo sẵn.

### 6.3b — Đăng ký + quà tân thủ `[ ]`
- **Phụ thuộc:** 6.2, 6.3a · **Model:** strongest
- **Bối cảnh:** ARCHITECTURE §3.2 `users`, `pack_boxes`, `player_cards`, `squads`/`squad_slots`; §3.4; §4.3 #2; PRD §7.1 (quà tân thủ) + tiêu chí F9; `apps/server/src/services/{auth,cards}.ts`.
- **Việc cần làm:** `POST /auth/register` trong **một transaction**: tạo user, hộp 100 phiếu theo config, 11 thẻ Đồng khởi đầu cố định (1 GK, 3 DF, 4 MF, 3 FW — danh sách `cardId` cố định trong config, chọn từ seed), đội hình 2-3-1 xếp sẵn 7 chính + 4 dự bị, `free_pack5_credits = 1`; đặt cookie phiên.
- **Kiểm chứng:** test integration: đăng ký → đúng 11 thẻ, hộp 58/30/10/2, 1 lượt miễn phí, đội hình hợp lệ; đăng ký trùng tên (khác hoa thường) → 409 `username_taken` và không tạo dữ liệu thừa; username/password sai định dạng → 400.
- **Xong khi:** tiêu chí PRD "tài khoản mới nhận đúng 11 thẻ + 1 gói 5, đúng một lần" có test.

### 6.4 — Domain gacha (thuần) `[ ]`
- **Phụ thuộc:** 6.1a (chỉ cần config) · **Song song với:** 6.1b–6.3b · **Model:** strongest
- **Bối cảnh:** PRD §6.3 + tiêu chí F5; ARCHITECTURE §5.1 (mục "drawTickets").
- **Việc cần làm:** `src/config/economy.ts` phần gói/hộp (`pack1` 100 xu ×1, `pack5` 450 xu ×5 có bảo đảm, hộp 2/10/30/58). `src/domain/gacha.ts`: `drawTickets(box, size, { guarantee }, rng)` trả về độ hiếm + hộp mới (tự làm mới khi hết, kể cả giữa gói 5); `nextOdds(box)`; `pickCard(cardsByRarity, rarity, rng)`. `rng` là tham số `(maxExclusive) => int`; `src/domain/rng.ts` export `cryptoRng` (bọc `crypto.randomInt`) cho production.
- **Kiểm chứng:**
  - Bốc hết 100 phiếu → đúng 2/10/30/58 (lặp nhiều hộp).
  - **10.000 hộp, chi-bình phương** tần suất độ hiếm theo từng vị trí bốc: dùng **PRNG có seed cố định** trong test (không flaky) và hiệu chỉnh Bonferroni (`p > 0,01 / 100`), cộng một kiểm định gộp `p > 0,01`.
  - Gói 5 không bao giờ ra 5 Đồng khi hộp còn Bạc+; hộp chỉ còn Đồng → không bảo đảm; làm mới giữa gói đúng.
  - `cryptoRng` gọi `crypto.randomInt` (spy).
- **Xong khi:** tiêu chí ROADMAP "test phân phối tỉ lệ rơi" xanh.

### 6.5 — API gói thẻ + ví + idempotency `[ ]`
- **Phụ thuộc:** 6.3b, 6.4 · **Model:** strongest
- **Bối cảnh:** ARCHITECTURE §3.4 (khoá), §4.3 #11–12, §5.1 (sơ đồ tuần tự — làm đúng từng bước), §8 (`ENABLE_DEV_ROUTES`); PRD §6.3 tiêu chí F5, §7.4; `apps/server/src/domain/{gacha,rng}.ts`, `src/services/cards.ts` (cache theo độ hiếm).
- **Việc cần làm:** contract `api/packs.ts`; `services/wallet.ts` `applyCoinDelta(tx, userId, amount, type, ref)` (yêu cầu đã khoá `users`, ghi `coin_transactions` với `balance_after`); `services/packs.ts` theo §5.1; `GET /packs`, `POST /packs/:code/open` (header `Idempotency-Key` uuid bắt buộc; cùng key khác body → 409); ghi `analytics_events` `pack_open`. Route dev `POST /dev/grant-coins` **chỉ đăng ký khi `ENABLE_DEV_ROUTES=1`**, đi qua `applyCoinDelta` với loại `admin_adjust`.
- **Kiểm chứng:** test integration: không đủ xu → 409, xu/hộp/kho không đổi; gửi lại cùng key → cùng kết quả, chỉ trừ xu một lần; **2 request song song** (khác key) khi chỉ đủ xu cho 1 → đúng 1 thành công, số dư ≥ 0; **2 request song song cùng key** → một kết quả; dùng `free_credit` → giá 0, credit − 1, không có dòng ledger; tổng ledger = `coins`; không đặt `ENABLE_DEV_ROUTES` → `/dev/grant-coins` 404.
- **Xong khi:** mọi tiêu chí F5 phía server có test.

### 6.6 — Web nền: router, API client, đăng nhập `[ ]`
- **Phụ thuộc:** 6.3b, **GĐ4 xong** · **Song song với:** 6.4–6.5 · **Model:** default
- **Bối cảnh:** ADR-0003; ARCHITECTURE §2.1 (cấu trúc web), §4.1; `docs/DESIGN.md` (tokens); `apps/web/src/api/client.ts`.
- **Việc cần làm:** cài `@tanstack/react-query` và `react-router` (nếu 5.9 chưa cài). `api/client.ts`: `apiFetch(path, schema, init)` — `credentials: 'include'`, request đổi dữ liệu luôn gửi JSON (tối thiểu `{}`), parse `{data}` bằng schema, ném `ApiClientError(code)` từ `ApiError`. Hook `useMe`. Màn đăng ký/đăng nhập, layout + menu (Đá với máy, Cửa hàng, Kho thẻ, Đội hình), chặn route khi chưa đăng nhập. Áp design tokens.
- **Kiểm chứng:** test client: response sai schema → lỗi rõ ràng; POST không body vẫn gửi `{}`; thủ công: đăng ký → vào menu, F5 vẫn đăng nhập, đăng xuất về màn đăng nhập.
- **Xong khi:** người chơi đăng ký/đăng nhập được trên web.

### 6.7 — Cửa hàng, màn mở thẻ, component thẻ `[ ]`
- **Phụ thuộc:** 6.5, 6.6 · **Model:** default
- **Bối cảnh:** `docs/DESIGN.md` (màn mở thẻ — prototype đã duyệt ở GĐ4, màu độ hiếm, ảnh đại diện); ARCHITECTURE §4.3 #6, #11–12; PRD §6.1 (thẻ gồm gì), §6.3 (UI hiển thị phiếu còn lại, tỉ lệ kế tiếp, cảnh báo hộp chỉ còn Đồng).
- **Việc cần làm:** `<CardView>` dùng chung (tên, biệt danh, vị trí, OVR, chỉ số, cấp +, ảnh đại diện sinh từ `avatar_seed`, màu theo độ hiếm) — 6.8 và 6.10 tái dùng. Màn Cửa hàng: số phiếu còn theo độ hiếm, tỉ lệ lần bốc kế, nút gói 1/gói 5, lượt miễn phí. Mỗi lần bấm sinh `crypto.randomUUID()` làm Idempotency-Key, **giữ nguyên khi retry**; khoá nút trong khi chờ. Animation lật thẻ theo độ hiếm. Sau khi mở: invalidate `me`, `packs`, `player-cards` — không tải lại trang.
- **Kiểm chứng:** thủ công: double-click chỉ mở 1 lần; số phiếu và xu cập nhật ngay; không đủ xu → thông báo rõ. Test component: hiển thị tỉ lệ; `<CardView>` cùng `avatar_seed` → cùng ảnh.
- **Xong khi:** tiêu chí F5 phía UI đạt.

### 6.8 — Kho thẻ + bán thẻ `[ ]`
- **Phụ thuộc:** 6.5, 6.7 · **Model:** default
- **Bối cảnh:** ARCHITECTURE §3.4, §4.3 #7–8; PRD §6.6 + tiêu chí F11; US-05; `apps/server/src/services/wallet.ts`; `apps/web/src/.../CardView.tsx`.
- **Việc cần làm:** contract `api/player-cards.ts`; `GET /player-cards` (lọc vị trí/độ hiếm, sắp xếp, cờ `inSquad`, `effectiveStats`); `POST /player-cards/sell` (1–50 thẻ, tất cả-hoặc-không, khoá `users` rồi `player_cards` theo id tăng dần, từ chối thẻ trong đội hình `card_in_squad`, cộng xu theo config + ledger `card_sale`). UI: lưới `<CardView>`, bộ lọc, chọn nhiều để bán, hộp xác nhận khi có Vàng+ hoặc thẻ đã +.
- **Kiểm chứng:** test: bán thẻ người khác → 404; bán thẻ trong đội hình → 409 và không thẻ nào bị bán; **2 request bán cùng một thẻ song song → xu chỉ cộng một lần**, request kia 404; ledger + số dư khớp.
- **Xong khi:** tiêu chí F11 có test.

### 6.9 — API đội hình `[ ]`
- **Phụ thuộc:** 6.3b · **Song song với:** 6.4–6.8 · **Model:** default
- **Bối cảnh:** PRD §6.4 + tiêu chí F6; ARCHITECTURE §3.2 `squads`/`squad_slots`, §3.4 (thứ tự khoá), §4.3 #13–14; `packages/shared/src/domain.ts` (`FORMATIONS`, `effectiveStats`).
- **Việc cần làm:** contract `api/squad.ts`; `GET /squad`, `PUT /squad` (một transaction, **khoá `users` trước**: kiểm sở hữu, mỗi thẻ một ô, ≤ 5 dự bị, slot hợp lệ với sơ đồ; xoá-chèn lại `squad_slots`); trả `teamRating` (TB OVR hiệu lực 7 người) + `warnings` (sai vị trí, thiếu GK, thiếu người). `validateSquad` & `teamRating` đặt ở `shared` để web tính ngay khi kéo-thả.
- **Kiểm chứng:** test: thẻ người khác → 404; trùng thẻ → 422 `invalid_squad`; sai vị trí → cảnh báo + rating giảm 15% cho người đó; lưu xong đăng nhập lại vẫn còn; **lưu đội hình và bán chính thẻ đó song song** → không deadlock/500, kết quả nhất quán.
- **Xong khi:** tiêu chí F6 phía server có test.

### 6.10 — Màn đội hình (kéo-thả) `[ ]`
- **Phụ thuộc:** 6.8, 6.9 · **Model:** default
- **Bối cảnh:** `docs/DESIGN.md` (màn đội hình); PRD §6.4 tiêu chí F6; `packages/shared/src/domain.ts` (`validateSquad`, `teamRating`).
- **Việc cần làm:** cài `@dnd-kit/core`; sân với ô theo sơ đồ + hàng dự bị + kho bên cạnh; kéo-thả/đổi chỗ; đổi sơ đồ giữ thẻ còn hợp lệ, thẻ thừa về dự bị/kho; cảnh báo đỏ sai vị trí; rating đội cập nhật tức thì; lưu bằng `PUT /squad`.
- **Kiểm chứng:** test hàm chuyển sơ đồ; thủ công theo tiêu chí F6.
- **Xong khi:** tiêu chí F6 phía UI đạt.

### 6.11 — Đá trận bằng đội của mình `[ ]`
- **Phụ thuộc:** 6.10, **5.13** · **Model:** strongest
- **Bối cảnh:** ARCHITECTURE §3.2 `matches`, §4.3 #15, §5.2 bước 1–2; `packages/shared/src/match.ts` (`MatchTeamSetup`); `packages/sim/src/fixtures/` (đội máy mẫu OVR 60/78 ở 5.1); PRD §5 (OVR đội máy ~60/~78).
- **Việc cần làm:** contract `api/matches.ts` (phần start). `POST /matches { difficulty }`: khoá `users`; kiểm đội hình đủ (`invalid_squad` nêu rõ thiếu gì); dựng `home` từ đội hình (chỉ số hiệu lực); sinh `away` từ `cards` theo OVR mục tiêu của độ khó (`cryptoRng`); sinh `seed` và **match token** (32 byte, lưu `token_hash` — cột NOT NULL); lưu `matches` (`status = started`, `squad_snapshot`, `reward_eligible = false` tạm). Kiểm tra token + thưởng làm ở 7.2. Web: "Đá với máy" → gọi API → truyền `home/away/seed` vào sim thay cho `demoTeams`, giữ token để nộp ở 7.2.
- **Kiểm chứng:** test: đội thiếu GK → 422; chỉ số trong response = công thức shared; OVR TB đội máy ±3 so với mục tiêu; chạy lại `pnpm --filter @pitch/sim balance` với **11 thẻ khởi đầu thật + bộ sinh đội máy thật**, ghi kết quả vào PROGRESS (chỉnh lại nếu lệch ngưỡng PRD). Thủ công: thẻ Tốc độ cao chạy nhanh rõ trên sân.
- **Xong khi:** đạt tiêu chí ROADMAP GĐ6 "mở → kho → đội hình → đá trận".

### 6.12a — Ép thẻ phía server (F10, Should) `[ ]`
- **Phụ thuộc:** 6.5, 6.8 · **Model:** strongest
- **Bối cảnh:** PRD §6.5 + tiêu chí F10; ARCHITECTURE §3.2 `card_upgrades`, §3.4, §4.3 #9–10, §5.3; `apps/server/src/services/{wallet,packs}.ts` (khuôn transaction + idempotency), `src/domain/rng.ts`; `packages/shared/src/domain.ts` (`LEVEL_STAT_BONUS`).
- **Việc cần làm:** config bảng ép (tỉ lệ cơ bản, phí × hệ số độ hiếm); `domain/upgrade.ts` thuần (`rate = base + luck`, kẹp 100); `GET /config/economy`; `POST /player-cards/:id/upgrade` (Idempotency-Key) theo §5.3, lưu `result` để trả lại khi lặp.
- **Kiểm chứng:** test: 10.000 lần ép mỗi cấp (luck 0, PRNG seed cố định) lệch ≤ ±1,5 điểm %; 3 lần trượt ở +5 → lần 4 tỉ lệ 55%; không ép thẻ +5 → 422 `max_level`; nguyên liệu thấp độ hiếm hơn → 422 `invalid_material`; nguyên liệu trong đội hình → 409; thiếu xu → 409 và không gì thay đổi; **cùng key gửi lại → cùng kết quả, trừ phí một lần; cùng key khác nguyên liệu → 409**; **2 lần ép song song dùng cùng nguyên liệu → đúng 1 thành công**; ledger khớp.
- **Xong khi:** tiêu chí F10 phía server có test.

### 6.12b — Màn ép thẻ (F10, Should) `[ ]`
- **Phụ thuộc:** 6.12a, 6.7 · **Model:** default
- **Bối cảnh:** `docs/DESIGN.md`; PRD §6.5 tiêu chí F10 (UI); ARCHITECTURE §4.3 #9–10.
- **Việc cần làm:** chọn thẻ + nguyên liệu (lọc nguyên liệu hợp lệ), hiển thị tỉ lệ = cơ bản + may mắn, phí, chỉ số sau ép, cảnh báo mất nguyên liệu (kể cả nguyên liệu đã +); Idempotency-Key như 6.7; hiệu ứng thành công/thất bại.
- **Kiểm chứng:** test component tính "chỉ số sau ép"; thủ công theo tiêu chí F10.
- **Xong khi:** tiêu chí F10 đạt. Cuối GĐ6: tick ROADMAP, cập nhật CLAUDE.md, PROGRESS.
