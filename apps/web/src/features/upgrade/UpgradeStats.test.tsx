import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { Card, UpgradeConfig } from '@pitch/shared';
import { upgradePreview } from './upgrade';
import { UpgradeStats } from './UpgradeStats';

const cfg: UpgradeConfig = {
  maxLevel: 5,
  luckPerFail: 10,
  steps: [
    { toLevel: 1, baseRate: 100, baseFee: 50 },
    { toLevel: 2, baseRate: 80, baseFee: 100 },
    { toLevel: 3, baseRate: 60, baseFee: 200 },
    { toLevel: 4, baseRate: 40, baseFee: 400 },
    { toLevel: 5, baseRate: 25, baseFee: 800 },
  ],
  rarityFeeMultiplier: { bronze: 1, silver: 2, gold: 3, legend: 5 },
};

const base = {
  pace: 80,
  shooting: 97,
  passing: 70,
  dribbling: 80,
  defending: 40,
  stamina: 70,
  reflexes: 60,
  handling: 61,
  positioning: 62,
  kicking: 63,
};
const card = (position: Card['position']): Card => ({
  id: '1',
  code: 'X-1',
  name: 'Rafinho Duarte',
  nickname: 'Ma tốc độ',
  position,
  rarity: 'gold',
  stats: base,
  ovr: 80,
  avatarSeed: 'a1b2c3d4',
});

const cells = (html: string, abbr: string) =>
  html
    .match(new RegExp(`<th scope="row"[^>]*>${abbr}</th>(.*?)</tr>`))?.[1]
    ?.match(/<td[^>]*>([^<]*)<\/td>/g)
    ?.map((td) => td.replace(/<[^>]+>/g, ''));

describe('<UpgradeStats> — chỉ số sau ép', () => {
  it('+3 → +4: mỗi chỉ số cộng 5 thay vì 3 (tăng 2), kẹp 99', () => {
    const c = card('FW');
    const html = renderToStaticMarkup(
      <UpgradeStats card={c} preview={upgradePreview(c, { level: 3, luck: 0 }, cfg)!} />,
    );
    expect(cells(html, 'PAC')).toEqual(['83', '→', '85', '+2']);
    expect(cells(html, 'SHO')).toEqual(['99', '→', '99', '—']);
    expect(html).toContain('>OVR<');
  });

  it('thủ môn hiện chỉ số thủ môn', () => {
    const c = card('GK');
    const html = renderToStaticMarkup(
      <UpgradeStats card={c} preview={upgradePreview(c, { level: 0, luck: 0 }, cfg)!} />,
    );
    expect(cells(html, 'REF')).toEqual(['60', '→', '61', '+1']);
    expect(html).not.toContain('>SHO<');
  });
});
