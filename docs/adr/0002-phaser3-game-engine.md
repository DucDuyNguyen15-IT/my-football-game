# ADR-0002: Phaser 3 làm game engine

**Date**: 2026-10-09
**Status**: accepted
**Deciders**: Chủ dự án + Claude

## Context
Trận đấu là 2D top-down 7v7, mục tiêu ≥ 55 FPS trên laptop tầm trung (PRD §5, §10). Cần scene, input bàn phím, tween/animation, camera bám bóng. Vật lý tự viết trong `packages/sim` (ADR-0001), nên engine chỉ lo hiển thị và input.

## Decision
Dùng **Phaser 3** (bản 3.x ổn định mới nhất, khoá phiên bản cụ thể) để render trận đấu. **Không** dùng Arcade/Matter physics của Phaser: Phaser chỉ vẽ lại trạng thái do `packages/sim` tính.

## Alternatives Considered
### PixiJS
- **Pros**: renderer rất nhanh, nhẹ
- **Cons**: chỉ là renderer, phải tự làm scene, input, camera, âm thanh
- **Why not**: tốn công hơn mà không có lợi ích rõ ở quy mô 14 cầu thủ
### Three.js / Babylon.js (3D)
- **Pros**: hình ảnh gần FC Online hơn
- **Cons**: cần model và animation 3D, nặng với máy yếu
- **Why not**: PRD đã loại 3D (§4.3)
### Phaser 4
- **Pros**: renderer mới
- **Cons**: còn mới, ít tài liệu và ví dụ
- **Why not**: research.md khuyến nghị Phaser 3 an toàn hơn; xem lại sau MVP

## Consequences
### Positive
- Nhiều tutorial, AI viết code Phaser 3 tốt; có sẵn camera, tween, input.
### Negative
- Bundle nặng hơn PixiJS (~1 MB), chấp nhận được.
### Risks
- Hiển thị lệch so với mô phỏng → Phaser chỉ đọc state, nội suy giữa các tick.
