/**
 * HUD trong trận (DESIGN.md §6.2), DOM đè lên canvas: bảng tỉ số, dải sự kiện, panel cầu thủ.
 * Chỉ hiển thị `HudSnapshot`; không gọi sim.
 */
import type { HudEvent, HudSnapshot } from './hud';
import { staminaLevel } from './hud';

const POSITION_NAME = { GK: 'Thủ môn', DF: 'Hậu vệ', MF: 'Tiền vệ', FW: 'Tiền đạo' } as const;

export function Scoreboard({ hud }: { hud: HudSnapshot }) {
  return (
    <div
      className="hud-scoreboard"
      role="group"
      aria-label={`Nhà ${hud.score.home}, Khách ${hud.score.away}, hiệp ${hud.half}, phút ${hud.clock}`}
    >
      <div className="hud-score">
        <span className="hud-team hud-team--home">
          <span aria-hidden="true">■</span> NHÀ
        </span>
        <span className="hud-score-num">
          {hud.score.home} – {hud.score.away}
        </span>
        <span className="hud-team hud-team--away">
          KHÁCH <span aria-hidden="true">■</span>
        </span>
      </div>
      <div className="hud-clock">
        H{hud.half} <span className="hud-clock-min">{hud.clock}</span>
      </div>
    </div>
  );
}

export interface ShownEvent extends HudEvent {
  id: number;
}

export function EventStrip({ events }: { events: ShownEvent[] }) {
  return (
    <ul className="hud-events" role="status" aria-live="polite">
      {events.map((e) => (
        <li key={e.id} className={`hud-event hud-event--${e.kind}`}>
          <span className={`hud-event-mark hud-event-mark--${e.team}`} aria-hidden="true">
            ■
          </span>
          {e.text}
        </li>
      ))}
    </ul>
  );
}

export function PlayerPanel({ controlled }: { controlled: HudSnapshot['controlled'] }) {
  if (!controlled) return null;
  const level = staminaLevel(controlled.stamina);
  return (
    <div className="hud-player">
      <div className="hud-player-head">
        <span className="hud-player-num">{controlled.number}</span>
        <abbr title={POSITION_NAME[controlled.position]}>{controlled.position}</abbr>
      </div>
      <div className="hud-stamina">
        <span className="hud-stamina-label">Thể lực</span>
        <span
          className="hud-stamina-bar"
          role="meter"
          aria-label="Thể lực"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={controlled.stamina}
        >
          <span
            className={`hud-stamina-fill hud-stamina-fill--${level}`}
            style={{ transform: `scaleX(${controlled.stamina / 100})` }}
          />
        </span>
      </div>
    </div>
  );
}
