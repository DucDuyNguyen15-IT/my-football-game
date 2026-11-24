# Implementation Plan: Đá trực tiếp (PvP thời gian thực)

**Spec:** [spec.md](spec.md) | **Ngày:** 20/11/2026 | **Nhánh:** `feat/pvp-realtime` (đã gộp main 24/11/2026)

_Ghi chú: số dòng trong plan này là lúc lập plan 20/11/2026, nay code đã lệch; tìm theo tên hàm._

## Tóm tắt

Hai người chơi đá với nhau theo thời gian thực. Server chạy lockstep 60 Hz: mỗi tick gom input của hai người, chạy **sim bóng** của chính server, rồi phát một khung cho cả hai trình duyệt. Hai trình duyệt chạy cùng sim tất định.

Sim bóng là nguồn sự thật cho tỉ số, lúc hết trận, việc kiểm thay người và việc phân xử khi mã băm lệch. Server lưu nhật ký để kiểm tra lại sau này.

Có hai kiểu trận:
- **ranked:** ghép ngẫu nhiên, có thưởng như đấu máy Khó.
- **friendly:** vào bằng mã phòng, không có thưởng.

Lý do chọn hướng này ở [research.md](research.md), mục R1.

## Bối cảnh kỹ thuật

- **Ngôn ngữ:** TypeScript, Node ≥ 24, monorepo pnpm.
- **Phụ thuộc chính:** Fastify 5, zod 4, Drizzle + PostgreSQL 16, React + Vite, Three.js.
- **Phụ thuộc mới:** `@fastify/websocket` (dùng `ws` bên dưới).
- **Lưu trữ:** PostgreSQL. Thêm bảng `pvp_matches` và 4 cột vào `matches` ([data-model.md](data-model.md)). Hàng chờ, phòng và phiên trận nằm trong bộ nhớ.
- **Kiểm thử:**
  - Vitest cho sim, server và web.
  - Playwright cho e2e hai context.
  - Playwright chạy test tất định trên 3 engine.
- **Nền tảng:** trình duyệt desktop. Server là một container sau Caddy.
- **Mục tiêu hiệu năng:** ít nhất 50 phiên đồng thời trên 1 vCPU. Điều kiện: ngưỡng dùng **p99** thời gian step, và sim bóng của server tốn ≤ 40% một lõi ở `PVP_MAX_SESSIONS`. Đo ở P0 (research.md R11). Không đạt thì giảm `PVP_MAX_SESSIONS`.
- **Bộ giữ nhịp:** MỘT vòng lặp chung cho mọi phiên, dùng `performance.now()`, tick tính theo mốc tuyệt đối (`tick_n = t0 + n·1000/60`), không cộng dồn sai số. Trễ thì chạy bù tối đa 5 tick mỗi lượt; trễ hơn nữa thì bỏ nhịp và ghi analytics. Phiên mới vào vòng ở tick kế tiếp (tự lệch pha, không cần lệch thêm). Băng thông khoảng 1,2 KB/s mỗi chiều cho mỗi người.
- **Ràng buộc:**
  - `packages/sim` không được dùng DOM, Three.js hay `Math.random`.
  - Golden hash của trận một người chơi phải giữ nguyên.
  - Mọi thưởng xu đi qua transaction có `FOR UPDATE` như luồng `submitMatchResult` hiện có.
- **Quy mô:** một tiến trình server, đặt máy chủ trong khu vực Việt Nam.

## Đối chiếu nguyên tắc dự án (CLAUDE.md đóng vai constitution)

| Nguyên tắc | Kết quả |
|---|---|
| Logic quan trọng chạy ở server, kể cả kết quả trận PvP | ✅ Sim bóng trên server chốt tỉ số, lúc hết trận, kiểm thay người và phân xử khi lệch. Server lưu nhật ký để kiểm lại |
| `packages/sim` không dùng DOM, Three.js | ✅ Chỉ thêm hàm thuần |
| Đã có ADR thì tuân theo | ⚠️ ADR-0006 ghi "Colyseus cho PvP realtime". **Lý do không theo:** sim đã tất định nên lockstep đơn giản hơn (R1). Đã ghi ADR-0012 thay thế, người dùng đã duyệt hướng ngày 20/11 |
| Chỉ làm trong phạm vi giai đoạn hiện tại | ⚠️ PvP thuộc phần sau MVP, nhưng người dùng giao trực tiếp. Đã thêm mục vào ROADMAP |
| Dữ liệu hư cấu, không thanh toán thật | ✅ Không đụng tới |
| `pnpm check` xanh trước mỗi commit; mỗi tính năng một commit và push | ✅ Có trong tasks |

Kiểm lại sau khi thiết kế: không có vi phạm mới.

## Cấu trúc thay đổi

```
packages/sim/src/
  types.ts            + humans, TeamInputs, chuyển các trường điều khiển sang Record theo đội
  match.ts            + stepBoth; HUMAN_TEAM → isHuman(state, team)
  hash.ts (mới)       stateHash
  replay.ts           v2: InputRecorder2, đọc v1/v2
  rules/substitution.ts + checkSubStructure (tách từ canSubstitute)
packages/shared/src/api/pvp.ts (mới)   schema zod cho tin nhắn WS (contracts/ws-protocol.md)
apps/server/src/
  routes/pvp.ts (mới)                  WS endpoint, kiểm cookie + Origin
  services/pvp/queue.ts, rooms.ts, session.ts (có sim bóng), finish.ts (mới)
  scripts/perf-pvp-sim.ts (mới)       đo chi phí stepBoth (R11)
  services/matches.ts                  countRewardedMatches tính thêm consumes_daily_cap
  services/analytics.ts                + 6 sự kiện pvp_*
  db/schema.ts; migration ở apps/server/drizzle/0008_pvp.sql
  app.ts                               đăng ký plugin websocket; khi khởi động huỷ các trận live còn sót
apps/web/src/
  features/pvp/ (mới)                  PvpLobby (Tìm trận / Tạo phòng / Nhập mã), useNetMatch (WS client)
  game/three/MatchRenderer.ts          + driver 'net' (sim chạy trong onmessage của WS, vòng vẽ chỉ hiển thị); lật camera/HUD theo side;
                                       chế độ mạng tắt replay/stinger che sân (682–702, 711–720), ghostHold (200, 631–654, 748–751), blindGuard (202, 643, 656, 716)
  features/play/PlayPage.tsx           tách phần dùng chung; PvP không có tạm dừng; panel thay người gửi qua WS
  app/router.tsx, Topbar               + /pvp
  i18n vi/en                           chuỗi mới
apps/web/vite.config.ts                proxy /api thêm ws: true
deploy/Caddyfile                       CSP connect-src thêm wss:
e2e/pvp.spec.ts, e2e/determinism.spec.ts (mới)
docs/adr/0012-pvp-lockstep.md; PRD, ARCHITECTURE, ROADMAP, BACKLOG, CLAUDE.md
```

## Giai đoạn triển khai

Task tách hai người (T009) phải phủ `stepShootout` (`match.ts:854`), `humanRestart` (`match.ts:927`), `nearestHuman` (`match.ts:200`) và có test luân lưu hai người chơi. Trận xử thua chỉ tính nhiệm vụ `match_play`/`match_win`.

Thứ tự bắt buộc: P0 → P1 → (P2 ∥ P3) → P4.

| Giai đoạn | Nội dung | Ai làm | Điều kiện xong |
|---|---|---|---|
| **P0** Tất định + chi phí | Golden hash trên 3 engine, nhiều seed. Ghi golden `stateHash` bằng code hiện tại trước refactor. Đo `step` trên Node (p99) | Opus | Cùng mã băm. Chi phí đã đo và đã chọn ngưỡng `PVP_MAX_SESSIONS` |
| **P1** Sim hai đội | `humans`, `stepBoth`, `stateHash` (băm phép chiếu), replay v2 (tiền tố `v2.`, `MAX_SUBS` mỗi đội), `checkSubStructure`, autopilot hai đội | Opus | Golden hash cũ giữ nguyên. Test hai phía xanh |
| **P2** Server | DB 0008, WS, phòng, session lockstep có sim bóng, rớt mạng, phân xử, hàng chờ, thưởng | Sonnet (worktree `../mfg-sonnet-pvp-server`, DB `pitch_test_a`) | Test session với client giả xanh |
| **P3** Web | Sảnh PvP, driver net, HUD/camera theo phía, thay người qua WS, i18n | Sonnet (worktree `../mfg-sonnet-pvp-web`, DB `pitch_test_b`) | Unit test xanh, xem bằng mắt |
| **P4** Ghép nối + docs | e2e hai context, ADR-0012, cập nhật docs | Opus | `pnpm check` và e2e xanh |

**Review chéo:** Sonnet review phần Opus viết (P0, P1, P4); Opus review P2 và P3. Mỗi giai đoạn xong thì commit và push.

## Rủi ro chính

1. Refactor `match.ts` làm đổi golden hash: giữ đường chạy một người chơi đi đúng nhánh cũ (R9).
2. Lệch giữa các engine: P0 làm trước để phát hiện sớm (R4).
3. Sim bóng làm nặng luồng chính của server: đo ở P0, có giới hạn số phiên (R11).
4. Chạy lại khi vào lại quá chậm trên máy yếu: đo ở P3, dự phòng bằng cách gửi ảnh chụp state (R6).
5. Không có server công khai thì không thử được qua Internet thật: dùng LAN và throttling của DevTools, rồi thử lại sau khi deploy 9.2.

## Tài liệu liên quan

[research.md](research.md) · [data-model.md](data-model.md) · [contracts/ws-protocol.md](contracts/ws-protocol.md) · [contracts/sim-api.md](contracts/sim-api.md) · [quickstart.md](quickstart.md)
