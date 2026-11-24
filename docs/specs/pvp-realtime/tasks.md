# Tasks: Đá trực tiếp (PvP thời gian thực)

**Input:** [spec.md](spec.md), [plan.md](plan.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Test:** có viết test. Repo bắt buộc `pnpm check` xanh, và quickstart đã định nghĩa các kịch bản tự động.

**Ký hiệu:**
- `[P]`: chạy song song được (file khác nhau, không phụ thuộc việc chưa xong).
- `[USn]`: thuộc câu chuyện n trong spec.

**Quy tắc chung:**
- Mỗi giai đoạn xong thì chạy `pnpm check`, commit và push (CLAUDE.md).
- Commit không có dòng `Co-Authored-By`.
- Mọi chuỗi giao diện mới đều có tiếng Việt và tiếng Anh (FR-018).

---

## Phase 1: Setup

- [x] T001 Tạo nhánh `feat/pvp-realtime` từ `main`. Trong `CLAUDE.md`: đánh dấu PvP là việc đang làm ở mục "Trạng thái hiện tại", sửa dòng "Phân vai agent" từ Fable sang Sonnet (theo quyết định không dùng Fable). Thêm mục PvP realtime vào `docs/ROADMAP.md`.
- [x] T002 [P] Viết `docs/adr/0012-pvp-lockstep.md` theo `docs/adr/template.md`. Nội dung:
  - thay phần "Colyseus cho PvP realtime" của ADR-0006 bằng lockstep do server giữ nhịp, có **sim bóng trên server**, server không gửi state xuống client (research.md R1, R11);
  - cập nhật `docs/adr/README.md` và dòng Realtime trong `CLAUDE.md`.
- [x] T003 [P] Thêm dependency `@fastify/websocket` vào `apps/server/package.json` (`pnpm --filter @pitch/server add @fastify/websocket`).
- [x] T004 [P] Thêm `ws: true` vào proxy `/api` trong `apps/web/vite.config.ts`. Thêm `wss:` vào `connect-src` của CSP trong `deploy/Caddyfile`.

---

## Phase 2: Foundational (chặn mọi câu chuyện)

### 2a. Tất định và chi phí (P0, làm đầu tiên)

- [x] T005 Chuyển hàm băm FNV-1a 32-bit từ `packages/sim/src/replay.test.ts:87-90` thành `stateHash(state): number` ở `packages/sim/src/hash.ts`, export qua `packages/sim/src/index.ts`. Sửa test cũ để dùng hàm mới.
  - `stateHash` băm **phép chiếu** cố định: tick, tỉ số, phase, bóng (pos/vel), từng cầu thủ (id, pos, vel) theo thứ tự id. Không băm JSON cả state, nên đổi field sang `Record<TeamSide,…>` (T008) không đổi hash (A7).
  - **Ghi golden hash trước mọi refactor (trước T008):** chạy `stateHash` trên code HIỆN TẠI (một người chơi, vài seed, mốc tick 60/600/cuối trận), lưu vào `packages/sim/src/golden-hash.json`. Commit riêng, trước T008.
- [x] T006 Tạo `e2e/determinism.spec.ts` và script `pnpm e2e:determinism`:
  - dùng project Playwright cho chromium, firefox, webkit;
  - nạp bundle sim (build bằng esbuild có sẵn qua vite/tsup) vào trang trắng;
  - chạy **100 seed × một trận đầy đủ** với autopilot cộng chuỗi input giả ngẫu nhiên có seed;
  - so `stateHash` mỗi 60 tick giữa ba engine và với Node (SC-003).

  **Nếu lệch: dừng lại, tìm tick đầu tiên lệch, sửa sim trước khi làm tiếp.**
- [x] T007 [P] Tạo `apps/server/scripts/perf-pvp-sim.ts`: đo trung bình và p99 của `step` qua một trận đầy đủ trên Node 24, in ra số phiên tối đa ước tính trên 1 lõi. Ngưỡng dùng **p99** (không dùng trung bình): sim bóng của server tốn ≤ 40% một lõi ở `PVP_MAX_SESSIONS` (A4). Ghi kết quả vào `docs/QA-REPORT.md` và chọn `PVP_MAX_SESSIONS` mặc định (research.md R11).

### 2b. Sim cho hai đội người (P1), theo contracts/sim-api.md

- [x] T008 Trong `packages/sim/src/types.ts`:
  - thêm `MatchSetup.humans?: TeamSide[]` (mặc định `['home']`) và kiểu `TeamInputs = Record<TeamSide, PlayerInput>`;
  - chuyển `controlledId`, `shotChargeTicks`, `passCharge`, `input`, `actionDeadline`, `passReceiver` thành `Record<TeamSide, …>`;
  - golden hash của T005 (`golden-hash.json`) phải giữ nguyên sau refactor, vì `stateHash` băm phép chiếu chứ không băm JSON (A7, research.md R9). Lệch thì dừng và báo.
- [x] T009 Trong `packages/sim/src/match.ts`:
  - thay hằng `HUMAN_TEAM` (dòng 154, khoảng 20 chỗ dùng) bằng `isHuman(state, team)`;
  - thêm `stepBoth(state, inputs)`; `step(state, input)` gọi `stepBoth` với away là `NO_INPUT`;
  - sửa `aiProfile` (khoảng dòng 559, đội người dùng `teammate`), `runTeamAi` (622, gán `controlledId` theo đội), `nextDeadline` (665-694, chạy cho mọi đội người), nghỉ giữa hiệp (723, một trong hai đội người bấm chuyền), tự thay người (732, chỉ cho đội máy);
  - autopilot (716) điều khiển **mọi** đội người khi bật, dùng cho e2e;
  - phủ thêm (A9): `stepShootout` (match.ts:854, mỗi đội người tự chọn người sút/thủ môn), `humanRestart` (match.ts:927, theo đội đang được hưởng), `nearestHuman` (match.ts:200, tính theo đội, không mặc định home).
- [x] T010 Trong `packages/sim/src/rules/substitution.ts` (A10): tách phần kiểm tra của `substitute` thành hai hàm, giữ nguyên hành vi của `substitute`:
  - `checkSubStructure(state, team, out, bench)`: cầu thủ đang trên sân, slot dự bị hợp lệ, còn lượt thay, chưa bị đuổi; sai thì trả lý do để server gửi `sub_rejected` ngay;
  - `canSubstituteNow(state)`: kiểm thời điểm (bóng chết); không phải lỗi, chỉ quyết định áp ngay hay xếp lệnh chờ.
- [x] T011 Trong `packages/sim/src/replay.ts`:
  - export `encodeInput`/`decodeInput`;
  - thêm `InputRecorder2` (ghi cặp mã home/away, `subs` có `team`) và định dạng v2 có **tiền tố chuỗi `v2.`** (v1 không có tiền tố, bắt đầu bằng varint nên không dùng "byte phiên bản") (A8);
  - `MAX_SUBS=3` (replay.ts:221) đổi thành **mỗi đội** 3 (A8);
  - `replayMatch` đọc được cả v1 lẫn v2, phân biệt bằng tiền tố `v2.`;
  - thêm `replayToState(setup, encoded): MatchState` (chạy hết log, trả state) để client dựng lại khi vào lại, vì `ReplayResult` (`replay.ts:236`) không có state.
- [x] T012 [P] Test trong `packages/sim/src/match.pvp.test.ts`:
  - golden hash của T005 (`golden-hash.json`) giữ nguyên sau refactor, và quỹ đạo `step` một người chơi không đổi (A7);
  - `stepBoth` với hai đội người chạy hết trận;
  - luân phiên đá luân lưu với **hai người chơi** (`stepShootout`), `humanRestart` đúng đội được hưởng, `nearestHuman` theo đội (A9);
  - autopilot hai đội;
  - đội khách chịu hạn 15 s đá phạt, 10 s thủ môn ôm bóng, thủ môn tối đa thẻ vàng;
  - nghỉ giữa hiệp kết thúc khi đội khách bấm;
  - `checkSubStructure` đúng cho cả hai đội (cầu thủ không trên sân, slot sai, hết lượt, đã bị đuổi đều bị từ chối) và `MAX_SUBS=3` tính riêng mỗi đội (A8, A10).
- [x] T013 [P] Test trong `packages/sim/src/replay.v2.test.ts`: `replayMatch(v2)` khớp với chạy trực tiếp `stepBoth` (có thay người cho cả hai đội); nhật ký v1 cũ (không tiền tố) vẫn ra cùng kết quả, nhật ký `v2.` được nhận ra đúng (A8); `stateHash(replayToState(...))` khớp với chạy trực tiếp.

### 2c. Hạ tầng server/web dùng chung

- [x] T014 [P] Tạo `packages/shared/src/api/pvp.ts`: schema zod cho mọi tin nhắn trong contracts/ws-protocol.md (client→server và server→client). Ràng buộc:
  - `code` gồm đúng 6 ký tự thuộc `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`;
  - `c` là số nguyên trong `0..(2^9*9-1)`;
  - `tick` của `hash` là bội số của 60; `h` là uint32;
  - `rewardReason` ∈ `friendly|forfeit|daily_cap|same_opponent_limit|void`;
  - mã lỗi gồm cả `busy` (A1) và `not_in_match` (A2);
  - `start` mang `countdownMs` (tương đối, 3000), **không có** `startAt` theo đồng hồ server (A16).

  Export qua index của shared.
- [x] T015 Trong `apps/server/src/db/schema.ts` + `drizzle-kit generate` → `apps/server/drizzle/0008_pvp.sql` (A5):
  - bảng `pvp_matches` theo data-model.md §1: enum `pvp_kind` (`ranked`,`friendly`), `pvp_status` (`live`,`finished`,`cancelled`), `pvp_end_reason` (`full_time`,`forfeit_disconnect`,`forfeit_desync`,`void_desync`,`void_both_left`,`void_not_ready`,`server_restart`); CHECK `home_user_id <> away_user_id`; CHECK goals 0..20;
  - thêm vào `matches` các cột `mode` (enum `match_mode`, mặc định `cpu`), `pvp_match_id`, `opponent_user_id`, `consumes_daily_cap` (mặc định false), UNIQUE `(pvp_match_id, user_id)`;
  - đổi điều kiện index `matches_user_reward_day_idx` thành `reward > 0 OR consumes_daily_cap`.
- [x] T016 Thêm `mode: 'cpu' | 'pvp'` vào `MissionEvent` `match_finished` (`apps/server/src/domain/missions.ts:11`). `match_hard` chỉ đếm khi `mode === 'cpu'` (research R13). Sửa nơi gọi hiện có trong `submitMatchResult` để truyền `mode: 'cpu'`. Thêm test trong `missions.test.ts`.
- [x] T016b Sửa `countRewardedMatches` trong `apps/server/src/services/matches.ts:42` để đếm `reward > 0 OR consumes_daily_cap`. Thêm 6 sự kiện `pvp_matched`, `pvp_start`, `pvp_end`, `pvp_disconnect`, `pvp_forfeit`, `pvp_desync` vào `AnalyticsEventName` trong `apps/server/src/services/analytics.ts`. Test hồi quy: trận đấu máy vẫn đếm như cũ.
- [x] T017 Tạo `apps/server/src/routes/pvp.ts` và đăng ký trong `apps/server/src/app.ts`:
  - endpoint WS `GET /api/v1/pvp/ws`;
  - `preValidation` xác thực `sid` bằng logic của `plugins/auth.ts` `requireAuth`; header `Origin` **bắt buộc**, thiếu hoặc sai (khác `Host`) → 403 (A18);
  - tối đa 4 kết nối WS đồng thời theo IP, quá thì từ chối (A18);
  - một user chỉ có một socket "đang giữ" trận; socket mới mở khi socket cũ còn sống thì **không đóng socket cũ**: socket mới chỉ được `rejoin`, nếu phía đó trong phiên còn socket sống thì trả `error busy`; `queue_join`/`room_*` từ socket thứ hai khi user đã có mục chờ/phòng/phiên cũng trả `busy` (A1);
  - `maxPayload` 512 byte (client→server), tắt `perMessageDeflate`; giới hạn 120 tin/s; parse bằng zod, sai thì gửi `error bad_message` và đóng với mã 4400; nếu `socket.bufferedAmount` > 256 KB thì đóng mã 4408 và xử như rớt mạng (A11);
  - socket đóng → xoá mục hàng chờ của user; chủ phòng đang `waiting` rời hoặc đóng socket → đóng phòng (`closed`) (A15);
  - đăng xuất hoặc xoá tài khoản (thu hồi session) → đóng mọi WS PvP của user (A18);
  - quá `PVP_MAX_SESSIONS` thì trả `server_busy`;
  - heartbeat: ping mỗi 2 s, quá 5 s không có pong thì báo cho session là rớt mạng (research R12).
- [x] T018 Tạo `apps/server/src/services/pvp/session.ts` (`PvpSession`, xem data-model.md §3):
  - bộ giữ nhịp: MỘT vòng lặp chung cho mọi phiên, dùng `performance.now()`, tick tính theo mốc tuyệt đối (`tick_n = t0 + n·1000/60`, không cộng dồn sai số); trễ thì chạy bù tối đa 5 tick/lượt, trễ hơn nữa thì bỏ nhịp và ghi analytics; phiên mới vào vòng ở tick kế tiếp. `Clock` giả lập được trong test (A4);
  - đếm ngược 3 s sau khi cả hai `ready`: gửi `start {countdownMs: 3000}` (tương đối, không gửi `startAt`) (A16), ghi sự kiện `pvp_start`; quá 30 s sau `matched` chưa đủ hai `ready` thì `finish('void_not_ready')`;
  - mỗi tick: lấy input mới nhất của mỗi đội (chưa có input mới thì giữ cũ), chạy `stepBoth` trên **sim bóng** `state`, ghi `InputRecorder2`, phát `f [tick, home, away, subs?]`;
  - ở tick bội số của 60 thì lưu `stateHash` vào `serverHashes`;
  - khi `state.phase === 'full_time'` thì gọi `finish('full_time')`.
- [x] T019 Tạo `apps/server/src/services/pvp/finish.ts`, chạy cho **mọi** cách kết thúc:
  - lấy tỉ số từ sim bóng (hoặc tỉ số xử thua);
  - trong một transaction: cập nhật `pvp_matches` (lưu `input_log`, `end_reason`), tạo đủ hai dòng `matches` (`mode`, `opponent_user_id`, `difficulty='hard'`, `reward_day = gameDay(finished_at)` cho cả hai dòng kể cả người bị xử thua; điền các cột NOT NULL: `seed` (= seed pvp), `squad_snapshot` (góc nhìn người đó, đội mình là home), `started_at`; dòng của người đá đội khách thì đảo `home_goals/away_goals` và kết quả luân lưu sang góc nhìn của họ trước khi tính `outcome` (A6); `token_hash` là SHA-256 của 32 byte ngẫu nhiên; trận bị huỷ thì `status='expired'`, `reward = 0`, tỉ số null);
  - nếu ranked và trận hợp lệ thì cộng thưởng qua `matchReward('hard', outcome, rewardedToday)` + `applyCoinDelta` + sự kiện nhiệm vụ `match_finished` với `mode: 'pvp'` (không tính `match_hard`) như `submitMatchResult` (`services/matches.ts:205`), khoá `users` bằng `FOR UPDATE`;
  - friendly thì `reward = 0`, `rewardReason='friendly'`;
  - ghi sự kiện `pvp_end`, gửi `end` cho cả hai.
- [x] T020 Trong `apps/server/src/app.ts`: khi khởi động, chuyển mọi `pvp_matches` có `status='live'` thành `cancelled/server_restart` và tạo dòng `matches` `expired` nếu chưa có. Ghi comment `shortcut: trạng thái trong bộ nhớ một tiến trình, nâng cấp khi chạy nhiều instance`.
- [x] T021 [P] Test `apps/server/src/services/pvp/session.test.ts` với client giả:
  - khung phát đúng thứ tự;
  - input trễ thì giữ input cũ;
  - trận kết thúc khi sim bóng tới `full_time` (kể cả khi có bù giờ);
  - tỉ số trong `end` bằng tỉ số chạy `replayMatch` trên `input_log`;
  - `finish` chạy hai lần chỉ thưởng một lần (FR-016);
  - Origin lạ bị 403, chưa đăng nhập bị 401;
  - quá `PVP_MAX_SESSIONS` thì trả `server_busy`;
  - một bên không gửi `ready` trong 30 s thì huỷ `void_not_ready`, không ai bị xử thua;
  - bộ giữ nhịp: Clock giả chậm thì chạy bù tối đa 5 tick/lượt, trễ hơn thì bỏ nhịp và ghi analytics; tick theo mốc tuyệt đối, không trôi (A4);
  - `start` có `countdownMs = 3000` và không có `startAt` (A16);
  - dòng `matches` của người đá đội khách có tỉ số/luân lưu đã đảo và đủ `seed`, `squad_snapshot`, `started_at`, `reward_day` (A6);
  - `maxPayload` 512 byte (tin lớn hơn bị đóng), `bufferedAmount` > 256 KB thì đóng mã 4408 và xử như rớt mạng (A11);
  - thiếu header `Origin` → 403; kết nối thứ 5 từ cùng IP bị từ chối; đăng xuất hoặc xoá tài khoản đóng mọi WS PvP của user (A18);
  - socket đóng thì mục hàng chờ bị xoá; chủ phòng `waiting` đóng socket thì phòng `closed` (A15).
- [x] T049 Test `apps/server/src/routes/pvp.ws-auth.test.ts` (phụ thuộc T017): chứng minh `@fastify/websocket` chạy hook xác thực `preValidation` **trước** upgrade (A18). Chưa đăng nhập hoặc `Origin` sai/thiếu thì nhận HTTP 401/403 ngay ở bước upgrade và handler WS không bao giờ được gọi; session đã thu hồi thì không upgrade được. Nếu hook chạy sau upgrade thì chuyển xác thực sang `server.on('upgrade')` hoặc `verifyClient` rồi mới đóng việc.
- [x] T022 Tạo `apps/web/src/features/pvp/useNetMatch.ts`: client WS
  - kết nối, gửi và nhận tin, parse bằng schema shared;
  - **chạy `stepBoth` và gửi `hash` (mỗi 60 tick) ngay trong `onmessage`**, không phụ thuộc `requestAnimationFrame`, để tab ẩn vẫn theo kịp (research.md R2);
  - đưa state mới nhất ra cho renderer, kèm bộ đệm hiển thị thích ứng 3–6 khung theo độ giật (jitter) đo được (A17);
  - trong lúc dựng lại sau `catchup`: xếp hàng các khung `f` tới, bỏ khung có tick ≤ `catchup.tick`, khung đầu tiên áp dụng là `catchup.tick + 1` (A13);
  - nếu tụt quá 300 khung (ví dụ trình duyệt bóp timer) thì gửi `rejoin` để xin `catchup`;
  - nhận `error busy` khi `rejoin` thì thử lại mỗi 2 s (socket cũ chết sẽ bị heartbeat phát hiện ≤ 5 s), vẫn trong hạn 30 s rớt mạng (A1);
  - 5 s không nhận được khung nào trong lúc trận đang chạy thì tự đóng và kết nối lại (R12).
- [x] T023 Trong `apps/web/src/game/three/MatchRenderer.ts`:
  - thêm `driver: 'local' | 'net'`; với `net` thì không dùng accumulator (khoảng dòng 676-770) mà chỉ vẽ state từ `useNetMatch`;
  - lấy mẫu input mỗi frame và gửi `input` khi mã đổi;
  - khi `visibilitychange` (tab ẩn) hoặc `blur` thì gửi ngay `input c=0` và xoá trạng thái phím đang giữ (spec, trường hợp biên "Tạm dừng");
  - lật camera và hướng điều khiển khi `side === 'away'`;
  - tắt tạm dừng và chặn phím của chuyển cảnh ở chế độ `net`;
  - chế độ `net` tắt replay/stinger che sân, `ghostHold`, `blindGuard` (MatchRenderer.ts:651, 676–770) (A12).

**Checkpoint:** sim chạy hai đội người, server có sim bóng và phát khung, web chạy theo khung. Đủ nền cho mọi câu chuyện.

---

## Phase 3: Câu chuyện 1 — Đá với bạn bằng mã phòng (P1) 🎯 MVP

**Mục tiêu:** A tạo phòng, B nhập mã, cả hai đá hết trận cùng tỉ số, không có thưởng.
**Kiểm thử độc lập:** quickstart, kịch bản tự động #4 (phần phòng) và kiểm tra bằng tay bước 2.

- [x] T024 [US1] Tạo `apps/server/src/services/pvp/rooms.ts`:
  - `room_create` sinh `code` 6 ký tự từ bảng chữ `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` bằng `node:crypto`, không trùng phòng đang mở, hạn 10 phút;
  - `room_join` trả lỗi `room_not_found`/`room_full`/`room_expired`/`self_join`;
  - mỗi user tối đa một mục trong hàng chờ, phòng hoặc phiên (`busy`, FR-004; gồm cả `room_*` từ socket thứ hai, A1);
  - chủ phòng đang `waiting` rời hoặc đóng socket thì đóng phòng (`closed`) (A15);
  - kiểm đội hình như `startMatch` (`invalid_squad`);
  - đặt `MatchSetup.autopilot` từ env `REPLAY_TEST_AUTOPILOT` và `halfLengthSec` từ `REPLAY_TEST_HALF_LENGTH_SEC` (chỉ khi test), để sim bóng và sim client dùng cùng giá trị;
  - khi đủ người: dựng `MatchSetup` bằng `buildHomeTeam` (`domain/match-teams.ts:45`) cho cả hai người, `humans: ['home','away']`, `kind='friendly'`, tạo dòng `pvp_matches`, gửi `matched`, ghi sự kiện `pvp_matched`;
  - viết phần "dựng trận" thành hàm dùng chung để T035 dùng lại.
- [x] T025 [P] [US1] Test `apps/server/src/services/pvp/rooms.test.ts`: mã không có ký tự 0/O/1/I; mọi mã lỗi; phòng hết hạn sau 10 phút; trận friendly cho `reward = 0` và không tính vào giới hạn ngày (FR-022).
- [x] T026 [US1] Tạo `apps/web/src/features/pvp/PvpLobby.tsx`:
  - nút Tạo phòng hiện mã (có nút sao chép) và dòng "Giao hữu, không có thưởng";
  - ô Nhập mã viết hoa, đúng 6 ký tự;
  - báo lỗi theo `error.code`;
  - khi `matched` thì hiện tên và đội hình đối thủ (FR-005).
- [x] T027 [US1] Tạo `apps/web/src/features/pvp/PvpMatchPage.tsx`:
  - nhúng `MatchCanvas` với `driver='net'`, HUD theo `side` (FR-008);
  - màn kết quả dùng tỉ số trong `end` và hiện lý do khi `reward = 0` theo `rewardReason`;
  - tách phần dùng chung từ `apps/web/src/features/play/PlayPage.tsx` thay vì sao chép.
- [x] T028 [US1] Thêm route `/pvp` (có `RequireAuth`) vào `apps/web/src/app/router.tsx`, mục PvP vào Topbar, chuỗi vi/en vào file i18n hiện có. Chặn trận trên điện thoại giống `/play`.
- [x] T029 [US1] Tạo `e2e/pvp.spec.ts` kịch bản phòng:
  - hai `browser.newContext()` hai tài khoản; A tạo phòng, B nhập mã;
  - autopilot hai đội (T009), hiệp 10 s;
  - hai màn kết quả cùng tỉ số và có dòng "Giao hữu";
  - đo thời gian từ lúc B nhập mã tới lúc có `start` (< 10 s, SC-001).

**Checkpoint:** MVP. Hai người đá được với nhau bằng mã phòng.

---

## Phase 4: Câu chuyện 3 — Rớt mạng, bỏ trận và lệch (P2)

Làm trước câu chuyện 2. Phải có luật xử thua thì mới mở trận có thưởng, nếu không người chơi sẽ thoát để né thua.

**Mục tiêu:** trận không đứng vì một người. Xử thua công bằng. Không né thua được bằng cách cố tình làm lệch.
**Kiểm thử độc lập:** quickstart, kiểm tra bằng tay bước 4, và test session.

- [x] T030 [US3] Trong `apps/server/src/services/pvp/session.ts`:
  - socket đóng hoặc nhận `leave` thì bắt đầu đếm rớt mạng: input của bên đó thành 0 (đứng yên), gửi `opp_disconnected {remainingMs}` cho bên kia, ghi sự kiện `pvp_disconnect`;
  - giới hạn 30 s mỗi lần, 60 s cộng dồn cả trận (FR-011);
  - `rejoin`: kiểm `userId ∈ {home, away}` của trận, sai → `error not_in_match`; trận đã `finished`/`cancelled` (phiên còn trong bộ nhớ hoặc chỉ còn dòng DB) → gửi lại `end` với kết quả đã lưu, không gửi `catchup` (A2);
  - `rejoin` trong hạn thì gửi `catchup {setup, log, tick}` và `opp_reconnected`; `rejoin` khi phía đó còn socket sống thì trả `error busy`, không đóng socket cũ (A1);
  - trận xử thua chỉ tính nhiệm vụ `match_play`/`match_win` (người thắng do đối thủ bị xử thua), không tính goals/clean_sheet (A14);
  - bên nào hết hạn trước thì bên đó bị xử thua; chỉ `finish('void_both_left')` khi lúc một bên hết hạn thì bên kia cũng đang rớt;
  - người chơi xoá tài khoản (`anonymizeUser`, `services/auth.ts:53`) khi đang chờ, trong phòng hoặc đang đá thì xử lý như `leave` (gọi hook từ route xoá tài khoản).
- [x] T031 [US3] Trong `apps/server/src/services/pvp/finish.ts`, hàm xử thua (FR-023):
  - lấy tỉ số hiện tại từ sim bóng; người ở lại thắng 3-0, hoặc giữ tỉ số hiện tại nếu đang dẫn cách biệt hơn 3 bàn;
  - ranked: người thua có `reward = 0`, `consumes_daily_cap = true`, không tính nhiệm vụ, `rewardReason='forfeit'`; người thắng nhận thưởng thắng và chỉ tính nhiệm vụ `match_play`/`match_win`, không tính goals/clean_sheet (A14);
  - dòng `matches` của cả hai có `reward_day = gameDay(finished_at)` (A6);
  - ghi `forfeit_user_id` và sự kiện `pvp_forfeit`.
- [x] T032 [US3] Phân xử lệch (FR-010, research.md R5) trong `apps/server/src/services/pvp/session.ts`:
  - nhận `hash {tick, h}` và so ngay với `serverHashes[tick]`;
  - một bên sai **lần đầu** thì server ép bên đó dựng lại: gửi `catchup` (miễn hạn mã băm 10 s như `rejoin`), chưa xử thua (A3);
  - bên đó sai **lần thứ hai** trong cùng trận thì `finish('forfeit_desync')`, bên đó thua (A3);
  - cả hai bên cùng sai lần hai thì `finish('void_desync')` (A3);
  - giữ mã băm 30 s; mã băm cũ hơn thì bỏ qua, không phạt;
  - bên **đang kết nối**, không đang dựng lại (chưa nhận `catchup_done` thì coi là đang dựng lại, nhưng miễn tối đa 10 s kể từ `catchup`), mà quá **15 s thời gian thật** không gửi hash thì bị coi là sai (R5);
  - ghi sự kiện `pvp_desync` (props: tick, bên lệch).
- [x] T033 [P] [US3] Test `apps/server/src/services/pvp/disconnect.test.ts`:
  - rớt 29 s rồi vào lại thì đá tiếp; rớt 31 s thì xử thua;
  - rớt 25 s + 25 s + 11 s thì xử thua do quá 60 s cộng dồn;
  - đang dẫn 5-0 khi đối thủ bỏ thì giữ 5-0;
  - người bị xử thua mất một lượt trong ngày nhưng 0 xu;
  - lệch lần 1 của một bên thì nhận `catchup` (không bị xử thua); lệch lần 2 của bên đó thì `forfeit_desync`; cả hai lệch lần hai thì `void_desync`, huỷ và vẫn có hai dòng `matches` `expired` (A3);
  - hai tab: mở socket thứ hai khi socket cũ còn sống thì socket cũ **không bị đóng**; `rejoin` từ socket mới nhận `error busy`; `queue_join`/`room_*` từ socket thứ hai nhận `busy`; sau khi socket cũ chết (heartbeat ≤ 5 s) và client thử lại sau 2 s thì `rejoin` thành công (A1);
  - `rejoin` bởi user không thuộc trận nhận `not_in_match`; `rejoin` trận đã `finished`/`cancelled` (còn trong bộ nhớ và chỉ còn dòng DB) nhận lại `end` đã lưu, không có `catchup` (A2);
  - người thắng do đối thủ bị xử thua chỉ tăng nhiệm vụ `match_play`/`match_win` (A14);
  - không gửi hash 15 s khi đang kết nối thì bị coi là lệch; đang rớt hoặc đang dựng lại thì không;
  - client chậm hơn server 5 s mà vẫn gửi hash đều thì **không** bị phạt;
  - nhận `catchup` mà không bao giờ gửi `catchup_done` thì sau 10 s + 15 s bị coi là lệch;
  - rớt lệch giờ: bên hết hạn trước thua; cả hai cùng đang rớt thì huỷ;
  - mất pong 5 s thì tính là rớt mạng.
- [x] T034 [US3] Trong `apps/web/src/features/pvp/useNetMatch.ts` và `PvpMatchPage.tsx`:
  - tự kết nối lại theo backoff, gửi `rejoin`;
  - nhận `error busy` thì thử `rejoin` lại mỗi 2 s trong hạn 30 s (A1); nhận `end` thay `catchup` thì hiện kết quả luôn (A2);
  - với `catchup` thì dựng lại state bằng `replayToState` trên `log` (không vẽ), hiện "Đang vào lại…", xếp hàng khung `f` tới, bỏ khung tick ≤ `catchup.tick`, khung đầu áp dụng là `catchup.tick + 1` (A13), xong thì gửi `catchup_done`;
  - banner đếm ngược khi đối thủ rớt;
  - hỏi xác nhận khi đóng tab hoặc bấm Back giữa trận (dùng lại cơ chế đang có ở `/play`);
  - chuỗi vi/en;
  - đo thời gian dựng lại 21.600 tick, quá 3 s thì báo lại (research.md R6).

---

## Phase 5: Câu chuyện 2 — Tìm trận ngẫu nhiên (P2)

**Mục tiêu:** ghép trận FIFO, có thưởng như đấu máy Khó.
**Kiểm thử độc lập:** hai tài khoản cùng bấm Tìm trận, vào trận và nhận thưởng.

- [x] T035 [US2] Tạo `apps/server/src/services/pvp/queue.ts`:
  - hàng chờ FIFO; socket đóng thì xoá mục chờ của user (A15); `queue_status` mỗi giây (`waitedSec`, `offerCpu` chuyển true sau 60 s);
  - quá 5 phút thì gửi `queue_timeout` và loại khỏi hàng;
  - `queue_leave`;
  - ghép hai người đầu hàng thành `kind='ranked'`, người vào trước là home, dùng hàm dựng trận chung từ T024.
- [x] T036 [US2] Trong `apps/server/src/services/pvp/finish.ts`:
  - nếu cặp hai user đã có quá 3 trận `ranked` `finished` trong ngày (tính theo `finished_at`, GMT+7) thì `reward = 0`, `rewardReason='same_opponent_limit'` (FR-017);
  - người hết giới hạn 15 trận/ngày thì `reward = 0`, `rewardReason='daily_cap'`.
- [x] T037 [P] [US2] Test `apps/server/src/services/pvp/queue.test.ts`: ghép đúng thứ tự FIFO; huỷ chờ; `offerCpu` sau 60 s; hết hạn sau 5 phút; người đang `busy` bị từ chối; trùng cặp từ trận thứ 4 không thưởng; thưởng đúng bảng `MATCH_REWARD.hard`; trận ranked tính nhiệm vụ chung nhưng **không** tính `match_hard`.
- [x] T038 [US2] Trong `apps/web/src/features/pvp/PvpLobby.tsx`:
  - nút Tìm trận, trạng thái "Đang tìm đối thủ…" kèm thời gian chờ và nút Huỷ;
  - sau 60 s hiện nút "Đá với máy" (gửi `queue_leave` rồi điều hướng sang `/play`);
  - báo khi hết 5 phút;
  - chuỗi vi/en.
- [x] T039 [US2] Thêm kịch bản hàng chờ vào `e2e/pvp.spec.ts`: hai context cùng Tìm trận, trận kết thúc, số dư xu của cả hai tăng đúng.

---

## Phase 6: Câu chuyện 4 — Thay người (P3)

**Mục tiêu:** mỗi người thay người cho đội mình, cả hai màn hình cùng cập nhật.
**Kiểm thử độc lập:** quickstart, kiểm tra bằng tay bước 5.

- [x] T040 [US4] Trong `apps/server/src/services/pvp/session.ts`:
  - nhận `sub`, kiểm cấu trúc bằng `checkSubStructure(state, team, out, bench)` trên sim bóng; sai thì gửi `error sub_rejected` ngay (A10);
  - kiểm thời điểm không gây lỗi: bóng đang lăn thì xếp lệnh chờ trong `pendingSubs`, mỗi đội tối đa 1 lệnh chờ (lệnh mới thay lệnh cũ), áp ở tick bóng chết gần nhất (A10);
  - tới bóng chết mà kiểm cấu trúc lại sai (ví dụ cầu thủ vừa nhận thẻ đỏ) thì gửi `sub_rejected` muộn và bỏ lệnh (A10);
  - hợp lệ thì áp `substitute` lên sim bóng, phát kèm khung, ghi `recorder.sub(tick, team, out, bench)`.
- [x] T041 [US4] Trong `apps/web/src/game/three/MatchRenderer.ts`, `useNetMatch.ts` và panel thay người hiện có:
  - ở chế độ `net`, panel gửi `sub` qua WS thay vì đẩy vào `applyCommands`;
  - client áp `subs` từ khung trước khi `stepBoth`;
  - bóng đang lăn thì hiện "Chờ bóng chết";
  - báo lỗi khi nhận `sub_rejected` (vi/en).
- [x] T042 [P] [US4] Test trong `apps/server/src/services/pvp/session.test.ts`: lệnh thay người lúc bóng lăn chỉ có hiệu lực ở tick bóng chết; lệnh chờ thứ hai của cùng đội thay lệnh đầu; cấu trúc sai (quá số lượt, cầu thủ không trên sân) bị `sub_rejected` ngay; cầu thủ nhận thẻ đỏ trong lúc chờ thì `sub_rejected` muộn và bỏ lệnh (A10); `replayMatch` trên `input_log` có thay người hai đội khớp với sim bóng.

---

## Phase 7: Polish & việc chung

- [ ] T043 [P] Ghi "Trang lịch sử trận (phân biệt máy / PvP xếp hạng / PvP giao hữu, tên đối thủ)" vào `docs/BACKLOG.md` (FR-021 đã hoãn; dữ liệu `mode`, `opponent_user_id` đã lưu).
- [ ] T044 [P] Cập nhật `docs/PRD.md` (mục PvP), `docs/ARCHITECTURE.md` (tham chiếu ADR-0012, sơ đồ WS, sim bóng), `docs/BACKLOG.md` (bỏ dòng PvP realtime, thêm rollback, ELO, nhiều instance), `docs/QA-REPORT.md`.
- [ ] T045 Chạy toàn bộ [quickstart.md](quickstart.md): `pnpm check`, `pnpm e2e`, `pnpm e2e:determinism`, rồi kiểm tra bằng tay các bước 1–6. Ghi vào QA-REPORT: kết quả đo SC-002 (RTT 100 ms), SC-001, thời gian dựng lại khi vào lại, chi phí sim bóng thực tế.
- [ ] T046 Playtest với ít nhất 3 người lần đầu dùng: tạo phòng hoặc vào phòng không cần hướng dẫn (SC-008). Ghi kết quả vào QA-REPORT.
- [ ] T047 Review chéo: Sonnet review diff phần Opus viết (T005–T013, T044); Opus review phần Sonnet viết (server, web). Sửa hết lỗi rồi merge `main`, push. Cập nhật "Trạng thái hiện tại" trong CLAUDE.md và `docs/PROGRESS.md`.

---

## Phụ thuộc và thứ tự

```
Phase 1 ─▶ 2a (T005-T007) ─▶ 2b (T008-T013) ─▶ 2c (T014-T023) ─▶ US1 ─▶ US3 ─▶ US2
                                                                   └──────▶ US4
                                                                                  ─▶ Phase 7
```

- T006 phải xanh thì mới làm T008. Lệch giữa các trình duyệt làm hỏng toàn bộ hướng làm.
- Golden hash của T005 phải ghi xong (và commit) trước T008.
- T049 (test xác thực trước upgrade) làm sau T017, song song với T018.
- Kết quả T007 quyết định `PVP_MAX_SESSIONS` dùng ở T017.
- T008 → T009 → T010 → T011 làm tuần tự (cùng chuỗi file sim). T012 và T013 song song sau T011.
- Ở 2c: T014, T015 song song. Server (T016–T021) và web (T022–T023) chạy song song trong hai worktree.
- US3 trước US2: trận có thưởng cần luật xử thua. US4 chỉ cần US1, làm song song với US3/US2 được (chung `session.ts` thì phối hợp tuần tự).

## Ví dụ chạy song song

- P0: `T005 → T006` ∥ `T007`.
- Sau T011: `T012 ∥ T013 ∥ T014 ∥ T015`.
- Phase 2c: worktree server làm `T016 → T017 → T018 → T019 → T020 → T021`, đồng thời worktree web làm `T022 → T023`.
- US1: `T024 → T025` (server) ∥ `T026 → T027 → T028` (web), rồi `T029`.

## Chiến lược

1. **MVP = Phase 1 + 2 + US1:** đá giao hữu bằng mã phòng. Dừng, demo, xem bằng mắt.
2. Sau đó US3, rồi US2 (có thưởng), US4.
3. Thử qua Internet thật sau khi deploy 9.2. Trước đó dùng LAN và throttling của DevTools.
