# ADR-0001: TypeScript monorepo với module mô phỏng dùng chung

**Date**: 2026-10-09
**Status**: accepted
**Deciders**: Chủ dự án + Claude

## Context
PRD yêu cầu mọi logic quan trọng chạy ở server. Trận vs máy chạy ở client, nhưng về sau server phải mô phỏng được trận (PvP bất đồng bộ, xác minh kết quả bằng log input). Dự án do một người làm cùng AI nên cần ít ngôn ngữ, ít công cụ.

## Decision
Dùng **TypeScript** cho cả client và server, tổ chức thành monorepo **pnpm workspaces**:
- `apps/web`: client (React + Phaser)
- `apps/server`: API (Fastify)
- `packages/sim`: vật lý bóng, luật, AI, chỉ số → tham số. TypeScript thuần, không phụ thuộc DOM/Phaser, bước thời gian cố định 60 tick/s
- `packages/shared`: kiểu dữ liệu, config kinh tế, schema API

## Alternatives Considered
### Client TS + server ngôn ngữ khác (Go/Python/C#)
- **Pros**: hiệu năng server tốt hơn (Go/C#)
- **Cons**: phải viết mô phỏng hai lần và giữ hai bản khớp nhau
- **Why not**: phá mục tiêu dùng chung module mô phỏng
### Hai repo riêng
- **Pros**: tách biệt rõ
- **Cons**: chia sẻ code phải publish package, đổi kiểu dữ liệu phải sửa hai nơi
- **Why not**: tốn công vô ích với một người làm

## Consequences
### Positive
- Một ngôn ngữ, kiểu dữ liệu dùng chung, test mô phỏng chạy bằng Node không cần trình duyệt.
### Negative
- Phải cấu hình workspace/tsconfig ban đầu.
### Risks
- Code Phaser lọt vào `packages/sim` → lint chặn import `phaser` và DOM trong `packages/sim`.
