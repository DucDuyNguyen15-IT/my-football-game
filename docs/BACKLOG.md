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
| Vật lý bóng: bóng qua vạch cuối **trên xà** rồi rơi xuống dưới 2 m trong dải 0–R sau vạch vẫn bị tính `goal`; nên xét "dưới xà" tại lúc tâm bóng qua x = ±HALF_LENGTH | Agent | 5 | Review task 5.2 (MEDIUM, ca hiếm). Làm cùng 5.4/5.5 |
| Test vật lý bóng bổ sung: vạch -y/-x, qua góc sân cùng bước con, bóng sát mép trong cột, kẹp lưới hông/nóc, chuẩn hoá -0 trong state | Agent | 5 | Review task 5.2 (MEDIUM/LOW) |
| Cầu thủ (`physics/player.ts`): `separatePlayers` chỉ một lượt (cụm ≥ 3 người có thể còn chồng) → lặp số lượt cố định khi nối vào `step`; state NaN (`stamina`/`vel`) không được làm sạch; ~5 tick đầu khi tăng tốc vẫn tính là "đứng yên" (hồi thể lực); `facing` có thể giật khi tốc độ ~0; gia tốc chưa chịu `fatigueFactor` | Agent | 5 | Review task 5.3 (MEDIUM/LOW). Làm ở 5.4/5.7 khi nối vào `step`, cân chỉnh ở 5.13 |
| Kiểm soát bóng (5.4): giữ K từ trước khi nhận bóng thì nạp lực ngay, thả ra là sút (nên chỉ nạp khi bấm K lúc đã có bóng); `kickLock` chỉ khoá 1 người, bị ghi đè ở cú chạm tiếp theo; bóng dính chân nhảy từ trước ra sau khi `facing` lật lúc đảo chiều chậm (< 4 m/s); đảo chiều khi đang chạy ≥ 4 m/s luôn mất bóng kể cả Rê 99; sút bỏ qua cản gió khi tính độ cao | Agent | 5 | Review task 5.4 (LOW). Cân nhắc ở 5.8a (AI dùng chung action) và cân chỉnh ở 5.13 |
| Luật (5.5): sau bàn thắng chưa có quãng ăn mừng — cầu thủ về vị trí giao bóng ngay tick đó; HUD 5.10 có thể thêm hiệu ứng/độ trễ hiển thị | Agent | 5 | Cân nhắc ở 5.10 |
| Luật (5.5): đội máy thực hiện bóng chết bằng quy tắc tạm (`cpuRestartKick`: giao bóng chuyền về sau, góc/phát bóng chuyền bổng, ném biên chuyền thấp theo hướng mặt) | Agent | 5 | Thay bằng quyết định của AI ở 5.7/5.8a |
| Luật (5.5): bù giờ chốt lúc công bố (45'/90'), bóng chết trong lúc bù giờ không cộng thêm; ném biên được thực hiện như chuyền bằng chân (cùng tầm/lực) | Agent | 5 | Đơn giản hoá có chủ ý; xem lại khi cân chỉnh 5.13 |
