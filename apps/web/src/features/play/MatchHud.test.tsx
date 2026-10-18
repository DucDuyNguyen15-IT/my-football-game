import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerPanel, Scoreboard } from './MatchHud';
import type { HudSnapshot } from './hud';
import { PauseMenu, SubstitutionPanel, type PauseSubs } from './screens';

const hud = (over: Partial<HudSnapshot> = {}): HudSnapshot => ({
  score: { home: 2, away: 1 },
  half: 2,
  clock: "67'",
  phase: 'play',
  controlled: { id: 'home-P5', number: 6, position: 'FW', stamina: 42 },
  bookings: [],
  shots: { home: 5, away: 3 },
  foulRestart: null,
  ballDead: false,
  subsLeft: 3,
  substitutions: [],
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

describe('menu thay người', () => {
  const subs = (allowed: boolean): PauseSubs => ({
    allowed,
    left: 2,
    options: {
      onPitch: [{ id: 'home-P2', number: 3, position: 'DF', stamina: 25 }],
      bench: [{ slot: 'B1', number: 8, position: 'DF' }],
    },
    onSubstitute: () => {},
  });
  const noop = () => {};

  it('bóng sống: nút thay người mờ kèm lời nhắc', () => {
    const html = renderToStaticMarkup(
      <PauseMenu
        quality="high"
        onQuality={noop}
        onResume={noop}
        onQuit={noop}
        subs={subs(false)}
      />,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Thay người \(2 lượt\)/);
    expect(html).toContain('Chỉ thay người khi bóng chết');
  });

  it('bóng chết: nút thay người bật', () => {
    const html = renderToStaticMarkup(
      <PauseMenu quality="high" onQuality={noop} onResume={noop} onQuit={noop} subs={subs(true)} />,
    );
    expect(html).not.toMatch(/disabled=""[^>]*>Thay người/);
  });

  it('panel liệt kê người ra (kèm thể lực) và người vào, chưa chọn thì không xác nhận được', () => {
    const html = renderToStaticMarkup(<SubstitutionPanel subs={subs(true)} onBack={noop} />);
    expect(html).toContain('25%');
    expect(html).toContain('Còn 2 lượt');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Thay người<\/button>/);
  });
});
