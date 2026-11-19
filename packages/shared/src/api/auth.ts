import { z } from 'zod';
import { dataEnvelope } from './common';
import { Me } from './me';
import { evaluatePasswordStrength, isPasswordAcceptable } from '../passwordStrength';

/** Tên đăng nhập 3–20 ký tự `[a-zA-Z0-9_]`; so trùng không phân biệt hoa thường (ARCHITECTURE §3.2). */
export const Username = z
  .string()
  .regex(/^[a-zA-Z0-9_]{3,20}$/, 'Tên đăng nhập 3–20 ký tự: chữ, số, dấu gạch dưới');

/** Mật khẩu 8–72 ký tự. */
export const Password = z.string().min(8, 'Mật khẩu ít nhất 8 ký tự').max(72);

/** POST /api/v1/auth/login → `MeResponse`. */
export const LoginRequest = z.object({ username: Username, password: z.string().min(1).max(72) });
export type LoginRequest = z.infer<typeof LoginRequest>;

/**
 * DELETE /api/v1/me → 204 (xoá tài khoản, NĐ 13/2023): gõ lại đúng tên đăng nhập để xác nhận; tài
 * khoản có mật khẩu phải nhập mật khẩu (tài khoản chỉ Google thì bỏ trống).
 */
export const DeleteAccountRequest = z.object({
  username: z.string().max(40),
  password: z.string().max(72).optional(),
});
export type DeleteAccountRequest = z.infer<typeof DeleteAccountRequest>;

/** POST /api/v1/auth/register → 201 `MeResponse` (task 6.3b). */
export const RegisterRequest = z.object({
  username: Username,
  password: Password,
  email: z.string().email().max(254).optional(),
  /** Đã tick ô đồng ý Điều khoản + Chính sách (NĐ 13) — server lưu thời điểm vào `users.terms_accepted_at`. */
  acceptTerms: z.literal(true),
})
  // Cùng luật với thanh "Độ mạnh mật khẩu" trên web: gọi API thẳng cũng không lách được.
  .refine((r) => isPasswordAcceptable(evaluatePasswordStrength(r.password, r.username)), {
    path: ['password'],
    message: 'Mật khẩu quá yếu',
  });
export type RegisterRequest = z.infer<typeof RegisterRequest>;

/**
 * POST /api/v1/auth/google (ADR-0010, task 7.7): `idToken` là ID token (JWT) từ Google Identity
 * Services. Lần đầu (chưa có tài khoản gắn `sub` này) server trả `needs_username`; web gửi lại cùng
 * token kèm `username` để tạo tài khoản + quà tân thủ như đăng ký thường.
 */
export const GoogleAuthRequest = z.object({
  idToken: z.string().min(1).max(4096),
  username: Username.optional(),
  /** Bắt buộc `true` khi gửi kèm `username` (tạo tài khoản mới). */
  acceptTerms: z.literal(true).optional(),
});
export type GoogleAuthRequest = z.infer<typeof GoogleAuthRequest>;

/**
 * Kết quả đăng nhập Google: `signed_in` (200, hoặc 201 khi vừa tạo tài khoản) kèm cookie phiên;
 * `needs_username` (200, chưa tạo gì) khi cần chọn tên — `suggestedUsername` chỉ là gợi ý, chưa kiểm trùng.
 */
export const GoogleAuthResult = z.discriminatedUnion('status', [
  z.object({ status: z.literal('signed_in'), me: Me }),
  z.object({ status: z.literal('needs_username'), suggestedUsername: z.string().nullable() }),
]);
export type GoogleAuthResult = z.infer<typeof GoogleAuthResult>;

export const GoogleAuthResponse = dataEnvelope(GoogleAuthResult);
export type GoogleAuthResponse = z.infer<typeof GoogleAuthResponse>;

/** GET /api/v1/config/auth: cách đăng nhập đang bật. `googleClientId` = null → ẩn nút Google. */
export const AuthConfig = z.object({ googleClientId: z.string().min(1).nullable() });
export type AuthConfig = z.infer<typeof AuthConfig>;

export const AuthConfigResponse = dataEnvelope(AuthConfig);
export type AuthConfigResponse = z.infer<typeof AuthConfigResponse>;
