# ADR-0011: Server xác minh trận vs máy bằng replay log input

**Date**: 2026-11-19
**Status**: accepted
**Deciders**: người dùng (chốt 19/11/2026), Fable 5.2 (triển khai)

## Context

Trận vs máy chạy ở client (ADR-0006), nên `POST /matches/:id/result` từng tin tỉ số do client báo:
sửa client gửi 20-0 là ăn thưởng và nhiệm vụ (SEC-07, `docs/QA-REPORT.md`). Giới hạn cũ (match token,
≥ 6 phút, ≤ 20 bàn, 15 trận/ngày) chỉ chặn bớt chứ không chặn được kết quả giả.

`packages/sim` đã tất định (mulberry32 trong state, `step` thuần) và chạy ~0,5 s cho một trận đủ
~24.000 tick trên Node. Server đã lưu `seed`, `difficulty`, `squad_snapshot` (đội nhà + đội máy) khi
`POST /matches`. Chỉ còn thiếu input người chơi.

## Decision

1. **Server chạy lại trận** từ seed + đội đã lưu + log input client gửi (`inputLog`), tỉ số/luân lưu
   do replay quyết định; thưởng và nhiệm vụ dùng số đó. Số client báo chỉ để đối chiếu: lệch, log hỏng
   hoặc replay không tới `full_time` → 422 `match_token_invalid` + analytics `match_replay_mismatch`
   (để thấy lệch tất định ngoài đời). Thời lượng tối thiểu 360 s giữ nguyên; thêm: số tick của log
   không được nhiều hơn thời gian thực đã trôi từ lúc phát token (+5 s dung sai).
2. **Log input** (`packages/sim/src/replay.ts`): ghi THEO TICK, run-length `[số tick, mã input]` + các
   lượt thay người kèm tick áp dụng (trước `step` của tick đó), mã nhị phân varint rồi base64url. Bàn phím
   chỉ ra 8 hướng nên `move` mã hoá bằng chỉ số hướng, lossless; `move` ngoài 8 hướng chuẩn thì không ghi
   được (ném lỗi). `decodeLog` chặn log hỏng/quá dài (trần 64.800 tick, trận đo dài nhất 27.352, ≤ 3 lượt thay người, không
   thừa byte). `MatchSetup` dựng bằng một hàm chung `buildMatchSetup` cho web và server; server không
   bao giờ bật `autopilot`/đổi `halfLengthSec`.
3. **Tất định số học giữa engine JS**: bỏ `Math.log/cos` khỏi đường state (chỉ còn `nextGaussian`
   dùng Box–Muller) bằng `ln`/`cos2pi` thuần số học trong `packages/sim/src/math/det.ts` (+ − × ÷ là chính
   xác theo IEEE-754, như `sqrt`). ESLint chặn `Math.sin/cos/log/hypot/pow/exp…` và toán tử `**` trong
   `packages/sim/src` (không áp cho test); thêm test golden-hash để phát hiện lệch số học.
4. **Replay trong `node:worker_threads`**, timeout 5 s, ngoài mọi transaction DB: kiểm token/hạn/thời
   lượng (transaction ngắn) → replay → transaction khoá `users` rồi `matches`, **kiểm lại trạng thái**,
   cộng thưởng. Nhờ vậy khoá `users` không giữ 0,5 s và nộp đồng thời/nộp lại vẫn idempotent (chỉ một
   lần cộng). Timeout/worker sập → 503 `internal_error` (không phải lỗi của người chơi, client được thử lại).
5. **Không viết lại sim bằng Rust** và **không làm PvP** trong thay đổi này.

## Alternatives Considered
### Giữ nguyên, chỉ siết giới hạn
- **Pros**: không tốn công.
- **Cons**: kết quả giả vẫn ăn được thưởng tới trần.
- **Why not**: chốt mới của người dùng là vá SEC-07.

### Server tự chạy trận (client chỉ gửi input realtime)
- **Pros**: chống gian lận mạnh nhất.
- **Cons**: cần realtime (ADR-0006), tốn CPU server suốt trận.
- **Why not**: quá nặng cho MVP; replay sau trận chỉ tốn ~0,5 s CPU mỗi lần nộp.

### Viết lại sim bằng Rust/WASM để server và client dùng chung bản nhị phân
- **Pros**: tất định tuyệt đối giữa môi trường.
- **Cons**: viết lại toàn bộ sim, ADR-0001 (TypeScript dùng chung) mất ý nghĩa.
- **Why not**: tất định số học trong JS đủ (chỉ còn 4 phép tính cơ bản + sqrt + min/max/abs/floor…).

### Chạy replay ngay trong event loop / trong transaction
- **Pros**: code ngắn.
- **Cons**: chặn mọi request ~0,5 s; giữ khoá `users` quá lâu.
- **Why not**: worker thread + kiểm lại trạng thái trong transaction cộng thưởng.

## Consequences
### Positive
- Tỉ số, thưởng, nhiệm vụ không còn do client quyết định; sửa số hoặc nộp log của trận khác đều bị từ chối.
- Nền sẵn cho PvP bất đồng bộ (cùng cơ chế replay).

### Negative
- Mỗi lần nộp tốn ~0,5–1,5 s CPU ở worker (một lần mỗi trận, tối đa 15 trận có thưởng/ngày/người).
- Mọi thay đổi sim làm đổi kết quả → trận đang đá lúc triển khai bản mới (client cũ, server mới hoặc ngược
  lại) sẽ bị từ chối: triển khai sim mới cần ngắt trận đang đá (token cũ hết hạn) hoặc chấp nhận mất vài trận.
- Client phải ghi log trung thực: `?half=`/`?autopilot=1` (chế độ test) chỉ khớp khi server bật
  `REPLAY_TEST_HALF_LENGTH_SEC`/`REPLAY_TEST_AUTOPILOT` (bị cấm ở production).

### Risks
- Lệch tất định giữa engine (nếu còn hàm nào ngoài danh sách IEEE-exact lọt vào sim) → người chơi thật
  bị từ chối nhầm. Giảm thiểu: ESLint, golden-hash, analytics `match_replay_mismatch` để theo dõi.
- Người chơi vẫn có thể dùng bot/macro điều khiển input hợp lệ (không phát hiện được bằng replay); chỉ giới hạn bởi
  thời lượng tối thiểu và trần thưởng/ngày.
