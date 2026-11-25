import { afterEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { fetchMe, meKey, purgeUserCache } from './auth';

const err401 = { error: { code: 'unauthenticated', message: 'Chưa đăng nhập' } };

function seed(qc: QueryClient) {
  qc.setQueryData(meKey, { id: 'a' });
  qc.setQueryData(['admin', 'users'], ['bí mật của admin']);
  qc.setQueryData(['squad', 'a'], { slots: [] });
}

afterEach(() => vi.unstubAllGlobals());

describe('purgeUserCache', () => {
  it('xoá mọi query trừ me', () => {
    const qc = new QueryClient();
    seed(qc);
    purgeUserCache(qc);
    expect(qc.getQueryData(['admin', 'users'])).toBeUndefined();
    expect(qc.getQueryData(['squad', 'a'])).toBeUndefined();
    expect(qc.getQueryData(meKey)).toEqual({ id: 'a' });
  });
});

describe('fetchMe', () => {
  it('401 → trả null và xoá cache của phiên cũ (không còn dữ liệu admin/squad)', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(err401), { status: 401 })),
    );
    const qc = new QueryClient();
    seed(qc);
    // Giống useMe: queryFn nhận `client` từ context.
    const me = await qc.fetchQuery({ queryKey: meKey, queryFn: ({ client }) => fetchMe(client) });
    expect(me).toBeNull();
    expect(qc.getQueryData(['admin', 'users'])).toBeUndefined();
    expect(qc.getQueryData(['squad', 'a'])).toBeUndefined();
  });
});
