import { describe, expect, it } from 'vitest';
import { ApiClientError } from './client';
import { isTransientError } from './matches';

describe('isTransientError', () => {
  const err = (status: number) => new ApiClientError('bad_response', status, 'x');
  it('mạng, 5xx, 408, 429 thì thử lại; lỗi nghiệp vụ 4xx thì không', () => {
    expect(isTransientError(new TypeError('fetch failed'))).toBe(true);
    expect(isTransientError(err(503))).toBe(true);
    expect(isTransientError(err(408))).toBe(true);
    expect(isTransientError(err(429))).toBe(true);
    expect(isTransientError(err(422))).toBe(false);
    expect(isTransientError(err(401))).toBe(false);
  });
});
