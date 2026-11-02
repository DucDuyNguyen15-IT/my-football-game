import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AuthConfig,
  GoogleAuthResult,
  Me,
  type GoogleAuthRequest,
  type LoginRequest,
  type RegisterRequest,
} from '@pitch/shared';
import { apiFetch, ApiClientError } from './client';

export const meKey = ['me'] as const;

/** Người chơi hiện tại; `null` = chưa đăng nhập (server trả 401). */
export async function fetchMe(): Promise<Me | null> {
  try {
    return await apiFetch('/me', Me);
  } catch (err) {
    if (err instanceof ApiClientError && err.code === 'unauthenticated') return null;
    throw err;
  }
}

export function useMe() {
  return useQuery({ queryKey: meKey, queryFn: fetchMe, staleTime: 30_000 });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: LoginRequest) => apiFetch('/auth/login', Me, { method: 'POST', body }),
    onSuccess: (me) => qc.setQueryData(meKey, me),
  });
}

export function useRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: RegisterRequest) => apiFetch('/auth/register', Me, { method: 'POST', body }),
    onSuccess: (me) => qc.setQueryData(meKey, me),
  });
}

/** Cách đăng nhập server đang bật (`googleClientId` null → ẩn nút Google, ADR-0010). */
export function useAuthConfig() {
  return useQuery({
    queryKey: ['config', 'auth'] as const,
    queryFn: () => apiFetch('/config/auth', AuthConfig),
    staleTime: Infinity,
    retry: 1,
  });
}

/** Đăng nhập Google: `signed_in` → lưu người chơi vào cache; `needs_username` → màn chọn tên. */
export function useGoogleSignIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: GoogleAuthRequest) =>
      apiFetch('/auth/google', GoogleAuthResult, { method: 'POST', body }),
    onSuccess: (result) => {
      if (result.status === 'signed_in') qc.setQueryData(meKey, result.me);
    },
  });
}

/** Đăng xuất: dù server lỗi (phiên đã hết hạn…) vẫn xoá dữ liệu người chơi khỏi cache. */
export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch('/auth/logout', null, { method: 'POST' }),
    onSettled: () => {
      // Không `clear()`: các màn đang theo dõi `me` phải nhận `null` để chuyển về /login.
      qc.setQueryData(meKey, null);
      qc.removeQueries({ predicate: (q) => q.queryKey[0] !== meKey[0] });
    },
  });
}
