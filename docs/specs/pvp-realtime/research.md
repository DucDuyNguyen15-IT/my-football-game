# Research: Đá trực tiếp (PvP thời gian thực)

Mỗi mục ghi: Quyết định, Lý do, Phương án đã cân nhắc.

## R1. Cách đồng bộ hai người chơi (netcode)

- **Quyết định:** dùng lockstep, server giữ nhịp, kèm **sim bóng trên server**. Mỗi tick (60 Hz), server tự chạy `stepBoth` trên bản sim của mình, rồi phát một khung chứa input của hai đội. Hai trình duyệt chạy `stepBoth` y hệt nhau theo khung. Server không gửi state xuống client.
- **Lý do:**
  - Sim đã tất định, đã có nhật ký RLE và test golden hash. Băng thông nhỏ vì chỉ gửi input.
  - **Server phải có state**, nếu không thì không biết lúc nào hết trận (bù giờ, luân lưu do sim quyết định), không kiểm được lệnh thay người, không biết tỉ số khi xử thua. Báo cáo analyze gọi các lỗi này là C1–C3.
  - Sim bóng là nguồn sự thật. Tỉ số chính thức lấy thẳng từ sim bóng, đúng ràng buộc "kết quả trận PvP chạy ở server" trong CLAUDE.md. Không cần chạy lại bằng worker lúc hết trận.
  - Chi phí CPU phải đo ở P0 (R11).
- **Đã cân nhắc:**
  - *Server tự tính trận và gửi state xuống (Colyseus, theo ADR-0006):* phải gửi state lớn 60 lần/s và client phải nội suy. Sim đã tất định nên chỉ cần gửi input.
  - *Server chỉ chuyển tiếp, không có sim:* không biết lúc hết trận và không kiểm được thay người (C1–C3), đã loại.
  - *P2P WebRTC:* cần STUN/TURN, khó chống gian lận, server không giữ được nhật ký.
  - *Rollback (GGPO):* mượt hơn khi mạng xấu, nhưng phải clone và tính lại nhiều tick mỗi khung. Để đợt sau (ngoài phạm vi trong spec).
- **Hệ quả:** cần ADR-0012 thay câu "Colyseus cho PvP" trong ADR-0006 và CLAUDE.md, ghi rõ server chạy sim bóng.

## R2. Bộ đệm và độ trễ

- **Quyết định:**
  - Server phát khung tick `t` theo nhịp đồng hồ của server (bộ giữ nhịp: xem R11). Mỗi đội dùng input mới nhất server đã nhận. Chưa nhận được input mới thì giữ input cũ (spec: "lấy theo phím gần nhất").
  - Client chạy sim ngay khi nhận khung (trong `onmessage`). Vòng vẽ hiển thị state trễ **thích ứng 3–6 khung** theo độ giật (jitter) đo được, để chống giật.
- **Lý do:** trận không bao giờ đứng chờ người mạng chậm (spec, trường hợp biên "Mạng chậm"). Độ trễ phím bằng RTT + bộ đệm: với RTT 100 ms là khoảng 150 ms (bộ đệm tối thiểu 3 khung).
- **Mất focus:** khi `visibilitychange` (tab ẩn) hoặc `blur`, client gửi ngay `input c=0` để cầu thủ đứng yên, vì không có sự kiện nhả phím (spec, trường hợp biên "Tạm dừng").
- **Tab ẩn:** trình duyệt ngừng `requestAnimationFrame` khi tab bị ẩn. Vì vậy client chạy `stepBoth` và gửi `hash` **ngay trong `onmessage` của WebSocket**, tách khỏi vòng vẽ. Vòng vẽ chỉ hiển thị state mới nhất. Tab ẩn vẫn theo kịp và không bị coi là lệch (lỗi U1 trong analyze).
- **Hệ quả cho spec:** SC-002 ban đầu ghi "trễ một chiều 100 ms → phản ứng ≤ 150 ms". Lockstep không có dự đoán thì không đạt được mức này. Đã sửa SC-002 thành "RTT ≤ 100 ms → phản ứng ≤ 200 ms".
- **Đã cân nhắc:** lockstep chờ đủ input của hai bên (cách lockstep cổ điển). Cách này làm trận đứng theo người chậm nhất, trái với spec.

## R3. Định dạng input trên dây

- **Quyết định:** mỗi input là một số nguyên, dùng lại mã `buttonBits*9 + dir` của `packages/sim/src/replay.ts:79-93`. Khung gửi đi là mảng JSON `[tick, homeCode, awayCode]`. Lệnh thay người đi kèm khung khi có.
- **Lý do:**
  - Dùng chung bộ mã với nhật ký replay, nên không phải viết thêm encoder.
  - Mỗi khung khoảng 20 byte, 60 khung/s, tức khoảng 1,2 KB/s mỗi chiều.
  - Input chỉ có 8 hướng bàn phím, đúng với encoder hiện có. Encoder sẽ từ chối vector analog.
- **Đã cân nhắc:** binary (ArrayBuffer). Gọn hơn nhưng khó debug, mà băng thông không phải nút thắt.

## R4. Tất định giữa các trình duyệt

- **Quyết định:** trước khi làm phần mạng, chạy 100 seed × trận đầy đủ trên Chromium, Firefox, WebKit và Node, so mã băm mỗi 60 tick (T006).
- **Lý do:**
  - Ngoài test, sim chỉ dùng `Math.sqrt`, mà `Math.sqrt` cho kết quả làm tròn đúng theo IEEE-754 nên giống nhau ở mọi engine.
  - Hàm `ln`/`cos2pi` tự viết bằng phép tính cơ bản ở `math/det.ts`.
  - RNG là mulberry32 dùng số nguyên.
  - Đánh giá rủi ro thấp, nhưng vẫn phải đo trước khi làm tiếp.
- **Nếu lệch:** tìm phép toán gây lệch bằng cách so mã băm theo từng tick, sửa trong sim, giữ golden hash của Chromium.

## R5. Phân xử khi lệch (Clarification Q1)

- **Quyết định:**
  - Server lưu `stateHash` của sim bóng ở mỗi tick bội số của 60 (giữ 30 mã gần nhất, tức 30 s).
  - Client gửi `stateHash` mỗi 60 tick. Server so ngay với mã của mình. Bên nào khác lần đầu thì server ép bên đó dựng lại: gửi `catchup` (miễn hạn mã băm 10 s như `rejoin`). Bên đó lệch **lần thứ hai** trong cùng trận thì bị xử thua (`forfeit_desync`). Cả hai cùng lệch lần hai (lỗi của server/sim) thì huỷ trận (`void_desync`). Khi một bên lệch lần hai mà bên kia đã lệch lần một và đang kết nối, server chờ tối đa 1,2 s (`DUAL_DESYNC_WINDOW_MS`, `session.ts`) rồi mới quyết: bên kia lệch lần hai → `void_desync`; bên kia gửi mã băm đúng → xử thua bên đầu.
  - Server giữ mã băm của 30 s gần nhất (30 mã). Mã băm tới muộn hơn thế thì bỏ qua, không phạt.
  - Một bên **đang kết nối** mà quá **15 s thời gian thật** không gửi mã băm nào thì bị coi là lệch. Không tính khi bên đó đang rớt mạng hoặc đang dựng lại sau `catchup` (client gửi `catchup_done` khi xong). Thời gian dựng lại được miễn tối đa **10 s**; quá 10 s thì vẫn áp hạn dù chưa nhận `catchup_done`, để client không thể né phân xử bằng cách không bao giờ gửi tin này. Lý do dùng thời gian thật: client luôn chạy sau server một khoảng (bộ đệm, tab bị bóp timer), tính theo tick server sẽ phạt oan.
- **Lý do:** có sim bóng thì so trực tiếp được, không phải chạy lại trong worker.
- **Đã cân nhắc:** luôn huỷ trận (bị lợi dụng để né thua).

## R6. Vào lại sau khi rớt mạng

- **Quyết định:**
  - Client kết nối lại, gửi `rejoin {pvpId}`. Server kiểm `userId ∈ {home, away}` (sai thì `error not_in_match`). Trận đã `finished`/`cancelled` (còn trong bộ nhớ hoặc chỉ còn dòng DB) thì server gửi lại `end` với kết quả đã lưu, không gửi `catchup`. Ngược lại server gửi `catchup {setup, log}` gồm toàn bộ nhật ký tới tick hiện tại.
  - Client dựng lại state bằng `replayToState` (không vẽ). Trong lúc dựng, các khung `f` tới được xếp hàng; bỏ khung có tick ≤ `catchup.tick`, khung đầu tiên áp dụng là `catchup.tick + 1`. Dựng xong thì nhận khung bình thường.
  - Socket mới mở khi socket cũ còn sống: server KHÔNG đóng socket cũ. Socket mới chỉ được `rejoin`; nếu phía đó trong phiên vẫn còn socket sống thì trả `error busy`. Client nhận `busy` khi đang `rejoin` thì thử lại mỗi 2 s (socket cũ chết sẽ bị heartbeat phát hiện ≤5 s), vẫn trong hạn 30 s rớt mạng.
  - Đang kết nối mà tụt quá 300 khung thì client gửi `rejoin` để xin `catchup`; server cho phép `rejoin` cả khi socket vẫn sống.
  - Đồng hồ rớt mạng: 30 s cho mỗi lần, 60 s cộng dồn cho cả trận (Clarification Q4).
- **Lý do:** không cần serialize state. Nhật ký tối đa 64.800 tick nhưng mã hoá RLE nên nhỏ.
- **Ghi chú:** `ReplayResult` hiện chỉ có tỉ số, phase và số tick, không có state (`replay.ts:236`). Vì vậy thêm `replayToState(setup, log): MatchState` để client dựng lại state từ `log`. Đây cũng là cách client quay lại tab sau khi bị tụt quá 300 khung.
- **Phải đo:** thời gian chạy lại 21.600 tick (một trận 6 phút) trên máy yếu. Nếu quá 3 s thì gửi thêm ảnh chụp state (đã serialize được bằng JSON).

## R7. Xác thực và bảo mật WebSocket

- **Quyết định:**
  - Dùng `@fastify/websocket`. Route `GET /api/v1/pvp/ws`.
  - Ở `preValidation`, kiểm cookie `sid` bằng logic của `requireAuth`, và kiểm `Origin` phải trùng `Host` (lớp CSRF ở `plugins/auth.ts:66` chỉ chặn POST/PUT/PATCH/DELETE).
  - Mỗi tài khoản chỉ có một socket "đang giữ" trận. Socket mới không đóng socket cũ (xem R6: `rejoin` + `busy`). `queue_join`/`room_*` từ socket thứ hai khi user đã có mục chờ/phòng/phiên thì trả `busy`.
  - `Origin` bắt buộc: thiếu hoặc sai thì 403. Tối đa 4 kết nối WS đồng thời cho mỗi IP. Có test kiểm `@fastify/websocket` chạy hook xác thực (`preValidation`) TRƯỚC upgrade.
  - Đóng mọi WS PvP của user khi đăng xuất hoặc xoá tài khoản (thu hồi session).
  - Giới hạn 120 tin/s cho mỗi kết nối. `maxPayload` 512 byte (client→server), tắt `perMessageDeflate`. Nếu `socket.bufferedAmount` > 256 KB thì đóng (mã 4408) và xử như rớt mạng. Mọi tin nhắn được kiểm bằng zod.
- **Lý do:** dùng chung phiên đăng nhập hiện có. Kiểm Origin chặn trang web lạ mở WebSocket bằng cookie của người chơi (CSWSH).
- **Đã cân nhắc:** vé ngắn hạn lấy qua POST rồi mới mở WebSocket. An toàn tương đương nhưng thêm một bước gọi.

## R8. Trạng thái trong bộ nhớ, một tiến trình

- **Quyết định:**
  - Hàng chờ, phòng và phiên trận nằm trong bộ nhớ của tiến trình server (ghi chú `shortcut:`).
  - Socket đóng thì xoá mục hàng chờ của user. Chủ phòng đang `waiting` rời hoặc đóng socket thì phòng bị đóng (`closed`).
  - Khi server khởi động, các `pvp_matches` có `status='live'` chuyển thành `cancelled` (lý do `server_restart`).
- **Lý do:** hạ tầng hiện có một container server (spec, Giả định). Nếu chạy nhiều tiến trình thì phải đưa trạng thái ra Redis hoặc dùng sticky session. Việc này ngoài phạm vi.

## R9. Sim cho hai đội người

- **Quyết định:**
  - Thêm `MatchSetup.humans?: TeamSide[]`, mặc định `['home']`.
  - Các trường điều khiển (`controlledId`, `shotChargeTicks`, `passCharge`, `input`, `actionDeadline`, `passReceiver`) thành `Record<TeamSide, …>`.
  - Hàm mới `stepBoth(state, {home, away})`. Hàm `step(state, input)` cũ gọi `stepBoth` với away là `NO_INPUT`.
  - Nghỉ giữa hiệp: cả hai người bấm chuyền mới đá tiếp, không thì tự đá sau 30 s.
  - Hai đội người đều dùng AI profile `teammate`.
- **Lý do:** code đấu máy không phải sửa. Golden hash một người chơi phải giữ nguyên (SC-007).
- **Rủi ro:** `match.ts` dài 1778 dòng, có khoảng 20 chỗ dùng `HUMAN_TEAM`. Đổi kiểu dữ liệu có thể làm đổi thứ tự khoá JSON và làm đổi golden hash. Phải giữ thứ tự khoá cũ cho trường hợp một người chơi, hoặc đổi cách băm thành băm theo các trường có thứ tự cố định.

## R10. Đếm giới hạn ngày khi xử thua (Clarification Q2)

- **Quyết định:** thêm cột `matches.consumes_daily_cap`. `countRewardedMatches` đếm `reward > 0 OR consumes_daily_cap`. Dòng của người bị xử thua có `reward = 0` và `consumes_daily_cap = true`.
- **Lý do:** hiện tại chỉ đếm `reward > 0` (index `matches_user_reward_day_idx`), nên người bị xử thua với 0 xu sẽ không bị trừ lượt.

## R11. Chi phí sim bóng trên server

- **Quyết định:** đo ở P0 bằng `apps/server/scripts/perf-pvp-sim.ts`: thời gian trung bình và p99 của một `stepBoth` trên một trận đầy đủ, chạy bằng Node 24.
  - **Ngưỡng:** dùng **p99** thời gian step (không dùng trung bình). Sim bóng của server tốn ≤ 40% một lõi ở `PVP_MAX_SESSIONS` (50 phiên × 60 tick/s, tức p99 ≤ ~0,13 ms/step; đo thực tế p99 ≈ 0,03–0,04 ms, xem kết quả bên dưới).
  - **Kết quả đo (20/11/2026):** `pnpm --filter @pitch/server bench:pvp-sim`, 12 seed × trận đầy đủ (~298 000 step, có warm-up 2 trận), input đổi mỗi 5–40 tick. Máy: Intel Core i7-13620H (16 luồng), Windows 11, Node v26.13.0 (chưa có Node 24 trên máy này). Ba lượt chạy: mean 0,012–0,014 ms, **p99 0,030–0,036 ms** (nặng nhất lượt nào cũng dưới 4 ms, hiếm). Với ngưỡng 40% một lõi (6,67 ms mỗi tick cho mọi phiên) thì tối đa 185–225 phiên theo p99, 490–550 theo mean. Đây là `step` một đội người.
  - **Đo lại bằng `stepBoth` (20/11/2026, sau T008/T009):** hai đội người đều có input, cùng máy/Node, 12 seed (~308 600 step). Ba lượt chạy: mean 0,0157–0,0160 ms, **p99 0,0455–0,0506 ms** (tăng khoảng 40% so với `step` một người, dưới mức ước tính 2 lần). Tối đa 131–146 phiên theo p99, 415–425 theo mean. `PVP_MAX_SESSIONS` = 50 vẫn dư khoảng 2,6 lần theo p99.
  - **Đề xuất `PVP_MAX_SESSIONS` = 50** (đúng mục tiêu plan, dư khoảng 2,6 lần so với số đo p99 của `stepBoth` (đã đo, xem trên) nên vẫn đủ và máy chủ yếu hơn máy dev). Chưa tính chi phí mạng/JSON; vCPU của máy chủ thật có thể chậm hơn.
  - **Bộ giữ nhịp:** MỘT vòng lặp chung cho mọi phiên, dùng `performance.now()`, tick tính theo mốc tuyệt đối (`tick_n = t0 + n·1000/60`), không cộng dồn sai số. Nếu trễ thì chạy bù tối đa 5 tick/lượt; trễ hơn nữa thì bỏ nhịp và ghi analytics. Phiên mới vào vòng ở tick kế tiếp (tự lệch pha, không cần lệch thêm).
  - **Nếu vượt ngưỡng:** giới hạn số phiên đồng thời (`PVP_MAX_SESSIONS`, quá thì báo "máy chủ bận") và ghi `shortcut:`. Phương án sau cùng là chuyển sim bóng sang `worker_threads`.
- **Lý do:** sim bóng chạy trên luồng chính của Fastify, nặng quá sẽ làm chậm API khác.

## R12. Phát hiện rớt mạng

- **Quyết định:** server gửi ping WebSocket mỗi 2 s. Quá 5 s không có pong thì coi là rớt mạng và bắt đầu đồng hồ 30 s (FR-011). Client cũng tự đóng và kết nối lại nếu 5 s không nhận được khung nào trong lúc trận đang chạy.
- **Lý do:** mạng rớt kiểu "im lặng" không làm socket đóng ngay (TCP có thể treo hàng phút). Client đứng yên cũng không gửi `input`, vì input chỉ gửi khi đổi.

## R13. Nhiệm vụ cho trận PvP (Clarification)

- **Quyết định:** thêm `mode: 'cpu' | 'pvp'` vào `MissionEvent` `match_finished` (`apps/server/src/domain/missions.ts:11`). `match_hard` chỉ đếm khi `mode === 'cpu' && difficulty === 'hard'`. Các nhiệm vụ còn lại (`match_play`, `match_win`, `match_goals`, `match_clean_sheet`) đếm cả PvP ranked.
