/**
 * Các màn của luồng trận (DESIGN.md §6.2): chọn độ khó → trận (nghỉ giữa hiệp, tạm dừng) → kết quả.
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

const CONTROLS: ReadonlyArray<readonly [string, string, string]> = [
  ['Mũi tên', 'Di chuyển', 'Di chuyển'],
  ['E (giữ)', 'Chạy nước rút', 'Chạy nước rút'],
  ['S', 'Chuyền sệt', 'Đổi cầu thủ'],
  ['A', 'Chuyền bổng', 'Xoạc'],
  ['D (giữ)', 'Sút (giữ để tăng lực)', 'Áp sát / tắc bóng'],
  ['Esc', 'Tạm dừng', 'Tạm dừng'],
];

export function ControlsTable() {
  return (
    <table className="controls-table">
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
              <kbd>{key}</kbd>
            </th>
            <td>{attack}</td>
            <td>{defend}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Lượt sút luân lưu của người chơi: nhắc cách sút. */
export function ShootoutHint() {
  return (
    <p className="hud-hints" role="status">
      Lượt bạn sút: <kbd>Mũi tên</kbd> chọn góc · giữ <kbd>D</kbd> rồi nhả để sút
    </p>
  );
}

/** Dải gợi ý phím ở cạnh dưới trong những giây đầu trận. */
export function KeyHints() {
  return (
    <p className="hud-hints">
      <kbd>Mũi tên</kbd> di chuyển · <kbd>E</kbd> nước rút · <kbd>S</kbd> chuyền / đổi người ·{' '}
      <kbd>A</kbd> chuyền bổng / xoạc · <kbd>D</kbd> sút / áp sát · <kbd>Esc</kbd> tạm dừng
    </p>
  );
}

const DIFFICULTIES: ReadonlyArray<{ value: Difficulty; label: string; hint: string }> = [
  { value: 'easy', label: 'Dễ', hint: 'Máy phản ứng chậm, chuyền và sút kém chính xác' },
  { value: 'hard', label: 'Khó', hint: 'Máy phản ứng nhanh, dâng cao và áp sát gắt' },
];

export function DifficultySelect({ onPick }: { onPick: (d: Difficulty) => void }) {
  return (
    <section className="screen" aria-labelledby="pick-title">
      <h1 id="pick-title" className="screen-title">
        Chọn độ khó
      </h1>
      <div className="difficulty-list">
        {DIFFICULTIES.map((d, i) => (
          <button
            key={d.value}
            type="button"
            className="btn btn--big difficulty"
            autoFocus={i === 0}
            onClick={() => onPick(d.value)}
          >
            <span className="difficulty-label">{d.label}</span>
            <span className="difficulty-hint">{d.hint}</span>
          </button>
        ))}
      </div>
      <Link to="/" className="btn btn--ghost">
        Về menu
      </Link>
    </section>
  );
}

export function HalfTimeOverlay({ hud }: { hud: HudSnapshot }) {
  return (
    <div className="overlay overlay--passive" role="status">
      <p className="overlay-kicker">Hết hiệp 1</p>
      <p className="overlay-score">
        {hud.score.home} – {hud.score.away}
      </p>
      <p>
        Bấm <kbd>S</kbd> để đá hiệp 2
      </p>
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

/** Chọn người ra (trên sân) và người vào (dự bị) rồi xác nhận. */
export function SubstitutionPanel({ subs, onBack }: { subs: PauseSubs; onBack: () => void }) {
  const [outId, setOutId] = useState<string | null>(null);
  const [inSlot, setInSlot] = useState<SquadSlot | null>(null);
  const out = subs.options.onPitch.find((p) => p.id === outId);
  const incoming = subs.options.bench.find((b) => b.slot === inSlot);
  const mismatch =
    out !== undefined && incoming !== undefined && !canSwap(out.position, incoming.position);
  const valid = out !== undefined && incoming !== undefined && !mismatch && subs.left > 0;
  return (
    <>
      <p className="subs-left">Còn {subs.left} lượt thay người</p>
      <div className="subs">
        <fieldset className="subs-col">
          <legend>Ra sân</legend>
          {subs.options.onPitch.map((p) => (
            <label key={p.id} className="subs-item">
              <input
                type="radio"
                name="sub-out"
                checked={outId === p.id}
                onChange={() => setOutId(p.id)}
              />
              <span className="subs-num">{p.number}</span>
              <span className="subs-pos">{p.position}</span>
              <span className="subs-stamina">{p.stamina}%</span>
            </label>
          ))}
        </fieldset>
        <fieldset className="subs-col">
          <legend>Vào sân</legend>
          {subs.options.bench.length === 0 && <p className="subs-empty">Hết dự bị</p>}
          {subs.options.bench.map((b) => (
            <label key={b.slot} className="subs-item">
              <input
                type="radio"
                name="sub-in"
                checked={inSlot === b.slot}
                onChange={() => setInSlot(b.slot)}
              />
              <span className="subs-num">{b.number}</span>
              <span className="subs-pos">{b.position}</span>
            </label>
          ))}
        </fieldset>
      </div>
      {mismatch && <p className="subs-warn">Thủ môn chỉ thay được bằng thủ môn.</p>}
      <div className="menu menu--row">
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Quay lại
        </button>
        <button
          type="button"
          className="btn btn--primary"
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
      </div>
    </>
  );
}

const PRESET_LABEL = { low: 'Thấp', high: 'Cao' } as const;

function graphicsLabel(g: GraphicsSettings): string {
  return Object.keys(g.overrides).length > 0 ? 'Tuỳ chỉnh' : PRESET_LABEL[g.preset];
}

/**
 * Cài đặt đồ hoạ (task 5.21): chọn preset rồi bật/tắt riêng từng chi tiết; chọn lại preset thì xoá
 * phần tuỳ chỉnh. Áp dụng ngay, không tạo lại trận.
 */
export function GraphicsPanel({
  graphics,
  onChange,
  onBack,
}: {
  graphics: GraphicsSettings;
  onChange: (g: GraphicsSettings) => void;
  onBack: () => void;
}) {
  const q = resolveQuality(graphics);
  return (
    <>
      <div className="subs">
        <fieldset className="subs-col">
          <legend>Mức</legend>
          {(['low', 'high'] as const).map((preset) => (
            <label key={preset} className="subs-item">
              <input
                type="radio"
                name="gfx-preset"
                checked={graphics.preset === preset && Object.keys(graphics.overrides).length === 0}
                onChange={() => onChange({ ...graphics, preset, overrides: {} })}
              />
              {PRESET_LABEL[preset]}
            </label>
          ))}
        </fieldset>
        <fieldset className="subs-col">
          <legend>Thời điểm</legend>
          {TIMES_OF_DAY.map((t) => (
            <label key={t.key} className="subs-item">
              <input
                type="radio"
                name="gfx-time"
                checked={graphics.timeOfDay === t.key}
                onChange={() => onChange({ ...graphics, timeOfDay: t.key })}
              />
              {t.label}
            </label>
          ))}
        </fieldset>
      </div>
      <fieldset className="subs-col gfx-toggles">
        <legend>Chi tiết</legend>
        {GRAPHICS_TOGGLES.map((t) => {
          // SSAO chạy trong hậu kỳ: tắt hậu kỳ thì SSAO mờ đi.
          const blocked = t.key === 'ssao' && !q.postFx;
          return (
            <label key={t.key} className="subs-item">
              <input
                type="checkbox"
                checked={q[t.key]}
                disabled={blocked}
                onChange={(e) => onChange(toggleGraphics(graphics, t.key, e.target.checked))}
              />
              {t.label}
            </label>
          );
        })}
      </fieldset>
      <div className="menu menu--row">
        <button type="button" className="btn btn--ghost" autoFocus onClick={onBack}>
          Quay lại
        </button>
      </div>
    </>
  );
}

export function PauseMenu({
  graphics,
  onGraphics,
  onResume,
  onQuit,
  subs,
}: {
  graphics: GraphicsSettings;
  onGraphics: (g: GraphicsSettings) => void;
  onResume: () => void;
  onQuit: () => void;
  subs: PauseSubs;
}) {
  const [view, setView] = useState<'menu' | 'controls' | 'confirm' | 'subs' | 'graphics'>('menu');
  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="pause-title">
      <div className="panel">
        <h2 id="pause-title" className="screen-title">
          Tạm dừng
        </h2>
        {view === 'menu' && (
          <div className="menu">
            <button type="button" className="btn btn--primary" autoFocus onClick={onResume}>
              Tiếp tục
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              disabled={!subs.allowed || subs.left === 0}
              aria-describedby={subs.allowed ? undefined : 'subs-hint'}
              onClick={() => setView('subs')}
            >
              Thay người ({subs.left} lượt)
            </button>
            {!subs.allowed && (
              <p id="subs-hint" className="menu-hint">
                Chỉ thay người khi bóng chết
              </p>
            )}
            <button type="button" className="btn btn--ghost" onClick={() => setView('controls')}>
              Phím điều khiển
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setView('graphics')}>
              Đồ hoạ: {graphicsLabel(graphics)}
            </button>
            <button type="button" className="btn btn--danger" onClick={() => setView('confirm')}>
              Bỏ trận
            </button>
          </div>
        )}
        {view === 'subs' && <SubstitutionPanel subs={subs} onBack={() => setView('menu')} />}
        {view === 'graphics' && (
          <GraphicsPanel graphics={graphics} onChange={onGraphics} onBack={() => setView('menu')} />
        )}
        {view === 'controls' && (
          <>
            <ControlsTable />
            <button
              type="button"
              className="btn btn--ghost"
              autoFocus
              onClick={() => setView('menu')}
            >
              Quay lại
            </button>
          </>
        )}
        {view === 'confirm' && (
          <>
            <p>Bỏ trận sẽ bị tính thua. Chắc chắn bỏ?</p>
            <div className="menu menu--row">
              <button
                type="button"
                className="btn btn--ghost"
                autoFocus
                onClick={() => setView('menu')}
              >
                Không
              </button>
              <button type="button" className="btn btn--danger" onClick={onQuit}>
                Bỏ trận
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

const OUTCOME_LABEL = { win: 'Thắng', draw: 'Hòa', loss: 'Thua' } as const;

const SHOOTOUT_LABEL = { win: 'Thắng luân lưu', loss: 'Thua luân lưu' } as const;

export function ResultScreen({ hud, onRematch }: { hud: HudSnapshot; onRematch: () => void }) {
  const outcome = matchOutcome(hud.score);
  const shootout = shootoutOutcome(hud);
  const pens = hud.shootout && shootoutScore(hud.shootout);
  return (
    <section className="screen" aria-labelledby="result-title">
      <p className="overlay-kicker">Hết trận</p>
      <h1 id="result-title" className={`result-outcome result-outcome--${outcome}`}>
        {OUTCOME_LABEL[outcome]}
      </h1>
      <p className="result-score" aria-label={`Nhà ${hud.score.home}, Khách ${hud.score.away}`}>
        <span className="hud-team--home">■ NHÀ</span> {hud.score.home} – {hud.score.away}{' '}
        <span className="hud-team--away">KHÁCH ■</span>
      </p>
      {shootout && pens && (
        <p className={`result-shootout result-outcome--${shootout}`}>
          {SHOOTOUT_LABEL[shootout]} {pens.home} – {pens.away}
        </p>
      )}
      <p className="result-shots">
        Cú sút: {hud.shots.home} – {hud.shots.away}
      </p>
      <h2 className="result-subtitle">Thẻ phạt</h2>
      {hud.bookings.length === 0 ? (
        <p className="result-empty">Không có thẻ phạt</p>
      ) : (
        <ul className="result-bookings">
          {hud.bookings.map((b, i) => (
            <li key={i}>
              <span className={`card-chip card-chip--${b.card}`} aria-hidden="true" />
              {b.clock} {CARD_LABEL[b.card]} · {TEAM_LABEL[b.team]} #{b.number}
            </li>
          ))}
        </ul>
      )}
      <div className="menu menu--row">
        <button type="button" className="btn btn--primary" autoFocus onClick={onRematch}>
          Đá tiếp
        </button>
        <Link to="/" className="btn btn--ghost">
          Về menu
        </Link>
      </div>
    </section>
  );
}
