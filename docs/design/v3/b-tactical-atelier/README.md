# Hướng B — "Sa Bàn Hoàng Kim" (Editorial Luxury · Chế độ Sáng)

## Ý tưởng
Lấy cảm hứng từ ấn phẩm Matchday Programme cổ điển, sa bàn chiến thuật của huấn luyện viên trưởng và tủ trưng bày truyền thống câu lạc bộ. Hướng thiết kế này đảo hoàn toàn cực sáng tối so với "Sân đêm v2" bằng **nền giấy ngà ấm (`#f3efe6`)** kết hợp mực than chì (`#141816`), xanh lục bảo hoàng gia (`#0a6847`) và vàng đồng khắc (`#824f00`). Mặt thẻ cầu thủ vẫn giữ nền tối sâu đóng khung bát giác kim loại để đảm bảo hào quang độ hiếm nổi bật và chữ trên thẻ đạt tương phản cao.

## Điểm nhớ thị giác
**Khung Ấn Phẩm Viền Đôi & Dấu Thập Định Vị (Double-Rule Editorial Frame & Corner Crosshairs)**:
- Mỗi panel có viền kép mảnh (`1px` ngoài + đường chỉ phụ bên trong cách `5px`) và dấu thập định vị (`+`) ở góc như bản in chiến thuật cao cấp.
- Các tiêu đề lớn đánh số thứ tự biên tập (`01 // ĐÁ VỚI MÁY`, `02 // ĐỘI CỦA BẠN`).
- Thẻ cầu thủ dùng **dáng Bát Giác Cân Xứng** (vát đều cả 4 góc `12px`) kèm khung chỉ kim loại lồng bên trong như tấm huy chương/bảng tên sưu tầm.

## Bảng màu & Tỉ lệ tương phản (WCAG 2.1)

| Token | Hex | Vai trò | Tỉ lệ tương phản |
|---|---|---|---|
| `--c-bg` | `#f3efe6` | Nền giấy ngà chính (chế độ sáng) | — |
| `--c-surface-1` / `2` / `3` | `#faf8f3` / `#eae3d5` / `#ddd4c3` | Panel kem, khối phụ, nền thanh tiến độ | — |
| `--c-text` | `#141816` | Chữ chính (mực than chì) | **15.61:1** trên bg · **16.88:1** trên surface-1 · **14.03:1** trên surface-2 |
| `--c-text-muted` | `#4a524d` | Chữ phụ, chú thích | **7.02:1** trên bg · **6.31:1** trên surface-2 |
| `--c-text-faint` | `#636b65` | Gợi ý nhỏ trên nền giấy | **4.79:1** trên bg |
| `--c-accent` / `--c-accent-ink` | `#0a6847` / `#faf8f3` | Nút chính ("Đá ngay", "Lưu", "Mở miễn phí") | **6.42:1** (chữ ngà trên nền xanh lục bảo) |
| `--c-coin` | `#824f00` | Số xu & đồng vàng | **5.97:1** trên bg · **6.45:1** trên surface-1 · **5.36:1** trên surface-2 |
| `--c-danger` / `warning` / `success` / `info` | `#b51f1f` / `#9e4506` / `#0e7452` / `#1864ab` | Cảnh báo, thành công, thông tin | **6.22:1** / **5.98:1** / **5.44:1** / **5.74:1** trên surface-1 |
| `--c-card-ink` _(mới)_ | `#faf8f3` | Chữ trên mặt thẻ tối | **≥ 9.4:1** trên mọi màu mặt thẻ |
| **Đồng** (`base` / `hi` / `lo`) | `#ad6234` / `#f0b289` / `#29160a` | Thẻ Đồng (`◆`) | **9.42:1** (`hi` trên `lo`) |
| **Bạc** (`base` / `hi` / `lo`) | `#8b97a6` / `#ecf1f7` / `#1e242b` | Thẻ Bạc (`◆◆`) | **13.77:1** (`hi` trên `lo`) |
| **Vàng** (`base` / `hi` / `lo`) | `#d49b1a` / `#ffe58f` / `#2b1e04` | Thẻ Vàng (`◆◆◆`) | **13.07:1** (`hi` trên `lo`) |
| **Huyền thoại** (`base` / `hi` / `lo`) | `#7e42f5` / `#e6d4ff` / `#15092b` | Thẻ Huyền thoại (`◆◆◆◆`) | **13.77:1** (`hi` trên `lo`) |

## Font chữ (OFL, hỗ trợ tiếng Việt đầy đủ)
- **Hiển thị (`--font-display`)**: `Space Grotesk` (600, 700) — nét hình học tinh tế, hiện đại kiểu tạp chí kiến trúc/thể thao.
- **Nội dung (`--font-body`)**: `IBM Plex Sans` (400, 500, 600) — rõ ràng ở cỡ nhỏ, dấu tiếng Việt gọn gàng, hỗ trợ số `tabular-nums` chuẩn mực.

## Kiểu thành phần & Chuyển động
- **Nút bấm**: Góc gọn `4px`, nút chính xanh lục bảo `#0a6847` chữ kem `#faf8f3`, nút phụ viền kép màu đá ấm `#736856`.
- **Panel**: Nền kem `#faf8f3` trên nền giấy `#f3efe6`, phân cấp bằng viền mảnh + đường chỉ phụ bên trong thay cho bóng đổ nặng.
- **Thẻ cầu thủ**: Mặt tối vát bát giác đều 4 góc với đường viền chỉ vàng/bạc/tím lồng bên trong, nổi bật như thẻ sưu tầm vật lý đặt trên bàn giấy sáng.
- **Chuyển động & Mở thẻ**: Chuyển động đằm và trang trọng hơn (280–460ms); khi lật thẻ Huyền thoại, lớp nền phủ tối nhẹ làm nổi bật vầng hào quang tím và các hạt kim tuyến vàng đồng. Khi `prefers-reduced-motion: reduce`, tắt xoay/rung/hạt sáng và thay bằng fade 200ms.
