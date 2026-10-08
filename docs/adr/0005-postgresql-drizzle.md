# ADR-0005: PostgreSQL + Drizzle ORM

**Date**: 2026-10-09
**Status**: accepted
**Deciders**: Chủ dự án + Claude

## Context
Dữ liệu có quan hệ rõ (user, card, player_card, box, squad, match, transaction). PRD yêu cầu số dư không bao giờ âm kể cả khi request đồng thời, và mỗi lần mở gói/ép thẻ là một transaction (PRD §6.3, §7). Cần khoá dòng (`SELECT … FOR UPDATE`) cho ví và hộp thẻ.

## Decision
Dùng **PostgreSQL** (bản 16 trở lên) với **Drizzle ORM** và **drizzle-kit** cho migration. Xu lưu kiểu số nguyên, có ràng buộc `CHECK (coins >= 0)` ở DB. Mọi biến động ghi vào bảng `transaction` (append-only).

## Alternatives Considered
### Prisma
- **Pros**: phổ biến, DX tốt
- **Cons**: query builder không hỗ trợ `FOR UPDATE` (phải viết raw SQL), có engine binary riêng
- **Why not**: khoá dòng là nhu cầu cốt lõi của gacha/ví
### MongoDB
- **Pros**: linh hoạt schema
- **Cons**: dữ liệu mang tính quan hệ, transaction nhiều document kém tự nhiên
- **Why not**: không hợp mô hình dữ liệu
### SQLite
- **Pros**: không cần server DB
- **Cons**: ghi đồng thời kém, ít lựa chọn host
- **Why not**: chỉ hợp cho test, không hợp phát hành

## Consequences
### Positive
- Transaction ACID, khoá dòng, ràng buộc ở DB; Drizzle sát SQL, type-safe.
### Negative
- Khi dev phải chạy Postgres (dùng Docker).
### Risks
- Deadlock khi khoá nhiều dòng → luôn khoá theo thứ tự cố định (user → box → card).
