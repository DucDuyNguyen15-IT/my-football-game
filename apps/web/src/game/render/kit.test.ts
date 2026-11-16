import { describe, expect, it } from 'vitest';
import { avatarSpec } from '@pitch/shared';
import { avatarSeedsForMatch, bodyRegion, kitColors, REGION, REGION_COUNT } from './kit';
import { COLORS } from './colors';

const hexToNum = (hex: string) => Number.parseInt(hex.slice(1), 16);

describe('bộ quần áo cầu thủ', () => {
  it('chia vùng theo tư thế chữ T', () => {
    expect(bodyRegion(0, 1.78)).toBe(REGION.hair);
    expect(bodyRegion(0, 1.65, -0.1)).toBe(REGION.hair);
    expect(bodyRegion(0, 1.6)).toBe(REGION.skin);
    expect(bodyRegion(0.12, 1.5, 0)).toBe(REGION.shirt);
    expect(bodyRegion(0, 1.2)).toBe(REGION.shirt);
    expect(bodyRegion(0.25, 1.43)).toBe(REGION.shirt);
    expect(bodyRegion(0.6, 1.43)).toBe(REGION.skin);
    expect(bodyRegion(0.1, 0.8)).toBe(REGION.shorts);
    expect(bodyRegion(0.1, 0.55)).toBe(REGION.skin);
    expect(bodyRegion(0.1, 0.3)).toBe(REGION.socks);
    expect(bodyRegion(0.1, 0.03)).toBe(REGION.boots);
  });

  it('màu áo theo đội, thủ môn áo riêng; da/tóc trùng miniface khi có seed hoặc ổn định theo id', () => {
    const home = kitColors('home', false, 'home-P1');
    expect(home).toHaveLength(REGION_COUNT);
    expect(home[REGION.shirt]).toBe(COLORS.team.home);
    expect(kitColors('away', true, 'away-GK')[REGION.shirt]).toBe(COLORS.keeper.away);
    expect(kitColors('home', false, 'home-P1')).toEqual(home);

    const fallbackSpec = avatarSpec('home-P1');
    expect(home[REGION.skin]).toBe(hexToNum(fallbackSpec.skin));
    expect(home[REGION.hair]).toBe(hexToNum(fallbackSpec.hair));

    const seed = 'cd681195';
    const cardSpec = avatarSpec(seed);
    const seeded = kitColors('home', false, 'home-P1', seed);
    expect(seeded[REGION.shirt]).toBe(COLORS.team.home);
    expect(seeded[REGION.skin]).toBe(hexToNum(cardSpec.skin));
    expect(seeded[REGION.hair]).toBe(hexToNum(cardSpec.hair));

    const looks = new Set(
      ['P1', 'P2', 'P3', 'P4', 'P5', 'P6'].map(
        (s) => kitColors('home', false, `home-${s}`)[REGION.skin],
      ),
    );
    expect(looks.size).toBeGreaterThan(1);
  });

  it('avatarSeedsForMatch rút seed cho cả đá chính, dự bị và đội máy từ danh mục thẻ', () => {
    const teams = {
      home: {
        players: [
          { slot: 'GK' as const, cardId: 'c1' },
          { slot: 'B1' as const, cardId: 'c2' },
          { slot: 'P1' as const },
        ],
      },
      away: {
        players: [
          { slot: 'GK' as const, cardId: 'c3' },
          { slot: 'P1' as const, cardId: 'missing' },
        ],
      },
    };
    const catalog = new Map([
      ['c1', { avatarSeed: 'seed-1' }],
      ['c2', { avatarSeed: 'seed-2' }],
      ['c3', { avatarSeed: 'seed-3' }],
    ]);

    expect(avatarSeedsForMatch(teams, undefined).size).toBe(0);
    const seeds = avatarSeedsForMatch(teams, catalog);
    expect(seeds.get('home-GK')).toBe('seed-1');
    expect(seeds.get('home-B1')).toBe('seed-2');
    expect(seeds.get('away-GK')).toBe('seed-3');
    expect(seeds.has('home-P1')).toBe(false);
    expect(seeds.has('away-P1')).toBe(false);
  });
});
