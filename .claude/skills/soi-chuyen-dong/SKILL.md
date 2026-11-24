---
name: soi-chuyen-dong
description: Soi lỗi chuyển động/animation/camera trong trận 3D và kiểm gameplay bằng mắt (review C5) — chạy trận autopilot, quay video, tự phát hiện chỗ giật, cắt clip + ảnh ghép để xem.
---

# Soi chuyển động (C5)

## Chuẩn bị
- Postgres test. Cổng 5432 hay bị chiếm, dùng container riêng:
  `docker run --rm -d --name mfg-test-pg -p 127.0.0.1:5433:5432 -e POSTGRES_USER=pitch -e POSTGRES_PASSWORD=pitch -e POSTGRES_DB=pitch_test postgres:16-alpine`
  rồi `E2E_DATABASE_URL=postgres://pitch:pitch@localhost:5433/pitch_test`.
- `apps/web/public/models/player.glb` phải có, không thì cầu thủ không có animation (kết quả vô nghĩa).
- `ffmpeg` trong PATH; `pnpm install`.

## Chạy
`E2E_DATABASE_URL=... E2E_SERVER_PORT=3401 E2E_WEB_PORT=5474 MOTION_HALF=30 pnpm motion`
(đổi cổng nếu có Playwright khác đang chạy). Kết quả: `motion-out/<stamp>/` gồm `report.md`, `log.json`, video, `clip-XX-<giây>s.mp4` và ảnh ghép `.png` cùng tên.

Biến env: `MOTION_HALF` (giây/hiệp, mặc định 30) · `MOTION_GFX` (low|medium|high, mặc định high) · `MOTION_REPLAY=0` tắt phát lại bàn thắng · `MOTION_THRESHOLDS='{"spinReversals":5}'` chỉnh ngưỡng · `MOTION_MAX_CLIPS` (20) · `MOTION_OUT` thư mục ra · `MOTION_SHEETS=0` tắt ảnh ghép · `E2E_DATABASE_URL`, `E2E_SERVER_PORT`, `E2E_WEB_PORT`.

## Loại phát hiện (ngưỡng ở `DEFAULT_THRESHOLDS` trong `apps/web/src/game/render/motionLog.ts`)
- `teleport` nhảy cóc: cầu thủ/bóng đổi chỗ quá nhanh khi người xem đang thấy (bỏ qua lúc màn chuyển cảnh che sân).
- `zigzag` đổi hướng chạy qua lại liên tục.
- `spin` thân xoay qua lại (lắc) khi gần đứng yên.
- `clip_flicker` clip animation A→B→A rất nhanh.
- `camera_shake` camera đổi chiều qua lại.
- `hitch` khung khựng. Headless Chromium dùng WebGL phần mềm nên FPS/hitch không đại diện máy thật; cần đo thì chạy `--headed`.

## Quy trình
1. Chạy, đọc `report.md` (tổng hợp theo loại/đối tượng; mỗi đoạn có id cầu thủ + `@(x, z)` lúc bắt đầu).
2. Mở từng ảnh ghép bằng Read tool (video thì agent không xem được). Checklist: cầu thủ xuyên nhau, bóng lệch chân/tay, HUD đè, camera giật, sai màu đội, chữ tràn.
3. Nhờ người dùng xem vài clip mp4 để chốt ngưỡng (báo nhầm nhiều thì nâng ngưỡng bằng `MOTION_THRESHOLDS`, rồi sửa `DEFAULT_THRESHOLDS`).
4. Lỗi thật ghi vào `.claude/collab/review-c-gameplay.md` (kèm đường dẫn clip/ảnh, giây, id cầu thủ).

Lưu ý GPU: `playwright.motion.config.ts` bật GPU thật (ANGLE D3D11) vì SwiftShader mặc định chỉ ~1 FPS. Máy không có GPU thì bỏ cờ đó trong config và chấp nhận chạy chậm (dùng `MOTION_GFX=low`).
