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

  it('REPLAY_TEST_*: dev đọc được, production cấm (client không được tự chỉnh trận replay)', () => {
    const dev = loadEnv({ REPLAY_TEST_HALF_LENGTH_SEC: '10', REPLAY_TEST_AUTOPILOT: '1' });
    expect(dev.replayTestHalfLengthSec).toBe(10);
    expect(dev.replayTestAutopilot).toBe(true);
    expect(loadEnv({}).replayTestHalfLengthSec).toBeUndefined();
    const prod = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://pitch:pitch@localhost:5432/pitch',
      SESSION_SECRET: 'x'.repeat(40),
    };
    expect(() => loadEnv({ ...prod, REPLAY_TEST_AUTOPILOT: '1' })).toThrow(/REPLAY_TEST_AUTOPILOT/);
    expect(() => loadEnv({ ...prod, REPLAY_TEST_HALF_LENGTH_SEC: '10' })).toThrow(
      /REPLAY_TEST_HALF_LENGTH_SEC/,
    );
  });

  it('production thiếu DATABASE_URL / SESSION_SECRET → lỗi nêu tên biến', () => {
    expect(() => loadEnv({ NODE_ENV: 'production' })).toThrow(/DATABASE_URL[\s\S]*SESSION_SECRET/);
  });

  it('production dùng SESSION_SECRET mẫu của .env.example → lỗi; dev vẫn dùng được', () => {
    const sample = 'dev-only-session-secret-change-me-please';
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://pitch:pitch@localhost:5432/pitch',
        SESSION_SECRET: sample,
      }),
    ).toThrow(/SESSION_SECRET/);
    expect(loadEnv({ SESSION_SECRET: sample }).sessionSecret).toBe(sample);
  });

  it('MATCH_MIN_DURATION_SEC: production < 360 → lỗi; mọi môi trường ≥ MATCH_MAX_AGE_SEC → lỗi', () => {
    const prod = {
      NODE_ENV: 'production',
      DATABASE_URL: 'postgres://pitch:pitch@localhost:5432/pitch',
      SESSION_SECRET: 'a-very-long-production-session-secret-32chars',
    };
    expect(() => loadEnv({ ...prod, MATCH_MIN_DURATION_SEC: '0' })).toThrow(
      /MATCH_MIN_DURATION_SEC/,
    );
    expect(loadEnv({ ...prod, MATCH_MIN_DURATION_SEC: '400' }).matchMinDurationSec).toBe(400);
    expect(loadEnv({ MATCH_MIN_DURATION_SEC: '0' }).matchMinDurationSec).toBe(0);
    expect(() => loadEnv({ MATCH_MIN_DURATION_SEC: '7200' })).toThrow(/MATCH_MIN_DURATION_SEC/);
  });

  it('production bật ENABLE_DEV_ROUTES → lỗi nêu tên biến', () => {
    expect(() =>
      loadEnv({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgres://pitch:pitch@localhost:5432/pitch',
        SESSION_SECRET: 'a-very-long-production-session-secret-32chars',
        ENABLE_DEV_ROUTES: '1',
      }),
    ).toThrow(/ENABLE_DEV_ROUTES/);
  });

  it('GOOGLE_CLIENT_ID: trống/không đặt → null; sai dạng → lỗi', () => {
    expect(loadEnv({}).googleClientId).toBeNull();
    expect(loadEnv({ GOOGLE_CLIENT_ID: '' }).googleClientId).toBeNull();
    expect(
      loadEnv({ GOOGLE_CLIENT_ID: ' 123-abc.apps.googleusercontent.com ' }).googleClientId,
    ).toBe('123-abc.apps.googleusercontent.com');
    expect(() => loadEnv({ GOOGLE_CLIENT_ID: 'khong-hop-le' })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it('giá trị sai → lỗi', () => {
    expect(() => loadEnv({ PORT: 'abc' })).toThrow(/PORT/);
    expect(() => loadEnv({ SESSION_SECRET: 'ngắn' })).toThrow(/SESSION_SECRET/);
  });
});
