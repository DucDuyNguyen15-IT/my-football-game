# ADR-0008: Animation lật thẻ bằng CSS 3D + Web Animations API

**Date**: 2026-10-10
**Status**: accepted
**Deciders**: Chủ dự án + Claude

## Context
ADR-0003 và ARCHITECTURE §9 để ngỏ cách làm animation lật thẻ: CSS/Framer Motion hay một scene Phaser nhỏ. Màn mở thẻ nằm trong React (Cửa hàng → Mở thẻ → Kho). Animation gồm nhiều bước nối nhau và khác nhau theo độ hiếm: tích tụ → lật → bùng nổ (DESIGN.md §6.3). Ngoài ra phải bỏ qua được (Esc / "Lật hết") và tôn trọng `prefers-reduced-motion`.

## Decision
Dùng **CSS 3D transform** (`rotateY`, `backface-visibility`) cho phần lật thẻ, và **Web Animations API** (`element.animate()` + `await animation.finished`) để nối các bước. Gói logic này trong một hook React (`useCardReveal`) ở task 6.7. Thời lượng lấy từ tokens (`motion.reveal` trong `design-tokens.json`). Không thêm thư viện animation.

## Alternatives Considered
### motion/react (Framer Motion)
- **Pros**: API khai báo, có `useAnimate` để nối bước, `AnimatePresence` cho exit
- **Cons**: thêm ~30–40 KB gzip vào bundle; các màn khác chỉ cần transition CSS đơn giản
- **Why not**: WAAPI có sẵn trong trình duyệt và đã làm được việc nối bước (`await finished`) và huỷ giữa chừng (`cancel()`/`finish()`). Nếu GĐ6 cần layout animation phức tạp (đổi sơ đồ đội hình) thì xét lại bằng ADR mới
### Scene Phaser nhỏ
- **Pros**: particle system mạnh, cùng engine với trận đấu
- **Cons**: phải khởi động Phaser (~1 MB) chỉ để mở thẻ; chữ trên thẻ vẽ bằng canvas nên khó đọc bằng screen reader, khó dùng lại `<CardView>` của React
- **Why not**: thẻ là UI React dùng ở nhiều màn, trình diễn bằng DOM thì chỉ cần một component

## Consequences
### Positive
- Không thêm dependency. Dùng lại `<CardView>` (DOM, có accessibility) ở mở thẻ, kho, đội hình.
- Animation chỉ dùng transform/opacity nên chạy trên GPU, kể cả máy yếu.
### Negative
- Hạt sáng (particles) phải tự làm bằng vài chục `<span>` + WAAPI, đơn giản hơn particle của Phaser.
### Risks
- Safari từng có lỗi `backface-visibility` khi lồng `transform-style: preserve-3d` → kiểm thử trên Safari ở GĐ8.
