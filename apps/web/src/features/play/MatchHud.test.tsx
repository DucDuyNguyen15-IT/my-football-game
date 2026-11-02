import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerPanel, Scoreboard } from './MatchHud';
import type { HudSnapshot } from './hud';
import { MemoryRouter } from 'react-router';
import { DEFAULT_GRAPHICS } from '../../game/render/quality';
import {
  GraphicsPanel,
  PauseMenu,
  ResultScreen,
  SubstitutionPanel,
  type PauseSubs,
  type RewardStatus,
} from './screens';

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
  shootout: null,
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
        graphics={DEFAULT_GRAPHICS}
        onGraphics={noop}
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
      <PauseMenu
        graphics={DEFAULT_GRAPHICS}
        onGraphics={noop}
        onResume={noop}
        onQuit={noop}
        subs={subs(true)}
      />,
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

describe('Scoreboard khi luân lưu', () => {
  it('thay đồng hồ bằng hàng chấm luân lưu', () => {
    const html = renderToStaticMarkup(
      <Scoreboard hud={hud({ shootout: { home: [true, false], away: [true], turn: 'away' } })} />,
    );
    expect(html).toContain('Luân lưu 1–1');
    expect(html.match(/hud-kick--scored/g)).toHaveLength(2);
    expect(html.match(/hud-kick--missed/g)).toHaveLength(1);
    expect(html).not.toContain('H2');
  });
});

describe('ResultScreen', () => {
  const result = (reward: RewardStatus) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ResultScreen
          hud={hud({ score: { home: 2, away: 0 }, phase: 'full_time' })}
          reward={reward}
          onRetryReward={() => {}}
          onRematch={() => {}}
        />
      </MemoryRouter>,
    );

  it('hiện xu nhận từ server; hết lượt thưởng; lỗi mạng cho gửi lại', () => {
    expect(result({ kind: 'pending' })).toContain('Đang ghi nhận kết quả');
    expect(result({ kind: 'done', reward: 120 })).toContain('+120 xu');
    expect(result({ kind: 'done', reward: 0 })).toContain('Không có thưởng');
    const offline = result({ kind: 'error', message: 'Mất mạng', retryable: true });
    expect(offline).toContain('Mất mạng');
    expect(offline).toContain('Gửi lại kết quả');
    expect(result({ kind: 'error', message: 'Quá sớm', retryable: false })).not.toContain(
      'Gửi lại kết quả',
    );
  });

  it('hoà có luân lưu: hiện Hoà kèm Thắng luân lưu', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <ResultScreen
          hud={hud({
            score: { home: 1, away: 1 },
            phase: 'full_time',
            shootout: { home: [true, true, true], away: [false, false, false], turn: null },
          })}
          reward={{ kind: 'pending' }}
          onRetryReward={() => {}}
          onRematch={() => {}}
        />
      </MemoryRouter>,
    );
    expect(html).toContain('Thắng luân lưu 3 – 0');
  });

  it('menu đồ hoạ: preset Cao chọn sẵn; tắt hậu kỳ thì SSAO bị khoá', () => {
    const noop = () => {};
    const html = renderToStaticMarkup(
      <GraphicsPanel graphics={DEFAULT_GRAPHICS} onChange={noop} onBack={noop} />,
    );
    expect(html).toContain('Khán giả');
    expect(html).toContain('Hoàng hôn');
    const off = renderToStaticMarkup(
      <GraphicsPanel
        graphics={{ ...DEFAULT_GRAPHICS, overrides: { postFx: false } }}
        onChange={noop}
        onBack={noop}
      />,
    );
    expect(off).toMatch(/disabled=""[^>]*\/>Che bóng môi trường/);
  });
});
