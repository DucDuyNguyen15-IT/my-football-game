import { describe, expect, it } from 'vitest';
import { GOAL_HEIGHT, GOAL_WIDTH, HALF_LENGTH } from '@pitch/sim';
import {
  BALL_R,
  BALL_SPOT,
  CAMERA_SETTLE_SEC,
  floodBank,
  floodLevel,
  INTRO_DURATION_SEC,
  INTRO_END,
  INTRO_SEEN_KEY,
  introBall,
  introCamera,
  introMode,
  keyLight,
  KICK_SEC,
  LOGO_AT_SEC,
  markIntroSeen,
  NET_HIT_SEC,
  readIntroSeen,
} from './intro';

describe('introMode', () => {
  it('lần đầu → full; giảm chuyển động → static; đã xem hoặc vào thẳng trận → none', () => {
    expect(introMode({ seen: false, reducedMotion: false, path: '/' })).toBe('full');
    expect(introMode({ seen: false, reducedMotion: true, path: '/login' })).toBe('static');
    expect(introMode({ seen: true, reducedMotion: false, path: '/' })).toBe('none');
    expect(introMode({ seen: false, reducedMotion: false, path: '/play' })).toBe('none');
  });
});

describe('sessionStorage', () => {
  it('đánh dấu đã xem rồi đọc lại', () => {
    const map = new Map<string, string>();
    const store = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    };
    expect(readIntroSeen(store)).toBe(false);
    markIntroSeen(store);
    expect(map.get(INTRO_SEEN_KEY)).toBe('1');
    expect(readIntroSeen(store)).toBe(true);
  });

  it('storage bị chặn hoặc không có → không ném lỗi', () => {
    const blocked = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('SecurityError');
      },
    };
    expect(readIntroSeen(blocked)).toBe(false);
    expect(() => markIntroSeen(blocked)).not.toThrow();
    expect(readIntroSeen(null)).toBe(false);
  });
});

const dist = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const times = (to: number, step = 0.02) =>
  Array.from({ length: Math.floor(to / step) + 1 }, (_, i) => i * step);

describe('kịch bản', () => {
  it('thứ tự mốc: sút → chạm lưới → logo → camera dừng → hết intro', () => {
    expect(KICK_SEC).toBeLessThan(NET_HIT_SEC);
    expect(NET_HIT_SEC).toBeLessThan(LOGO_AT_SEC);
    expect(CAMERA_SETTLE_SEC).toBeLessThan(INTRO_DURATION_SEC);
  });
});

describe('introBall', () => {
  it('nằm yên trên chấm phạt đền tới lúc sút', () => {
    expect(introBall(0).pos).toEqual(BALL_SPOT);
    expect(introBall(KICK_SEC).pos).toEqual(BALL_SPOT);
  });

  it('qua vạch cuối ở giữa hai cột, dưới xà', () => {
    let prev = introBall(KICK_SEC).pos;
    for (let t = KICK_SEC; t <= NET_HIT_SEC; t += 0.005) {
      const p = introBall(t).pos;
      if (prev.x < HALF_LENGTH && p.x >= HALF_LENGTH) {
        expect(Math.abs(p.z)).toBeLessThan(GOAL_WIDTH / 2 - BALL_R);
        expect(p.y).toBeLessThan(GOAL_HEIGHT - BALL_R);
      }
      prev = p;
    }
    expect(prev.x).toBeGreaterThan(HALF_LENGTH);
  });

  it('không lún xuống cỏ, nằm yên trong lưới ở cuối', () => {
    for (const t of times(INTRO_DURATION_SEC)) {
      expect(introBall(t).pos.y).toBeGreaterThanOrEqual(BALL_R - 1e-9);
    }
    const end = introBall(INTRO_DURATION_SEC).pos;
    expect(end.y).toBeCloseTo(BALL_R);
    expect(end.x).toBeGreaterThan(HALF_LENGTH);
  });
});

describe('introCamera', () => {
  it('liền mạch: không nhảy cóc giữa hai khung hình (60 fps)', () => {
    let prev = introCamera(0).pos;
    for (const t of times(INTRO_DURATION_SEC, 1 / 60)) {
      const p = introCamera(t).pos;
      expect(dist(p, prev)).toBeLessThan(1);
      prev = p;
    }
  });

  it('dừng đúng góc toàn cảnh và đứng yên sau đó', () => {
    expect(introCamera(CAMERA_SETTLE_SEC)).toEqual(INTRO_END);
    expect(introCamera(INTRO_DURATION_SEC)).toEqual(INTRO_END);
  });

  it('không chui xuống cỏ, không đâm vào quả bóng', () => {
    for (const t of times(INTRO_DURATION_SEC)) {
      const cam = introCamera(t).pos;
      expect(cam.y).toBeGreaterThan(0.2);
      expect(dist(cam, introBall(t).pos)).toBeGreaterThan(0.8);
    }
  });
});

describe('đèn', () => {
  it('đèn pha tắt lúc đầu, bật hết trước khi sút, mỗi cột bật một lúc khác nhau', () => {
    expect(floodLevel(0)).toBe(0);
    expect(floodLevel(KICK_SEC)).toBe(1);
    const firstOn = [0, 1, 2, 3].map((i) => times(KICK_SEC, 0.01).find((t) => floodBank(t, i) > 0));
    expect(new Set(firstOn).size).toBe(4);
  });

  it('đèn rọi bóng sáng lên từ tối, dịu xuống khi đèn pha bật, tắt sau khi bóng vào lưới', () => {
    expect(keyLight(0)).toBe(0);
    expect(keyLight(1)).toBeCloseTo(1);
    expect(keyLight(KICK_SEC)).toBeGreaterThan(0.2);
    expect(keyLight(KICK_SEC)).toBeLessThan(0.5);
    expect(keyLight(INTRO_DURATION_SEC)).toBe(0);
  });
});
