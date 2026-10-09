# Kế hoạch triển khai — Giai đoạn 5–9

_Tạo ở Giai đoạn 3 (2026-10-10) bằng `ecc:blueprint`. Nguồn: `docs/PRD.md`, `docs/ARCHITECTURE.md`, ADR-0001…0007._

| File | Giai đoạn | Số task |
|---|---|---|
| [phase-5-match-offline.md](phase-5-match-offline.md) | 5 — Trận đấu offline | 14 |
| [phase-6-cards-squad.md](phase-6-cards-squad.md) | 6 — Thẻ & đội hình (+ nền server, tài khoản cơ bản) | 15 |
| [phase-7-accounts-economy.md](phase-7-accounts-economy.md) | 7 — Tài khoản, kinh tế | 6 |
| [phase-8-qa-security.md](phase-8-qa-security.md) | 8 — Kiểm thử, bảo mật, tối ưu | 4 |
| [phase-9-deploy.md](phase-9-deploy.md) | 9 — Deploy & bàn giao | 3 |

## Cách thực thi một task

1. Đọc `CLAUDE.md` → mở file plan của giai đoạn hiện tại → chọn **task đầu tiên chưa tick `[ ]` mà mọi task "Phụ thuộc" đã `[x]`**.
2. Chỉ đọc file được nêu trong mục **Bối cảnh** của task (mỗi task tự đủ thông tin, không cần đọc task trước).
3. Logic (sim, domain server) làm theo **TDD**: viết test đỏ → code → xanh.
4. Chạy mục **Kiểm chứng**. Tất cả phải xanh, cộng với các bất biến chung bên dưới.
5. Tick `[x]` task trong plan, commit **một commit cho một task**: `feat(<phạm vi>): <task id> <tóm tắt>`. Dừng lại báo cáo.

**Chế độ:** trực tiếp trên `main` (máy chưa có GitHub CLI). Nếu sau này dùng PR: mỗi task một nhánh `task/<id>-<slug>`, một PR.
**Rollback mặc định:** `git revert <commit của task>`; task có migration DB ghi rõ cách rollback riêng.
**Model:** `strongest` = task khó/rủi ro (luật, AI, gacha, ví, bảo mật) — nên dùng model mạnh nhất; `default` = còn lại.

## Bất biến chung (kiểm sau MỌI task)

- `pnpm check` xanh (lint + typecheck + test).
- `packages/sim` không import Phaser/React/DOM/`node:*`, không dùng `Math.random` (lint đã chặn).
- Server không dùng `Math.random`; random cho gacha/ép thẻ đến từ `node:crypto`.
- Đổi API = sửa schema Zod trong `packages/shared/src/api` **trước**, server và web cùng dùng schema đó (`contract-first`).
- Mọi thay đổi xu/thẻ chạy trong **một DB transaction**, khoá theo thứ tự `users → pack_boxes → player_cards → squads`, có dòng `coin_transactions` khi xu đổi.
- Không có tên/ảnh cầu thủ thật, logo CLB, thương hiệu FIFA/EA.
- Ý tưởng ngoài task → `docs/BACKLOG.md`, không tự làm.

## Thứ tự & song song

```
GĐ5:  5.1 → {5.2, 5.3} → 5.4 → 5.5 → 5.6 → 5.7 → 5.8a → 5.8b → {5.11, 5.12} → 5.13
                          └─► 5.9 (cần GĐ4) → 5.10 (cần 5.5) ─► 5.11

GĐ6:  6.1a → 6.1b → 6.2 ─┐
      6.1a → 6.4 ────────┼─► 6.3a(sau 6.1b) → 6.3b → 6.5 → 6.7 → 6.8 → 6.10 → 6.11 (cần 5.13)
                         │                    ├─► 6.6 (cần GĐ4) ─► 6.7
                         │                    └─► 6.9 ─────────────► 6.10
      6.12a (sau 6.5, 6.8) → 6.12b

GĐ7:  7.1 (sau 6.3b) ;  7.2 (sau 6.11) → 7.3 → 7.4 → 7.5 → 7.6
GĐ8:  8.1 → {8.2, 8.3} → 8.4          GĐ9:  9.1 → 9.2 → 9.3
```

- 5.9 (render Phaser) có thể làm song song với 5.5–5.8b sau khi 5.4 xong.
- 6.1a–6.5 (server) **không phụ thuộc** GĐ5 — có thể làm xen kẽ, nhưng ROADMAP vẫn đánh dấu theo giai đoạn. 6.11 là điểm hội tụ, cần cả 5.13.
- 6.12a/b (ép thẻ) là Should: được hoãn nếu trễ (PRD §11); 7.3 và 7.5 khi đó bỏ phần liên quan ép thẻ.

## Điều chỉnh so với ROADMAP (đã cân nhắc)

ROADMAP đặt "tài khoản" ở GĐ7, nhưng gacha chạy ở server (GĐ6) cần biết **ai** đang mở thẻ và **ví của ai**. Vì vậy:
- **GĐ6** làm phần tối thiểu: nền DB, đăng ký/đăng nhập/phiên, ví + sổ giao dịch, quà tân thủ (task 6.1, 6.3, 6.5).
- **GĐ7** làm phần còn lại: khoá đăng nhập, rate limit, thưởng trận + match token, nhiệm vụ, analytics, onboarding.
- PvP (kể cả bất đồng bộ) **không** nằm trong MVP — xem `docs/BACKLOG.md`.

## Điều kiện tiên quyết

- Node ≥ 24, pnpm 12 (qua corepack — xem "Lệnh thường dùng" trong `CLAUDE.md`).
- **Từ task 6.1:** cần Postgres 16 — cài **Docker Desktop** (khuyến nghị) hoặc Postgres 16 bản cài trực tiếp.
- **GĐ4 xong** trước task 5.9 (cần phím điều khiển chốt + màu sắc) và 6.6 (design tokens).

## Giao thức thay đổi plan

- **Tách task** quá lớn (> 1 phiên): đổi `X.Y` thành `X.Ya`, `X.Yb`, ghi lý do một dòng.
- **Thêm task:** dùng số tiếp theo trong giai đoạn, ghi "Phụ thuộc".
- **Bỏ qua / hoãn:** đánh `[~]` + lý do + chuyển vào BACKLOG nếu cần.
- Không xoá task đã xong; mọi thay đổi plan đi kèm commit `docs(plans): …`.
