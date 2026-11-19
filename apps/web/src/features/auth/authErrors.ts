import { LoginRequest, RegisterRequest, Username } from '@pitch/shared';
import { ApiClientError } from '../../api/client';
import { errorMessageFor, formatMessage, getActiveLocale, type Locale } from '../../i18n/i18n';

/** Thông báo lỗi ở màn đăng nhập: `warning` cho lỗi tạm thời (khoá, rate limit), `danger` còn lại. */
export interface AuthNotice {
  tone: 'danger' | 'warning';
  title?: string;
  text: string;
}

/** Ô nhập có lỗi riêng (lỗi `validation_error` của server có `details[].field`). */
export type AuthField = 'username' | 'password' | 'confirmPassword' | 'email';

/** Đổi lỗi API thành thông báo cho người chơi theo `error.code` (message server chỉ là dự phòng). */
export function describeAuthError(err: unknown, locale: Locale = getActiveLocale()): AuthNotice {
  if (!(err instanceof ApiClientError)) {
    return { tone: 'danger', text: formatMessage(locale, 'err.generic') };
  }
  switch (err.code) {
    case 'login_locked':
      return {
        tone: 'warning',
        title: formatMessage(locale, 'err.login_lockedTitle'),
        text: formatMessage(locale, 'err.login_locked'),
      };
    case 'rate_limited':
      return {
        tone: 'warning',
        title: formatMessage(locale, 'err.rate_limitedTitle'),
        text: formatMessage(locale, 'err.rate_limited'),
      };
    case 'reauth_required':
      return {
        tone: 'warning',
        title: formatMessage(locale, 'err.reauth_requiredTitle'),
        text: formatMessage(locale, 'err.reauth_required'),
      };
    case 'validation_error': {
      const detail = err.details?.[0];
      if (detail?.field === 'username') {
        return { tone: 'danger', text: formatMessage(locale, 'auth.usernameInvalid') };
      }
      if (detail?.field === 'password') {
        return { tone: 'danger', text: formatMessage(locale, 'auth.passwordWeak') };
      }
      if (detail?.field === 'email') {
        return { tone: 'danger', text: formatMessage(locale, 'auth.emailInvalid') };
      }
      return {
        tone: 'danger',
        // Không dùng message server (tiếng Việt) để khỏi lọt sang bản EN.
        text: formatMessage(locale, 'err.validation_error'),
      };
    }
    default:
      return { tone: 'danger', text: errorMessageFor(err, locale) };
  }
}

/** Lỗi gắn được vào một ô nhập (để hiện ngay dưới ô đó), nếu có. */
export function fieldErrorOf(
  err: unknown,
  locale: Locale = getActiveLocale(),
): { field: AuthField; text: string } | null {
  if (!(err instanceof ApiClientError)) return null;
  if (err.code === 'username_taken') {
    return { field: 'username', text: formatMessage(locale, 'err.username_taken') };
  }
  if (err.code !== 'validation_error') return null;
  const d = err.details?.find(
    (x) => x.field === 'username' || x.field === 'password' || x.field === 'email',
  );
  if (!d) return null;
  if (d.field === 'username') {
    return { field: 'username', text: formatMessage(locale, 'auth.usernameInvalid') };
  }
  if (d.field === 'password') {
    return { field: 'password', text: formatMessage(locale, 'auth.passwordWeak') };
  }
  return { field: 'email', text: formatMessage(locale, 'auth.emailInvalid') };
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
  locale?: Locale;
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
  const locale = input.locale ?? getActiveLocale();
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
        errors.email = formatMessage(locale, 'auth.emailInvalid');
      } else if (f === 'password' && !errors.password) {
        errors.password =
          input.mode === 'login' && input.password.length === 0
            ? formatMessage(locale, 'auth.passwordRequiredLogin')
            : input.mode === 'register' && input.password.length >= 8
              ? formatMessage(locale, 'auth.passwordWeak')
              : formatMessage(locale, 'auth.passwordMinLength');
      } else if (f === 'username' && !errors.username) {
        errors.username = formatMessage(locale, 'auth.usernameInvalid');
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
        ? formatMessage(locale, 'auth.confirmRequired')
        : formatMessage(locale, 'auth.confirmMismatch');
  }
  if (parsed.success && !errors.confirmPassword) {
    return { ok: true, data: parsed.data, trimmedUsername, trimmedEmail };
  }
  return { ok: false, errors, consentError, trimmedUsername, trimmedEmail };
}

/** Chuẩn hoá + kiểm tra tên đăng nhập Google lần đầu. */
export function parseGoogleUsername(
  raw: string,
  locale: Locale = getActiveLocale(),
): { ok: true; value: string } | { ok: false; error: string; trimmed: string } {
  const trimmed = raw.trim();
  const parsed = Username.safeParse(trimmed);
  if (parsed.success) return { ok: true, value: parsed.data };
  return {
    ok: false,
    error: formatMessage(locale, 'auth.usernameInvalid'),
    trimmed,
  };
}
