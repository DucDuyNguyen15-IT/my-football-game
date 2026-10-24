import type { z } from 'zod';
import { ApiError, type ErrorCode } from '@pitch/shared';

/** Tiền tố chung của REST API (docs/ARCHITECTURE.md §4). */
export const API_BASE = '/api/v1';

export function apiUrl(path: `/${string}`): string {
  return `${API_BASE}${path}`;
}

/** Mã lỗi phía client: mã server (`ErrorCode`) + lỗi mạng / response sai hợp đồng. */
export type ClientErrorCode = ErrorCode | 'network_error' | 'bad_response';

export class ApiClientError extends Error {
  constructor(
    readonly code: ClientErrorCode,
    readonly status: number,
    message: string,
    readonly details?: ApiError['error']['details'],
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export interface ApiInit {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** Request đổi dữ liệu luôn gửi JSON; không có body thì gửi `{}` (ARCHITECTURE §4.1). */
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

/**
 * Gọi API: gửi cookie phiên, parse `{ data }` bằng `schema` (dữ liệu bên trong envelope). `schema`
 * = `null` cho response không có nội dung (204). Lỗi → `ApiClientError` mang `code` của server.
 */
export async function apiFetch<T extends z.ZodType>(
  path: `/${string}`,
  schema: T,
  init?: ApiInit,
): Promise<z.infer<T>>;
export async function apiFetch(path: `/${string}`, schema: null, init?: ApiInit): Promise<void>;
export async function apiFetch(
  path: `/${string}`,
  schema: z.ZodType | null,
  init: ApiInit = {},
): Promise<unknown> {
  const method = init.method ?? 'GET';
  const mutating = method !== 'GET';
  let res: Response;
  try {
    res = await fetch(apiUrl(path), {
      method,
      credentials: 'include',
      headers: {
        accept: 'application/json',
        ...(mutating ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
      body: mutating ? JSON.stringify(init.body ?? {}) : undefined,
      signal: init.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiClientError('network_error', 0, 'Không kết nối được máy chủ');
  }

  const text = await res.text();
  let body: unknown = undefined;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      throw new ApiClientError('bad_response', res.status, `Response không phải JSON (${path})`);
    }
  }

  if (!res.ok) {
    const parsed = ApiError.safeParse(body);
    if (parsed.success) {
      const { code, message, details } = parsed.data.error;
      throw new ApiClientError(code, res.status, message, details);
    }
    throw new ApiClientError('bad_response', res.status, `Lỗi máy chủ ${res.status} (${path})`);
  }
  if (schema === null) return undefined;

  const data = (body as { data?: unknown } | undefined)?.data;
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const where = parsed.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join('.') || '(gốc)'}: ${i.message}`)
      .join('; ');
    throw new ApiClientError(
      'bad_response',
      res.status,
      `Response sai hợp đồng ${path} — ${where}`,
    );
  }
  return parsed.data;
}
