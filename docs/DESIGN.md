# DESIGN.md — Phong cách, design tokens, phác thảo màn hình

Nguồn spec: `docs/PRD.md`. Token chạy thật: [`apps/web/src/styles/tokens.css`](../apps/web/src/styles/tokens.css), bản JSON cho Phaser: [`docs/design/design-tokens.json`](design/design-tokens.json). Prototype màn mở thẻ: [`docs/design/prototypes/pack-opening.html`](design/prototypes/pack-opening.html). Cách làm animation lật thẻ: [ADR-0008](adr/0008-card-reveal-css-waapi.md). Prototype đã được duyệt ngày 2026-10-10.

## 1. Hướng thiết kế

| | |
|---|---|
| **Mục đích** | Vòng lặp 15 phút: mở gói → xếp đội → đá. Mỗi màn phải cho người chơi thấy ngay việc tiếp theo |
| **Người chơi** | Fan FC Online chơi casual, đã quen thẻ/độ hiếm/OVR. Cần đọc nhanh: OVR, vị trí, độ hiếm, xu |
| **Giọng điệu** | **"Sân đêm"**: sân bóng dưới đèn pha. Nền xanh đen như sân lúc tối, chữ trắng phấn như vạch kẻ sân, nút chính màu chanh. Gọn và chắc, không bóng bẩy |
| **Điểm nhớ** | **Vạch phấn**: các đường kẻ sân (vòng tròn giữa sân, vạch giữa, vòng cấm) được dùng làm cấu trúc UI: đường phân cách, khung sân khấu mở thẻ, ô xếp đội. Thẻ cầu thủ có **góc vát** (trên-phải, dưới-trái) giống mác áo đấu, khác hẳn hình khiên của FUT |
| **Ràng buộc** | Không dùng tên/logo/ảnh thật, không có hình khiên thẻ kiểu FUT. Desktop trước (≥ 1280×720 khi đá; các màn menu dùng được từ 768px). Mobile/cảm ứng nằm trong BACKLOG |

**Không làm:** gradient tím-xanh làm nền chung (màu tím chỉ dành cho thẻ Huyền thoại), glassmorphism, blob trang trí, card lồng card, hero marketing.

**Chỉ có giao diện tối.** Game chơi trong "sân đêm", các màu độ hiếm và hào quang cần nền tối mới nổi. Không làm chế độ sáng.

## 2. Font

| Vai trò | Font | Dùng cho |
|---|---|---|
| Hiển thị | **Barlow Condensed** 600/700 | OVR, tỉ số, đồng hồ, tiêu đề, nhãn viết hoa, giá xu. Font hẹp kiểu bảng tỉ số sân vận động, chữ số rõ |
| Nội dung | **Be Vietnam Pro** 400/500/600 | Văn bản, nút, form, tên cầu thủ. Thiết kế cho tiếng Việt nên dấu không đè lên nhau |

- Cả hai font đều giấy phép OFL và hỗ trợ tiếng Việt. Ở GĐ6 sẽ **tự host** qua `@fontsource/*`, không gọi Google Fonts ở bản chạy thật (nhanh hơn, không lộ IP người chơi). Prototype tạm dùng Google Fonts.
- Số luôn dùng `font-variant-numeric: tabular-nums` để đồng hồ và xu không bị nhảy khi giá trị đổi.
- Thang cỡ chữ: 12 / 14 / 16 / 20 / 28 / 40 / 64 px. Văn bản tối thiểu 14px, nhãn phụ 12px chỉ dùng cho chữ in hoa có giãn chữ (`--tracking-caps`).

## 3. Bảng màu

### 3.1 Màu nền và giao diện

| Token | Hex | Dùng cho | Tương phản |
|---|---|---|---|
| `--c-bg` | `#0a1310` | Nền trang | — |
| `--c-surface-1/2/3` | `#111d18` / `#182822` / `#213530` | Panel, hover, panel nổi | — |
| `--c-line` | `#2a3d35` | Đường kẻ phấn mờ, viền | — |
| `--c-text` | `#edf2ec` | Chữ chính | 16.6:1 trên bg |
| `--c-text-muted` | `#9db0a6` | Chữ phụ | 8.3:1 trên bg, 6.7:1 trên surface-2 |
| `--c-text-faint` | `#71857c` | Gợi ý, placeholder | 4.8:1 trên bg. **Không dùng trên surface-2/3** (3.9:1) |
| `--c-accent` | `#c8f031` | Nút chính ("Mở gói", "Đá"), lựa chọn đang bật | chữ `--c-accent-ink` trên nền chanh: 14.3:1 |
| `--c-danger` | `#ff5a4e` | Thẻ đỏ, sai vị trí, lỗi | 6.1:1 |
| `--c-warning` | `#ffc23d` | Thẻ vàng, cảnh báo hộp chỉ còn Đồng | |
| `--c-success` / `--c-info` | `#3dd68c` / `#5cc8ff` | Thành công / thông tin, viền focus | |
| `--c-coin` | `#f2b33d` | Icon xu và số xu | |

**Màu đội trên sân:** nhà `#3fa9f5` (xanh dương), khách `#ff7a45` (cam). Chọn cặp xanh dương/cam vì người mù màu đỏ-lục vẫn phân biệt được. Mặt sân là 2 sọc `#1d6436` / `#226f3c`, vạch sân `#e8f0e6`.

### 3.2 Màu theo độ hiếm (chốt PRD §6.1)

Mặt thẻ luôn tối (`lo`) và khung có màu (`base`). Nhờ vậy chữ trên thẻ luôn sáng, mọi độ hiếm đều đạt tương phản ≥ 7:1.

| Độ hiếm | base (khung) | hi (OVR, viền sáng) | lo (mặt thẻ) | Ký hiệu phụ | Hiệu ứng mặt thẻ |
|---|---|---|---|---|---|
| **Đồng** | `#b87040` | `#ebaa78` | `#3a1f10` | ◆ (1 hạt) | Khung trơn |
| **Bạc** | `#aeb7c2` | `#eef2f6` | `#262c33` | ◆◆ | Khung có sọc chéo mảnh |
| **Vàng** | `#e0ae2e` | `#ffe48a` | `#3a2a06` | ◆◆◆ | Khung đôi + vệt sáng lướt qua khi hover |
| **Huyền thoại** | `#9b6bff` | `#d9c2ff` | `#120a20` | ◆◆◆◆ | Khung ánh nhiều màu (foil conic: tím → ngọc → hồng → vàng), luôn chuyển động chậm |

**Không chỉ dựa vào màu** (WCAG 1.4.1): mỗi thẻ có **nhãn chữ** độ hiếm, **số hạt ◆** và **kiểu khung** riêng, nên người mù màu vẫn phân biệt được.

### 3.3 Khoảng cách, bo góc, bóng

- Khoảng cách theo bước 4px: `--sp-1..8` = 4, 8, 12, 16, 24, 32, 48, 64.
- Bo góc nhỏ (2 / 4 / 8px) cho cảm giác thể thao, cứng cáp. Thẻ cầu thủ không bo góc mà **vát góc** `--card-notch: 14px` (`clip-path`).
- Bóng đổ chỉ có 2 mức (`--shadow-1/2`). Lớp z: HUD 10, overlay 100, modal 200, toast 300.

## 4. Thành phần dùng chung

| Thành phần | Mô tả |
|---|---|
| **`<CardView>`** | 3 cỡ: lg 220px (mở thẻ, chi tiết), md 150px (kho), sm 96px (ô đội hình). Từ trên xuống: OVR + vị trí (góc trên-trái), ảnh đại diện, tên, biệt danh, hạt độ hiếm. Cỡ lg/md có thêm 6 chỉ số dạng `PAC 88`. Cấp ép `+3` là huy hiệu ở góc dưới-phải. Tỉ lệ khung 5:7 |
| **Viết tắt vị trí & chỉ số** | Dùng **tiếng Anh**, giống FC Online mà người chơi đã quen, và tránh các từ viết tắt tiếng Việt dễ thành từ xấu. Vị trí: **GK** Thủ môn · **DF** Hậu vệ · **MF** Tiền vệ · **FW** Tiền đạo. Chỉ số cầu thủ ngoài sân: **PAC** Tốc độ · **SHO** Sút · **PAS** Chuyền · **DRI** Rê bóng · **DEF** Phòng ngự · **STA** Thể lực. Thủ môn: **REF** Phản xạ · **HAN** Bắt bóng · **POS** Vị trí · **KIC** Phát bóng · **STA** Thể lực. Tên đầy đủ tiếng Việt hiện ở tooltip, panel chi tiết và `aria-label`. Câu chữ còn lại của UI vẫn dùng tiếng Việt |
| **Ảnh đại diện** | **Avatar vector sinh từ `avatar_seed`** (chốt câu hỏi mở PRD §12). PRNG có seed chọn: dáng mặt (3), màu da (6), kiểu tóc (7), màu tóc (6), râu (4), áo thi đấu theo màu `base` của độ hiếm. Đây là SVG thuần, dữ liệu nằm trong `packages/shared` để mọi nơi vẽ ra cùng một khuôn mặt. Không dùng ảnh người thật |
| **Nút** | Chính: nền chanh, chữ tối, chữ in hoa Barlow 600. Phụ: viền `--c-line-strong`, nền trong suốt. Nguy hiểm: viền đỏ. Cao 40px (lớn 48px). Có trạng thái `:focus-visible` với viền 2px `--c-focus` cách 2px. Khi chờ server thì khoá nút và hiện spinner, không đổi kích thước nút |
| **Xu** | Icon đồng xu (vòng tròn + vạch) + số tabular. Khi xu thay đổi thì số đếm lên/xuống trong 400ms |
| **Thanh hộp phiếu** | 4 hàng: tên độ hiếm, thanh ngang `còn/tổng ban đầu`, số `còn lại`, tỉ lệ lần bốc kế tiếp `%`. Dùng ở Cửa hàng và màn mở thẻ |
| **Chip lọc** | Vị trí (GK/DF/MF/FW), độ hiếm. Đang bật thì nền chanh nhạt + viền chanh |
| **Toast** | Góc trên-phải, tự ẩn sau 4s, `role="status"`. Lỗi dùng `role="alert"` |

## 5. Chuyển động

**Nguyên tắc** (theo `motion-foundations`): chuyển động chỉ để **dẫn mắt**, **báo trạng thái** hoặc **giữ mạch không gian**. Không có thì bỏ. Chỉ animate `transform` và `opacity`.

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--dur-instant` | 80ms | Phản hồi nhấn nút |
| `--dur-fast` | 160ms | Hover, chip, tooltip |
| `--dur-base` | 240ms | Chuyển màn, mở panel |
| `--dur-slow` | 400ms | Modal, đếm xu |
| `--ease-out` | `cubic-bezier(.22,1,.36,1)` | Mặc định khi phần tử xuất hiện |
| `--ease-snap` | `cubic-bezier(.34,1.56,.64,1)` | Thẻ đáp xuống, nảy nhẹ |
| `--stagger` | 80ms | Thẻ/lưới xuất hiện lần lượt (giới hạn 50–100ms) |

**Giảm chuyển động** (`prefers-reduced-motion: reduce`): bỏ hết xoay, rung, hạt sáng và vệt foil chạy. Chỉ còn fade ≤ 200ms. Nút "Lật hết" và Esc luôn bỏ qua được animation.

**Hiệu năng:** animation lặp vô hạn (foil Huyền thoại, hào quang) phải dừng khi tab bị ẩn (`visibilitychange`). Không chạy animation DOM khi đang trong trận.

## 6. Phác thảo màn hình

Khung chung cho các màn ngoài trận: thanh trên cùng cao 56px (logo chữ "PITCH" · menu · xu · tên người chơi). Nội dung rộng tối đa 1280px, lề 24px.

### 6.1 Menu chính

```
┌──────────────────────────────────────────────────────────────────────┐
│ PITCH   Trang chủ  Cửa hàng  Kho thẻ  Đội hình          ◎ 1.240   duy│
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│   ┌──────────────── ĐÁ VỚI MÁY ────────────────┐  ┌─ NHIỆM VỤ NGÀY ─┐│
│   │  (sân nhìn từ trên, đội hình 2-3-1 của bạn) │  │ ☐ Thắng 1 trận  ││
│   │                                             │  │   0/1   +50 ◎   ││
│   │  Chỉ số đội  71        Sơ đồ  2-3-1         │  │ ☑ Mở 1 gói      ││
│   │                                             │  │   [NHẬN +50 ◎]  ││
│   │  [ DỄ ]  [ KHÓ ]            [  ĐÁ NGAY ▶ ]  │  │ ☐ Ghi 3 bàn 1/3 ││
│   └─────────────────────────────────────────────┘  └─────────────────┘│
│   Trận có thưởng hôm nay: 4/15                                        │
│                                                                      │
│   ┌─ CỬA HÀNG ─────────┐  ┌─ KHO THẺ ──────────┐  ┌─ ĐỘI HÌNH ──────┐ │
│   │ Hộp: 2 HT · 9 V    │  │ 23 thẻ · 2 mới     │  │ 1 cảnh báo sai  │ │
│   │ ★ 1 gói miễn phí   │  │                    │  │ vị trí          │ │
│   └────────────────────┘  └────────────────────┘  └─────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
```
- Việc chính là **Đá ngay** (nút chanh, nổi nhất màn). Ô "Đá với máy" vẽ sân bằng vạch phấn, không dùng ảnh nền.
- Ba ô dưới là lối tắt, mỗi ô chỉ ghi **trạng thái cần biết** (có gói miễn phí, thẻ mới, cảnh báo đội hình), không mô tả tính năng.
- Hết lượt trận có thưởng thì vẫn cho đá, nhãn đổi thành "Không còn thưởng hôm nay".

### 6.2 Trận đấu (HUD, vẽ bằng Phaser)

```
┌──────────────────────────────────────────────────────────────────────┐
│                    ┌──────────────────────────┐                      │
│                    │ ■ NHÀ  2 – 1  KHÁCH ■    │                      │
│                    │        H2  67'           │   ┌──────────┐       │
│                    └──────────────────────────┘   │ minimap  │       │
│                 [■ 58' Thẻ vàng · Okafor]          │  ·  ° ·  │       │
│                                                    └──────────┘       │
│                         (sân 2D, camera bám bóng)                     │
│                               ▼ (mũi tên trên đầu cầu thủ đang điều khiển)
│                              ◉━━━━━  thanh lực sút (khi giữ K)        │
│                                                                      │
│ ┌─────────────────────┐                                              │
│ │ 9  R. DUARTE   FW   │                    Esc  Tạm dừng              │
│ │ Thể lực ████████░░  │                                              │
│ └─────────────────────┘                                              │
└──────────────────────────────────────────────────────────────────────┘
```
- **Bảng tỉ số** ở giữa phía trên: ô màu đội, tỉ số Barlow 40px, hiệp + phút (0'–90'). Các sự kiện (bàn thắng, thẻ, thay người) hiện thành dải nhỏ dưới bảng tỉ số trong 3s.
- **Panel cầu thủ** ở góc dưới-trái: số áo, tên, vị trí, thanh thể lực. Thanh đổi sang vàng khi < 50% và đỏ khi < 30% (mốc PRD làm giảm tốc độ).
- **Thanh lực sút** hiện cạnh cầu thủ khi giữ K, đầy trong 1s.
- **Minimap** góc trên-phải hiện 14 chấm màu đội và bóng trắng.
- Bàn thắng: chữ "VÀO!" màu chanh quét ngang màn hình 1.2s, rồi về giao bóng.
- Lần đầu vào trận: hiện dải gợi ý phím điều khiển ở cạnh dưới trong 10s đầu, sau đó ẩn và mở lại được trong menu tạm dừng.

**Phím điều khiển (chốt PRD §5):**

| Phím | Có bóng | Không có bóng |
|---|---|---|
| WASD / mũi tên | Di chuyển | Di chuyển |
| Shift (giữ) | Chạy nước rút | Chạy nước rút |
| J | Chuyền thấp | Đổi sang người gần bóng nhất |
| L | Chuyền bổng | — |
| K (giữ để tăng lực) | Sút | Xoạc |
| Esc | Tạm dừng | Tạm dừng |

- **Đổi so với đề xuất trong PRD:** bỏ phím Tab, vì Tab là phím chuyển focus của trình duyệt và dễ làm mất focus khỏi canvas. **Esc tạm dừng được bất cứ lúc nào.** Trong menu tạm dừng, tab "Thay người" chỉ bật khi bóng chết (đúng luật PRD), các lúc khác hiện mờ kèm dòng "Chỉ thay người khi bóng chết".
- Menu tạm dừng gồm: Tiếp tục · Thay người (3 lượt, hiện số lượt còn) · Phím điều khiển · Bỏ trận (có hỏi xác nhận vì sẽ bị tính thua).
- Màn kết quả: tỉ số lớn, Thắng/Hòa/Thua, danh sách ghi bàn và thẻ phạt, xu nhận được (đếm lên), tiến độ nhiệm vụ, 2 nút "Đá tiếp" / "Về menu".

### 6.3 Mở thẻ (xem prototype)

```
┌──────────────────────────────────────────────────────────────────────┐
│ ← Cửa hàng                    GÓI 5 THẺ                      ◎ 790   │
│                                                                      │
│              ╭───────────── vòng tròn giữa sân ─────────────╮        │
│     ┌────┐  ┌────┐  ┌────┐  ┌────┐  ┌────┐                          │
│     │ ▒▒ │  │ ▒▒ │  │ ▒▒ │  │✦▒▒✦│  │ ▒▒ │   ← mặt sau, thẻ Vàng+ có  │
│     │ ▒▒ │  │ ▒▒ │  │ ▒▒ │  │ ▒▒ │  │ ▒▒ │     viền sáng báo trước    │
│     └────┘  └────┘  └────┘  └────┘  └────┘                          │
│              ╰──────────────────────────────────────────────╯        │
│        Space / bấm vào thẻ: lật thẻ tiếp     [ LẬT HẾT ]             │
│                                                                      │
│  Hộp còn:  HT 2 · 2%   Vàng 9 · 10%   Bạc 28 · 30%   Đồng 56 · 58%   │
└──────────────────────────────────────────────────────────────────────┘
```

**Luồng:** server trả kết quả **trước** (ARCHITECTURE §4.3), animation chỉ là phần trình diễn, client không quyết định gì.

1. **Gói** nằm giữa vòng tròn giữa sân và "thở" nhẹ. Bấm hoặc Space để xé gói.
2. **Xé gói:** gói tách đôi, các thẻ úp mặt bay ra xếp thành hàng, lần lượt cách nhau 80ms. Thẻ **Vàng trở lên** có viền mặt sau phát sáng theo màu độ hiếm **trước khi lật**. Giống FC Online, người chơi biết trước là có thẻ ngon nên hồi hộp hơn.
3. **Lật thẻ:** người chơi lật từng thẻ (bấm hoặc Space) hoặc "Lật hết". Thời gian và hiệu ứng tăng dần theo độ hiếm:

| Độ hiếm | Tích tụ (charge) | Lật | Bùng nổ (burst) | Mô tả |
|---|---|---|---|---|
| Đồng | 0 | 360ms | — | Lật nhanh, nảy nhẹ khi đáp |
| Bạc | 0 | 440ms | 240ms | Lật + một vệt sáng bạc lướt qua mặt thẻ |
| Vàng | 450ms | 560ms | 520ms | Thẻ nhấc lên và rung nhẹ, lật, vòng sáng vàng toả ra, 12 hạt sáng |
| Huyền thoại | 1300ms | 760ms | 900ms | Màn tối dần, thẻ nhấc lên giữa sân, tia sáng tím xoay sau thẻ, rung tăng dần, lật, foil quét ngang, 28 hạt sáng, thẻ phóng to lên giữa màn rồi về chỗ |

4. **Tổng kết:** "Đã nhận 5 thẻ" cùng các thẻ mặt ngửa, thẻ mới (chưa từng có) gắn nhãn "MỚI". 2 nút: "Mở thêm" (giá xu, khoá nếu không đủ) và "Xem trong kho".
5. **Thanh hộp phiếu** ở dưới cập nhật số còn lại sau khi mở.

**Truy cập:** thẻ úp là `<button>` (Tab đi qua từng thẻ). `aria-live="polite"` đọc kết quả mỗi lần lật, ví dụ "Thẻ 4: Vàng, Rafinho Duarte, Tiền đạo, OVR 81". Esc hoặc "Lật hết" bỏ qua animation. Khi bật giảm chuyển động: không xoay, thẻ fade từ mặt sau sang mặt trước trong 200ms, có thêm nhãn độ hiếm.

### 6.4 Kho thẻ

```
┌──────────────────────────────────────────────────────────────────────┐
│ KHO THẺ  23/300            [Tìm tên…        ]   Sắp xếp: OVR ▼        │
│ Vị trí: (Tất cả) (GK) (DF) (MF) (FW)   Độ hiếm: (Đồng)(Bạc)(Vàng)(HT) │
├───────────────────────────────────────────────────┬──────────────────┤
│ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐ ┌────┐         │  [ thẻ lg 220 ]  │
│ │81 V│ │78 V│ │72 B│ │70 B│ │64 Đ│ │63 Đ│         │                  │
│ │FW  │ │MF ●│ │DF  │ │GK  │ │MF  │ │DF  │         │ PAC 88  SHO 84   │
│ └────┘ └────┘ └────┘ └────┘ └────┘ └────┘         │ PAS 70  DRI 79   │
│ ┌────┐ ┌────┐ ...                                 │ DEF 41  STA 72   │
│                                                   │ ● Đang trong đội │
│  ● = đang trong đội hình    MỚI = chưa xem        │ [ÉP THẺ] [BÁN 80◎]│
└───────────────────────────────────────────────────┴──────────────────┘
```
- Lưới thẻ cỡ md, bộ lọc và cách sắp xếp lưu trên URL (`?pos=TD&rarity=gold&sort=ovr`) để quay lại vẫn giữ.
- Bấm một thẻ thì panel chi tiết bên phải hiện thẻ cỡ lg, đủ chỉ số, cấp ép, giá bán.
- Thẻ trong đội hình thì nút Bán/Ép-làm-nguyên-liệu bị **khoá và ghi rõ lý do** ("Thẻ đang trong đội hình"), không ẩn nút.
- Bán thẻ: hỏi xác nhận một lần, thẻ Vàng/Huyền thoại phải bấm giữ 1s.
- Kho rỗng theo bộ lọc: "Không có thẻ khớp bộ lọc" + nút "Xoá lọc".

### 6.5 Xếp đội hình

```
┌──────────────────────────────────────────────────────────────────────┐
│ ĐỘI HÌNH   Sơ đồ: [2-3-1] [3-2-1] [2-2-2]     Chỉ số đội  71   [LƯU]  │
├────────────────────────────────────┬─────────────────────────────────┤
│        ┌── nửa sân, vạch phấn ──┐  │ KHO (lọc theo ô đang chọn: FW)  │
│        │         [FW 81]        │  │ ┌────┐ ┌────┐ ┌────┐            │
│        │   [MF] [MF 78] [MF]    │  │ │81 V│ │64 Đ│ │60 Đ│            │
│        │      [DF]   [DF ⚠]     │  │ └────┘ └────┘ └────┘            │
│        │         [GK 70]        │  │                                 │
│        └────────────────────────┘  │ DỰ BỊ (5)                       │
│  ⚠ Okafor (MF) đá DF: −15% chỉ số  │ [  ] [  ] [  ] [  ] [  ]        │
└────────────────────────────────────┴─────────────────────────────────┘
```
- Sân vẽ bằng vạch phấn, 7 ô theo sơ đồ. Mỗi ô là thẻ cỡ sm, ô trống có viền đứt và nhãn vị trí.
- **Hai cách xếp:** (1) kéo-thả bằng chuột; (2) **bấm ô → bấm thẻ** trong cột kho. Cách 2 dùng được bằng bàn phím và là cách chính. Khi chọn một ô, cột kho tự lọc theo nhóm vị trí của ô đó, thẻ khác vị trí vẫn xếp được nhưng hiện "−15%".
- Xếp sai vị trí: ô có viền đỏ, biểu tượng ⚠, dòng cảnh báo dưới sân ghi rõ tên và mức phạt. Chỉ số đội cập nhật ngay (số đếm 240ms).
- Đổi sơ đồ: các ô **trượt** sang vị trí mới (layout animation), thẻ không còn hợp lệ chuyển xuống dự bị và có toast báo.
- Còn thay đổi chưa lưu thì nút LƯU sáng lên. Rời trang sẽ hỏi xác nhận.

### 6.6 Cửa hàng

```
┌──────────────────────────────────────────────────────────────────────┐
│ CỬA HÀNG                                                    ◎ 1.240  │
├─────────────────────────────────┬────────────────────────────────────┤
│ HỘP CỦA BẠN  (còn 95/100 phiếu) │ ┌──────────────┐ ┌──────────────┐  │
│ HT    ██░░░░░░░░  2   2,1%      │ │   GÓI 1 THẺ  │ │  GÓI 5 THẺ   │  │
│ Vàng  █████████░  9   9,5%      │ │              │ │ ≥ 1 Bạc trở  │  │
│ Bạc   █████████▒ 28  29,5%      │ │              │ │ lên          │  │
│ Đồng  █████████▒ 56  58,9%      │ │  [ 100 ◎ ]   │ │ [ 450 ◎ ] -10%│ │
│ Tỉ lệ = số còn / tổng còn.      │ └──────────────┘ └──────────────┘  │
│ Xem trang "Tỉ lệ" →             │ ★ Gói 5 miễn phí: [ MỞ MIỄN PHÍ ]  │
└─────────────────────────────────┴────────────────────────────────────┘
```
- **Hộp phiếu đặt bên trái**, ngang tầm mắt khi vào màn: minh bạch là điểm khác biệt của game (PRD §1). Tỉ lệ hiện 1 chữ số thập phân.
- Không đủ xu: nút giá bị khoá + "Thiếu 210 ◎". Hộp chỉ còn Đồng: dải cảnh báo vàng trên gói 5 "Hộp chỉ còn thẻ Đồng — gói 5 không đảm bảo Bạc".
- Bấm mua: nút khoá + spinner (giữ Idempotency-Key khi retry, xem plan 6.7), có kết quả thì chuyển sang màn mở thẻ.
- Hình gói là hình trừu tượng: hình chữ nhật vát góc, vạch phấn + sọc 4 màu độ hiếm. Không có logo.

## 7. Truy cập (tối thiểu)

- Tương phản chữ ≥ 4.5:1 (đã kiểm ở §3.1). Mọi thao tác dùng được bằng bàn phím, có `:focus-visible` rõ ràng.
- Thông tin không chỉ thể hiện bằng màu: độ hiếm (§3.2), sai vị trí (⚠ + chữ), màu đội (thêm ký hiệu ■ nhà/khách trên bảng tỉ số).
- Tôn trọng `prefers-reduced-motion` (§5). Có thể bỏ qua mọi animation dài.

## 8. Quyết định đã chốt trong giai đoạn này

| Câu hỏi mở | Chốt | Ở đâu |
|---|---|---|
| Màu độ hiếm (PRD §6.1) | Đồng/Bạc/Vàng/HT như §3.2 | Mục này |
| Phím điều khiển (PRD §5) | Bảng §6.2, bỏ Tab, Esc tạm dừng mọi lúc | Mục này |
| Ảnh đại diện thẻ (PRD §12) | Avatar vector sinh từ `avatar_seed` | §4 |
| Animation lật thẻ (ARCHITECTURE §9) | CSS 3D + Web Animations API, không thêm thư viện, không dùng Phaser | [ADR-0008](adr/0008-card-reveal-css-waapi.md) |
| Font | Barlow Condensed + Be Vietnam Pro, tự host | §2 |
| Viết tắt vị trí/chỉ số | Tiếng Anh (GK/DF/MF/FW, PAC/SHO/…), tên đầy đủ tiếng Việt ở tooltip | §4 |
