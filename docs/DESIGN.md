# Tài liệu Thiết kế Giao diện v3 — "Sa Bàn Hoàng Kim" (Editorial Luxury · Chế độ Sáng)

> Tài liệu chuẩn cho toàn bộ UI 2D của **MFG** (`apps/web`).
> Phiên bản v3 thay thế định hướng tối toàn trang của v2 bằng Hướng B — **"Sa Bàn Hoàng Kim"** (`docs/design/v3/b-tactical-atelier/`).

---

## 1. Bỏ quy tắc Dark-mode v2 & Lý do chuyển sang v3

- **Quy tắc v2 được thu hồi:** Toàn bộ màn ngoài trận trước đây dùng nền xanh đen tối (`#0B1210`) và gạch một góc bất đối xứng trên panel lẫn thẻ.
- **Lý do chuyển sang v3 (Sa Bàn Hoàng Kim):**
  1. **Tách rõ vùng trưng bày sáng và vùng sân cỏ/thẻ tối:** Giấy ngà ấm (`#f3efe6`) kết hợp lưới toạ độ editorial `48×48px` và khung kem đôi viền (`#faf8f3`) giúp dữ liệu thống kê, bảng chỉ số, hộp 100 phiếu và nhiệm vụ dễ đọc lâu không mỏi mắt.
  2. **Thẻ cầu thủ và sa bàn nỉ xanh nổi bật tự nhiên:** Khi mặt thẻ giữ tông trưng bày tối (`--r-*-lo`) vát 4 góc bát giác cân xứng, còn sân đội hình / sân mở gói / màn đối đầu giữ nền nỉ xanh lục bảo đậm (`#17523a` → `#0b261b`), các lá thẻ tách lớp rõ rệt cả trên trang sáng lẫn trên sa bàn chiến thuật.
  3. **Chuyển tiếp mượt vào trận 3D:** Màn Đối đầu (`.vs`), màn Vào trận (`.play-screen`), HUD 3D và Menu Tạm dừng (`.pause`) vẫn dùng bảng màu nỉ/than tối (`--c-pitch-felt-deep`, `--c-hud-bg`, `--c-hud-surface`) để không bị loé sáng khi chuyển sang canvas WebGL sân cỏ ban đêm; màn Giới thiệu (`IntroOverlay`) cũng giữ nền tối đè lên sân vận động 3D.

*Lưu ý ranh giới 3D:* `apps/web/src/game/render/colors.ts` và `docs/design/design-tokens.json` điều khiển màu vật thể 3D trong WebGL giữ nguyên độc lập với tokens v3 của UI 2D.

---

## 2. Phân vùng bề mặt & Độ tương phản (WCAG AA)

| Vùng bề mặt | Token nền | Token chữ chính | Token chữ phụ | Ghi chú |
|---|---|---|---|---|
| **Trang ấn phẩm sáng** (Đăng nhập, Trang chủ, Cửa hàng, Kho, Ép thẻ, Admin, Kết quả) | `--c-bg` `#f3efe6` · `--c-surface-1` `#faf8f3` · `--c-surface-2` `#eae3d5` | `--c-text` `#141816` | `--c-text-muted` `#4a524d` · `--c-text-faint` `#636b65` | Viền ô nhập/chip dùng `--c-line-control` `#736856` (≥ 3:1). Độ hiếm trên nền sáng bắt buộc dùng `--r-*-ink` (không dùng `--hi`). |
| **Sa bàn & Sân tối** (Sân Đội hình, Sân Mở gói `.stage`, Màn Đối đầu `.vs`, Chờ trận `.play-screen`) | `--c-pitch-felt` `#17523a` → `--c-pitch-felt-deep` `#0b261b` | `--c-card-ink` `#faf8f3` | `--c-card-muted` `#c9c2b2` | Mọi `.muted`, `.label`, `.coin`, `.btn--ghost` nằm trong `.stage` / `.vs` phải dùng `--c-card-ink` / `--c-card-muted` / `--r-gold-hi`. |
| **Thẻ cầu thủ & HUD trên sân 3D** (Mặt thẻ `.card`, `.hud-*`, `.pause`, `IntroOverlay`, `MatchTutorialOverlay`) | `--r-*-lo` · `--c-hud-bg` `rgb(14 26 21 / 0.9)` · `--c-hud-surface` `#15261f` | `--c-card-ink` `#faf8f3` | `--c-card-muted` `#c9c2b2` | Mặt thẻ không bao giờ thừa hưởng `--c-text` tối. Huy hiệu/cờ trên nền đỏ `--c-danger` (`#b51f1f`) luôn dùng chữ `--c-card-ink` (6.22:1). |

---

## 3. Hệ thống Tokens (`apps/web/src/styles/tokens.css`)

### 3.1. Bảng màu chính
- **Giấy & kem:** `--c-bg: #f3efe6`, `--c-surface-1: #faf8f3`, `--c-surface-2: #eae3d5`, `--c-surface-3: #ddd4c3`, `--c-line: #cfc5b2`, `--c-line-strong: #9e927d`, `--c-line-control: #736856`.
- **Chữ nền sáng:** `--c-text: #141816`, `--c-text-muted: #4a524d`, `--c-text-faint: #636b65`.
- **Hành động & trạng thái:** `--c-accent: #0a6847` (hover `#075238`, ink `#faf8f3`), `--c-gold-leaf: #b8860b`, `--c-coin: #824f00`, `--c-danger: #b51f1f`, `--c-warning: #9e4506`, `--c-success: #0e7452`, `--c-info: #1864ab`, `--c-focus: #1864ab`, `--c-scrim: rgb(20 24 22 / 0.76)`.
- **Độ hiếm (gắn biến `--base`, `--hi`, `--lo`, `--ink`):**
  - Đồng (`bronze`): base `#ad6234`, hi `#f0b289`, lo `#29160a`, **ink `#7a3e19`**
  - Bạc (`silver`): base `#8b97a6`, hi `#ecf1f7`, lo `#1e242b`, **ink `#3c4652`**
  - Vàng (`gold`): base `#d49b1a`, hi `#ffe58f`, lo `#2b1e04`, **ink `#825300`**
  - Huyền thoại (`legend`): base `#7e42f5`, hi `#e6d4ff`, lo `#15092b`, **ink `#5b28c4`**

### 3.2. Typography (Self-hosted hỗ trợ tiếng Việt đầy đủ)
- Nhúng trực tiếp qua `@fontsource/space-grotesk` (`600`, `700`) và `@fontsource/ibm-plex-sans` (`400`, `500`, `600`, `700`) trong `apps/web/src/main.tsx` — đảm bảo hoạt động ngoại tuyến và không chớp font trong Playwright/Vite.
- `--font-display: 'Space Grotesk', sans-serif` — tiêu đề in hoa cô đọng, số OVR, đồng hồ, chỉ số bàn thắng.
- `--font-body: 'IBM Plex Sans', system-ui, sans-serif` — nội dung đọc, mô tả, nhãn, nút phụ.
- Số đếm dùng `font-variant-numeric: tabular-nums` (class `.num`).

### 3.3. Hình khối, Viền đôi & Nhịp chuyển động
- **Panel ấn phẩm đôi viền (`.panel`, `.panel--notch`):** Nền `--c-surface-1`, `border: 1px solid var(--c-line-strong)`, `outline: 1px solid var(--c-line)` (`outline-offset: -5px`), kèm dấu cộng định vị `+` màu `--c-gold-leaf` ở `.panel--notch`.
- **Đánh số mục tự động bằng CSS thuần:** `.page` khởi tạo `counter-reset: ed-panel`; `.panel__title::before` chèn `counter(ed-panel, decimal-leading-zero) ' //' / ''` (alt-text rỗng CSS Content Level 3) để tạo nhịp báo chí `01 //`, `02 //` mà không làm thay đổi accessible name trong DOM/E2E.
- **Thẻ cầu thủ bát giác cân xứng (`.card`):** Vát cả 4 góc đối xứng bằng `--card-notch` (`12px` cỡ vừa, `9px` cỡ nhỏ, `7px` cỡ xs, `14px` cỡ lớn), khung viền kim loại khắc mảnh, riêng `r-legend` xoay góc `--foil-angle` (tạm dừng khi `html.tab-hidden` và tắt khi `prefers-reduced-motion: reduce`).
- **Chuyển động:** `--dur-instant: 90ms`, `--dur-fast: 180ms`, `--dur-base: 280ms`, `--dur-slow: 460ms`, đường cong `--ease-out` / `--ease-snap`; toàn bộ hiệu ứng tôn trọng `@media (prefers-reduced-motion: reduce)`.

---

## 4. Kiến trúc CSS & Tư liệu minh hoạ

- **Tokens & nền tảng:** `apps/web/src/styles/tokens.css`, `apps/web/src/styles/ui.css`, `apps/web/src/app/app.css`, `apps/web/src/main.tsx`
- **Thẻ cầu thủ:** `apps/web/src/components/card/card.css`
- **Các màn tính năng:**
  - `apps/web/src/features/auth/auth.css` (Đăng nhập / Đăng ký tách 2 cột kèm thẻ mẫu sa bàn)
  - `apps/web/src/features/home/home.css` (Trang chủ biên tập, sân mini 7v7, nhiệm vụ ngày)
  - `apps/web/src/features/missions/missions.css`
  - `apps/web/src/features/onboarding/onboarding.css` (`IntroOverlay` tối trên nền 3D, `MatchTutorialOverlay`, `OnboardingFlowBanner`)
  - `apps/web/src/features/shop/shop.css` (Cửa hàng kem ngà + Hộp 100 phiếu `--ink` + Sân mở gói nỉ xanh `.stage` giữ nguyên hook `reveal.ts`)
  - `apps/web/src/features/collection/collection.css` (Kho thẻ + bảng chi tiết dính + thanh bán hàng loạt)
  - `apps/web/src/features/upgrade/upgrade.css` (Ép thẻ 3 cột + hộp thoại kết quả)
  - `apps/web/src/features/admin/admin.css`
  - `apps/web/src/features/squad/squad.css` (Sa bàn nỉ xanh bên trái, dự bị & kho bên phải)
  - `apps/web/src/features/play/prematch.css` (Chọn độ khó sáng + Màn VS nỉ xanh)
  - `apps/web/src/features/play/play.css` (Vào trận nỉ xanh + HUD 3D + Tạm dừng tối + Kết quả sáng)
- **Mẫu tham chiếu HTML v3:** `docs/design/v3/b-tactical-atelier/` (`tokens.css`, `home.html`, `shop.html`, `squad.html`)
- **Ảnh chụp màn hình sau khi áp dụng (1440×900):** `docs/design/v3/b-tactical-atelier/applied/`
