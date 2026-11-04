/**
 * Các màn của luồng trận (docs/design/screens/match*.html, pause.html, result*.html): HUD phụ (gợi ý
 * phím, nghỉ giữa hiệp), menu tạm dừng, kết quả.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import type { Difficulty, SquadSlot } from '@pitch/shared';
import type { GraphicsSettings } from '../../game/bridge';
import {
  GRAPHICS_TOGGLES,
  TIMES_OF_DAY,
  resolveQuality,
  toggleGraphics,
} from '../../game/render/quality';
import {
  CARD_LABEL,
  TEAM_LABEL,
  canSwap,
  matchOutcome,
  shootoutOutcome,
  shootoutScore,
  type HudSnapshot,
  type SubOptions,
} from './hud';

const fmt = (n: number) => n.toLocaleString('vi-VN');
const POSITION_NAME = { GK: 'Thủ môn', DF: 'Hậu vệ', MF: 'Tiền vệ', FW: 'Tiền đạo' } as const;

const CONTROLS: ReadonlyArray<readonly [string, string, string]> = [
  ['Mũi tên', 'Di chuyển', 'Di chuyển'],
  ['E (giữ)', 'Chạy nước rút', 'Chạy nước rút'],
  ['S', 'Chuyền sệt', 'Đổi cầu thủ'],
  ['A', 'Chuyền bổng', 'Xoạc'],
  ['D (giữ)', 'Sút (giữ để tăng lực)', 'Áp sát / tắc bóng'],
  ['W', 'Chọc khe', '—'],
  ['Q + W', 'Chọc khe bổng', '—'],
  ['Esc', 'Tạm dừng', 'Tạm dừng'],
];

export function ControlsTable() {
  return (
    <table className="table">
      <thead>
        <tr>
          <th scope="col">Phím</th>
          <th scope="col">Có bóng</th>
          <th scope="col">Không có bóng</th>
        </tr>
      </thead>
      <tbody>
        {CONTROLS.map(([key, attack, defend]) => (
          <tr key={key}>
            <th scope="row">
              <kbd className="kbd">{key}</kbd>
            </th>
            <td>{attack}</td>
            <td>{defend}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Lượt sút luân lưu của người chơi: nhắc cách sút (match-shootout.html). */
export function ShootoutHint() {
  return (
    <p className="hud-panel hud-keys" role="status">
      <span className="keyhint">
        <kbd className="kbd">Mũi tên</kbd>Chọn góc
      </span>
      <span className="keyhint">
        <kbd className="kbd">D</kbd>Giữ để nạp lực, nhả để sút
      </span>
      <span className="keyhint">
        <kbd className="kbd">Esc</kbd>Tạm dừng
      </span>
    </p>
  );
}

const KEY_HINTS: ReadonlyArray<readonly [string, string]> = [
  ['← ↑ → ↓', 'Di chuyển'],
  ['E', 'Nước rút'],
  ['S', 'Chuyền / đổi người'],
  ['A', 'Chuyền bổng / xoạc'],
  ['D', 'Sút / áp sát'],
  ['W', 'Chọc khe'],
  ['Q+W', 'Chọc khe bổng'],
  ['Esc', 'Tạm dừng'],
];

/** Dải gợi ý phím ở cạnh dưới trong những giây đầu trận. */
export function KeyHints() {
  return (
    <p className="hud-panel hud-keys">
      {KEY_HINTS.map(([k, t]) => (
        <span key={k} className="keyhint">
          <kbd className="kbd">{k}</kbd>
          {t}
        </span>
      ))}
    </p>
  );
}

/** Nghỉ giữa hiệp: dải sự kiện "Hết hiệp 1" giữ nguyên dưới bảng tỉ số (match-events.html). */
export function HalfTimeStrip() {
  return (
    <div className="event-strip hud-event hud-event--half" role="status">
      <span className="event-strip__mark" aria-hidden="true">
        ■
      </span>
      <span>
        Hết hiệp 1 · nhấn <kbd className="kbd">S</kbd> để đá hiệp 2
      </span>
    </div>
  );
}

export interface PauseSubs {
  /** Bóng chết — chỉ khi đó mới được thay (PRD §5). */
  allowed: boolean;
  left: number;
  options: SubOptions;
  onSubstitute: (outId: string, benchSlot: SquadSlot) => void;
}

const staminaTone = (v: number) => (v < 30 ? ' is-critical' : v < 50 ? ' is-low' : '');

/** Chọn người ra (trên sân) và người vào (dự bị) rồi xác nhận. */
export function SubstitutionPanel({ subs }: { subs: PauseSubs }) {
  const [outId, setOutId] = useState<string | null>(null);
  const [inSlot, setInSlot] = useState<SquadSlot | null>(null);
  const out = subs.options.onPitch.find((p) => p.id === outId);
  const incoming = subs.options.bench.find((b) => b.slot === inSlot);
  const mismatch =
    out !== undefined && incoming !== undefined && !canSwap(out.position, incoming.position);
  const valid = out !== undefined && incoming !== undefined && !mismatch && subs.left > 0;
  return (
    <>
      <h3 className="panel__title" id="pause-panel-title">
        Thay người <span className="meta">Còn {subs.left} lượt</span>
      </h3>
      <div className="subs">
        <fieldset className="subs__col">
          <legend className="label">Ra sân</legend>
          {subs.options.onPitch.map((p) => (
            <label key={p.id} className="subs__item">
              <input
                type="radio"
                name="sub-out"
                className="sr-only"
                checked={outId === p.id}
                onChange={() => setOutId(p.id)}
              />
              <span className="display num subs__num">{p.number}</span>
              <abbr className={`pos pos--${p.position}`} title={POSITION_NAME[p.position]}>
                {p.position}
              </abbr>
              <span className={`num subs__stamina${staminaTone(p.stamina)}`}>{p.stamina}%</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="subs__col">
          <legend className="label">Vào sân</legend>
          {subs.options.bench.length === 0 && <p className="muted">Hết dự bị</p>}
          {subs.options.bench.map((b) => (
            <label key={b.slot} className="subs__item">
              <input
                type="radio"
                name="sub-in"
                className="sr-only"
                checked={inSlot === b.slot}
                onChange={() => setInSlot(b.slot)}
              />
              <span className="display num subs__num">{b.number}</span>
              <abbr className={`pos pos--${b.position}`} title={POSITION_NAME[b.position]}>
                {b.position}
              </abbr>
            </label>
          ))}
        </fieldset>
      </div>
      {mismatch && (
        <p className="subs__warn" role="alert">
          Thủ môn chỉ thay được bằng thủ môn.
        </p>
      )}
      <button
        type="button"
        className="btn btn--primary pause__confirm"
        disabled={!valid}
        onClick={() => {
          if (!out || !incoming) return;
          subs.onSubstitute(out.id, incoming.slot);
          setOutId(null);
          setInSlot(null);
        }}
      >
        Thay người
      </button>
    </>
  );
}

const PRESET_LABEL = { low: 'Thấp', high: 'Cao' } as const;

/**
 * Cài đặt đồ hoạ (task 5.21): chọn preset rồi bật/tắt riêng từng chi tiết; chọn lại preset thì xoá
 * phần tuỳ chỉnh. Áp dụng ngay, không tạo lại trận.
 */
export function GraphicsPanel({
  graphics,
  onChange,
}: {
  graphics: GraphicsSettings;
  onChange: (g: GraphicsSettings) => void;
}) {
  const q = resolveQuality(graphics);
  const custom = Object.keys(graphics.overrides).length > 0;
  return (
    <>
      <h3 className="panel__title" id="pause-panel-title">
        Đồ hoạ{' '}
        <span className="meta">
          Áp dụng ngay · {custom ? 'Tuỳ chỉnh' : PRESET_LABEL[graphics.preset]}
        </span>
      </h3>
      <div className="pause-row">
        <span id="gfx-preset">Chất lượng</span>
        <div className="seg" role="group" aria-labelledby="gfx-preset">
          {(['low', 'high'] as const).map((preset) => {
            const on = graphics.preset === preset && !custom;
            return (
              <button
                key={preset}
                type="button"
                className={`seg__opt${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => onChange({ ...graphics, preset, overrides: {} })}
              >
                {PRESET_LABEL[preset]}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pause-row">
        <span id="gfx-time">Thời điểm</span>
        <div className="seg" role="group" aria-labelledby="gfx-time">
          {TIMES_OF_DAY.map((t) => {
            const on = graphics.timeOfDay === t.key;
            return (
              <button
                key={t.key}
                type="button"
                className={`seg__opt${on ? ' is-on' : ''}`}
                aria-pressed={on}
                onClick={() => onChange({ ...graphics, timeOfDay: t.key })}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="pause-switches">
        {GRAPHICS_TOGGLES.map((t) => {
          // SSAO chạy trong hậu kỳ: tắt hậu kỳ thì SSAO mờ đi.
          const blocked = t.key === 'ssao' && !q.postFx;
          const on = q[t.key];
          return (
            <label
              key={t.key}
              className={`switch${on ? ' is-on' : ''}${blocked ? ' is-blocked' : ''}`}
            >
              <span className="pause-switch__text">
                <span>{t.label}</span>
                {t.key === 'grass3d' && <span className="muted">Tốn GPU nhất — tắt nếu giật</span>}
                {blocked && <span className="muted">Cần bật hậu kỳ</span>}
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={on}
                disabled={blocked}
                onChange={(e) => onChange(toggleGraphics(graphics, t.key, e.target.checked))}
              />
              <span className="switch__track" aria-hidden="true" />
            </label>
          );
        })}
      </div>
    </>
  );
}

type PauseView = 'graphics' | 'controls' | 'subs' | 'confirm';

const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M4 2.5v11l9-5.5z" />
  </svg>
);

/**
 * Menu tạm dừng (pause.html): cột nút bên trái, panel bên phải theo mục đang chọn (Đồ hoạ mặc
 * định). Bỏ trận hỏi xác nhận trong panel.
 */
export function PauseMenu({
  hud,
  graphics,
  onGraphics,
  onResume,
  onQuit,
  subs,
}: {
  hud: Pick<HudSnapshot, 'half' | 'clock'> | null;
  graphics: GraphicsSettings;
  onGraphics: (g: GraphicsSettings) => void;
  onResume: () => void;
  onQuit: () => void;
  subs: PauseSubs;
}) {
  const [view, setView] = useState<PauseView>('graphics');
  const subsOff = !subs.allowed || subs.left === 0;
  // Đang mở panel thay người mà bóng sống lại (không xảy ra khi tạm dừng) → về Đồ hoạ.
  const shown: PauseView = view === 'subs' && subsOff ? 'graphics' : view;
  const pick = (v: PauseView) => ({
    'aria-pressed': shown === v,
    'aria-controls': 'pause-panel',
    onClick: () => setView(v),
  });
  return (
    <div className="scrim pause" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="pause__menu">
        {hud && (
          <span className="label">
            Tạm dừng · H{hud.half} {hud.clock}
          </span>
        )}
        <h2 id="pause-title" className="h1 pause__title">
          Tạm dừng
        </h2>
        <button
          type="button"
          className="btn btn--primary btn--lg btn--block pause__btn"
          autoFocus
          onClick={onResume}
        >
          <PlayIcon />
          Tiếp tục
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--lg btn--block pause__btn pause__btn--split"
          disabled={subsOff}
          aria-describedby="subs-hint"
          {...pick('subs')}
        >
          Thay người <span className="tag">Còn {subs.left} lượt</span>
        </button>
        <span id="subs-hint" className="muted pause__hint">
          {subs.left === 0
            ? 'Đã dùng hết lượt thay người.'
            : 'Chỉ thay người khi bóng chết (biên, góc, phạt, bàn thắng).'}
        </span>
        <button
          type="button"
          className="btn btn--secondary btn--lg btn--block pause__btn"
          {...pick('graphics')}
        >
          Đồ hoạ
        </button>
        <button
          type="button"
          className="btn btn--secondary btn--lg btn--block pause__btn"
          {...pick('controls')}
        >
          Phím điều khiển
        </button>
        <button
          type="button"
          className="btn btn--danger btn--lg btn--block pause__btn pause__quit"
          {...pick('confirm')}
        >
          Bỏ trận
        </button>
        <span className="muted pause__hint">Bỏ trận bị tính thua (hỏi xác nhận).</span>
      </div>
      <section
        id="pause-panel"
        className="panel panel--raised pause__panel"
        aria-labelledby="pause-panel-title"
      >
        {shown === 'subs' && <SubstitutionPanel subs={subs} />}
        {shown === 'graphics' && <GraphicsPanel graphics={graphics} onChange={onGraphics} />}
        {shown === 'controls' && (
          <>
            <h3 className="panel__title" id="pause-panel-title">
              Phím điều khiển
            </h3>
            <ControlsTable />
          </>
        )}
        {shown === 'confirm' && (
          <>
            <h3 className="panel__title" id="pause-panel-title">
              Bỏ trận?
            </h3>
            <p className="muted">Bỏ trận sẽ bị tính thua. Chắc chắn bỏ?</p>
            <div className="pause__actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => setView('graphics')}
              >
                Không, đá tiếp
              </button>
              <button type="button" className="btn btn--danger" autoFocus onClick={onQuit}>
                Bỏ trận
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

const OUTCOME_LABEL = { win: 'Thắng', draw: 'Hoà', loss: 'Thua' } as const;
const SHOOTOUT_LABEL = { win: 'Thắng luân lưu', loss: 'Thua luân lưu' } as const;
const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Dễ', hard: 'Khó' };

/** Trạng thái nộp kết quả lên server (thưởng do server tính). */
export type RewardStatus =
  | { kind: 'pending' }
  | { kind: 'done'; reward: number; balance: number }
  | { kind: 'error'; message: string; retryable: boolean; retrying?: boolean };

/** Số trận có thưởng hôm nay (từ /me, đọc lại sau khi nộp kết quả). */
export interface RewardedMatches {
  today: number;
  limit: number;
}

const WarnIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    <path d="M8 2l6.5 12h-13z" />
    <path d="M8 7v3M8 12v.5" />
  </svg>
);

function Coin({ value, muted }: { value: string; muted?: boolean }) {
  return (
    <span className={`coin coin--xl${muted ? ' result-coin--none' : ''}`}>
      <span className="coin__icon" aria-hidden="true" />
      <span className="num">{value}</span> xu
    </span>
  );
}

function RewardBlock({
  status,
  caption,
  matches,
  onRetry,
}: {
  status: RewardStatus;
  caption: string;
  matches: RewardedMatches | null;
  onRetry: () => void;
}) {
  if (status.kind === 'pending') {
    return (
      <div className="result-reward" role="status" aria-busy="true">
        <span className="label">Thưởng trận</span>
        <span className="skel skel--line result-reward__skel" aria-hidden="true" />
        <span className="muted">Đang ghi nhận kết quả…</span>
      </div>
    );
  }
  if (status.kind === 'error') {
    return (
      <div className="result-reward" role="alert">
        <span className="label">Thưởng trận</span>
        <div className="banner banner--danger">
          <WarnIcon />
          <span>
            <b>{status.message}</b>
            {status.retryable && ' Thưởng sẽ được cộng khi máy chủ xác nhận.'}
          </span>
        </div>
        {status.retryable && (
          <button
            type="button"
            className={`btn btn--primary${status.retrying ? ' is-loading' : ''}`}
            aria-busy={status.retrying || undefined}
            disabled={status.retrying}
            onClick={onRetry}
          >
            <span className="btn__label">Gửi lại kết quả</span>
          </button>
        )}
      </div>
    );
  }
  if (status.reward === 0) {
    return (
      <div className="result-reward" role="status">
        <span className="label">Thưởng trận</span>
        <div className="banner">
          <WarnIcon />
          <span>
            <b>Trận luyện tập</b> — không có thưởng vì đã đủ số trận có thưởng hôm nay.
          </span>
        </div>
        <Coin value="+0" muted />
        <span className="muted">Ví: {fmt(status.balance)} xu</span>
      </div>
    );
  }
  return (
    <div className="result-reward" role="status">
      <span className="label">Thưởng trận</span>
      <Coin value={`+${fmt(status.reward)}`} />
      <span className="muted">
        {caption}
        {matches && ` · trận có thưởng ${matches.today}/${matches.limit}`} · ví:{' '}
        {fmt(status.balance)} xu
      </span>
    </div>
  );
}

function StatRow({ title, home, away }: { title: string; home: number; away: number }) {
  const total = home + away;
  return (
    <div className="result-stat" role="group" aria-label={`${title}: Nhà ${home}, Khách ${away}`}>
      <span className="display num">{home}</span>
      <div className="result-stat__mid" aria-hidden="true">
        <span className="label">{title}</span>
        <div className={`result-stat__bars${total ? '' : ' is-empty'}`}>
          <span className="result-stat__home" style={{ flexGrow: total ? home : 1 }} />
          <span className="result-stat__away" style={{ flexGrow: total ? away : 1 }} />
        </div>
      </div>
      <span className="display num result-stat__r">{away}</span>
    </div>
  );
}

interface ResultScreenProps {
  hud: HudSnapshot;
  difficulty: Difficulty;
  reward: RewardStatus;
  matches: RewardedMatches | null;
  onRetryReward: () => void;
  onRematch: () => void;
}

/** Màn kết quả (result.html, result-states.html). Xu nhận lấy từ server. */
export function ResultScreen({
  hud,
  difficulty,
  reward,
  matches,
  onRetryReward,
  onRematch,
}: ResultScreenProps) {
  const outcome = matchOutcome(hud.score);
  const shootout = shootoutOutcome(hud);
  const pens = hud.shootout && shootoutScore(hud.shootout);
  const count = (team: 'home' | 'away', card: 'yellow' | 'red') =>
    hud.bookings.filter((b) => b.team === team && b.card === card).length;
  const headline = shootout ? SHOOTOUT_LABEL[shootout] : OUTCOME_LABEL[outcome];
  const level = DIFFICULTY_LABEL[difficulty];
  return (
    <main className="night-bg result" aria-labelledby="result-title">
      <div className="result__main">
        <span className="label">
          Kết thúc · vs Máy mức {level} · {hud.shootout ? '2 hiệp + luân lưu' : '2 hiệp'}
        </span>
        <p className="result__score" aria-label={`Nhà ${hud.score.home}, Khách ${hud.score.away}`}>
          <span className="display result__team" aria-hidden="true">
            <span className="result__sw result__sw--home" />
            NHÀ
          </span>
          <span className="display num result__goals" aria-hidden="true">
            {hud.score.home} – {hud.score.away}
          </span>
          <span className="display result__team" aria-hidden="true">
            KHÁCH
            <span className="result__sw result__sw--away" />
          </span>
        </p>
        {pens && (
          <span className="muted result__pens">
            Luân lưu{' '}
            <b className="num">
              {pens.home} – {pens.away}
            </b>
          </span>
        )}
        <h1
          id="result-title"
          className={`display result__outcome result__outcome--${shootout ?? outcome}`}
        >
          {headline}
        </h1>
        <section className="panel result__stats" aria-label="Thống kê trận">
          <StatRow title="Sút" home={hud.shots.home} away={hud.shots.away} />
          <StatRow title="Thẻ vàng" home={count('home', 'yellow')} away={count('away', 'yellow')} />
          <StatRow title="Thẻ đỏ" home={count('home', 'red')} away={count('away', 'red')} />
        </section>
        {hud.bookings.length > 0 && (
          <p className="muted result__bookings">
            Thẻ phạt:{' '}
            {hud.bookings
              .map((b) => `${b.clock} ${CARD_LABEL[b.card]} · ${TEAM_LABEL[b.team]} #${b.number}`)
              .join(' · ')}
          </p>
        )}
      </div>
      <div className="result__side">
        <section className="panel--notch">
          <div className="panel__in">
            <RewardBlock
              status={reward}
              caption={`${headline} mức ${level}`}
              matches={matches}
              onRetry={onRetryReward}
            />
          </div>
        </section>
        <div className="result__actions">
          <button type="button" className="btn btn--primary btn--lg" autoFocus onClick={onRematch}>
            Đá tiếp
          </button>
          <Link to="/" className="btn btn--secondary btn--lg">
            Về trang chủ
          </Link>
        </div>
      </div>
    </main>
  );
}
