import { describe, expect, it } from 'vitest';
import { HealthResponse } from '@pitch/shared';
import { buildApp } from './app';

describe('GET /api/v1/health', () => {
  it('trả về status ok đúng contract', async () => {
    const app = buildApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toEqual({ data: { status: 'ok' } });
    await app.close();
  });
});
