# Dự án: Game bóng đá web (kiểu FC Online)

Game bóng đá chơi trên trình duyệt: điều khiển trận đấu + sưu tầm/mở thẻ cầu thủ (gacha) + xây đội hình.

## Trạng thái hiện tại
- **Giai đoạn đang làm:** GĐ8 xong (2026-11-14). Trước GĐ9: làm lại giao diện v3 "Bộ áo mới" (Gemini, ngoại lệ có đồng ý của người dùng) → review toàn bộ đồ án (Fable làm, Opus review chéo)
- **Việc tiếp theo:** chọn 1 trong 3 hướng thiết kế v3 ở `docs/design/v3/` (nhánh `feat/ui-v3-directions`); sau đó áp vào `apps/web` theo 3 đợt. Việc còn tồn: `docs/QA-REPORT.md` §6
- Cập nhật 2 dòng trên mỗi khi xong một giai đoạn.

## Quy tắc cho agent (đọc kỹ, không cần nhắc lại)
1. Trước khi làm, đọc **chỉ mục giai đoạn hiện tại** trong `docs/ROADMAP.md`, không đọc cả file nếu không cần.
2. Chỉ làm trong phạm vi giai đoạn hiện tại. Ý tưởng ngoài phạm vi → ghi vào `docs/BACKLOG.md`, không tự làm.
3. Quyết định kỹ thuật quan trọng → ghi ADR vào `docs/adr/` (dùng skill `ecc:architecture-decision-records`). Đã có ADR thì tuân theo, không bàn lại.
4. Spec gốc là `docs/PRD.md`. Mâu thuẫn giữa code và PRD → hỏi người dùng, không tự đoán.
5. Kết thúc giai đoạn: tick checklist "Hoàn thành khi" trong ROADMAP, cập nhật "Trạng thái hiện tại" ở trên, ghi tóm tắt 3–5 dòng vào `docs/PROGRESS.md`.
6. Trả lời người dùng bằng tiếng Việt, ngắn gọn.

## Ràng buộc cố định
- **Không dùng tên/ảnh cầu thủ thật, logo CLB, thương hiệu FIFA/EA** — dùng dữ liệu hư cấu.
- **Gacha chỉ dùng tiền ảo trong game**, không tích hợp thanh toán thật.
- **Mọi logic quan trọng chạy ở server:** tỉ lệ rơi thẻ, cộng/trừ tiền, kết quả trận PvP. Client không được tự quyết định.

## Tech stack
Chi tiết và lý do: `docs/adr/README.md`.
- **Ngôn ngữ & cấu trúc:** TypeScript, monorepo pnpm (`apps/web`, `apps/server`, `packages/sim`, `packages/shared`). `packages/sim` không được import Three.js/DOM — [ADR-0001](docs/adr/0001-typescript-monorepo-shared-sim.md)
- **Game engine:** Three.js render trận 3D (camera truyền hình), chỉ vẽ + input; vật lý/luật/AI nằm trong `packages/sim` — [ADR-0009](docs/adr/0009-threejs-3d-match-render.md) (thay Phaser 3 của ADR-0002)
- **UI:** React + Vite, TanStack Query; Three.js nhúng trong `<MatchCanvas>` — [ADR-0003](docs/adr/0003-react-vite-ui.md)
- **Backend:** Node.js LTS + Fastify, Zod, session cookie + argon2, random bằng `node:crypto`, test bằng Vitest — [ADR-0004](docs/adr/0004-fastify-backend.md)
- **Database:** PostgreSQL 16+ + Drizzle ORM; ví/hộp thẻ dùng transaction + `FOR UPDATE` — [ADR-0005](docs/adr/0005-postgresql-drizzle.md)
- **Realtime:** không dùng trong MVP (chỉ REST); Colyseus cho PvP realtime sau này — [ADR-0006](docs/adr/0006-no-realtime-in-mvp.md)
- **Hosting:** Docker Compose (Caddy + server + Postgres), nhà cung cấp chốt ở Giai đoạn 9 — [ADR-0007](docs/adr/0007-hosting-docker-compose.md) _(proposed)_

## Lệnh thường dùng
Yêu cầu: Node ≥ 24, pnpm 12 (bật qua corepack: `corepack enable --install-directory "$HOME/bin" pnpm` nếu không có quyền admin). Từ task 6.1 cần Postgres 16 (Docker Desktop).

| Lệnh (chạy ở gốc repo) | Tác dụng |
|---|---|
| `pnpm install` | Cài dependency cho toàn monorepo |
| `docker compose -f docker-compose.dev.yml up -d` | Bật Postgres 16 dev (DB `pitch` + `pitch_test`); test server cần nó chạy. Biến môi trường mẫu: `.env.example` (thiếu thì dùng giá trị dev) |
| `pnpm dev` | Chạy web (Vite :5173, proxy `/api` → :3000) + server (Fastify :3000, tự reload) |
| `pnpm test` | Chạy toàn bộ test Vitest (mọi package) — `pnpm test:watch` để chạy theo dõi |
| `pnpm --filter @pitch/sim exec vitest run` | Chỉ test một package (thay `@pitch/sim` bằng `@pitch/server`, `@pitch/web`, `@pitch/shared`) |
| `pnpm lint` | ESLint (chặn Three.js/Phaser/DOM/`Math.random` trong `packages/sim`, `Math.random` trong server) |
| `pnpm typecheck` | `tsc` cho từng package |
| `pnpm check` | lint + typecheck + test — **phải xanh trước mỗi commit** |
| `pnpm e2e` | E2E luồng chính bằng Playwright (`e2e/`, task 8.1): tự migrate + seed DB test (`E2E_DATABASE_URL` → `DATABASE_URL_TEST` → `pitch_test`, không bao giờ DB dev `pitch`), bật server :3101 + web :5174 riêng. Lần đầu: `pnpm exec playwright install chromium`. Không nằm trong `pnpm check` |
| `pnpm build` | Build web (`apps/web/dist`) + server (`apps/server/dist`) |
| `pnpm format` | Prettier |
| `pnpm assets` | Dựng `apps/web/public/models/player.glb` từ file Mixamo trong `assets-src/mixamo/` (cả hai **không commit** — giấy phép Mixamo, repo public; thiếu file thì trận dùng cầu thủ khối) |

Kế hoạch task: `docs/plans/README.md` (cách chọn task tiếp theo, bất biến chung).

## Quy tắc làm việc của người dùng (áp dụng trên mọi máy / tài khoản)
- **Cài công cụ:** máy thiếu công cụ cần cho công việc (git, node, pnpm, docker, …) thì tự cài (ưu tiên `winget`), không cần hỏi; cài xong báo đã cài gì.
- **Commit + push mỗi tính năng:** xong một tính năng và `pnpm check` xanh thì commit và push ngay, không gom nhiều tính năng.
- **Không ghi attribution của Claude:** không thêm dòng `Co-Authored-By: Claude …` vào commit, không thêm "Generated with Claude Code" vào PR.
- **AI LOG** (nếu đồ án yêu cầu): luôn hỏi người dùng trước khi ghi. Không chép nguyên văn câu lệnh ngắn của người dùng; viết lại thành prompt đầy đủ (bối cảnh, mục tiêu, yêu cầu, ràng buộc, kết quả mong muốn), cho xem trước, chỉ ghi khi được đồng ý.
- **Tiết kiệm usage:** phiên vượt ~200k token thì dừng và báo người dùng (trừ khi người dùng cho phép riêng phiên đó).
- **Phân vai agent (từ 14/11/2026):** không dùng Gemini nữa. Opus điều phối và **review toàn bộ diff**, chịu trách nhiệm cuối trước khi commit; Fable 5.2 làm code từng task trong worktree riêng; Haiku làm việc vặt (docs, chạy lệnh).

## Phối hợp với Gemini (Antigravity)
- CLI: `C:\Users\Admin\.gemini\bin\agy.exe` (cài Antigravity rồi chạy `agy install`). Model: `gemini-pro-orchestrator-g1-pro` (Orchestrator Argon, **không** nhận cờ `--effort`).
- Giao việc: chạy nền trong worktree riêng của Gemini
  `agy -p "Đọc và thực hiện brief ở .claude/collab/brief-<task>.md" --model gemini-pro-orchestrator-g1-pro --mode auto --output-format json`
  → JSON có `conversation_id`; hỏi tiếp bằng `--conversation <id>`.
- Hộp thư: `.claude/collab/brief-<task>.md` (Claude → Gemini) và `report-<task>.md` (Gemini → Claude). Thư mục `.claude/` bị gitignore nên brief chỉ có trên máy đang chạy.
- Gemini chỉ commit trong nhánh của mình, **không push**; Claude review, chạy `pnpm check`, merge vào `main` rồi push.
- Mỗi worktree chạy song song dùng DB test riêng: tạo `pitch_test_a`, `pitch_test_b`, … trong Postgres dev, đặt `DATABASE_URL_TEST=postgres://pitch:pitch@localhost:5432/pitch_test_x` khi chạy test.
- Worktree tạo thủ công ở thư mục anh em (`../mfg-<agent>-<task>`): công cụ worktree tự động của Claude lỗi với ổ `d:`/`D:`.

## Kế hoạch tuần 13–20/11/2026 (đóng GĐ7, bắt đầu GĐ8) — trạng thái 14/11
| Task | Ai làm | Trạng thái |
|---|---|---|
| 7.3 Toàn vẹn sổ cái & tamper | Fable | ✅ Đã gộp `main` |
| 8.2 Security review | Gemini | ✅ Đã gộp `main` |
| 7.4 Nhiệm vụ ngày | Gemini | ✅ Đã gộp `main` |
| 7.5 Analytics & retention | Gemini | ✅ Đã gộp `main` |
| 7.6 Onboarding | Gemini | ✅ Đã gộp `main` (merge `6c44f0a`) |
| 8.1 E2E | Fable | ✅ Đã gộp `main` |
| 8.3 Hiệu năng | Fable + Opus | ✅ Opus đo FPS/bộ nhớ bằng Chrome thật (Cao 74,6 / Thấp 166 FPS TB, không rò) |
| 8.4 Rà tiêu chí & QA-REPORT | Fable | ✅ Đã gộp `main` (36/36 tiêu chí) |

Opus đã review cuối và gộp cả 3 nhánh (2026-11-14): `pnpm check` 845 test xanh, `ledger:check` 0 lệch, worktree và nhánh đã dọn.

**Tuần sau:** 8.1 E2E (Playwright, dùng `?half=`/`?autopilot=1` để trận ngắn) → 8.3 hiệu năng → 8.4 rà tiêu chí chấp nhận & hoàn thiện `docs/QA-REPORT.md`.
