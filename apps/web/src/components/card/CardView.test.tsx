import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { computeOvr, type Card } from '@pitch/shared';
import { Avatar } from './Avatar';
import { CardView, cardLabel } from './CardView';

const card = (over: Partial<Card> = {}): Card => ({
  id: '7',
  code: 'FW-0007',
  name: 'Rafinho Duarte',
  nickname: 'Ma tốc độ',
  position: 'FW',
  rarity: 'gold',
  stats: {
    pace: 88,
    shooting: 84,
    passing: 70,
    dribbling: 80,
    defending: 40,
    stamina: 75,
    reflexes: 10,
    handling: 10,
    positioning: 10,
    kicking: 10,
  },
  ovr: 81,
  avatarSeed: 'a1b2c3d4',
  ...over,
});

const svgOf = (html: string) => html.match(/<svg[\s\S]*?<\/svg>/)?.[0];

describe('<CardView>', () => {
  it('cùng avatar_seed → cùng ảnh, khác seed → khác ảnh', () => {
    const a = svgOf(renderToStaticMarkup(<CardView card={card()} />));
    const b = svgOf(renderToStaticMarkup(<CardView card={card({ id: '9', name: 'X Y' })} />));
    const c = svgOf(renderToStaticMarkup(<CardView card={card({ avatarSeed: 'ffff0000' })} />));
    expect(a).toBeDefined();
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('hiện OVR, vị trí, họ, biệt danh, nhãn độ hiếm và chỉ số dạng PAC 88', () => {
    const html = renderToStaticMarkup(<CardView card={card()} size="lg" />);
    expect(html).toContain('>81<');
    expect(html).toContain('>FW<');
    expect(html).toContain('Duarte');
    expect(html).toContain('Ma tốc độ');
    expect(html).toContain('Vàng');
    expect(html).toContain('◆◆◆');
    expect(html).toMatch(/<b>88<\/b><span>PAC<\/span>/);
    expect(html).toContain('r-gold');
  });

  it('thủ môn dùng chỉ số REF/HAN/POS/KIC; cỡ sm không có chỉ số', () => {
    const gk = card({ position: 'GK' });
    expect(renderToStaticMarkup(<CardView card={gk} />)).toContain('REF');
    expect(renderToStaticMarkup(<CardView card={gk} size="sm" />)).not.toContain('REF');
  });

  it('cấp + hiện huy hiệu và OVR tính từ chỉ số hiệu lực', () => {
    const c = card();
    const boosted = { ...c.stats, pace: 95, shooting: 91 };
    const html = renderToStaticMarkup(<CardView card={c} level={3} stats={boosted} />);
    expect(html).toContain('+3');
    expect(html).toContain(`>${computeOvr('FW', boosted)}<`);
  });

  it('aria-label đọc được độ hiếm, tên, vị trí, OVR', () => {
    expect(cardLabel(card())).toBe('Vàng, Rafinho Duarte, Tiền đạo, OVR 81');
    expect(renderToStaticMarkup(<CardView card={card()} />)).toContain(
      'aria-label="Vàng, Rafinho Duarte, Tiền đạo, OVR 81"',
    );
  });

  it('Avatar tất định theo seed', () => {
    expect(renderToStaticMarkup(<Avatar seed="s1" />)).toBe(
      renderToStaticMarkup(<Avatar seed="s1" />),
    );
  });
});
