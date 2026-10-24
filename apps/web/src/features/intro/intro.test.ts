import { describe, expect, it } from 'vitest';
import {
  CAMERA_FLY_SEC,
  floodLevel,
  INTRO_END,
  INTRO_SEEN_KEY,
  INTRO_START,
  introCamera,
  introMode,
  markIntroSeen,
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

describe('introCamera', () => {
  it('bắt đầu ở điểm đầu, dừng đúng điểm cuối và đứng yên sau đó', () => {
    expect(introCamera(0)).toEqual(INTRO_START);
    const end = introCamera(CAMERA_FLY_SEC);
    expect(end.pos.x).toBeCloseTo(INTRO_END.pos.x);
    expect(end.pos.y).toBeCloseTo(INTRO_END.pos.y);
    expect(end.pos.z).toBeCloseTo(INTRO_END.pos.z);
    expect(introCamera(CAMERA_FLY_SEC + 5)).toEqual(end);
  });

  it('độ cao tăng dần (không chúi xuống cỏ giữa đường)', () => {
    let prev = -Infinity;
    for (let t = 0; t <= CAMERA_FLY_SEC; t += 0.1) {
      const y = introCamera(t).pos.y;
      expect(y).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = y;
    }
  });
});

describe('floodLevel', () => {
  it('tắt lúc đầu, bật hết sau ~1,6 s, không giảm', () => {
    expect(floodLevel(0)).toBe(0);
    expect(floodLevel(2)).toBe(1);
    let prev = 0;
    for (let t = 0; t <= 2; t += 0.05) {
      expect(floodLevel(t)).toBeGreaterThanOrEqual(prev);
      prev = floodLevel(t);
    }
  });
});
