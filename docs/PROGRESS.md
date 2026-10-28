# Nhật ký tiến độ

Mỗi giai đoạn xong ghi 3–5 dòng: đã làm gì, quyết định nào đã chốt, việc còn dở. Mới nhất ở trên cùng.

---

## Giai đoạn 6 — ghi chú giữa giai đoạn (đang làm)
- 6.11 (2026-10-28): đá trận bằng đội của mình qua `POST /matches` (đội nhà từ đội hình, đội máy sinh ở server từ `cards`, seed + match token). Cân bằng lại với 11 thẻ khởi đầu thật + bộ sinh đội máy thật (`pnpm --filter @pitch/server balance`, 100 trận/mức): **Dễ thắng 79%** (T79/H18/B3, bàn 198–28), **Khó thắng 13%** (T13/H25/B62, bàn 82–203) — đạt ngưỡng PRD (Dễ ≥ 60%, Khó ≤ 30%), không cần chỉnh.

## Giai đoạn 5 — MVP lõi: trận đấu offline (2026-10-25) ✅
- `packages/sim` tất định 60 tick/s: vật lý bóng 3D, cầu thủ theo chỉ số + thể lực, chuyền giữ-nhả có thanh lực, sút, chọc khe W/Q+W, xoạc/tắc/phạm lỗi/thẻ, bóng chết, luân lưu, thay người, AI 2 tầng + thủ môn, 2 mức khó cân chỉnh bằng mô phỏng (5.13). ~490 test Vitest.
- Render chuyển từ Phaser sang **Three.js** (ADR-0009): sân 3D camera truyền hình, cầu thủ Mixamo (không commit file, thiếu thì dùng khối), HUD React + minimap, menu Đồ hoạ (preset, đêm/hoàng hôn/ngày, SSAO tắt mặc định), khán giả ảnh động, replay quay chậm sau bàn thắng (S bỏ qua). Mức Cao ~80–90 FPS trên Intel UHD.
- Đổi tên game thành **MFG** (My Football Game), giữ package `@pitch/*`. Cuối giai đoạn: thủ môn ném tay từ vai, AI xoay người trước khi chuyền về sau, người nhận chạy đón theo đường bóng thật (cả máy).
- Còn dở: 5.18b `[~]` (đã thay bằng Mixamo 5.18d), 5.14 hướng dẫn trận đầu hoãn sang 7.6. Cơ chế mới chờ người dùng chơi thử. Tiếp theo: Giai đoạn 6 — `docs/plans/phase-6-cards-squad.md`.

## Giai đoạn 4 — Thiết kế UI/UX (2026-10-10) ✅
- Viết `docs/DESIGN.md`: phong cách "Sân đêm" (nền xanh đen, chữ trắng phấn, nút chanh, vạch kẻ sân làm khung UI, thẻ vát góc), font Barlow Condensed + Be Vietnam Pro, phác thảo 6 màn (menu, HUD, mở thẻ, kho, đội hình, cửa hàng).
- Design tokens: `apps/web/src/styles/tokens.css` + `docs/design/design-tokens.json` (cho Phaser). Màu độ hiếm Đồng/Bạc/Vàng/HT kèm nhãn + số ◆ + kiểu khung để không chỉ dựa vào màu; tương phản chữ đạt AA.
- Chốt: phím điều khiển (bỏ Tab, Esc tạm dừng mọi lúc), avatar vector sinh từ `avatar_seed`, viết tắt vị trí/chỉ số bằng tiếng Anh (GK/DF/MF/FW, PAC/SHO/…), ADR-0008 animation lật thẻ bằng CSS 3D + WAAPI (không thêm thư viện).
- Prototype `docs/design/prototypes/pack-opening.html` đã được duyệt. Tiếp theo: Giai đoạn 5 — task đầu tiên trong `docs/plans/phase-5-match-offline.md`.

## Giai đoạn 3 — Kiến trúc & kế hoạch triển khai (2026-10-10) ✅
- Viết `docs/ARCHITECTURE.md`: sơ đồ module, schema 13 bảng (CHECK xu ≥ 0, ledger append-only, khoá theo thứ tự users → pack_boxes → player_cards → squads), 19 endpoint `/api/v1`, luồng mở thẻ server (idempotency + FOR UPDATE + CSPRNG), match token.
- `docs/plans/`: 42 task cho GĐ5–9 (blueprint, đã qua review phản biện, sửa 23 phát hiện). Đưa đăng nhập/ví cơ bản từ GĐ7 lên GĐ6 vì gacha server cần biết người chơi.
- Skeleton pnpm monorepo (`apps/web`, `apps/server`, `packages/sim`, `packages/shared`): `pnpm dev/test/lint/typecheck/build` chạy được; lint chặn Phaser/DOM/`Math.random` trong sim. TypeScript khoá 6.0 (typescript-eslint chưa hỗ trợ TS 7).
- Chốt thêm trong PRD: ép thẻ +5 = tổng +7 chỉ số; D7 retention tính theo "có sự kiện bất kỳ", thêm `session_seen`.
- Cần cài Docker Desktop trước task 6.1a (Postgres). Tiếp theo: Giai đoạn 4 — DESIGN.md.

## Giai đoạn 2 — Spec (PRD) & quyết định kỹ thuật (2026-10-09) ✅
- Viết `docs/PRD.md`: 7v7 vs máy (2 hiệp × 3 phút, phạm lỗi/thẻ, luân lưu, thể lực + thay người), 4 độ hiếm Đồng→Huyền thoại, hộp 100 phiếu (2/10/30/58), gói 1 thẻ 100 xu / gói 5 thẻ 450 xu, ép +1→+5 có điểm may mắn, giới hạn 15 trận thưởng/ngày, mục tiêu D7 ≥ 15%.
- Chốt tên cầu thủ hư cấu "quen tai", **không** dùng tên nhại (rủi ro pháp lý khi phát hành).
- 7 ADR: TS monorepo + `packages/sim` dùng chung, Phaser 3, React + Vite, Fastify, PostgreSQL + Drizzle, không realtime trong MVP, Docker Compose (hosting còn proposed).
- Thời hạn ~3–4 tháng là mốc mềm. Tiếp theo: Giai đoạn 3 — ARCHITECTURE.md, kế hoạch task, skeleton.

## Giai đoạn 1 — Nghiên cứu & ý tưởng (2026-10-09) ✅
- Viết `docs/research.md`: so sánh FC Online, eFootball, Haxball, Football Legends, Hattrick; nghiên cứu engine 2D/3D, vật lý bóng, AI cầu thủ.
- **Đã chốt: phương án MVP B — Cân bằng**: 2D top-down 7v7 đá với máy (2 mức khó), 4 độ hiếm, gói box draw ~150 thẻ hư cấu, ép thẻ +1→+5, 3 sơ đồ, nhiệm vụ ngày + phí ép thẻ.
- Hướng kỹ thuật đề xuất (chưa phải ADR): Phaser 3/PixiJS, vật lý bóng tự viết dùng chung client/server, AI 2 tầng + steering behaviors.
- Tiếp theo: Giai đoạn 2 — viết PRD và ADR.

## Giai đoạn 0 — Khởi động (2026-10-08) ✅
- Tạo khung tài liệu: `docs/PROGRESS.md`, `docs/BACKLOG.md`, `docs/adr/`, `docs/plans/`.
- Khởi tạo git, thêm `.gitignore` cho dự án web (Node/JS).
- Chưa có quyết định kỹ thuật nào. Tiếp theo: Giai đoạn 1 — Nghiên cứu & ý tưởng.
