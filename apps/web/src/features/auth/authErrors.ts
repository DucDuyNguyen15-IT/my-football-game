import { LoginRequest, RegisterRequest, Username } from '@pitch/shared';
import { ApiClientError } from '../../api/client';

/** Thông báo lỗi ở màn đăng nhập: `warning` cho lỗi tạm thời (khoá, rate limit), `danger` còn lại. */
export interface AuthNotice {
  tone: 'danger' | 'warning';
  title?: string;
  text: string;
}

/** Ô nhập có lỗi riêng (lỗi `validation_error` của server có `details[].field`). */
export type AuthField = 'username' | 'password' | 'confirmPassword' | 'email';

/** Đổi lỗi API thành thông báo cho người chơi; `login_locked` và `rate_limited` có lời riêng. */
export function describeAuthError(err: unknown): AuthNotice {
  if (!(err instanceof ApiClientError)) {
    return { tone: 'danger', text: 'Có lỗi xảy ra. Thử lại sau.' };
  }
  switch (err.code) {
    case 'login_locked':
      return {
        tone: 'warning',
        title: 'Tạm khoá đăng nhập',
        text: 'Sai mật khẩu quá nhiều lần. Đợi 15 phút rồi thử lại.',
      };
    case 'rate_limited':
      return {
        tone: 'warning',
        title: 'Thao tác quá nhanh',
        text: 'Bạn gửi quá nhiều yêu cầu. Đợi khoảng 1 phút rồi thử lại.',
      };
    case 'reauth_required':
      // Xoá tài khoản chỉ Google: phiên đăng nhập quá 10 phút.
      return {
        tone: 'warning',
        title: 'Cần đăng nhập lại',
        text: 'Vì an toàn, hãy đăng xuất rồi đăng nhập lại bằng Google, sau đó xoá tài khoản trong vòng 10 phút.',
      };
    case 'network_error':
      return { tone: 'danger', text: 'Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.' };
    case 'bad_response':
    case 'internal_error':
      return { tone: 'danger', text: 'Máy chủ đang gặp lỗi. Thử lại sau.' };
    case 'validation_error':
      return { tone: 'danger', text: err.details?.[0]?.message ?? err.message };
    default:
      return { tone: 'danger', text: err.message };
  }
}

/** Lỗi gắn được vào một ô nhập (để hiện ngay dưới ô đó), nếu có. */
export function fieldErrorOf(err: unknown): { field: AuthField; text: string } | null {
  if (!(err instanceof ApiClientError)) return null;
  if (err.code === 'username_taken') return { field: 'username', text: err.message };
  if (err.code !== 'validation_error') return null;
  const d = err.details?.find(
    (x) => x.field === 'username' || x.field === 'password' || x.field === 'email',
  );
  return d ? { field: d.field as AuthField, text: d.message } : null;
}

export type FieldErrors = Partial<Record<AuthField, string>>;

/** Chuẩn hoá + kiểm tra dữ liệu form đăng nhập/đăng ký phía client (nguyên tắc 18: Postel). */
export function parseAuthForm(input: {
  mode: 'login' | 'register';
  username: string;
  password: string;
  confirmPassword?: string;
  email: string;
  agreed: boolean;
}):
  | {
      ok: true;
      data: LoginRequest | RegisterRequest;
      trimmedUsername: string;
      trimmedEmail: string;
    }
  | {
      ok: false;
      errors: FieldErrors;
      consentError: boolean;
      trimmedUsername: string;
      trimmedEmail: string;
    } {
  const trimmedUsername = input.username.trim();
  const trimmedEmail = input.email.trim();
  const parsed =
    input.mode === 'login'
      ? LoginRequest.safeParse({ username: trimmedUsername, password: input.password })
      : RegisterRequest.safeParse({
          username: trimmedUsername,
          password: input.password,
          ...(trimmedEmail && { email: trimmedEmail }),
          acceptTerms: input.agreed,
        });
  const errors: FieldErrors = {};
  let consentError = false;
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const f = issue.path[0];
      if (f === 'email' && !errors.email) {
        errors.email = 'Email chưa đúng định dạng (ví dụ: ten@vidu.vn).';
      } else if (f === 'password' && !errors.password) {
        errors.password =
          input.mode === 'login' && input.password.length === 0
            ? 'Nhập mật khẩu để đăng nhập.'
            : issue.message;
      } else if (f === 'username' && !errors.username) {
        errors.username = issue.message;
      } else if (f === 'acceptTerms') {
        consentError = true;
      }
    }
  }
  if (
    input.mode === 'register' &&
    input.confirmPassword !== undefined &&
    input.confirmPassword !== input.password
  ) {
    errors.confirmPassword =
      input.confirmPassword.length === 0
        ? 'Nhập lại mật khẩu để xác nhận.'
        : 'Mật khẩu nhập lại chưa khớp.';
  }
  if (parsed.success && !errors.confirmPassword) {
    return { ok: true, data: parsed.data, trimmedUsername, trimmedEmail };
  }
  return { ok: false, errors, consentError, trimmedUsername, trimmedEmail };
}

/** Chuẩn hoá + kiểm tra tên đăng nhập Google lần đầu. */
export function parseGoogleUsername(
  raw: string,
): { ok: true; value: string } | { ok: false; error: string; trimmed: string } {
  const trimmed = raw.trim();
  const parsed = Username.safeParse(trimmed);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    error: parsed.error.issues[0]?.message ?? 'Tên đăng nhập 3–20 ký tự: chữ, số, dấu gạch dưới.',
    trimmed,
  };
}
