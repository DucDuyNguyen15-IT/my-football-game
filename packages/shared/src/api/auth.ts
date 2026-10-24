import { z } from 'zod';

/** Tên đăng nhập 3–20 ký tự `[a-zA-Z0-9_]`; so trùng không phân biệt hoa thường (ARCHITECTURE §3.2). */
export const Username = z
  .string()
  .regex(/^[a-zA-Z0-9_]{3,20}$/, 'Tên đăng nhập 3–20 ký tự: chữ, số, dấu gạch dưới');

/** Mật khẩu 8–72 ký tự. */
export const Password = z.string().min(8, 'Mật khẩu ít nhất 8 ký tự').max(72);

/** POST /api/v1/auth/login → `MeResponse`. */
export const LoginRequest = z.object({ username: Username, password: z.string().min(1).max(72) });
export type LoginRequest = z.infer<typeof LoginRequest>;

/** POST /api/v1/auth/register → 201 `MeResponse` (task 6.3b). */
export const RegisterRequest = z.object({
  username: Username,
  password: Password,
  email: z.string().email().max(254).optional(),
});
export type RegisterRequest = z.infer<typeof RegisterRequest>;
