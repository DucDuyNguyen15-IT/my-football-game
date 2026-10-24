import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GRAPHICS,
  parseGraphicsSettings,
  pixelRatioFor,
  QUALITY,
  resolveQuality,
  toggleGraphics,
} from './quality';

describe('mức đồ hoạ', () => {
  it('Thấp nhẹ hơn Cao ở mọi mục tốn GPU', () => {
    const { low, high } = QUALITY;
    for (const k of [
      'shadows',
      'postFx',
      'floodSpots',
      'skyAndRoof',
      'grass3d',
      'crowd',
      'ssao',
    ] as const) {
      expect(low[k]).toBe(false);
      expect(high[k]).toBe(true);
    }
    expect(high.shadowMapSize).toBeGreaterThan(low.shadowMapSize);
    expect(high.maxPixelRatio).toBeGreaterThan(low.maxPixelRatio);
    expect(high.bloomStrength).toBeGreaterThan(0);
  });

  it('pixel ratio theo màn hình nhưng có trần, không dưới 1', () => {
    expect(pixelRatioFor(QUALITY.low, 2)).toBe(1);
    expect(pixelRatioFor(QUALITY.high, 3)).toBe(2);
    expect(pixelRatioFor(QUALITY.high, 1.25)).toBe(1.25);
    expect(pixelRatioFor(QUALITY.high, 0)).toBe(1);
  });
});

describe('tuỳ chỉnh đồ hoạ', () => {
  it('bật/tắt riêng đè lên preset', () => {
    const q = resolveQuality({ ...DEFAULT_GRAPHICS, overrides: { crowd: false, grass3d: false } });
    expect(q.crowd).toBe(false);
    expect(q.grass3d).toBe(false);
    expect(q.shadows).toBe(true);
    expect(
      resolveQuality({ ...DEFAULT_GRAPHICS, preset: 'low', overrides: { shadows: true } }).shadows,
    ).toBe(true);
  });

  it('tắt hậu kỳ thì tắt luôn bloom và SSAO; bật hậu kỳ trên Thấp thì có bloom', () => {
    const off = resolveQuality({ ...DEFAULT_GRAPHICS, overrides: { postFx: false } });
    expect(off.bloomStrength).toBe(0);
    expect(off.ssao).toBe(false);
    const on = resolveQuality({ ...DEFAULT_GRAPHICS, preset: 'low', overrides: { postFx: true } });
    expect(on.bloomStrength).toBeGreaterThan(0);
  });

  it('chỉnh về đúng giá trị preset thì bỏ khỏi overrides', () => {
    const a = toggleGraphics(DEFAULT_GRAPHICS, 'crowd', false);
    expect(a.overrides).toEqual({ crowd: false });
    expect(toggleGraphics(a, 'crowd', true).overrides).toEqual({});
  });

  it('đọc cài đặt đã lưu: bản cũ, JSON, dữ liệu hỏng', () => {
    expect(parseGraphicsSettings('low')).toEqual({ ...DEFAULT_GRAPHICS, preset: 'low' });
    expect(parseGraphicsSettings(null)).toEqual(DEFAULT_GRAPHICS);
    expect(parseGraphicsSettings('{bad')).toEqual(DEFAULT_GRAPHICS);
    expect(parseGraphicsSettings('42')).toEqual(DEFAULT_GRAPHICS);
    expect(
      parseGraphicsSettings(
        JSON.stringify({
          preset: 'low',
          overrides: { crowd: true, hack: true, ssao: 'x' },
          timeOfDay: 'day',
        }),
      ),
    ).toEqual({ preset: 'low', overrides: { crowd: true }, timeOfDay: 'day' });
    expect(parseGraphicsSettings(JSON.stringify({ timeOfDay: 'noon' })).timeOfDay).toBe('night');
  });
});
