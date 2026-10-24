import { describe, expect, it } from 'vitest';
import { bodyRegion, kitColors, REGION, REGION_COUNT } from './kit';
import { COLORS } from './colors';

describe('bộ quần áo cầu thủ', () => {
  it('chia vùng theo tư thế chữ T', () => {
    expect(bodyRegion(0, 1.78)).toBe(REGION.hair);
    expect(bodyRegion(0, 1.6)).toBe(REGION.skin);
    expect(bodyRegion(0, 1.2)).toBe(REGION.shirt);
    expect(bodyRegion(0.25, 1.43)).toBe(REGION.shirt);
    expect(bodyRegion(0.6, 1.43)).toBe(REGION.skin);
    expect(bodyRegion(0.1, 0.8)).toBe(REGION.shorts);
    expect(bodyRegion(0.1, 0.55)).toBe(REGION.skin);
    expect(bodyRegion(0.1, 0.3)).toBe(REGION.socks);
    expect(bodyRegion(0.1, 0.03)).toBe(REGION.boots);
  });

  it('màu áo theo đội, thủ môn áo riêng; da/tóc ổn định theo id', () => {
    const home = kitColors('home', false, 'home-P1');
    expect(home).toHaveLength(REGION_COUNT);
    expect(home[REGION.shirt]).toBe(COLORS.team.home);
    expect(kitColors('away', true, 'away-GK')[REGION.shirt]).toBe(COLORS.keeper.away);
    expect(kitColors('home', false, 'home-P1')).toEqual(home);
    const looks = new Set(
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(
        (s) => kitColors('home', false, `home-${s}`)[REGION.skin],
      ),
    );
    expect(looks.size).toBeGreaterThan(1);
  });
});
