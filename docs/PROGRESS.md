# Nhật ký tiến độ

Mỗi giai đoạn xong ghi 3–5 dòng: đã làm gì, quyết định nào đã chốt, việc còn dở. Mới nhất ở trên cùng.

---

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
