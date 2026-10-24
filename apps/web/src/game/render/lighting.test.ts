import { describe, expect, it } from 'vitest';
import { LIGHTING } from './lighting';

describe('ánh sáng theo thời điểm', () => {
  it('chỉ đêm có sao; ban ngày tắt đèn pha, đêm bật đủ', () => {
    expect(LIGHTING.night.stars).toBe(true);
    expect(LIGHTING.dusk.stars).toBe(false);
    expect(LIGHTING.day.floodScale).toBe(0);
    expect(LIGHTING.night.floodScale).toBe(1);
  });

  it('hoàng hôn mặt trời thấp hơn (bóng dài hơn) ban ngày', () => {
    expect(LIGHTING.dusk.sunPos[1]).toBeLessThan(LIGHTING.day.sunPos[1]);
  });
});
