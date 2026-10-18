import { describe, expect, it } from 'vitest';
import { pixelRatioFor, QUALITY } from './quality';

describe('mức đồ hoạ', () => {
  it('Thấp nhẹ hơn Cao ở mọi mục tốn GPU', () => {
    const { low, high } = QUALITY;
    expect(low.shadows).toBe(false);
    expect(low.postFx).toBe(false);
    expect(low.floodSpots).toBe(false);
    expect(low.skyAndRoof).toBe(false);
    expect(high.shadowMapSize).toBeGreaterThan(low.shadowMapSize);
    expect(high.maxPixelRatio).toBeGreaterThan(low.maxPixelRatio);
    expect(high.bloomStrength).toBeGreaterThan(0);
  });

  it('pixel ratio theo màn hình nhưng có trần, không dưới 1', () => {
    expect(pixelRatioFor('low', 2)).toBe(1);
    expect(pixelRatioFor('high', 3)).toBe(2);
    expect(pixelRatioFor('high', 1.25)).toBe(1.25);
    expect(pixelRatioFor('high', 0)).toBe(1);
  });
});
