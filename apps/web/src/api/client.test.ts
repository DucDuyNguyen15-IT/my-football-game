import { describe, expect, it } from 'vitest';
import { apiUrl } from './client';

describe('apiUrl', () => {
  it('gắn tiền tố /api/v1', () => {
    expect(apiUrl('/health')).toBe('/api/v1/health');
  });
});
