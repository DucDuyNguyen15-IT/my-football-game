# ADR-0009: Three.js render trận 3D (thay ADR-0002)

**Date**: 2026-10-14
**Status**: accepted
**Deciders**: Chủ dự án + Claude

## Context
Sau khi chơi thử 5.9–5.10, chủ dự án thấy cầu thủ chấm tròn nhìn từ trên xuống "giống game khác, quá đơn giản" và muốn hình ảnh gần FC Online. PRD trước đó loại đồ hoạ 3D vì sợ nặng với máy yếu; chủ dự án quyết định bỏ ràng buộc này (PRD §4.3, §5 sửa ngày 2026-10-14), dẫn chứng game 3D trên điện thoại yếu vẫn chạy được. Yêu cầu ≥ 55 FPS TB trên laptop tầm trung (GPU tích hợp) giữ nguyên. Vật lý/luật/AI đã nằm trong `packages/sim` (ADR-0001), engine chỉ vẽ state và đọc phím.

## Decision
Render trận bằng **Three.js** (khoá phiên bản cụ thể), góc **camera truyền hình** (nhìn chéo từ khán đài, bám bóng), sân/khung thành/khán đài 3D. Làm 2 bước: (1) nhân vật **low-poly dựng bằng code** (khung xương + khối hình, hoạt ảnh chạy/sút/xoạc/thủ môn bay người viết bằng code); (2) thay bằng **mô hình glTF có rig + hoạt ảnh** (VD Mixamo hoặc bộ CC0) khi có file, dùng `AnimationMixer` hoà trộn hoạt ảnh. Phaser bị gỡ khỏi dự án. Three.js chỉ vẽ: không tự tính vật lý, không quyết định luật.

## Alternatives Considered
### Giữ Phaser, vẽ đẹp hơn ở 2D top-down
- **Pros**: không đổi kiến trúc, nhẹ nhất
- **Cons**: vẫn là góc nhìn từ trên xuống, khó ra cảm giác FC Online
- **Why not**: chủ dự án muốn 3D
### Phaser 2.5D (nhìn chéo, sprite 8 hướng vẽ sẵn)
- **Pros**: giữ engine, có chiều sâu
- **Cons**: xoay người giật theo 8 nấc, ít khung hình, khó nâng cấp lên mô hình thật
- **Why not**: tốn công gần bằng 3D mà trần chất lượng thấp hơn
### Babylon.js
- **Pros**: engine 3D đầy đủ (vật lý, GUI, inspector)
- **Cons**: bundle lớn hơn nhiều; vật lý/GUI không dùng (sim tự tính, HUD bằng React)
- **Why not**: Three.js nhẹ hơn, nhiều ví dụ hơn, chỉ cần phần render

## Consequences
### Positive
- Chuyển động xoay/hoà trộn mượt, ánh sáng/bóng đổ thật, camera đặt tuỳ ý.
- Bundle trận nhỏ hơn (Three.js ~600 KB so với Phaser ~1.2 MB).
- Bước 2 chỉ thay lớp nhân vật; sim, HUD React, input không đổi.
### Negative
- Viết lại `apps/web/src/game` (scene, camera, vẽ sân); Three.js không có sẵn input/scene manager như Phaser — input đọc bằng listener DOM (đã thuần trong `keyboard.ts`).
- Bước 2 cần chủ dự án tự tải mô hình/hoạt ảnh (tài khoản Mixamo) và kiểm giấy phép.
### Risks
- **FPS trên GPU tích hợp** → low-poly, 1 nguồn bóng đổ map nhỏ, không post-processing, `pixelRatio` tối đa 1.5, có mức đồ hoạ "Thấp" (tắt bóng đổ/khán đài); đo FPS trong từng task và ở 5.13/8.x.
- **Rò WebGL context khi vào/ra trận** → `renderer.dispose()` + `forceContextLoss()`, giải phóng geometry/material/texture khi unmount; giữ kiểm "vào/ra 10 lần" của 5.9.
- **Hiển thị lệch mô phỏng** → như cũ: chỉ đọc state, nội suy giữa 2 tick.
