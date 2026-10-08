# ADR-0007: Hosting bằng Docker Compose (đề xuất)

**Date**: 2026-10-09
**Status**: proposed — chốt ngân sách và nhà cung cấp ở Giai đoạn 9
**Deciders**: Chủ dự án + Claude

## Context
Dự án nhắm phát hành thật nhưng chưa chốt ngân sách. Cần chạy server Node, Postgres, phục vụ file tĩnh của client và có HTTPS. Giai đoạn 9 trong ROADMAP đã định đóng gói bằng Docker.

## Decision
Đóng gói bằng **Docker Compose** gồm: `caddy` (HTTPS tự động, phục vụ build tĩnh của web, reverse proxy) + `server` + `postgres`. Dùng chung cho dev và deploy. Ứng viên deploy: 1 VPS nhỏ (~5 USD/tháng). Giá và nhà cung cấp chốt ở Giai đoạn 9.

## Alternatives Considered
### Free tier (static host + PaaS miễn phí + Postgres miễn phí)
- **Pros**: 0 đồng
- **Cons**: server bị "ngủ" khi không có truy cập (lần đầu vào chậm), giới hạn dung lượng DB, điều khoản hay thay đổi
- **Why not (tạm thời)**: vẫn là phương án dự phòng nếu ngân sách = 0; Docker image chạy được trên hầu hết PaaS
### PaaS trả phí (Render/Railway/Fly…)
- **Pros**: không phải tự quản trị máy chủ
- **Cons**: thường đắt hơn VPS khi có DB đi kèm
- **Why not (tạm thời)**: chờ chốt ngân sách
### Kubernetes
- **Why not**: quá mức cần thiết cho quy mô này

## Consequences
### Positive
- Môi trường dev giống production, dễ chuyển nhà cung cấp.
### Negative
- Tự lo backup Postgres và cập nhật bảo mật VPS.
### Risks
- Mất dữ liệu → cron `pg_dump` hằng ngày ra nơi lưu trữ ngoài (cấu hình ở Giai đoạn 9).
