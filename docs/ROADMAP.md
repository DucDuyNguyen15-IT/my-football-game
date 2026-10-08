# Lộ trình dự án — theo từng giai đoạn

Cách dùng: mỗi giai đoạn có **Mục tiêu → Skill → Câu lệnh mẫu → Đầu ra → Hoàn thành khi**.
Người dùng chỉ cần copy "Câu lệnh mẫu" dán cho agent. Agent đọc `CLAUDE.md` để biết đang ở giai đoạn nào.

**Mẹo tiết kiệm token**
- Mỗi giai đoạn nên mở **một phiên chat mới** (`/clear`). Kết quả đã nằm trong file nên agent không cần nhớ lịch sử chat.
- Phiên dài: dùng `/compact` hoặc skill `ecc:save-session` → phiên sau `ecc:resume-session`.
- Đừng yêu cầu agent "đọc toàn bộ dự án"; chỉ định file cụ thể.

## Tổng quan

| # | Giai đoạn | Đầu ra chính | Trạng thái |
|---|---|---|---|
| 0 | Khởi động | Thư mục `docs/`, file theo dõi | ✅ |
| 1 | Nghiên cứu & ý tưởng | `docs/research.md` | ✅ |
| 2 | Spec (PRD) & quyết định kỹ thuật | `docs/PRD.md`, `docs/adr/*` | ✅ |
| 3 | Kiến trúc & kế hoạch | `docs/ARCHITECTURE.md`, `docs/plans/*` | ⬜ |
| 4 | Thiết kế UI/UX | `docs/DESIGN.md`, design tokens | ⬜ |
| 5 | MVP lõi: trận đấu offline | Đá được 1 trận với máy | ⬜ |
| 6 | Hệ thống thẻ & đội hình | Mở thẻ, kho thẻ, xếp đội hình | ⬜ |
| 7 | Tài khoản, kinh tế, (tuỳ chọn) PvP | Đăng nhập, tiền ảo, ghép trận | ⬜ |
| 8 | Kiểm thử, bảo mật, tối ưu | Báo cáo test/security | ⬜ |
| 9 | Deploy & bàn giao | Link chạy thật, README | ⬜ |

Trạng thái: ⬜ chưa làm · 🟡 đang làm · ✅ xong

---

## Giai đoạn 0 — Khởi động
**Mục tiêu:** dựng khung tài liệu để các giai đoạn sau ghi vào.

**Câu lệnh mẫu:**
> Làm Giai đoạn 0 trong docs/ROADMAP.md: tạo docs/PROGRESS.md, docs/BACKLOG.md, thư mục docs/adr/ và docs/plans/, khởi tạo git kèm .gitignore. Không viết code.

**Hoàn thành khi:**
- [x] Có `docs/PROGRESS.md`, `docs/BACKLOG.md`, `docs/adr/`, `docs/plans/`
- [x] Đã `git init` và commit đầu tiên

---

## Giai đoạn 1 — Nghiên cứu & ý tưởng
**Mục tiêu:** hiểu đối thủ, chốt điểm khác biệt và phạm vi.

**Skill:** `ecc:competitive-platform-analysis`, `ecc:market-research`, `ecc:deep-research` (kỹ thuật), `ecc:council` (phản biện)

**Câu lệnh mẫu:**
> Làm Giai đoạn 1. Phân tích FC Online, eFootball và 2–3 game bóng đá chạy trên web: cơ chế trận đấu, hệ thống thẻ/độ hiếm, nâng cấp thẻ, kinh tế game. Thêm nghiên cứu kỹ thuật: engine 2D vs 3D cho web, mô phỏng vật lý bóng, AI cầu thủ. Viết kết quả ngắn gọn (tối đa 2 trang) vào docs/research.md, kết thúc bằng 3 phương án phạm vi MVP để mình chọn.

**Câu hỏi cần chốt cuối giai đoạn:**
- Góc nhìn 2D top-down hay 3D?
- Số người mỗi đội ở MVP (5v5 dễ hơn nhiều so với 11v11)?
- Đá với máy trước, PvP sau? (khuyến nghị: có)

**Hoàn thành khi:**
- [x] `docs/research.md` có bảng so sánh + 3 phương án MVP
- [x] Người dùng đã chọn 1 phương án (ghi vào PROGRESS.md)

---

## Giai đoạn 2 — Spec (PRD) & quyết định kỹ thuật
**Mục tiêu:** một bản spec duy nhất làm "nguồn sự thật" cho mọi giai đoạn sau.

**Skill:** `ecc:prp-prd` (hỏi đáp để viết PRD), `ecc:architecture-decision-records`, `ecc:council`

**Câu lệnh mẫu (bước 1):**
> /ecc:prp-prd Làm Giai đoạn 2. Dựa trên docs/research.md và phương án MVP đã chọn trong docs/PROGRESS.md, hỏi mình từng câu rồi viết docs/PRD.md gồm: tầm nhìn, người chơi mục tiêu, user stories, tính năng MVP / sau MVP / không làm, luật trận đấu, hệ thống thẻ (độ hiếm, chỉ số, tỉ lệ rơi, giá gói thẻ), kinh tế tiền ảo, tiêu chí chấp nhận cho từng tính năng.

**Câu lệnh mẫu (bước 2):**
> Từ docs/PRD.md, đề xuất tech stack và ghi mỗi quyết định thành 1 ADR trong docs/adr/: game engine (Phaser/PixiJS/Three.js), framework UI, backend, database, realtime (WebSocket/Colyseus…), hosting. Mỗi ADR có lựa chọn thay thế và lý do. Sau đó điền mục "Tech stack" trong CLAUDE.md.

**Hoàn thành khi:**
- [x] `docs/PRD.md` có mục "Không làm" và tiêu chí chấp nhận
- [x] Có ADR cho engine, frontend, backend, DB, realtime, hosting _(hosting: proposed, chốt ở GĐ 9)_
- [x] Mục "Tech stack" trong CLAUDE.md đã điền

---

## Giai đoạn 3 — Kiến trúc & kế hoạch triển khai
**Mục tiêu:** chia dự án thành các phần nhỏ, rõ thứ tự làm.

**Skill:** `ecc:blueprint`, `ecc:api-design`, `ecc:contract-first`, `ecc:postgres-patterns` / `ecc:prisma-patterns`, `ecc:plan`

**Câu lệnh mẫu:**
> Làm Giai đoạn 3. Dựa trên PRD và ADR, viết docs/ARCHITECTURE.md: sơ đồ module (client game, UI, API, game server, DB), schema database (user, card, player_card, pack, squad, match, transaction), danh sách API, luồng mở thẻ phía server. Sau đó dùng /ecc:blueprint chia Giai đoạn 5–9 thành các task nhỏ (mỗi task ≤ 1 phiên làm việc), lưu vào docs/plans/. Dựng skeleton dự án (monorepo, lint, test runner) và điền "Lệnh thường dùng" trong CLAUDE.md.

**Hoàn thành khi:**
- [ ] `docs/ARCHITECTURE.md` có schema DB + danh sách API
- [ ] `docs/plans/` có task list đánh số cho giai đoạn 5–9
- [ ] Skeleton chạy được `dev` và `test` (rỗng cũng được)

---

## Giai đoạn 4 — Thiết kế UI/UX
**Mục tiêu:** chốt phong cách hình ảnh trước khi code giao diện.

**Skill:** `ecc:frontend-design-direction`, `ecc:design-system`, `ecc:motion-patterns` / `ecc:motion-advanced`, `ecc:gan-design`

**Câu lệnh mẫu:**
> Làm Giai đoạn 4. Viết docs/DESIGN.md: phong cách, bảng màu theo độ hiếm thẻ, font, design tokens. Phác thảo các màn: menu chính, trận đấu (HUD), mở thẻ (animation lật thẻ theo độ hiếm), kho thẻ, xếp đội hình, cửa hàng. Làm 1 prototype HTML cho màn mở thẻ để mình duyệt.

**Hoàn thành khi:**
- [ ] `docs/DESIGN.md` + file design tokens
- [ ] Người dùng duyệt prototype màn mở thẻ

---

## Giai đoạn 5 — MVP lõi: trận đấu offline
**Mục tiêu:** đá được 1 trận hoàn chỉnh với máy trên trình duyệt.

**Skill:** `ecc:orch-build-mvp` (hoặc `ecc:prp-implement` theo từng task), `ecc:tdd-workflow`, `ecc:frontend-patterns`

**Câu lệnh mẫu:**
> Làm Giai đoạn 5, task tiếp theo chưa xong trong docs/plans/. Làm theo TDD cho phần logic (vật lý bóng, luật, tỉ số). Xong task thì tick vào plan và dừng lại báo cáo.

**Phạm vi gợi ý:** sân, bóng có vật lý, di chuyển/chuyền/sút, đổi cầu thủ điều khiển, AI đối thủ cơ bản, thủ môn, bàn thắng, đồng hồ trận, màn kết quả. **Chưa** cần thẻ hay tài khoản.

**Hoàn thành khi:**
- [ ] Đá hết 1 trận với máy mà không lỗi
- [ ] Logic trận đấu có unit test
- [ ] Chạy ổn ≥ 50 FPS trên laptop thường

---

## Giai đoạn 6 — Hệ thống thẻ & đội hình
**Mục tiêu:** mở thẻ, lưu thẻ, xếp đội hình, chỉ số thẻ ảnh hưởng tới trận đấu.

**Skill:** `ecc:orch-add-feature`, `ecc:backend-patterns`, `ecc:motion-patterns`, `ecc:security-review`

**Câu lệnh mẫu:**
> Làm Giai đoạn 6, task tiếp theo trong docs/plans/. Nhớ quy tắc: random tỉ lệ rơi thẻ ở server, có test kiểm chứng phân phối tỉ lệ khớp PRD.

**Phạm vi gợi ý:** dữ liệu cầu thủ hư cấu (seed), gói thẻ, animation mở thẻ, kho thẻ (lọc/sắp xếp), xếp đội hình + sơ đồ chiến thuật, chỉ số thẻ → tốc độ/sút/chuyền trong trận, (tuỳ chọn) nâng cấp/ép thẻ.

**Hoàn thành khi:**
- [ ] Mở thẻ → thẻ vào kho → đưa vào đội hình → đá trận bằng đội đó
- [ ] Test phân phối tỉ lệ rơi (vd. 10.000 lần mở) khớp PRD ± sai số

---

## Giai đoạn 7 — Tài khoản, kinh tế, (tuỳ chọn) PvP
**Mục tiêu:** lưu tiến trình người chơi, vòng lặp kiếm tiền ảo ↔ mở thẻ.

**Skill:** `ecc:orch-add-feature`, `ecc:redis-patterns`, `ecc:latency-critical-systems` (PvP), `ecc:security-review`

**Câu lệnh mẫu:**
> Làm Giai đoạn 7, task tiếp theo trong docs/plans/. Mọi giao dịch tiền ảo phải có bản ghi transaction và chạy trong DB transaction.

**Phạm vi gợi ý:** đăng ký/đăng nhập, ví tiền ảo, thưởng sau trận, nhiệm vụ ngày, bảng xếp hạng. PvP realtime chỉ làm nếu còn thời gian (server-authoritative).

**Hoàn thành khi:**
- [ ] Đăng xuất/đăng nhập lại vẫn giữ thẻ và tiền
- [ ] Không thể tự cộng tiền/thẻ bằng cách sửa request (đã thử)

---

## Giai đoạn 8 — Kiểm thử, bảo mật, tối ưu
**Skill:** `ecc:e2e-testing`, `ecc:browser-qa`, `ecc:security-review`, `code-review`, agent `ecc:performance-optimizer`

**Câu lệnh mẫu:**
> Làm Giai đoạn 8. Viết E2E cho các luồng chính (đăng nhập → mở thẻ → xếp đội → đá trận → nhận thưởng). Chạy security review tập trung vào gacha, ví tiền và API. Đo hiệu năng trận đấu. Ghi kết quả vào docs/QA-REPORT.md, sửa lỗi nghiêm trọng.

**Hoàn thành khi:**
- [ ] E2E luồng chính chạy xanh
- [ ] Không còn lỗi bảo mật mức cao
- [ ] `docs/QA-REPORT.md`

---

## Giai đoạn 9 — Deploy & bàn giao
**Skill:** `ecc:docker-patterns`, `ecc:deployment-patterns`, `ecc:update-docs`

**Câu lệnh mẫu:**
> Làm Giai đoạn 9. Đóng gói bằng Docker, deploy theo ADR hosting, viết README (cài đặt, chạy, kiến trúc, ảnh chụp màn hình).

**Hoàn thành khi:**
- [ ] Có link chạy thật
- [ ] README đủ để người khác tự chạy được

---

## Khi gặp sự cố (dùng ở mọi giai đoạn)
| Tình huống | Skill |
|---|---|
| Build lỗi | `ecc:build-fix`, `ecc:react-build` |
| Có bug | `ecc:orch-fix-defect` |
| Đổi hành vi tính năng đã có | `ecc:orch-change-feature` |
| Dọn/refactor code | `ecc:orch-refine-code`, `simplify` |
| Review trước khi commit | `code-review` |
