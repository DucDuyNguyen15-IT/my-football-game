import { describe, expect, it } from 'vitest';
import { loadEnv } from './env';

describe('loadEnv', () => {
  it('dev: thiếu biến thì dùng giá trị khớp docker-compose.dev.yml', () => {
    const env = loadEnv({});
    expect(env.databaseUrl).toBe('postgres://pitch:pitch@localhost:5432/pitch');
    expect(env.port).toBe(3000);
    expect(env.matchMinDurationSec).toBe(360);
    expect(env.enableDevRoutes).toBe(false);
  });

  it('ép kiểu số và cờ ENABLE_DEV_ROUTES', () => {
    const env = loadEnv({ PORT: '8080', MATCH_MIN_DURATION_SEC: '5', ENABLE_DEV_ROUTES: '1' });
    expect(env.port).toBe(8080);
    expect(env.matchMinDurationSec).toBe(5);
    expect(env.enableDevRoutes).toBe(true);
  });

  it('production thiếu DATABASE_URL / SESSION_SECRET → lỗi nêu tên biến', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL[\s\S]*SESSION_SECRET/);
  });

  it('giá trị sai → lỗi', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadEnv({ SESSION_SECRET: 'ngắn' })).toThrow(/SESSION_SECRET/);
  });
});
