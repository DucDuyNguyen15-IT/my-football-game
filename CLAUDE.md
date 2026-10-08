# Dự án: Game bóng đá web (kiểu FC Online)

Game bóng đá chơi trên trình duyệt: điều khiển trận đấu + sưu tầm/mở thẻ cầu thủ (gacha) + xây đội hình.

## Trạng thái hiện tại
- **Giai đoạn đang làm:** 3 — Kiến trúc & kế hoạch triển khai
- **Việc tiếp theo:** xem mục "Giai đoạn 3" trong `docs/ROADMAP.md`
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
- **Ngôn ngữ & cấu trúc:** TypeScript, monorepo pnpm (`apps/web`, `apps/server`, `packages/sim`, `packages/shared`). `packages/sim` không được import Phaser/DOM — [ADR-0001](docs/adr/0001-typescript-monorepo-shared-sim.md)
- **Game engine:** Phaser 3, chỉ dùng để render + input; vật lý/luật/AI nằm trong `packages/sim` — [ADR-0002](docs/adr/0002-phaser3-game-engine.md)
- **UI:** React + Vite, TanStack Query; Phaser nhúng trong `<MatchCanvas>` — [ADR-0003](docs/adr/0003-react-vite-ui.md)
- **Backend:** Node.js LTS + Fastify, Zod, session cookie + argon2, random bằng `node:crypto`, test bằng Vitest — [ADR-0004](docs/adr/0004-fastify-backend.md)
- **Database:** PostgreSQL 16+ + Drizzle ORM; ví/hộp thẻ dùng transaction + `FOR UPDATE` — [ADR-0005](docs/adr/0005-postgresql-drizzle.md)
- **Realtime:** không dùng trong MVP (chỉ REST); Colyseus cho PvP realtime sau này — [ADR-0006](docs/adr/0006-no-realtime-in-mvp.md)
- **Hosting:** Docker Compose (Caddy + server + Postgres), nhà cung cấp chốt ở Giai đoạn 9 — [ADR-0007](docs/adr/0007-hosting-docker-compose.md) _(proposed)_

## Lệnh thường dùng
_(Điền sau Giai đoạn 3 — dev, test, build)_
