import { ApiClientError } from '../../api/client';

/** Thông báo lỗi ở màn đăng nhập: `warning` cho lỗi tạm thời (khoá, rate limit), `danger` còn lại. */
export interface AuthNotice {
  tone: 'danger' | 'warning';
  title?: string;
  text: string;
}

/** Ô nhập có lỗi riêng (lỗi `validation_error` của server có `details[].field`). */
export type AuthField = 'username' | 'password' | 'email';

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
