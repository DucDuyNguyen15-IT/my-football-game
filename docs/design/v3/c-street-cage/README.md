# Hướng C — "Lồng Sắt Đường Phố" (Street Cage Brutalist)

## Ý tưởng
Lấy cảm hứng từ văn hoá bóng đá lồng sắt đường phố 7v7 (Street Cage / Futsal bê tông) dưới ánh đèn cao áp vàng cam. Thay vì sân cỏ truyền thống, giao diện đặt trên nền nhựa đường tối (`#121110`) và bê tông xám ấm (`#1c1a18`), bùng nổ với cam lửa sơn xịt (`#ff5917`) và vàng tia lửa (`#ffd000`). Phong cách Neo-Brutalist kết hợp cơ khí sắc cạnh tạo ra cảm giác gai góc, trẻ trung và cá tính khác biệt hoàn toàn.

## Điểm nhớ thị giác
**Bóng Cứng Brutalist & Thẻ Bài Stencil Lồng Sắt (Brutalist Hard-Shadow & Cage Dog-Tag)**:
- Mọi panel và nút bấm chính có viền dày `2px` kèm bóng cứng không nhoè (`4px 4px 0 #080706`), khi bấm nút sẽ lún xuống đúng `2px` tạo cảm giác cơ khí đã tay.
- Mặt sân là bê tông xám phủ hoạ tiết **lưới mắt cáo lồng sắt** và vạch sơn kem thô.
- Thẻ cầu thủ mang dáng **Thẻ Bài Công Nghiệp (Dog-Tag)**: vát sâu một góc trên-phải `18px` kết hợp **hai khuyết rãnh neo đối xứng ở hai cạnh hông**.

## Bảng màu & Tỉ lệ tương phản (WCAG 2.1)

| Token | Hex | Vai trò | Tỉ lệ tương phản |
|---|---|---|---|
| `--c-bg` | `#121110` | Nền nhựa đường | — |
| `--c-surface-1` / `2` / `3` | `#1c1a18` / `#262320` / `#332f2a` | Bề mặt bê tông phân cấp | — |
| `--c-text` | `#f7f3eb` | Chữ chính (sơn kem) | **17.04:1** trên bg · **15.68:1** trên surface-1 · **14.12:1** trên surface-2 |
| `--c-text-muted` | `#b5aba0` | Chữ phụ | **8.35:1** trên bg · **6.92:1** trên surface-2 |
| `--c-text-faint` | `#877e74` | Gợi ý nhỏ trên nền nhựa đường | **4.73:1** trên bg |
| `--c-accent` / `--c-accent-ink` | `#ff5917` / `#121110` | Nút chính ("Đá ngay", "Lưu", "Mở miễn phí") | **6.01:1** (chữ đen trên nền cam lửa) |
| `--c-coin` | `#ffd000` | Xu & tia cảnh báo vàng | **12.82:1** trên bg |
| `--c-danger` / `warning` / `success` / `info` | `#ff4242` / `#ffd000` / `#2ee59d` / `#38c8ff` | Cảnh báo, thành công, thông tin | **5.05:1** / **11.79:1** / **10.58:1** / **8.98:1** trên surface-1 |
| **Đồng** (`base` / `hi` / `lo`) | `#c86d3b` / `#f7b48d` / `#2b170c` | Thẻ Đồng (`◆`) | **9.64:1** (`hi` trên `lo`) |
| **Bạc** (`base` / `hi` / `lo`) | `#a3b1bf` / `#edf3f8` / `#20252b` | Thẻ Bạc (`◆◆`) | **13.80:1** (`hi` trên `lo`) |
| **Vàng** (`base` / `hi` / `lo`) | `#f5b81d` / `#fff094` / `#2e2104` | Thẻ Vàng (`◆◆◆`) | **13.59:1** (`hi` trên `lo`) |
| **Huyền thoại** (`base` / `hi` / `lo`) | `#b05cff` / `#ebd6ff` / `#190a29` | Thẻ Huyền thoại (`◆◆◆◆`) | **13.96:1** (`hi` trên `lo`) |

## Font chữ (OFL, hỗ trợ tiếng Việt đầy đủ)
- **Hiển thị (`--font-display`)**: `Chakra Petch` (600, 700) — nét vát góc cơ khí chuẩn phong cách đường phố/esports, hiển thị OVR và tiêu đề stencil rất mạnh mẽ.
- **Nội dung (`--font-body`)**: `Lexend` (400, 500, 600) — thiết kế tối ưu tốc độ đọc và nhận diện ký tự tiếng Việt, cực kỳ rõ ràng ở cỡ 13–15px.

## Kiểu thành phần & Chuyển động
- **Nút bấm**: Không bo góc (`0px`), viền `2px` đen/sáng kèm bóng cứng lệch `3px 3px 0 #080706`, hover/active dịch chuyển thực `translate(2px, 2px)` triệt tiêu bóng.
- **Panel**: Vuông vức viền dày `2px`, thanh tiêu đề bọc nền bê tông sọc chéo cảnh báo công trường ở khối hot.
- **Thẻ cầu thủ**: Dáng thẻ bài Dog-Tag có rãnh khuyết hai bên hông, chữ stencil in hoa đậm, dải nhãn độ hiếm đặt ở chân thẻ.
- **Chuyển động & Mở thẻ**: Bật nảy cơ khí dứt khoát (`cubic-bezier(0.36, 1.65, 0.62, 1)`), thẻ Huyền thoại rung mạnh như va lồng sắt rồi bùng các mảnh sơn vuông góc. Khi `prefers-reduced-motion: reduce`, chuyển về fade ≤ 200ms không rung/xoay.
