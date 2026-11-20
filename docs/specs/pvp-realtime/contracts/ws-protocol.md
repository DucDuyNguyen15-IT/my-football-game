# Giao thức WebSocket PvP

**Endpoint:** `GET /api/v1/pvp/ws` (upgrade). Cần cookie `sid` hợp lệ và header `Origin` trùng `Host`. Thiếu hoặc sai `Origin` thì trả 403, cookie sai thì trả 401, đều trước khi upgrade (hook xác thực chạy ở `preValidation`, có test kiểm `@fastify/websocket` chạy hook này TRƯỚC upgrade). Tối đa 4 kết nối WS đồng thời cho mỗi IP. Khi người dùng đăng xuất hoặc xoá tài khoản (thu hồi session), server đóng mọi WS PvP của họ.

**Định dạng:**
- Mỗi tin nhắn là JSON `{ "t": "<type>", ... }`. Chiều client→server: `maxPayload` 512 byte, tắt `perMessageDeflate`. Chiều server→client không giới hạn kích thước (như `catchup`), nhưng nếu `socket.bufferedAmount` > 256 KB thì server đóng kết nối (mã 4408) và xử như rớt mạng.
- Schema zod đặt ở `packages/shared/src/api/pvp.ts` và dùng chung cho client và server.
- Tin không hợp lệ thì server trả `error` và đóng kết nối với mã 4400.

## Client → Server

| `t` | Trường | Khi nào |
|---|---|---|
| `queue_join` | — | Bấm "Tìm trận" |
| `queue_leave` | — | Bấm Huỷ hoặc "Đá với máy" |
| `room_create` | — | Bấm "Tạo phòng" |
| `room_join` | `code: string(6)` | Nhập mã |
| `room_leave` | — | Rời màn chờ phòng |
| `ready` | — | Đã tải xong sân 3D, sẵn sàng đếm ngược |
| `input` | `c: int` (mã `buttonBits*9+dir`, 0..(2^9*9-1)) | Chỉ khi mã đổi (server giữ input cuối). Tab ẩn hoặc mất focus thì gửi ngay `c=0` |
| `sub` | `out: playerId, bench: slot` | Chọn thay người. Server kiểm cấu trúc bằng `checkSubStructure(state, team, out, bench)` (cầu thủ đang trên sân, slot dự bị hợp lệ, còn lượt thay, chưa bị đuổi): sai thì trả `error sub_rejected` ngay. Đúng thì xếp lệnh chờ tới bóng chết gần nhất rồi phát kèm khung ở tick đó. Mỗi đội tối đa 1 lệnh chờ (lệnh mới thay lệnh cũ). Tới bóng chết mà kiểm cấu trúc lại sai (ví dụ cầu thủ vừa nhận thẻ đỏ) thì trả `sub_rejected` muộn và bỏ lệnh. Thời điểm (bóng chưa chết) không gây lỗi |
| `hash` | `tick: int (bội số 60), h: uint32` | Mỗi 60 tick. Lệch lần đầu thì server ép dựng lại bằng `catchup` (xem bất biến 8) |
| `rejoin` | `pvpId: int` | Kết nối lại sau khi rớt mạng, hoặc xin `catchup` khi đang kết nối mà bị tụt quá 300 khung. Server kiểm `userId ∈ {home, away}` của trận, sai thì trả `error not_in_match`. Trận đã `finished`/`cancelled` (còn trong bộ nhớ hoặc chỉ còn dòng DB) thì gửi lại `end` với kết quả đã lưu, không gửi `catchup`. Nếu phía đó trong phiên vẫn còn socket sống thì trả `error busy` |
| `catchup_done` | — | Đã dựng lại xong state sau `catchup`. Miễn hạn mã băm tối đa 10 s kể từ `catchup` |
| `leave` | — | Chủ động bỏ trận (tính như rớt mạng, FR-012) |

## Server → Client

| `t` | Trường | Ý nghĩa |
|---|---|---|
| `queue_status` | `waitedSec`, `offerCpu: bool` | `offerCpu` chuyển thành true sau 60 s |
| `queue_timeout` | — | Chờ quá 5 phút |
| `room_created` | `code`, `expiresAt` | |
| `matched` | `pvpId` (int), `kind`, `side: 'home'\|'away'`, `opponent: {username, squad}`, `setup` | Hai người đã được ghép, client tải sân |
| `start` | `countdownMs` (tương đối, 3000) | Đếm ngược 3 s kể từ lúc nhận (không dùng đồng hồ server), sau đó server bắt đầu phát `f`. Quá 30 s sau `matched` mà chưa đủ hai `ready` thì gửi `end` với `reason='void_not_ready'` |
| `f` | `[tick, homeCode, awayCode]` hoặc `[tick, homeCode, awayCode, subs]` | Một khung lockstep. `subs = [{team, out, bench}]` được áp dụng **trước** `step` ở tick đó |
| `catchup` | `setup`, `log` (base64url v2), `tick` | Trả lời `rejoin`, hoặc ép dựng lại khi lệch mã băm lần đầu. Khung `f` tới trong lúc dựng được client xếp hàng: bỏ khung có tick ≤ `catchup.tick`, khung đầu tiên áp dụng là `catchup.tick + 1` |
| `opp_disconnected` | `remainingMs` | Đếm ngược theo thời gian còn lại (đã trừ các lần trước) |
| `opp_reconnected` | — | |
| `end` | `reason`, `home`, `away`, `you: {outcome, reward, rewardReason?}` | Tỉ số chính thức lấy từ sim bóng của server. `reason` là một giá trị của `pvp_end_reason`. `rewardReason` (khi `reward = 0`): `friendly`, `forfeit`, `daily_cap`, `same_opponent_limit`, `void` |
| `error` | `code` | `room_not_found`, `room_full`, `room_expired`, `self_join`, `busy` (đã có trận, phòng hoặc đang chờ; hoặc `rejoin` khi phía đó còn socket sống. Client đang `rejoin` nhận `busy` thì thử lại mỗi 2 s, vẫn trong hạn 30 s rớt mạng), `invalid_squad`, `rate_limited`, `bad_message`, `sub_rejected` (ngay hoặc muộn), `not_in_match`, `server_busy` (quá `PVP_MAX_SESSIONS`) |

## Bất biến

1. Server không bao giờ phát `f` tick `t+1` trước tick `t`. Client chạy `stepBoth` đúng một lần cho mỗi `f` theo thứ tự, **ngay trong `onmessage`** (không phụ thuộc vòng vẽ, để tab ẩn vẫn theo kịp).
2. Lệnh thay người chỉ có hiệu lực ở tick được ghi trong `f`. Client không tự áp dụng.
3. Tỉ số trong `end` là tỉ số chính thức. Màn kết quả hiển thị tỉ số này, không dùng tỉ số client tự tính.
4. Giới hạn mỗi kết nối: 120 tin/s. Quá giới hạn thì trả `rate_limited` rồi đóng kết nối, và áp dụng như rớt mạng.
5. Server kết thúc trận khi sim bóng tới `full_time`, rồi gửi `end` sau khung cuối.
6. Heartbeat: server gửi ping WebSocket mỗi 2 s, quá 5 s không có pong thì coi là rớt mạng (research R12).
7. Hạn gửi mã băm: đang kết nối và không dựng lại (miễn tối đa 10 s) mà quá 15 s thời gian thật không gửi `hash` thì bị coi là lệch. Mã băm cũ hơn 30 s thì bỏ qua (research R5).
8. Lệch mã băm: lần đầu của một bên thì server gửi `catchup` cho bên đó (miễn hạn mã băm 10 s như `rejoin`). Lệch **lần thứ hai** của cùng bên trong trận thì `end` với `forfeit_desync`. Cả hai bên cùng lệch lần hai thì `void_desync`.
9. Một user chỉ có một socket "đang giữ" trận. Socket mới mở khi socket cũ còn sống thì KHÔNG đóng socket cũ; socket mới chỉ được `rejoin`, và bị `busy` nếu phía đó còn socket sống (socket cũ chết sẽ bị heartbeat phát hiện ≤5 s). `queue_join`/`room_*` từ socket thứ hai khi user đã có mục chờ/phòng/phiên thì trả `busy`.
10. Socket đóng thì xoá mục hàng chờ của user. Chủ phòng đang `waiting` rời hoặc đóng socket thì phòng bị đóng (`closed`).
11. Bộ đệm hiển thị của client thích ứng 3–6 khung theo độ giật (jitter) đo được (research R2).
12. Bộ giữ nhịp phía server: một vòng lặp chung cho mọi phiên, tick theo mốc tuyệt đối (research R11).
