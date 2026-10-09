# Giai đoạn 5 — Trận đấu offline (F1–F3, F14 tuỳ chọn)

**Mục tiêu:** đá được 1 trận 7v7 hoàn chỉnh với máy trên trình duyệt. Chưa có thẻ/tài khoản: đội dùng dữ liệu demo hư cấu.
**Hoàn thành giai đoạn khi** (ROADMAP): đá hết 1 trận không lỗi · logic trận có unit test · ≥ 55 FPS TB (PRD) trên laptop thường.
**Tài liệu nền cho mọi task:** `docs/ARCHITECTURE.md` §6, `docs/PRD.md` §5 (luật) và §6.2 (chỉ số → gameplay).

Quy ước chung trong `packages/sim`: hàm thuần, state là object thường (serialize được), mọi random lấy từ PRNG trong state, đơn vị mét & giây, gốc toạ độ tâm sân, trục x dọc sân (đội nhà tấn công về +x ở hiệp 1).

---

### 5.1 — Lõi mô phỏng & tính tất định `[ ]`
- **Phụ thuộc:** — · **Model:** strongest
- **Bối cảnh:** `packages/sim/src/index.ts` (đã có `TICK_RATE`, `TICK_DT`), ARCHITECTURE §6, PRD §5.
- **Việc cần làm:**
  - `math/vec2.ts` (cộng, trừ, scale, length, normalize, dot, clampLength) — dạng hàm thuần trên `{x,y}`.
  - `rng.ts`: PRNG có seed (mulberry32), state là một số nguyên nằm trong `MatchState`; `nextFloat`, `nextInt`, `nextGaussian`.
  - `pitch.ts`: kích thước sân 7v7 (đề xuất 60×40 m, khung thành 5 m, vòng cấm 12×20 m), hằng số vạch.
  - `packages/shared/src/match.ts`: kiểu `MatchTeamSetup` (formation, 7 đá chính + ≤ 5 dự bị, mỗi người: slot, position, stats đã hiệu lực) — đây cũng là `MatchTeam` trong API sau này.
  - `types.ts`: `MatchState`, `PlayerState`, `BallState` (có `z`, `vz`), `PlayerInput` (hướng, nút pass/lob/shoot/sprint/switch, giữ-thả).
  - `match.ts`: `createMatch(setup)` đặt đội hình giao bóng; `step(state, input)` tăng tick + đồng hồ (chưa có vật lý).
  - `fixtures/demoTeams.ts` (dữ liệu hư cấu, dùng tới hết GĐ5): `starterLikeTeam` (11 thẻ Đồng 1 GK/3 DF/4 MF/3 FW, OVR TB ~57, mô phỏng quà tân thủ PRD §7.1), `cpuEasyTeam` (OVR TB ~60), `cpuHardTeam` (OVR TB ~78) — khớp PRD §5.
- **Kiểm chứng:** `pnpm --filter @pitch/sim exec vitest run` — test rng cùng seed cùng chuỗi; 2 lần chạy 600 tick cùng input → state `toEqual`.
- **Xong khi:** `createMatch` + `step` chạy được, có test tất định, export qua `src/index.ts`.

### 5.2 — Vật lý bóng `[ ]`
- **Phụ thuộc:** 5.1 · **Model:** default
- **Bối cảnh:** `packages/sim/src/{types,pitch,match}.ts`, PRD §5 (bóng ra ngoài).
- **Việc cần làm:** `physics/ball.ts`: ma sát lăn trên cỏ, cản không khí, trọng lực + nảy (hệ số hồi phục) cho bóng bổng, va cột dọc/xà (đơn giản hoá 2D + z), lưới giữ bóng. Phát sự kiện `ball_out { line: 'touch'|'goal', point }` và `goal { team }` khi bóng qua hẳn vạch (tâm bóng + bán kính).
- **Kiểm chứng:** test: bóng lăn dừng trong khoảng cách mong đợi; bóng bổng chạm đất rồi nảy thấp dần; qua vạch biên → `ball_out touch`; vào khung thành dưới xà → `goal`; trên xà → `ball_out goal`.
- **Xong khi:** mọi sự kiện có test; không có phép tính phụ thuộc thời gian thực.

### 5.3 — Cầu thủ: di chuyển, chỉ số, thể lực `[ ]`
- **Phụ thuộc:** 5.1 · **Song song với:** 5.2 · **Model:** default
- **Bối cảnh:** PRD §5 (thể lực), §6.2 (bảng chỉ số → tham số).
- **Việc cần làm:**
  - `stats/params.ts`: ánh xạ chỉ số 1–99 → `maxSpeed`, `accel`, `staminaDrain`, … (tuyến tính có kẹp; hằng số đặt ở một chỗ để cân chỉnh ở 5.13).
  - `physics/player.ts`: steering tới vận tốc mong muốn, giới hạn gia tốc, chạy nước rút, tách va chạm giữa cầu thủ.
  - Thể lực: 100% → hao theo tốc độ/nước rút, hồi khi đứng; < 30% giảm dần tốc độ tối đa và độ chính xác (xuất `fatigueFactor`).
- **Kiểm chứng:** test: Tốc độ 90 chạy 30 m nhanh hơn Tốc độ 50; nước rút liên tục làm thể lực tụt nhanh hơn chạy thường; Thể lực 90 hao chậm hơn 50; dưới 30% thì `maxSpeed` giảm.
- **Xong khi:** tham số chỉ số có test đơn điệu (chỉ số cao → tốt hơn).

### 5.4 — Kiểm soát bóng: rê, chuyền, sút, đổi người `[ ]`
- **Phụ thuộc:** 5.2, 5.3 · **Model:** strongest
- **Bối cảnh:** PRD §5 (điều khiển), §5 tiêu chí "Sút 90 vs Sút 55", §6.2.
- **Việc cần làm:** `rules/possession.ts` (bóng dính chân trong bán kính phụ thuộc Rê bóng, mất bóng khi xoay gắt); `actions/pass.ts` (chuyền thấp tới đồng đội tốt nhất theo hướng, chuyền bổng theo tầm; sai số góc/lực từ Chuyền); `actions/shoot.ts` (giữ để nạp lực, sai số góc từ Sút + `fatigueFactor`); đổi người điều khiển = cầu thủ gần bóng nhất phía mình (J khi không có bóng).
- **Kiểm chứng:** test 1.000 cú sút cùng tình huống (seed khác nhau): Sút 90 vào khung thành nhiều hơn Sút 55 **≥ 25 điểm %**; chuyền thấp tới đồng đội đứng yên 15 m tới được ≥ 90% với Chuyền 80.
- **Xong khi:** tiêu chí PRD về sút có test xanh.

### 5.5 — Luật: bóng chết, giao bóng, hiệp, đồng hồ `[ ]`
- **Phụ thuộc:** 5.4 · **Model:** strongest
- **Bối cảnh:** PRD §5 (thời lượng, bóng ra ngoài) và tiêu chí F1.
- **Việc cần làm:** `rules/restarts.ts`: ném biên cho đội không chạm cuối; vạch cuối → phạt góc hoặc phát bóng; giao bóng sau bàn thắng; đặt bóng tự động, đội người bấm chuyền để tiếp tục, đội máy tự thực hiện sau 3 s. `rules/clock.ts`: 2 hiệp × `halfLengthSec` (mặc định 180), đồng hồ hiển thị 0'–90', nghỉ giữa hiệp đổi sân. Trạng thái `phase: 'kickoff'|'play'|'dead_ball'|'half_time'|'full_time'` + cờ `ballDead` (dùng cho thay người ở 5.11).
- **Kiểm chứng:** test 3 trường hợp bóng ra (biên/góc/phát bóng) đúng đội; trận chạy đủ 2×180 s ±1 tick; đổi sân sau hiệp 1.
- **Xong khi:** các tiêu chí F1 tương ứng có test.

### 5.6 — Xoạc, phạm lỗi, thẻ phạt `[ ]`
- **Phụ thuộc:** 5.5 · **Model:** strongest
- **Bối cảnh:** PRD §5 (dòng "Phạm lỗi") và tiêu chí F2.
- **Việc cần làm:** `actions/tackle.ts` (K khi không có bóng; bán kính/tỉ lệ sạch theo Phòng ngự); `rules/fouls.ts`: không chạm bóng trước hoặc từ phía sau → phạm lỗi; trong vòng cấm → phạt đền; từ sau khi đối phương đối mặt khung thành → vàng; 2 vàng → đỏ; xoạc thô bạo (tốc độ cao từ sau) → xác suất đỏ trực tiếp (PRNG). Cầu thủ bị đỏ rời sân. Đá phạt/phạt đền là restart mới.
- **Kiểm chứng:** test từng nhánh: xoạc trượt → phạm lỗi + đá phạt; trong vòng cấm → phạt đền; xoạc từ sau khi đối phương đối mặt khung thành → vàng; vàng thứ 2 → đỏ và đội còn 6 người; xoạc thô bạo với một seed cố định ra đỏ trực tiếp và một seed cố định không ra.
- **Xong khi:** tiêu chí F2 phạm lỗi có test xanh.

### 5.7 — AI tầng đội `[ ]`
- **Phụ thuộc:** 5.6 · **Model:** strongest
- **Bối cảnh:** `docs/research.md` §2 (AI 2 tầng + steering), PRD §5 (Dễ/Khó).
- **Việc cần làm:** `ai/team.ts`: điểm neo theo sơ đồ (2-3-1, 3-2-1, 2-2-2 từ `@pitch/shared`), dịch theo vị trí bóng, trạng thái tấn công/phòng ngự/chuyển trạng thái, phân công kèm người, người áp sát gần bóng nhất. `ai/difficulty.ts`: `reactionDelayTicks`, hệ số sai số chuyền/sút, độ hung hăng — Dễ/Khó.
- **Kiểm chứng:** test: khi bóng ở 1/3 sân nhà, trung bình x của đội phòng ngự lùi về; luôn có đúng 1 người áp sát; chạy 1 trận AI-vs-AI không văng lỗi, không cầu thủ nào ra ngoài sân quá 2 s.
- **Xong khi:** hai đội AI tự di chuyển có hình dạng đội hình hợp lý.

### 5.8a — AI tầng cầu thủ `[ ]`
- **Phụ thuộc:** 5.7 · **Model:** strongest
- **Bối cảnh:** `docs/research.md` §2; `packages/sim/src/ai/{team,difficulty}.ts`, `src/actions/*`.
- **Việc cần làm:** `ai/player.ts`: người có bóng chấm điểm chuyền/sút/rê (khoảng trống, góc sút, áp lực); người không bóng chạy chỗ/đỡ bóng; AI tự thực hiện restart (sau 3 s). Các cầu thủ không điều khiển của đội người cũng dùng AI này. Thêm cờ `autopilot` trong `MatchSetup` để AI điều khiển luôn cầu thủ của người chơi (dùng cho test cân bằng và E2E).
- **Kiểm chứng:** test: AI-vs-AI 20 trận (thủ môn tạm đứng giữa khung): mỗi trận có ≥ 1 cú sút; người có bóng bị áp sát sát thì chuyền/sút trong ≤ 2 s.
- **Xong khi:** hai đội AI tạo được cơ hội.

### 5.8b — AI thủ môn `[ ]`
- **Phụ thuộc:** 5.8a · **Model:** strongest
- **Bối cảnh:** PRD §6.2 (Phản xạ, Bắt bóng, Vị trí, Phát bóng); `packages/sim/src/ai/player.ts`, `src/physics/ball.ts`.
- **Việc cần làm:** `ai/goalkeeper.ts`: đứng theo góc bóng (Vị trí), thời gian phản ứng (Phản xạ), bắt dính hay đẩy ra (Bắt bóng), phát bóng/chuyền (Phát bóng), lao ra khi đối mặt.
- **Kiểm chứng:** test: thủ môn Phản xạ 90 cản nhiều cú sút chuẩn hơn Phản xạ 50 (500 cú, seed cố định); AI-vs-AI 20 trận tỉ số TB trong 1–8 bàn.
- **Xong khi:** AI-vs-AI ra trận "trông như bóng đá" (ghi chú quan sát vào PROGRESS ở 5.13).

### 5.9 — Client game: Phaser render + input `[ ]`
- **Phụ thuộc:** 5.4, **GĐ4 xong** · **Song song với:** 5.5–5.8b · **Model:** default
- **Bối cảnh:** ADR-0002, ADR-0003, ARCHITECTURE §2 & §6, `docs/DESIGN.md` (phím điều khiển, màu), `apps/web/src/`.
- **Việc cần làm:** cài `phaser` (khoá bản 3.x cụ thể) + `react-router`; `game/MatchCanvas.tsx` tạo `Phaser.Game` khi mount, `destroy(true)` khi unmount; `game/scenes/MatchScene.ts`: vẽ sân, cầu thủ (hình tròn + số áo, màu theo đội), bóng + bóng đổ theo `z`; vòng lặp accumulator chạy `step` cố định 60 tick/s, **nội suy** vị trí khi render; `game/input/keyboard.ts` map phím → `PlayerInput`; camera bám bóng; overlay FPS ở chế độ dev. Route `/play` dùng `demoTeams`.
- **Kiểm chứng:** `pnpm dev` → vào `/play` điều khiển được 1 cầu thủ, chuyền/sút được; vào/ra `/play` 10 lần không tăng số canvas/listener (kiểm DevTools). Test unit cho map phím → input.
- **Xong khi:** đá được bóng trên trình duyệt; Phaser không chứa logic luật/vật lý.

### 5.10 — HUD & luồng trận `[ ]`
- **Phụ thuộc:** 5.9, 5.5 · **Model:** default
- **Bối cảnh:** `docs/DESIGN.md` (HUD), PRD §5.
- **Việc cần làm:** HUD React đè lên canvas: tỉ số, đồng hồ 0'–90', chỉ báo cầu thủ đang điều khiển, thanh thể lực của người đó, thông báo bàn thắng/thẻ phạt. Màn chọn độ khó → trận → nghỉ giữa hiệp → màn kết quả (tỉ số, thẻ phạt). Tạm dừng (Esc khi bóng sống = menu tạm dừng). Tham số chỉ bật khi `import.meta.env.DEV` hoặc `MODE === 'test'`: `?half=<giây>` (hiệp ngắn) và `?autopilot=1` (bật cờ `autopilot` của 5.8a, cần cho E2E ở 8.1) — build production bỏ qua.
- **Kiểm chứng:** đá hết 1 trận với `?half=20` qua đủ các màn; `?autopilot=1&half=10` tự đá hết trận không cần bấm phím; test component cho định dạng đồng hồ; build production không đọc các tham số này.
- **Xong khi:** một trận có đầu – giữa – cuối rõ ràng.

### 5.11 — Thay người khi bóng chết `[ ]`
- **Phụ thuộc:** 5.8b, 5.10 · **Model:** default
- **Bối cảnh:** PRD §5 (Thể lực, Thay người) và tiêu chí F3.
- **Việc cần làm:** sim: lệnh `substitute(out, in)` chỉ hợp lệ khi `ballDead`/nghỉ giữa hiệp, tối đa 3 lượt, không thay người đã nhận thẻ đỏ; AI tự thay khi cầu thủ < 30% thể lực. Web: menu thay người (Esc/Tab khi bóng chết), trận tạm dừng khi mở.
- **Kiểm chứng:** test sim: thay khi bóng sống bị từ chối; lượt thứ 4 bị từ chối; người bị đỏ không thay được; AI thay khi < 30%.
- **Xong khi:** tiêu chí F3 có test xanh.

### 5.12 — Luân lưu `[ ]`
- **Phụ thuộc:** 5.8b · **Model:** default
- **Bối cảnh:** PRD §5 ("Hòa sau 2 hiệp"), §7.1 (kết quả thắng/thua luân lưu).
- **Việc cần làm:** sim: phase `shootout` — 5 lượt mỗi đội, kết thúc sớm khi không thể gỡ, rồi sudden death; người sút do người chơi (chọn hướng + lực) hoặc AI; thủ môn AI đoán hướng theo Phản xạ. Kết quả trận: `win|draw|loss` + `shootout?: {home, away}`. Web: màn luân lưu và hiển thị kết quả.
- **Kiểm chứng:** test: hoà → vào luân lưu; dừng sớm đúng (VD 3–0 sau 3 lượt); sudden death tới khi có kết quả; 1.000 loạt luân lưu AI luôn kết thúc.
- **Xong khi:** tiêu chí "Hòa sau 2 hiệp" có test xanh.

### 5.13 — Cân chỉnh độ khó & hiệu năng `[ ]`
- **Phụ thuộc:** 5.11, 5.12 · **Model:** strongest
- **Bối cảnh:** PRD §5 tiêu chí (AI-vs-AI 100 trận, ≥ 55 FPS), §10.
- **Việc cần làm:** script `pnpm --filter @pitch/sim balance` chạy headless 100 trận (danh sách **seed cố định**): `starterLikeTeam` điều khiển bởi hồ sơ AI `proxy` (hồ sơ riêng mô phỏng người chơi trung bình, nằm giữa Dễ và Khó, định nghĩa trong `ai/difficulty.ts`) vs `cpuEasyTeam` (AI Dễ) và vs `cpuHardTeam` (AI Khó); in tỉ lệ thắng. Chỉnh hằng số ở `stats/params.ts` và `ai/difficulty.ts` tới khi **thắng Dễ ≥ 60%, thắng Khó ≤ 30%**. Đo FPS trên Chrome (Performance panel hoặc overlay dev) với 14 cầu thủ, 1 trận đủ; tối ưu nếu < 55. (Chạy lại với dữ liệu thật ở 6.11.)
- **Kiểm chứng:** test `balance.slow.test.ts` khẳng định ngưỡng — loại khỏi `pnpm test` mặc định (`exclude` trong config sim), chạy bằng `pnpm --filter @pitch/sim test:slow`; ghi số FPS đo được vào `docs/PROGRESS.md`.
- **Xong khi:** đạt 3 tiêu chí ROADMAP GĐ5 → tick ROADMAP, cập nhật CLAUDE.md, PROGRESS.

### 5.14 — Hướng dẫn trận đầu (F14, Could) `[~]`
- Hoãn sang 7.6 (onboarding) để làm một lần cùng luồng người chơi mới.
