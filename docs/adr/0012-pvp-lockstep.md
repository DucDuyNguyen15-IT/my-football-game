# ADR-0012: PvP đá trực tiếp bằng lockstep, server giữ nhịp và chạy sim bóng

**Date**: 2026-11-20
**Status**: accepted
**Deciders**: Chủ dự án + Claude

## Context
ADR-0006 để ngỏ "Colyseus cho PvP realtime". Sim trong `packages/sim` đã tất định, có nhật ký input RLE và test golden hash (ADR-0011). CLAUDE.md bắt buộc kết quả trận PvP do server quyết định. Chi tiết: `docs/specs/pvp-realtime/research.md` (R1, R11).

## Decision
Dùng **lockstep do server giữ nhịp** qua WebSocket (`@fastify/websocket`):
- Mỗi tick 60 Hz server chạy `stepBoth` trên bản sim của mình, rồi phát một khung chứa input của hai đội. Hai trình duyệt chạy `stepBoth` y hệt theo khung.
- Server **có sim bóng** (biết hết trận, bù giờ, luân lưu, tỉ số, kiểm thay người) nhưng **không gửi state xuống client**, chỉ gửi input.
- Tỉ số chính thức lấy từ sim server. Một vòng lặp nhịp chung cho mọi phiên; giới hạn `PVP_MAX_SESSIONS` theo số đo p99 của `step`.
- Không dùng Colyseus. ADR-0006 bị thay ở phần realtime.

## Alternatives Considered
### Colyseus (server authoritative gửi state)
- **Pros**: có sẵn room, đồng bộ state
- **Cons**: gửi state lớn 60 lần/s, client phải nội suy, thêm framework mới
- **Why not**: sim đã tất định nên chỉ cần gửi input
### Server chỉ chuyển tiếp input, không có sim
- **Pros**: nhẹ CPU
- **Cons**: không biết lúc hết trận, không kiểm được thay người, không biết tỉ số khi xử thua
- **Why not**: thiếu nguồn sự thật cho kết quả
### P2P WebRTC
- **Pros**: không tốn băng thông server
- **Cons**: cần STUN/TURN, khó chống gian lận, server không giữ nhật ký
- **Why not**: trái ràng buộc server quyết định kết quả
### Rollback (GGPO)
- **Pros**: mượt hơn khi mạng xấu
- **Cons**: phải clone và tính lại nhiều tick mỗi khung
- **Why not**: ngoài phạm vi, để đợt sau

## Consequences
### Positive
- Băng thông nhỏ, tái dùng sim và nhật ký có sẵn, kết quả do server quyết định.
### Negative
- Không có dự đoán phía client nên phản ứng phím bằng RTT + bộ đệm (RTT 100 ms → ≤ 200 ms).
### Risks
- Sim phải tất định giữa chromium/firefox/webkit và Node (kiểm bằng `e2e:determinism`).
- Sim bóng tốn CPU luồng chính Fastify: đo ở T007, giới hạn `PVP_MAX_SESSIONS`, phương án cuối là `worker_threads`.
