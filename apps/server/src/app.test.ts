import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { ApiError, HealthResponse } from '@pitch/shared';
import { buildApp } from './app';
import { AppError } from './plugins/errors';
import { createTestApp, FakeClock } from '../test/helpers';

describe('GET /api/v1/health', () => {
  it('trả về status ok đúng contract khi DB kết nối được', async () => {
    const { app } = createTestApp();
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(res.statusCode).toBe(200);
    expect(HealthResponse.parse(res.json())).toEqual({ data: { status: 'ok' } });
    await app.close();
  });

  it('DB không kết nối được → 503 internal_error', async () => {
    const app = buildApp({ databaseUrl: 'postgres://nobody:x@127.0.0.1:1/none' });
    const res = await app.inject({ method: 'GET', url: '/api/v1/health' });

    expect(res.statusCode).toBe(503);
    expect(ApiError.parse(res.json()).error.code).toBe('internal_error');
    await app.close();
  });
});

describe('chuẩn hoá lỗi', () => {
  function appWithRoutes() {
    const app = buildApp();
    app.get('/boom/app-error', async () => {
      throw new AppError('insufficient_coins', 409, 'Không đủ xu');
    });
    app.get('/boom/unknown', async () => {
      throw new Error('bí mật nội bộ');
    });
    app.post('/echo', async (req) => {
      const body = z.object({ name: z.string().min(3), age: z.number().int() }).parse(req.body);
      return { data: body };
    });
    return app;
  }

  it('AppError → đúng HTTP và envelope ApiError', async () => {
    const app = appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/boom/app-error' });
    expect(res.statusCode).toBe(409);
    expect(ApiError.parse(res.json())).toEqual({
      error: { code: 'insufficient_coins', message: 'Không đủ xu' },
    });
    await app.close();
  });

  it('body sai schema → 400 validation_error có details theo field', async () => {
    const app = appWithRoutes();
    const res = await app.inject({ method: 'POST', url: '/echo', payload: { name: 'a' } });
    expect(res.statusCode).toBe(400);
    const err = ApiError.parse(res.json()).error;
    expect(err.code).toBe('validation_error');
    expect(err.details?.map((d) => d.field).sort()).toEqual(['age', 'name']);
    await app.close();
  });

  it('JSON hỏng → 400 validation_error', async () => {
    const app = appWithRoutes();
    const res = await app.inject({
      method: 'POST',
      url: '/echo',
      headers: { 'content-type': 'application/json' },
      payload: '{"name":',
    });
    expect(res.statusCode).toBe(400);
    expect(ApiError.parse(res.json()).error.code).toBe('validation_error');
    await app.close();
  });

  it('lỗi lạ → 500 internal_error, không lộ message gốc', async () => {
    const app = appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/boom/unknown' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('bí mật');
    expect(ApiError.parse(res.json()).error.code).toBe('internal_error');
    await app.close();
  });

  it('route không tồn tại → 404 not_found', async () => {
    const app = appWithRoutes();
    const res = await app.inject({ method: 'GET', url: '/api/v1/khong-co' });
    expect(res.statusCode).toBe(404);
    expect(ApiError.parse(res.json()).error.code).toBe('not_found');
    await app.close();
  });
});

describe('đồng hồ tiêm được', () => {
  it('FakeClock.advance đổi app.clock.now()', async () => {
    const clock = new FakeClock('2026-10-25T00:00:00Z');
    const app = buildApp({ clock });
    expect(app.clock.now().toISOString()).toBe('2026-10-25T00:00:00.000Z');
    clock.advance(90_000);
    expect(app.clock.now().toISOString()).toBe('2026-10-25T00:01:30.000Z');
    await app.close();
  });

  it('mặc định là đồng hồ thật', async () => {
    const app = buildApp();
    expect(Math.abs(app.clock.now().getTime() - Date.now())).toBeLessThan(1000);
    await app.close();
  });
});
