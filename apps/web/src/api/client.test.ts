import { afterEach, describe, expect, it, vi } from 'vitest';
import { Me } from '@pitch/shared';
import { apiFetch, ApiClientError, apiUrl } from './client';

describe('apiUrl', () => {
  it('gắn tiền tố /api/v1', () => {
    expect(apiUrl('/health')).toBe('/api/v1/health');
  });
});

const me = {
  id: '1',
  username: 'duy',
  coins: 100,
  freePack5Credits: 1,
  rewardedMatchesToday: 0,
  rewardedMatchesLimit: 15,
};

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(
    async () => new Response(body === undefined ? null : JSON.stringify(body), { status }),
  );
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('apiFetch', () => {
  it('GET: gửi cookie, parse `data` bằng schema', async () => {
    const fetch = mockFetch(200, { data: me });
    await expect(apiFetch('/me', Me)).resolves.toEqual(me);
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('/api/v1/me');
    expect(init).toMatchObject({ method: 'GET', credentials: 'include', body: undefined });
  });

  it('POST không body vẫn gửi `{}` kèm Content-Type JSON', async () => {
    const fetch = mockFetch(204, undefined);
    await apiFetch('/auth/logout', null, { method: 'POST' });
    const init = fetch.mock.calls[0]![1]!;
    expect(init.body).toBe('{}');
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('response sai schema → ApiClientError bad_response nêu rõ trường sai', async () => {
    mockFetch(200, { data: { ...me, coins: 'nhiều' } });
    const err = await apiFetch('/me', Me).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ code: 'bad_response' });
    expect((err as Error).message).toContain('coins');
  });

  it('lỗi server → ApiClientError mang code/status/message của ApiError', async () => {
    mockFetch(409, { error: { code: 'insufficient_coins', message: 'Không đủ xu' } });
    await expect(apiFetch('/packs/pack1/open', null, { method: 'POST' })).rejects.toMatchObject({
      code: 'insufficient_coins',
      status: 409,
      message: 'Không đủ xu',
    });
  });

  it('lỗi mạng → network_error; body lỗi không đúng chuẩn → bad_response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(apiFetch('/me', Me)).rejects.toMatchObject({ code: 'network_error' });
    mockFetch(502, { oops: true });
    await expect(apiFetch('/me', Me)).rejects.toMatchObject({ code: 'bad_response', status: 502 });
  });
});
