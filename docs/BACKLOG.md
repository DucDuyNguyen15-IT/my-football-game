# Backlog — ý tưởng ngoài phạm vi giai đoạn hiện tại

Ghi ý tưởng vào đây thay vì làm ngay. Xem xét lại khi lập kế hoạch giai đoạn tiếp theo.

| Ý tưởng | Ghi bởi | Giai đoạn phát sinh | Ghi chú |
|---|---|---|---|
| PvP thời gian thực (netcode server authoritative) | Agent | 1 | Phương án C; cân nhắc ở Giai đoạn 7, ưu tiên PvP bất đồng bộ trước |
| Chợ chuyển nhượng giữa người chơi | Agent | 1 | Phương án C; cần phí chợ chống lạm phát |
| Xếp hạng mùa | Agent | 1 | Phương án C |
| Điều khiển cảm ứng/mobile, tay cầm | Agent | 2 | PRD §4.2, sau PvP bất đồng bộ và chợ |
| CLB/quốc tịch hư cấu + bonus "team color" | Agent | 2 | PRD §4.2 |
| Xác minh trận vs máy bằng log input (server mô phỏng lại) | Agent | 2 | Câu hỏi mở PRD §12; chống gian lận thưởng |
| Tất định giữa các engine JS (V8/JSC/SpiderMonkey): bỏ `Math.cos/log/sin` khỏi đường state của sim (VD `nextGaussian` dùng Box–Muller) hoặc thay bằng bảng tra / xấp xỉ thuần số học; thêm test golden-hash N tick | Agent | 5 | Chỉ cần khi server mô phỏng lại trận (dòng trên) hoặc PvP. Phát hiện khi review task 5.1 |
| Test vật lý bóng bổ sung: vạch -y/-x, qua góc sân cùng bước con, bóng sát mép trong cột, kẹp lưới hông/nóc, chuẩn hoá -0 trong state | Agent | 5 | Review task 5.2 (MEDIUM/LOW) |
| Cầu thủ (`physics/player.ts`): `separatePlayers` chỉ một lượt (cụm ≥ 3 người có thể còn chồng) → lặp số lượt cố định khi nối vào `step`; state NaN (`stamina`/`vel`) không được làm sạch; ~5 tick đầu khi tăng tốc vẫn tính là "đứng yên" (hồi thể lực); `facing` có thể giật khi tốc độ ~0; gia tốc chưa chịu `fatigueFactor` | Agent | 5 | Review task 5.3 (MEDIUM/LOW). Làm ở 5.4/5.7 khi nối vào `step`, cân chỉnh ở 5.13 |
| Kiểm soát bóng (5.4): giữ K từ trước khi nhận bóng thì nạp lực ngay, thả ra là sút (nên chỉ nạp khi bấm K lúc đã có bóng); `kickLock` chỉ khoá 1 người, bị ghi đè ở cú chạm tiếp theo; bóng dính chân nhảy từ trước ra sau khi `facing` lật lúc đảo chiều chậm (< 4 m/s); đảo chiều khi đang chạy ≥ 4 m/s luôn mất bóng kể cả Rê 99; sút bỏ qua cản gió khi tính độ cao | Agent | 5 | Review task 5.4 (LOW). Cân nhắc ở 5.8a (AI dùng chung action) và cân chỉnh ở 5.13 |
| Luật (5.5): sau bàn thắng chưa có quãng ăn mừng — cầu thủ về vị trí giao bóng ngay tick đó; HUD 5.10 có thể thêm hiệu ứng/độ trễ hiển thị | Agent | 5 | Cân nhắc ở 5.10 |
| Luật (5.5): đội máy thực hiện bóng chết bằng quy tắc tạm (`cpuRestartKick`: giao bóng chuyền về sau, góc/phát bóng chuyền bổng, ném biên chuyền thấp theo hướng mặt) | Agent | 5 | Thay bằng quyết định của AI ở 5.7/5.8a |
| Luật (5.5): bù giờ chốt lúc công bố (45'/90'), bóng chết trong lúc bù giờ không cộng thêm; ném biên được thực hiện như chuyền bằng chân (cùng tầm/lực) | Agent | 5 | Đơn giản hoá có chủ ý; xem lại khi cân chỉnh 5.13 |
| Cảm giác chơi (người dùng chơi thử 5.9): sút khó vào; bóng chuyền/sút lăn ngang qua cầu thủ là bị "dính" lại ngay (`findCapturer` bắt bóng bất kể tốc độ/độ cao — cân nhắc tỉ lệ khống chế theo tốc độ bóng + chỉ số, bóng nhanh/bổng có thể lọt qua); xoạc (A) khó giành bóng và hiếm khi thấy phạm lỗi | Người dùng | 5 | Cân chỉnh ở 5.13 (hằng số `stats/params.ts`, `actions/tackle.ts`) |
| Thanh lực cho chuyền S/A (giữ để tăng lực chuyền) như FC Online — hiện sim chỉ nạp lực cho sút D | Người dùng | 5 | Cần đổi sim (`PlayerInput`/`actions/pass.ts`); thanh lực sút D đã có trong HUD 5.10 (DESIGN §6.2). Cân nhắc khi lập kế hoạch sau 5.10 |
| Hoạt ảnh xoạc phạm lỗi: sim chuyển sang bóng chết và dời cầu thủ về vị trí đá phạt ngay tick phạm lỗi, nên clip xoạc/ngã phát ở chỗ mới — cân nhắc quãng dừng ngắn (~1 s) trước khi xếp lại vị trí | Agent | 5 | Cùng chỗ với quãng ăn mừng bàn thắng (5.5) |
| Clip đi bộ: Soccer Game Pack chỉ có `jog`; `pnpm assets` tự nhận `walking.fbx` (Y Bot, bỏ "In Place") trong `assets-src/mixamo/` nếu có (`Running.fbx` đã có) | Người dùng | 5 | Người dùng tải từ Mixamo |
| Dòng sự kiện bằng chữ kiểu bình luận viên (bàn thắng, thẻ, cứu thua…) | Người dùng | 5 | Người dùng · 2026-10-25 |
| Thống kê sau trận: kiểm soát bóng, cú sút, bản đồ nhiệt | Người dùng | 5 | Người dùng · 2026-10-25; sim cần ghi thêm số liệu theo tick |
| Lưu highlight và chọn góc camera khi phát lại | Người dùng | 5 | Người dùng · 2026-10-25; mở rộng `render/replay.ts` |
| Ăn mừng bàn thắng theo thẻ cầu thủ | Người dùng | 5 | Người dùng · 2026-10-25; cần hoạt ảnh Mixamo riêng |
| Tuỳ chọn tốc độ trận (độ dài hiệp / tốc độ mô phỏng) | Người dùng | 5 | Người dùng · 2026-10-25 |
