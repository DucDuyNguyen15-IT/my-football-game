# Data model: Đá trực tiếp (PvP thời gian thực)

Migration mới: `apps/server/drizzle/0008_pvp.sql` (sinh bằng drizzle-kit; không phải `src/db/migrations`), schema ở `apps/server/src/db/schema.ts`.

## 1. Bảng mới `pvp_matches` (mỗi trận một dòng)

| Cột | Kiểu | Ràng buộc / ghi chú |
|---|---|---|
| `id` | bigint identity | PK, `id()` như các bảng khác (`schema.ts:25`) |
| `kind` | enum `pvp_kind` (`ranked`, `friendly`) | `ranked` là ghép ngẫu nhiên (có thưởng), `friendly` là mã phòng (không thưởng, FR-022) |
| `home_user_id` | bigint → users (`userRef`) | NOT NULL. Người tạo phòng, hoặc người vào hàng chờ trước |
| `away_user_id` | bigint → users (`userRef`) | NOT NULL. CHECK `home_user_id <> away_user_id` (spec: không đá với chính mình) |
| `seed` | bigint | NOT NULL, sinh bằng `node:crypto` như `startMatch` |
| `squad_snapshot` | jsonb | NOT NULL, `{formation_home, formation_away, home, away}` chụp lúc vào trận |
| `status` | enum `pvp_status` (`live`, `finished`, `cancelled`) | mặc định `live` |
| `end_reason` | enum `pvp_end_reason` | `full_time`, `forfeit_disconnect`, `forfeit_desync`, `void_desync`, `void_both_left`, `void_not_ready`, `server_restart`. Null khi đang `live` |
| `forfeit_user_id` | bigint → users (`userRef`) | null, trừ khi có người bị xử thua |
| `home_goals`, `away_goals` | smallint | CHECK 0..20, null khi `live` hoặc bị huỷ |
| `input_log` | text | nhật ký base64url của server (định dạng v2, xem contracts/sim-api.md), lưu để kiểm tra lại |
| `started_at`, `finished_at` | timestamptz | |

Index:
- `(home_user_id, started_at)` và `(away_user_id, started_at)`: tra cứu theo người chơi.
- `(kind, finished_at) WHERE kind='ranked' AND status='finished'`: đếm số trận ghép trùng cặp trong ngày theo giờ kết thúc GMT+7 (FR-017).

**Chuyển trạng thái:** `live → finished` (hết giờ hoặc xử thua), `live → cancelled` (huỷ do cả hai lệch, cả hai bỏ, hoặc server khởi động lại). Không có chuyển trạng thái nào khác. Khi server khởi động, mọi dòng `live` chuyển thành `cancelled/server_restart`.

## 2. Bảng `matches` (đã có), mỗi người chơi một dòng

Thêm cột:

| Cột | Kiểu | Ghi chú |
|---|---|---|
| `mode` | enum `match_mode` (`cpu`, `pvp_ranked`, `pvp_friendly`) | NOT NULL, mặc định `cpu` (dòng cũ giữ nguyên nghĩa) |
| `pvp_match_id` | bigint → pvp_matches | null với `cpu`. UNIQUE `(pvp_match_id, user_id)`: mỗi người chỉ có một dòng cho mỗi trận, nên chỉ được thưởng một lần (FR-016) |
| `opponent_user_id` | bigint → users | null với `cpu`. Lưu sẵn cho trang lịch sử sau này (FR-021 đã chuyển BACKLOG) |
| `consumes_daily_cap` | boolean | mặc định false. True cho người bị xử thua ở trận ranked (Clarification Q2) |

Các cột giữ nguyên ý nghĩa với dòng PvP:
- `token_hash`: NOT NULL UNIQUE. Dòng PvP lưu SHA-256 của 32 byte ngẫu nhiên nhưng không bao giờ phát ra ngoài. Cách này tránh phải đổi cột thành cho phép null.
- `difficulty`: luôn `hard`, để `matchReward('hard', …)` dùng chung.
- `reward_eligible`: true với ranked, false với friendly.
- `home_goals`, `away_goals`: ghi **theo góc nhìn của người chơi đó** (đội mình là home), để `outcome` và lịch sử dùng chung logic với trận đấu máy.
- `status`: `finished` khi trận xong. Trận bị huỷ (`void_*`, `server_restart`) **vẫn tạo đủ hai dòng** với `expired`, `reward = 0`, tỉ số null.

Các cột NOT NULL của `matches` phải điền cho dòng PvP:
- `seed`: bằng `seed` của `pvp_matches`.
- `squad_snapshot`: theo góc nhìn của người đó (đội mình là home).
- `started_at`: lấy từ `pvp_matches`.
- `reward_day`: `gameDay(finished_at)` cho cả hai dòng, kể cả người bị xử thua.
- Dòng của người đá đội khách: đảo `home_goals/away_goals` và kết quả luân lưu sang góc nhìn của họ trước khi tính `outcome`.

Nhiệm vụ ngày: trận xử thua chỉ tính `match_play`/`match_win` (người thắng do đối thủ bị xử thua). Không tính `goals`/`clean_sheet`.

Đổi điều kiện của index `matches_user_reward_day_idx` thành `reward > 0 OR consumes_daily_cap`. Đổi `countRewardedMatches` (`services/matches.ts:42`) theo cùng điều kiện.

## 3. Trạng thái trong bộ nhớ (không lưu DB, chỉ trong tiến trình)

- **Lượt chờ ghép (`QueueEntry`):** `userId`, `enqueuedAt`, `socket`. Hàng chờ FIFO. Hết hạn sau 5 phút (Clarification Q5).
- **Phòng (`Room`):** `code` gồm 6 ký tự lấy từ bảng chữ `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (bỏ 0/O, 1/I, FR-001), `hostUserId`, `createdAt`, hạn 10 phút. Trạng thái `waiting → full → closed`.
- **Phiên trận (`PvpSession`):**
  - `pvpMatchId`, `setup` (MatchSetup có `humans: ['home','away']`), `tick`.
  - `state`: MatchState của **sim bóng**, là nguồn sự thật cho tỉ số, lúc hết trận và việc kiểm thay người.
  - `serverHashes`: `stateHash` của sim bóng ở các tick bội số của 60, giữ 30 mã gần nhất (30 s).
  - `lastInput: {home, away}` (mã input).
  - `pendingSubs`: tối đa **1 lệnh chờ mỗi đội** (`{home?, away?}`). Lệnh mới thay lệnh cũ. Tới bóng chết mà kiểm cấu trúc (`checkSubStructure`) lại sai thì gửi `sub_rejected` muộn và bỏ lệnh.
  - `recorder`: InputRecorder v2, ghi cả hai đội.
  - `lastHashAt: {home, away}` (thời gian thật) và `catchingUpSince: {home, away}` (miễn tối đa 10 s): dùng để phát hiện bên đang kết nối mà quá 15 s không gửi mã băm.
  - `desyncCount: {home, away}`: số lần mỗi bên lệch mã băm trong trận. Lệch lần đầu của một bên: server ép bên đó dựng lại (gửi `catchup`, miễn hạn mã băm 10 s như rejoin). Lệch lần hai của cùng bên: `forfeit_desync`. Cả hai bên cùng lệch lần hai: `void_desync`.
  - `lastPongAt: {home, away}`: heartbeat, quá 5 s thì coi là rớt mạng.
  - `disconnect: {side, since, usedMs: {home, away}}`: giới hạn 30 s mỗi lần, 60 s cộng dồn (FR-011).
  - `sockets: {home?, away?}`.
  - Sau khi trận kết thúc, phiên còn giữ trong bộ nhớ 60 s cùng kết quả đã lưu, để `rejoin` trả lại `end`. Hết thời gian đó thì đọc từ dòng DB.

**`stateHash`:** băm một **phép chiếu** cố định (tick, tỉ số, phase, bóng pos/vel, từng cầu thủ id/pos/vel theo thứ tự id), không băm JSON cả state (xem contracts/sim-api.md). `serverHashes` và mã băm client dùng cùng hàm này.

**Ràng buộc:** mỗi `userId` có tối đa một mục trong (hàng chờ ∪ phòng đang `waiting` ∪ phiên `live`) (FR-004).

## 4. Analytics (thêm vào `AnalyticsEventName`)

`pvp_matched`, `pvp_start`, `pvp_end` (props: kind, endReason, score), `pvp_disconnect`, `pvp_forfeit`, `pvp_desync` (props: tick, bên lệch). Đáp ứng FR-019.
