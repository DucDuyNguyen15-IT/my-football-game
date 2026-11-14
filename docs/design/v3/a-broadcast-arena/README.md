# Hướng A — "Sóng Cầu Trường" (Broadcast Esports)

## Ý tưởng
Lấy cảm hứng từ đồ hoạ truyền hình trực tiếp các giải bóng đá giờ vàng kết hợp sân khấu giải đấu Esports hiện đại. Nền xanh navy trường quay sâu thẳm (`#070b16`) làm bệ phóng cho sắc xanh băng điện tử (`#00e5ff`) ở các hành động chính và đỏ hồng phát sóng (`#ff2a5f`) ở nhãn trạng thái nóng. Bố cục giàu tương phản và nhịp độ nhanh giúp người chơi có cảm giác mỗi trận 7v7 hay mỗi lần xé gói thẻ đều đang lên sóng trực tiếp.

## Điểm nhớ thị giác
**Dải băng truyền hình & Góc cắt Tốc độ (Broadcast Lower-Thirds & Speed-Slash)**:
- Mỗi panel chính có thanh chỉ thị phát sáng dọc 4px ở cạnh trái và vát chéo góc dưới-phải `16px`.
- Tiêu đề mục đi kèm cụm sọc tốc độ nghiêng `-18deg` (`///`) đặc trưng của bảng tỉ số truyền hình.
- Thẻ cầu thủ dùng **dáng lục giác vát chéo đối xứng tâm** (vát mạnh góc trên-trái và dưới-phải `18px`), kết hợp dải băng đen ngang chứa tên cầu thủ giống thanh giới thiệu cầu thủ (lower-third) trên TV.

## Bảng màu & Tỉ lệ tương phản (WCAG 2.1)

| Token | Hex | Vai trò | Tỉ lệ tương phản |
|---|---|---|---|
| `--c-bg` | `#070b16` | Nền trường quay chính | — |
| `--c-surface-1` / `2` / `3` | `#0d1426` / `#141f38` / `#1d2c4f` | Panel, thẻ nổi, nền tương tác | — |
| `--c-text` | `#f0f5ff` | Chữ chính | **17.98:1** trên bg · **16.77:1** trên surface-1 · **14.97:1** trên surface-2 |
| `--c-text-muted` | `#9bb0d6` | Chữ phụ, chú thích | **8.96:1** trên bg · **7.46:1** trên surface-2 |
| `--c-text-faint` | `#6d84ad` | Gợi ý nhỏ trên nền chính | **5.20:1** trên bg |
| `--c-accent` / `--c-accent-ink` | `#00e5ff` / `#050912` | Nút chính ("Đá ngay", "Lưu", "Lật tất cả") | **12.95:1** (chữ tối trên nền cyan) |
| `--c-accent-alt` / `-ink` _(mới)_ | `#ff2a5f` / `#050912` | Nhãn "TRỰC TIẾP / HOT", sự kiện nóng | **5.02:1** chữ trên surface-1 · **5.45:1** chữ tối trên badge |
| `--c-coin` | `#ffd13b` | Số xu & vé thưởng | **13.51:1** trên bg |
| `--c-danger` / `warning` / `success` / `info` | `#ff3b5c` / `#ffb830` / `#00e676` / `#38b6ff` | Cảnh báo, thành công, thông tin | **5.27:1** / **10.61:1** / **10.99:1** / **8.12:1** trên surface-1 |
| **Đồng** (`base` / `hi` / `lo`) | `#c47442` / `#f5b58b` / `#2b160b` | Thẻ Đồng (`◆`) | **9.71:1** (`hi` trên `lo`) |
| **Bạc** (`base` / `hi` / `lo`) | `#94a8c4` / `#e6f0fa` / `#172030` | Thẻ Bạc (`◆◆`) | **14.16:1** (`hi` trên `lo`) |
| **Vàng** (`base` / `hi` / `lo`) | `#f0b429` / `#fff099` / `#2e2005` | Thẻ Vàng (`◆◆◆`) | **13.72:1** (`hi` trên `lo`) |
| **Huyền thoại** (`base` / `hi` / `lo`) | `#b84dff` / `#f0d6ff` / `#160829` | Thẻ Huyền thoại (`◆◆◆◆`) | **14.32:1** (`hi` trên `lo`) |

## Font chữ (OFL, hỗ trợ tiếng Việt đầy đủ)
- **Hiển thị (`--font-display`)**: `Oswald` (600, 700) — nét cao, dứt khoát kiểu bảng điện tử truyền hình, hiển thị OVR và tiêu đề rất bắt mắt.
- **Nội dung (`--font-body`)**: `Plus Jakarta Sans` (400, 500, 600, 700) — hình học hiện đại, dấu tiếng Việt tách bạch rõ ràng ở cỡ 12–16px.
- Toàn bộ số liệu (OVR, xu, vé, tỉ lệ, đồng hồ, chỉ số) bắt buộc áp dụng `font-variant-numeric: tabular-nums`.

## Kiểu thành phần & Chuyển động
- **Nút bấm**: Vát góc dưới-phải `10px`, nút chính phủ sắc `#00e5ff` kèm vệt sáng lướt ngang khi hover; nút xu dùng viền vàng `#ffd13b` nền tối ánh kim để phân biệt rõ với nút CTA chính.
- **Panel**: Thanh dọc phát sáng bên trái + khung tối có lưới quét mờ (scanline siêu mảnh) ở khu vực hero.
- **Thẻ cầu thủ**: Mặt thẻ tối chia 2 vùng rõ rệt: vùng trên chứa OVR, vị trí và avatar trên nền lưới tia phát sóng; dải băng đen ở 2/3 chiều cao chứa tên cầu thủ in hoa; vùng dưới là 6 chỉ số đều nhau. Huyền thoại có viền `conic-gradient` xoay liên tục.
- **Chuyển động & Mở thẻ**: Thẻ bay ra từ hộp kiểu đồ hoạ broadcast trượt ngang, thẻ Vàng/Huyền thoại có luồng sáng strobe + vòng sóng radar bung ra sau khi xoay 3D (`WAAPI`). Khi `prefers-reduced-motion: reduce`, tắt mọi xoay/nhấp nháy/tia sáng, chỉ còn fade ≤ 200ms.
