import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerPanel, Scoreboard } from './MatchHud';
import type { HudSnapshot } from './hud';

const hud = (over: Partial<HudSnapshot> = {}): HudSnapshot => ({
  score: { home: 2, away: 1 },
  half: 2,
  clock: "67'",
  phase: 'play',
  controlled: { id: 'home-P5', number: 6, position: 'FW', stamina: 42 },
  bookings: [],
  shots: { home: 5, away: 3 },
  foulRestart: null,
  ...over,
});

describe('Scoreboard', () => {
  it('hiện tỉ số, hiệp và phút', () => {
    const html = renderToStaticMarkup(<Scoreboard hud={hud()} />);
    expect(html).toContain('2 – 1');
    expect(html).toContain('H2');
    expect(html).toContain('67&#x27;');
  });

  it('bù giờ hiện dạng 90+2', () => {
    const html = renderToStaticMarkup(<Scoreboard hud={hud({ clock: "90+2'" })} />);
    expect(html).toContain('90+2&#x27;');
  });
});

describe('PlayerPanel', () => {
  it('thanh thể lực vàng khi < 50%', () => {
    const html = renderToStaticMarkup(<PlayerPanel controlled={hud().controlled} />);
    expect(html).toContain('hud-stamina-fill--low');
    expect(html).toContain('aria-valuenow="42"');
  });

  it('không có người điều khiển thì không vẽ', () => {
    expect(renderToStaticMarkup(<PlayerPanel controlled={null} />)).toBe('');
  });
});
