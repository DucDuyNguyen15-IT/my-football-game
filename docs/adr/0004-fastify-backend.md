# ADR-0004: Node.js + Fastify cho backend

**Date**: 2026-10-09
**Status**: accepted
**Deciders**: Chủ dự án + Claude

## Context
Server quyết định gacha, ép thẻ, ví xu và phần thưởng trận (CLAUDE.md, PRD §7.4), mọi giao dịch nằm trong DB transaction. Server phải import được `packages/sim` (ADR-0001). Một người phát triển nên cần framework nhẹ.

## Decision
Dùng **Node.js (LTS) + Fastify**, REST JSON, validate request bằng **Zod** (schema dùng chung từ `packages/shared`). Xác thực bằng **session cookie httpOnly** lưu trong Postgres, băm mật khẩu bằng **argon2**. Random cho gacha/ép thẻ dùng `node:crypto` (CSPRNG). Test bằng **Vitest**.

## Alternatives Considered
### Express
- **Pros**: phổ biến nhất
- **Cons**: không có validate schema sẵn, chậm hơn, xử lý lỗi async kém hơn
- **Why not**: Fastify đơn giản tương đương nhưng có sẵn những thứ trên
### NestJS
- **Pros**: cấu trúc chặt, DI
- **Cons**: nhiều boilerplate, nhiều khái niệm phải học
- **Why not**: quá nặng cho một người làm
### Supabase/Firebase (BaaS)
- **Pros**: có sẵn auth và DB, ít code server
- **Cons**: logic gacha phải viết bằng SQL function/edge function, khó test, phụ thuộc nhà cung cấp
- **Why not**: logic quan trọng nhất (gacha, ví) cần nằm trong code TypeScript có test
### JWT thay cho session
- **Pros**: stateless
- **Cons**: khó thu hồi, dễ cấu hình sai
- **Why not**: chỉ có một server, session đơn giản và an toàn hơn

## Consequences
### Positive
- Dùng chung kiểu dữ liệu/schema với client; server chạy được mô phỏng trận.
### Negative
- Node đơn luồng: mô phỏng trận ở server (PvP bất đồng bộ) có thể chặn event loop.
### Risks
- Mô phỏng nặng → sau MVP chuyển sang `worker_threads` hoặc hàng đợi.
