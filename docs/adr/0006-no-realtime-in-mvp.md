# ADR-0006: Không dùng realtime (WebSocket) trong MVP

**Date**: 2026-10-09
**Status**: accepted
**Deciders**: Chủ dự án + Claude

## Context
MVP chỉ đá với máy (PRD §4.1): trận chạy ở client, server phát match token và kiểm kết quả qua HTTP. Tính năng đầu tiên sau MVP là PvP bất đồng bộ, trong đó server mô phỏng trận giữa hai đội hình, cũng không cần kết nối liên tục. PvP thời gian thực đứng cuối danh sách ưu tiên.

## Decision
MVP **chỉ dùng REST/HTTP**, không có WebSocket. Khi làm PvP thời gian thực, ưu tiên **Colyseus** (server authoritative, dùng lại `packages/sim`) và viết ADR mới thay thế ADR này.

## Alternatives Considered
### WebSocket (ws/Socket.IO) ngay từ đầu
- **Pros**: sẵn sàng cho thông báo realtime
- **Cons**: thêm hạ tầng, sticky session, xử lý kết nối lại
- **Why not**: MVP không có tính năng nào cần
### Colyseus ngay từ đầu
- **Pros**: có sẵn room, đồng bộ state
- **Cons**: thêm server và mô hình lập trình mới khi chưa cần
- **Why not**: PvP realtime nằm ngoài MVP

## Consequences
### Positive
- Hạ tầng đơn giản, dễ deploy, dễ test.
### Negative
- Không có cập nhật đẩy từ server (VD: nhiệm vụ hoàn thành) → client tự refetch sau mỗi hành động.
### Risks
- Thêm realtime về sau tốn công → giữ `packages/sim` độc lập, tick cố định ngay từ đầu.
