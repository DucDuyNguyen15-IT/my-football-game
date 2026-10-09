# Giai đoạn 7 — Tài khoản, kinh tế

**Mục tiêu:** vòng lặp kiếm xu ↔ mở thẻ an toàn, dữ liệu bền trên server, đo được retention.
**Hoàn thành giai đoạn khi** (ROADMAP): đăng xuất/đăng nhập lại vẫn giữ thẻ và tiền · không thể tự cộng tiền/thẻ bằng cách sửa request (đã thử).
**Tài liệu nền:** `docs/ARCHITECTURE.md` §3–5, §7; `docs/PRD.md` §7, §8.
**Ngoài phạm vi:** PvP (bất đồng bộ và realtime) — sau MVP, xem `docs/BACKLOG.md`.
**Thời gian trong test:** dùng `FakeClock` (`apps/server/test/helpers.ts`, task 6.1a); code nghiệp vụ lấy giờ từ `app.clock.now()`, không dùng `now()` của SQL.

---

### 7.1 — Gia cố đăng nhập & giới hạn tần suất `[ ]`
- **Phụ thuộc:** 6.3b · **Model:** strongest
- **Bối cảnh:** PRD §8 tiêu chí F8; ARCHITECTURE §3.2 `users` (cột `failed_login_*`, `locked_until`), `sessions`; §4.1 (rate limit); §7; `apps/server/src/plugins/auth.ts`, `src/services/auth.ts`.
- **Việc cần làm:** khoá đăng nhập 15' sau 5 lần sai trong 15' (429 `login_locked` + `Retry-After`); cài `@fastify/rate-limit` (100/phút/người, `/auth/*` 10/phút/IP); xoay token khi đăng nhập; hạn phiên 30 ngày gia hạn trượt; dọn phiên hết hạn; cookie `Secure` khi production.
- **Kiểm chứng:** test: 5 lần sai → lần 6 bị khoá kể cả đúng mật khẩu; `clock.advance(15')` → đăng nhập được; vượt rate limit → 429; đăng xuất → cookie cũ không dùng được; **đăng xuất rồi đăng nhập lại → thẻ, xu, đội hình giữ nguyên**.
- **Xong khi:** tiêu chí F8 + tiêu chí ROADMAP GĐ7 thứ nhất có test.

### 7.2 — Kiểm tra kết quả trận & thưởng `[ ]`
- **Phụ thuộc:** 6.11 · **Model:** strongest
- **Bối cảnh:** PRD §7.1 (bảng thưởng, luân lưu, 15 trận/ngày), §7 tiêu chí (match token); ARCHITECTURE §3.2 `matches`, §4.3 #15–16, §5.2; `packages/shared/src/match.ts` (kiểu kết quả trận + `shootout`, từ 5.12); `apps/server/src/services/{wallet,matches}.ts`.
- **Việc cần làm:** config thưởng + trần; `domain/rewards.ts` (gồm thắng/thua luân lưu); `POST /matches` tính `reward_eligible`; `POST /matches/:id/result` theo §5.2 bước 3: token đúng & chưa dùng, ≥ `MATCH_MIN_DURATION_SEC`, tỉ số ≤ 20, `shootout` chỉ khi hoà, `reward_day` = ngày GMT+7 lúc nộp; **nộp lại cùng token cho trận đã xong → trả kết quả cũ**; response `missions: []` (7.4 điền). Web: nộp kết quả cuối trận (retry giữ token), màn kết quả hiển thị xu nhận; cảnh báo trước khi vào trận nếu đã hết 15 trận có thưởng.
- **Kiểm chứng:** test mỗi điều kiện từ chối (token sai, < 6', tỉ số 21, shootout khi không hoà, trận của người khác → 404); gửi lại cùng token → cùng kết quả, xu cộng một lần; trận 16 trong ngày → thưởng 0; nộp lúc 23:59 và 00:01 GMT+7 tính hai ngày khác nhau; ledger `match_reward` đúng.
- **Xong khi:** tiêu chí "Thưởng trận chỉ được cấp khi…" có test.

### 7.3 — Toàn vẹn sổ cái & thử sửa request `[ ]`
- **Phụ thuộc:** 7.2 (và 6.12a nếu đã làm) · **Model:** strongest
- **Bối cảnh:** PRD §7.4 + tiêu chí F7, §8 tiêu chí "mọi API thay đổi dữ liệu đều yêu cầu đăng nhập"; ARCHITECTURE §3.4, §7; ROADMAP GĐ7 "đã thử sửa request"; `apps/server/src/app.ts`, `src/services/*`.
- **Việc cần làm:**
  - Test đối soát: chuỗi ngẫu nhiên (mở gói, bán, ép nếu có, thưởng) cho nhiều user → `coins = SUM(amount)` cho mọi user.
  - Test đồng thời hỗn hợp (mở gói + bán + ép + lưu đội hình song song) → không âm, không deadlock/500.
  - Script `pnpm --filter @pitch/server ledger:check` báo user lệch.
  - Test liệt kê **mọi route ghi** (`POST/PUT/PATCH/DELETE`) từ `app.printRoutes()` → gọi không cookie phải 401 (danh sách ngoại lệ: `/auth/register`, `/auth/login`).
  - Bộ test "tamper": gửi thêm field `price`, `coins`, `rarity`, `userId` khác, `playerCardId` của người khác, tỉ số 99 → bị bỏ qua hoặc từ chối, không có lợi.
- **Kiểm chứng:** các test trên xanh; `ledger:check` trên DB dev = 0 lệch.
- **Xong khi:** tiêu chí ROADMAP GĐ7 thứ hai có bằng chứng (test + ghi chú PROGRESS).

### 7.4 — Nhiệm vụ ngày (F12, Should) `[ ]`
- **Phụ thuộc:** 7.2 · **Model:** default
- **Bối cảnh:** PRD §7.1 (nhiệm vụ), tiêu chí F12; ARCHITECTURE §3.2 `daily_missions`, §4.3 #16–18, §5.1 & §5.2 (transaction cần chèn cập nhật tiến độ); `apps/server/src/services/{packs,matches}.ts`.
- **Việc cần làm:** config danh sách nhiệm vụ (thắng 1 trận, ghi 3 bàn, mở 1 gói, đá 1 trận Khó, …); `domain/missions.ts` chọn 3 nhiệm vụ/ngày/người (tất định theo user + ngày); `services/missions.ts` `ensureTodayMissions(tx, userId, day)` — gọi từ **cả** đường cập nhật tiến độ lẫn `GET`; cập nhật tiến độ trong transaction của `match result` và `pack open`; điền `missions` trong response #16; `GET /missions/today`, `POST /missions/:code/claim` (một lần, ledger `mission_reward`). UI: bảng nhiệm vụ ở menu.
- **Kiểm chứng:** test: đá trận **trước khi** mở màn nhiệm vụ vẫn tính tiến độ; tiến độ tăng đúng sự kiện; nhận 2 lần → lần 2 bị từ chối; chưa xong → không nhận được; reset 00:00 GMT+7 (`FakeClock`).
- **Xong khi:** tiêu chí F12 có test.

### 7.5 — Analytics & retention (F13, Should) `[ ]`
- **Phụ thuộc:** 7.4, 6.12a (nếu đã làm) · **Model:** default
- **Bối cảnh:** PRD §8 (danh sách sự kiện), §10; ARCHITECTURE §3.2 `analytics_events`, §4.3 #19; `apps/server/src/services/*` (nơi gắn `track`), `src/plugins/auth.ts`.
- **Việc cần làm:** `services/analytics.ts` `track(tx, userId, name, props)` gọi trong transaction của từng nghiệp vụ (`register`, `login`, `match_start`, `match_end`, `pack_open`, `upgrade`, `mission_claim`); `session_seen` ghi trong `plugins/auth.ts` tối đa 1 lần/ngày GMT+7/người; "quay lại ngày N" = có ≥ 1 sự kiện bất kỳ vào ngày N (PRD §8); truy vấn D1/D7 theo nhóm ngày đăng ký; `GET /admin/retention` (chỉ `is_admin`); trang admin tối giản.
- **Kiểm chứng:** test: dữ liệu giả 3 nhóm ngày → D1/D7 đúng; người chơi vẫn còn cookie (không có sự kiện `login`) quay lại ngày 7 vẫn được tính; người không phải admin → 403.
- **Xong khi:** tiêu chí F13 có test.

### 7.6 — Onboarding & hướng dẫn trận đầu (F9 luồng, F14 Could) `[ ]`
- **Phụ thuộc:** 7.5, 6.7 · **Model:** default
- **Bối cảnh:** PRD §9 (luồng người chơi, mục tiêu ≤ 2 phút tới trận đầu), F14; `docs/DESIGN.md`.
- **Việc cần làm:** sau đăng ký dẫn thẳng: mở gói miễn phí → xem đội hình xếp sẵn → "Đá với máy – Dễ". Lớp hướng dẫn phím ở trận đầu (bỏ qua được, nhớ đã xem trong localStorage). Đo `register → match_start` bằng analytics.
- **Kiểm chứng:** thủ công: tài khoản mới vào trận đầu < 2 phút; truy vấn analytics ra thời gian trung vị.
- **Xong khi:** luồng §9 chạy trơn. Cuối GĐ7: tick ROADMAP, cập nhật CLAUDE.md, PROGRESS.
