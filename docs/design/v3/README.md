# Thiết kế giao diện v3 ("Bộ áo mới") — MFG 7v7

Tài liệu đề xuất **3 hướng thiết kế hoàn chỉnh và độc lập** cho game bóng đá 7v7 & thẻ cầu thủ MFG (tiền đề cho bước chuyển đổi giao diện chính ở bước 2). Cả 3 hướng đều giữ nguyên hệ thống tên biến của `apps/web/src/styles/tokens.css`, toàn bộ chữ tiếng Việt (chỉ giữ `GK/DF/MF/FW` và `PAC/SHO/PAS/DRI/DEF/STA`), phân cấp 4 độ hiếm (`Đồng ◆ < Bạc ◆◆ < Vàng ◆◆◆ < Huyền thoại ◆◆◆◆`), số liệu `tabular-nums`, dữ liệu cầu thủ hư cấu và `prefers-reduced-motion: reduce`.

---

## Bảng so sánh 3 hướng thiết kế

| Tiêu chí | Hướng A — **Sóng Cầu Trường** (`Broadcast Esports`) | Hướng B — **Sa Bàn Hoàng Kim** (`Editorial Luxury · Light`) | Hướng C — **Lồng Sắt Đường Phố** (`Street Cage Brutalist`) |
|---|---|---|---|
| **Thư mục** | [`a-broadcast-arena/`](a-broadcast-arena/README.md) | [`b-tactical-atelier/`](b-tactical-atelier/README.md) | [`c-street-cage/`](c-street-cage/README.md) |
| **Cảm xúc chủ đạo** | Truyền hình thể thao giờ vàng + sân khấu giải đấu Esports: kịch tính, tốc độ cao, phát sóng trực tiếp (`TRỰC TIẾP`, tia cyan `#00e5ff` & đỏ phát sóng `#ff2a5f`). | Ấn phẩm Matchday Programme & sa bàn chiến thuật cao cấp: điềm tĩnh, tinh xảo, cảm giác sưu tầm thẻ quý đặt trên bàn giấy ngà ấm (`#f3efe6`) và nỉ xanh lục bảo (`#0a6847`). | Bóng đá lồng sắt / futsal đường phố dưới đèn cao áp: gai góc, cơ khí, bấm nút lún thực (`4px 4px 0 #080706`), cam lửa (`#ff5917`) & vàng tia lửa (`#ffd000`). |
| **Điểm nhớ thị giác (Visual anchor)** | Dải băng giới thiệu cầu thủ (*lower-third*) trên thẻ **Lục giác vát chéo đối xứng tâm**, sọc tốc độ `-18deg` (`///`) và thanh phát sáng cạnh trái panel. | Khung ấn phẩm **viền kép + dấu thập định vị (`+`)**, tiêu đề đánh số `01 // ...`, thẻ **Bát giác cân xứng** lồng viền kim loại trên nền bàn nỉ xanh. | Bóng cứng không nhoè (`box-shadow: 4px 4px 0 #080706`), dải băng sọc cảnh báo công trường, sân bê tông **lưới mắt cáo**, thẻ **Dog-Tag có rãnh khuyết hai hông**. |
| **Bảng màu & Font OFL** | Nền navy `#070b16`, chữ `#f0f5ff`, cyan `#00e5ff`, đỏ `#ff2a5f`, vàng xu `#ffd13b`.<br>`Oswald` + `Plus Jakarta Sans` | Nền giấy ngà `#f3efe6`, kem `#faf8f3`, mực than `#141816`, lục bảo `#0a6847`, đồng `#824f00`.<br>`Space Grotesk` + `IBM Plex Sans` | Nền nhựa đường `#121110`, bê tông `#1c1a18`, chữ `#f7f3eb`, cam `#ff5917`, vàng `#ffd000`.<br>`Chakra Petch` + `Lexend` |
| **Độ khó khi áp vào code hiện tại** | **Thấp – Trung bình.** Kế thừa trực tiếp khung `clip-path` của `ui.css` & `card.css`; giữ nền tối nên không xung đột khi chuyển cảnh vào trận 3D. Chỉ cần thay `tokens.css`, thêm dải băng lower-third thẻ và tuỳ biến nhịp WAAPI ở `PackOpeningStage.tsx`. | **Cao.** Đảo cực sáng–tối cho toàn bộ màn ngoài trận nhưng phải giữ mặt thẻ tối (`--c-card-ink`) và nỉ xanh ở sân/bàn mở thẻ; cần cập nhật nhiều rule CSS đang giả định nền tối (`ui.css`, badge, modal, chuyển cảnh sang canvas 3D). | **Trung bình.** Đổi `clip-path` vát cạnh sang khung vuông viền dày `2px` + bóng cứng (lưu ý `box-shadow` bị cắt nếu dùng chung `clip-path` nên cần tách lớp khung với panel), thay bề mặt sân sang lưới bê tông. |
| **Rủi ro tương phản & đọc số** | **Rất thấp.** Chữ chính đạt **17.98:1** (`bg`), **16.77:1** (`surface-1`); chữ tối trên nút cyan đạt **12.95:1**; chữ nhỏ trên thẻ `hi/lo` đạt **9.71:1–14.32:1**. Lưu ý duy nhất: tránh đặt chữ trắng lên cyan `#00e5ff` — luôn dùng `#050912`. | **Trung bình — đã kiểm soát.** Màu sáng dễ trượt tương phản ở vàng xu/cảnh báo: phải neo `--c-coin: #824f00` (**5.97:1**), `--c-warning: #9e4506` (**5.98:1** trên surface-1), `--c-danger: #b51f1f` (**6.22:1**), chữ chính **15.61:1**, thẻ tối **≥ 9.42:1**. Khi mở rộng ở bước 2 cần kiểm tra kỹ nhãn nhỏ. | **Thấp – Trung bình.** Chữ chính **17.04:1**, vàng `#ffd000` đạt **12.82:1**. Rủi ro chính nằm ở nút cam `--c-accent: #ff5917`: chữ trắng trên nền cam sẽ dưới ngưỡng 4.5:1, bắt buộc dùng chữ tối `#121110` (**6.01:1**) và bảng tỉ lệ hộp thẻ cần đủ chiều rộng cho `◆◆◆◆ Huyền thoại`. |

---

## Tài liệu & Prototype tương tác (1440×900)

- **Hướng A — Sóng Cầu Trường**: [README](a-broadcast-arena/README.md) · [tokens.css](a-broadcast-arena/tokens.css) · [Trang chủ](a-broadcast-arena/home.html) · [Cửa hàng & Mở thẻ](a-broadcast-arena/shop.html) · [Đội hình](a-broadcast-arena/squad.html) · Preview: [Home](a-broadcast-arena/preview-home.png) / [Shop](a-broadcast-arena/preview-shop.png) / [Squad](a-broadcast-arena/preview-squad.png)
- **Hướng B — Sa Bàn Hoàng Kim**: [README](b-tactical-atelier/README.md) · [tokens.css](b-tactical-atelier/tokens.css) · [Trang chủ](b-tactical-atelier/home.html) · [Cửa hàng & Mở thẻ](b-tactical-atelier/shop.html) · [Đội hình](b-tactical-atelier/squad.html) · Preview: [Home](b-tactical-atelier/preview-home.png) / [Shop](b-tactical-atelier/preview-shop.png) / [Squad](b-tactical-atelier/preview-squad.png)
- **Hướng C — Lồng Sắt Đường Phố**: [README](c-street-cage/README.md) · [tokens.css](c-street-cage/tokens.css) · [Trang chủ](c-street-cage/home.html) · [Cửa hàng & Mở thẻ](c-street-cage/shop.html) · [Đội hình](c-street-cage/squad.html) · Preview: [Home](c-street-cage/preview-home.png) / [Shop](c-street-cage/preview-shop.png) / [Squad](c-street-cage/preview-squad.png)

---

## Khuyến nghị chọn hướng chính cho Bước 2

**Đề xuất chọn Hướng A — "Sóng Cầu Trường" (`Broadcast Esports`) làm hướng triển khai chính**, vì 4 lý do thực tế khi đưa vào ứng dụng `apps/web`:

1. **Nhận diện "lột xác" rõ rệt nhưng không đứt gãy trận 3D:** Biến màn hình quản lý thành bảng đồ hoạ phát sóng bóng đá trực tiếp giờ vàng (`Oswald` + sọc tốc độ `///` + lower-third + radar sân đấu) với ấn tượng thị giác mạnh ngay lập tức, đồng thời giữ trường nhìn tối giúp chuyển cảnh từ `Đá ngay` vào sân 3D không bị chói gắt.
2. **Độ tương phản và tốc độ quét số cao nhất:** Nền navy `#070b16` + cyan `#00e5ff` cho phép người chơi đọc OVR, 6 chỉ số thẻ, thanh tỉ lệ hộp 100 phiếu và cảnh báo sai vị trí `−15%` trong tích tắc ở cả 1280px lẫn 1920px mà không có điểm yếu tương phản.
3. **Chi phí triển khai vào code gọn và ít rủi ro nhất:** Cấu trúc `clip-path`, hệ token màu/chữ/motion trong `tokens.css` map 1-1 với `apps/web/src/styles/tokens.css`, chỉ cần mở rộng thêm 2 màu nhấn phụ (`--c-accent-alt`, `--c-accent-alt-ink`) và góc sọc `--slash-angle` để áp đồng bộ lên `HomePage`, `ShopPage`, `PackOpeningStage`, `SquadPage` và HUD trận đấu.
4. **Hiệu ứng mở gói có chiều sâu sân khấu rõ ràng:** Nhịp `Lật từng thẻ / Lật tất cả` kết hợp ánh tím cảnh báo Huyền thoại (`SÁNG TÍM · HUYỀN THOẠI!`) và vòng sóng radar khớp hoàn hảo với kiến trúc WAAPI sẵn có của `PackOpeningStage`.

> **Khi nào cân nhắc 2 hướng còn lại:**
> - Chọn **Hướng B ("Sa Bàn Hoàng Kim")** nếu muốn sản phẩm tách khỏi 100% các game bóng đá nền tối trên thị trường bằng chất ấn phẩm cao cấp ban ngày; cần dự trù công tinh chỉnh riêng bộ token sáng và lớp chuyển cảnh vào trận.
> - Chọn **Hướng C ("Lồng Sắt Đường Phố")** nếu muốn định vị cá tính bóng đá lồng sắt đường phố đậm chất trẻ, nổi loạn; rất hợp nếu sau này thêm chủ đề sân bê tông 7v7 đồng bộ trong engine trận đấu.
