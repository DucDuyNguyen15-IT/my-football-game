# ADR-0003: React + Vite cho giao diện ngoài trận

**Date**: 2026-10-09
**Status**: accepted
**Deciders**: Chủ dự án + Claude

## Context
Ngoài trận đấu, game có nhiều màn dạng ứng dụng: đăng nhập, kho thẻ (lọc, bán hàng loạt), đội hình (kéo-thả), cửa hàng/hộp thẻ, ép thẻ, nhiệm vụ. Làm các màn này bằng UI của Phaser rất tốn công.

## Decision
Dùng **React + Vite** cho toàn bộ UI ngoài trận. Phaser được nhúng vào một component `<MatchCanvas>` và chỉ chạy khi vào trận. Gọi API bằng **TanStack Query**. Animation lật thẻ dùng CSS/Framer Motion hoặc một scene Phaser nhỏ (chốt ở Giai đoạn 4).

## Alternatives Considered
### Toàn bộ UI trong Phaser
- **Pros**: một công nghệ
- **Cons**: form, cuộn danh sách, kéo-thả, accessibility đều phải tự làm
- **Why not**: tốn công nhất
### Vue / Svelte
- **Pros**: gọn, nhẹ
- **Cons**: ít ví dụ tích hợp Phaser hơn
- **Why not**: React phổ biến nhất, có template chính thức Phaser + React, AI hỗ trợ tốt
### Next.js
- **Pros**: SSR, routing
- **Cons**: game không cần SSR/SEO, thêm độ phức tạp
- **Why not**: SPA bằng Vite là đủ

## Consequences
### Positive
- Màn kho/đội hình/cửa hàng làm nhanh, có sẵn thư viện kéo-thả (dnd-kit).
### Negative
- Phải xử lý ranh giới React ↔ Phaser (khởi tạo/huỷ game, truyền dữ liệu).
### Risks
- Rò bộ nhớ khi vào/ra trận nhiều lần → huỷ `Phaser.Game` khi unmount, có test.
