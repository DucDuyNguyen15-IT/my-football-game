# Dự án: Game bóng đá web (kiểu FC Online)

Game bóng đá chơi trên trình duyệt: điều khiển trận đấu + sưu tầm/mở thẻ cầu thủ (gacha) + xây đội hình.

## Trạng thái hiện tại
- **Giai đoạn đang làm:** 1 — Nghiên cứu & ý tưởng
- **Việc tiếp theo:** xem mục "Giai đoạn 1" trong `docs/ROADMAP.md`
- Cập nhật 2 dòng trên mỗi khi xong một giai đoạn.

## Quy tắc cho agent (đọc kỹ, không cần nhắc lại)
1. Trước khi làm, đọc **chỉ mục giai đoạn hiện tại** trong `docs/ROADMAP.md`, không đọc cả file nếu không cần.
2. Chỉ làm trong phạm vi giai đoạn hiện tại. Ý tưởng ngoài phạm vi → ghi vào `docs/BACKLOG.md`, không tự làm.
3. Quyết định kỹ thuật quan trọng → ghi ADR vào `docs/adr/` (dùng skill `ecc:architecture-decision-records`). Đã có ADR thì tuân theo, không bàn lại.
4. Spec gốc là `docs/PRD.md`. Mâu thuẫn giữa code và PRD → hỏi người dùng, không tự đoán.
5. Kết thúc giai đoạn: tick checklist "Hoàn thành khi" trong ROADMAP, cập nhật "Trạng thái hiện tại" ở trên, ghi tóm tắt 3–5 dòng vào `docs/PROGRESS.md`.
6. Trả lời người dùng bằng tiếng Việt, ngắn gọn.

## Ràng buộc cố định
- **Không dùng tên/ảnh cầu thủ thật, logo CLB, thương hiệu FIFA/EA** — dùng dữ liệu hư cấu.
- **Gacha chỉ dùng tiền ảo trong game**, không tích hợp thanh toán thật.
- **Mọi logic quan trọng chạy ở server:** tỉ lệ rơi thẻ, cộng/trừ tiền, kết quả trận PvP. Client không được tự quyết định.

## Tech stack
_(Điền sau Giai đoạn 2 — link tới ADR tương ứng)_

## Lệnh thường dùng
_(Điền sau Giai đoạn 3 — dev, test, build)_
