/**
 * Các màn của luồng trận (DESIGN.md §6.2): chọn độ khó → trận (nghỉ giữa hiệp, tạm dừng) → kết quả.
 */
import { useState } from 'react';
import { Link } from 'react-router';
import type { Difficulty } from '@pitch/shared';
import { CARD_LABEL, TEAM_LABEL, matchOutcome, type HudSnapshot } from './hud';

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

export function PauseMenu({ onResume, onQuit }: { onResume: () => void; onQuit: () => void }) {
  const [view, setView] = useState<'menu' | 'controls' | 'confirm'>('menu');
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
            <button type="button" className="btn btn--ghost" onClick={() => setView('controls')}>
              Phím điều khiển
            </button>
            <button type="button" className="btn btn--danger" onClick={() => setView('confirm')}>
              Bỏ trận
            </button>
          </div>
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

export function ResultScreen({ hud, onRematch }: { hud: HudSnapshot; onRematch: () => void }) {
  const outcome = matchOutcome(hud.score);
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
