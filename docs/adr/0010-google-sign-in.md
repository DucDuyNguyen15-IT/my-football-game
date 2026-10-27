# ADR-0010: Đăng nhập Google bằng Google Identity Services, server tự giữ phiên

**Date**: 2026-10-28
**Status**: accepted
**Deciders**: Chủ dự án + Claude

## Context
Người chơi muốn đăng nhập bằng Google ngoài tên đăng nhập + mật khẩu. ADR-0004 đã chốt phiên bằng session cookie (bảng `sessions`) + argon2; mọi logic quan trọng chạy ở server. Cần chọn cách xác thực Google mà không phá mô hình phiên hiện có.

## Decision
Dùng **Google Identity Services** (nút "Sign in with Google" ở web) lấy **ID token**; web gửi token lên `POST /auth/google`. Server kiểm chữ ký/`aud`/`iss`/`exp` của token (thư viện `google-auth-library` hoặc `jose` + JWKS của Google), rồi tìm/tạo user theo `sub` và **tạo phiên cookie như đăng nhập thường**. Không dùng Firebase. Cấu hình bằng biến môi trường `GOOGLE_CLIENT_ID` (web đọc qua API/config build); thiếu thì ẩn nút Google. Làm ở GĐ7 (task 7.7).

## Alternatives Considered
### Firebase Authentication
- **Pros**: UI đăng nhập dựng sẵn, nhiều nhà cung cấp
- **Cons**: thêm SDK client + `firebase-admin` + một dịch vụ ngoài; server vẫn phải tự kiểm token và giữ phiên của mình
- **Why not**: không thêm lợi ích so với GIS cho một nhà cung cấp, lại thêm phụ thuộc
### OAuth code flow phía server (redirect)
- **Pros**: không cần script Google ở client
- **Cons**: thêm route callback, state/PKCE, cấu hình redirect URI từng môi trường
- **Why not**: GIS + ID token đơn giản hơn cho SPA cùng origin

## Consequences
### Positive
- Giữ nguyên phiên, CSRF/Origin check, rate limit hiện có; Google chỉ là một cách chứng minh danh tính.
### Negative
- Schema đổi: `users.password_hash` thành nullable, thêm `google_sub` (unique). Người dùng Google lần đầu phải chọn tên hiển thị (username) và nhận quà tân thủ như đăng ký thường.
- Cần chủ dự án tạo OAuth Client ID (Google Cloud Console) và khai báo origin của web cho từng môi trường.
