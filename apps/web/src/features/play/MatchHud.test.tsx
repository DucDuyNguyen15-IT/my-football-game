import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PlayerPanel, Scoreboard, ShootoutPanel } from './MatchHud';
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
    expect(html).toContain('Nhà 2, Khách 1');
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
    expect(html).toContain('hud-stamina--low');
    expect(html).toContain('42%');
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
        hud={hud()}
        graphics={DEFAULT_GRAPHICS}
        onGraphics={noop}
        onResume={noop}
        onQuit={noop}
        subs={subs(false)}
      />,
    );
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Thay người <span class="tag">Còn 2 lượt/);
    expect(html).toContain('Chỉ thay người khi bóng chết');
    expect(html).toContain('Tạm dừng · H2 67');
  });

  it('bóng chết: nút thay người bật', () => {
    const html = renderToStaticMarkup(
      <PauseMenu
        hud={hud()}
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
    const html = renderToStaticMarkup(<SubstitutionPanel subs={subs(true)} />);
    expect(html).toContain('25%');
    expect(html).toContain('Còn 2 lượt');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>Thay người<\/button>/);
  });
});

describe('Scoreboard khi luân lưu', () => {
  const so = { home: [true, false], away: [true], turn: 'away' as const };

  it('thay đồng hồ bằng tỉ số luân lưu', () => {
    const html = renderToStaticMarkup(<Scoreboard hud={hud({ shootout: so })} />);
    expect(html).toMatch(/Luân lưu <b class="num">1–1<\/b>/);
    expect(html).not.toContain('H2');
  });

  it('bảng luân lưu: chấm trúng/trượt/chưa sút, lượt đang đá', () => {
    const html = renderToStaticMarkup(<ShootoutPanel shootout={so} />);
    expect(html.match(/class="dot hit"/g)).toHaveLength(2);
    expect(html.match(/class="dot miss"/g)).toHaveLength(1);
    expect(html.match(/class="dot"/g)).toHaveLength(7);
    expect(html).toContain('Lượt 2/5 · Khách sút');
  });
});

describe('ResultScreen', () => {
  const result = (reward: RewardStatus) =>
    renderToStaticMarkup(
      <MemoryRouter>
        <ResultScreen
          hud={hud({ score: { home: 2, away: 0 }, phase: 'full_time' })}
          difficulty="hard"
          matches={{ today: 4, limit: 15 }}
          reward={reward}
          onRetryReward={() => {}}
          onRematch={() => {}}
        />
      </MemoryRouter>,
    );

  it('hiện xu nhận từ server; hết lượt thưởng; lỗi mạng cho gửi lại', () => {
    expect(result({ kind: 'pending' })).toContain('Đang ghi nhận kết quả');
    const won = result({ kind: 'done', reward: 120, balance: 1360 });
    expect(won).toMatch(/\+120<\/span> xu/);
    expect(won).toContain('Thắng mức Khó · trận có thưởng 4/15 · ví: 1.360 xu');
    expect(result({ kind: 'done', reward: 0, balance: 50 })).toContain('Trận luyện tập');
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
          difficulty="easy"
          matches={null}
          reward={{ kind: 'pending' }}
          onRetryReward={() => {}}
          onRematch={() => {}}
        />
      </MemoryRouter>,
    );
    expect(html).toContain('Thắng luân lưu</h1>');
    expect(html).toMatch(/Luân lưu <b class="num">3 – 0<\/b>/);
  });

  it('menu đồ hoạ: preset Cao chọn sẵn; tắt hậu kỳ thì SSAO bị khoá', () => {
    const noop = () => {};
    const html = renderToStaticMarkup(
      <GraphicsPanel graphics={DEFAULT_GRAPHICS} onChange={noop} />,
    );
    expect(html).toContain('Khán giả');
    expect(html).toContain('Hoàng hôn');
    const off = renderToStaticMarkup(
      <GraphicsPanel
        graphics={{ ...DEFAULT_GRAPHICS, overrides: { postFx: false } }}
        onChange={noop}
      />,
    );
    expect(html).toMatch(/aria-pressed="true">Cao</);
    expect(off).toMatch(/Che bóng môi trường[^]*?Cần bật hậu kỳ[^]*?disabled=""/);
    expect(off).toContain('Tuỳ chỉnh');
  });
});
