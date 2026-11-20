# API `packages/sim` thêm cho PvP

Chỉ thêm, không đổi chữ ký cũ. Code đấu máy hiện tại phải chạy nguyên như cũ (SC-007).

```ts
// types.ts
interface MatchSetup { /* ... */ humans?: TeamSide[] }   // mặc định ['home']
type TeamInputs = Record<TeamSide, PlayerInput>;

// match.ts
function stepBoth(state: MatchState, inputs: TeamInputs): MatchState;
function step(state: MatchState, input: PlayerInput): MatchState; // = stepBoth(state, {home: input, away: NO_INPUT})

// hash.ts (lấy từ replay.test.ts:87)
function stateHash(state: MatchState): number;            // FNV-1a 32-bit, ổn định qua engine; băm PHÉP CHIẾU cố định (xem dưới)

// replay.ts — định dạng nhật ký v2
encodeInput(input: PlayerInput): number;                  // export hàm có sẵn
decodeInput(code: number): PlayerInput;
class InputRecorder2 { tick(inputs: TeamInputs): void; sub(tick, team, out, bench): void; encode(): string }
function replayMatch(setup: MatchSetup, encoded: string): ReplayResult;          // nhận cả v1 lẫn v2
function replayToState(setup: MatchSetup, encoded: string): MatchState;          // chạy hết log, trả state; client dùng khi vào lại (R6)

// rules/substitution.ts (đã có): dùng để server kiểm lệnh thay người trên sim bóng
// Tách `canSubstitute` thành hai:
function checkSubStructure(state: MatchState, team: TeamSide, out, bench): boolean;
// cầu thủ `out` đang trên sân, slot dự bị hợp lệ, đội còn lượt thay, `out` chưa bị đuổi.
// Sai → server trả `sub_rejected` ngay.
function canSubstituteNow(state: MatchState): boolean;   // bóng chết?
// Kiểm thời điểm không gây lỗi: false thì lệnh xếp chờ tới bóng chết gần nhất.
```

**Phép chiếu của `stateHash`:** tick, tỉ số, phase, bóng (pos/vel), từng cầu thủ (id, pos, vel) theo thứ tự id. Không băm JSON cả state, nên đổi field sang `Record<TeamSide,…>` không đổi hash. Ghi golden hash bằng `stateHash` trên code HIỆN TẠI trước khi refactor. Sau refactor golden phải giữ nguyên, kèm test quỹ đạo một người không đổi.

**Định dạng v2:** nhật ký có tiền tố chuỗi `v2.`. Bản v1 không có tiền tố (v1 bắt đầu bằng varint nên không dùng "byte phiên bản"), vẫn đọc được như cũ. Mỗi run lưu cặp `(homeCode, awayCode)`. `subs[]` thêm trường `team`. Giới hạn `MAX_SUBS=3` (`replay.ts:221`) đổi thành **mỗi đội** 3.

**Thay người (server):** mỗi đội tối đa 1 lệnh chờ, lệnh mới thay lệnh cũ. Tới bóng chết mà `checkSubStructure` lại sai (ví dụ cầu thủ vừa nhận thẻ đỏ) thì `sub_rejected` muộn và bỏ lệnh.

**Test bắt buộc:**
- Golden hash của `step` một người chơi giữ nguyên (ghi trước refactor, xem trên).
- Task tách hai người phải phủ thêm `stepShootout` (`match.ts:854`), `humanRestart` (`match.ts:927`, đang dùng `HUMAN_TEAM`) và `nearestHuman` (`match.ts:200`), kèm test luân lưu với hai người chơi.
- `replayMatch(v2)` khớp với chạy trực tiếp `stepBoth`.
- `stateHash(replayToState(setup, log))` khớp với state khi chạy trực tiếp tới cùng tick.
- Autopilot điều khiển được cả hai đội khi `humans` có hai đội, dùng cho e2e. Cờ `MatchSetup.autopilot` nằm trong setup, nên sim bóng của server và sim ở client tự dùng cùng giá trị.
- Các luật 15 s đá phạt, 10 s thủ môn ôm bóng, vàng tối đa cho thủ môn, nghỉ giữa hiệp đều áp cho đội khách khi `humans` có `'away'`.
