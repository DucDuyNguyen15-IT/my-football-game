/**
 * HUD trong trận (DESIGN.md §6.2), DOM đè lên canvas: bảng tỉ số, dải sự kiện, panel cầu thủ,
 * minimap. Chỉ hiển thị `HudSnapshot` / state mới nhất; không gọi sim.
 */
import { useEffect, useRef, type CSSProperties } from 'react';
import { HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_DEPTH, PENALTY_AREA_WIDTH } from '@pitch/sim';
import type { MatchState } from '@pitch/sim';
import { COLORS } from '../../game/render/colors';
import type { HudEvent, HudSnapshot } from './hud';
import { TEAM_LABEL, shootoutScore, staminaLevel } from './hud';
import {
  MINIMAP_H,
  MINIMAP_HZ,
  MINIMAP_W,
  minimapFrame,
  toMinimap,
  type MinimapFrame,
} from './minimap';

const POSITION_NAME = { GK: 'Thủ môn', DF: 'Hậu vệ', MF: 'Tiền vệ', FW: 'Tiền đạo' } as const;

/** Bảng tỉ số giữa trên (match.html): vạch màu đội, số bàn, hàng dưới là hiệp + phút / luân lưu. */
export function Scoreboard({ hud }: { hud: HudSnapshot }) {
  const pens = hud.shootout && shootoutScore(hud.shootout);
  return (
    <div
      className="hud-score"
      role="group"
      aria-label={`Nhà ${hud.score.home}, Khách ${hud.score.away}, hiệp ${hud.half}, phút ${hud.clock}`}
    >
      <span className="hud-score__sw hud-score__sw--home" aria-hidden="true" />
      <span className="hud-score__team">NHÀ</span>
      <span className="hud-score__goals">{hud.score.home}</span>
      <span className="hud-score__goals hud-score__goals--away">{hud.score.away}</span>
      <span className="hud-score__team">KHÁCH</span>
      <span className="hud-score__sw hud-score__sw--away" aria-hidden="true" />
      <span className="hud-score__clock">
        {pens ? (
          <>
            Luân lưu{' '}
            <b className="num">
              {pens.home}–{pens.away}
            </b>
          </>
        ) : (
          <>
            H{hud.half} · <b className="num">{hud.clock}</b>
          </>
        )}
      </span>
    </div>
  );
}

const MAX_DOTS = 5;
const KICK_LABEL = { hit: 'Trúng', miss: 'Trượt', '': 'Chưa sút' } as const;

/** Một chấm mỗi lượt sút (đủ 5 chấm, chưa sút thì rỗng); sudden death thì hiện thêm chấm. */
function KickDots({ kicks }: { kicks: boolean[] }) {
  const n = Math.max(MAX_DOTS, kicks.length);
  return (
    <span className="so-row__dots">
      {Array.from({ length: n }, (_, i) => {
        const k = kicks[i];
        const state = k === undefined ? '' : k ? 'hit' : 'miss';
        return (
          <span key={i} className={`dot${state ? ` ${state}` : ''}`} title={KICK_LABEL[state]} />
        );
      })}
    </span>
  );
}

/** Bảng luân lưu (match-shootout.html): mỗi đội một hàng chấm trúng/trượt/chưa sút + số bàn. */
export function ShootoutPanel({ shootout }: { shootout: NonNullable<HudSnapshot['shootout']> }) {
  const score = shootoutScore(shootout);
  // Lượt đang đá: lượt kế của đội đang sút; bóng đang bay / đã xong thì lượt vừa đá.
  const round = shootout.turn
    ? shootout[shootout.turn].length + 1
    : Math.max(shootout.home.length, shootout.away.length);
  const turn = shootout.turn ? `${TEAM_LABEL[shootout.turn]} sút` : null;
  return (
    <section
      className="hud-panel so"
      aria-label={`Luân lưu: Nhà ${score.home}, Khách ${score.away}`}
    >
      <div className="so__head">
        <h2 className="h3">Luân lưu</h2>
        <span className="label">
          Lượt {Math.max(1, round)}/{Math.max(MAX_DOTS, round)}
          {turn && ` · ${turn}`}
        </span>
      </div>
      {(['home', 'away'] as const).map((team) => (
        <div key={team} className="so-row">
          <span className="display so-row__team">
            <span className={`so-row__sw so-row__sw--${team}`} aria-hidden="true" />
            {team === 'home' ? 'NHÀ' : 'KHÁCH'}
          </span>
          <KickDots kicks={shootout[team]} />
          <span className="display num so-row__score">{score[team]}</span>
        </div>
      ))}
    </section>
  );
}

export interface ShownEvent extends HudEvent {
  id: number;
}

const EVENT_MARK: Record<HudEvent['kind'], string> = {
  goal: 'G',
  yellow: '▮',
  red: '▮',
  foul: '!',
  sub: '⇄',
  shootout: '●',
};

/** Dải sự kiện dưới bảng tỉ số (match-events.html), mỗi sự kiện hiện 3 giây. */
export function EventStrip({ events }: { events: ShownEvent[] }) {
  return (
    <ul className="hud-events" role="status" aria-live="polite">
      {events.map((e) => (
        <li key={e.id} className={`event-strip hud-event hud-event--${e.kind}`}>
          <span className="event-strip__mark" aria-hidden="true">
            {EVENT_MARK[e.kind]}
          </span>
          <span>{e.text}</span>
        </li>
      ))}
    </ul>
  );
}

/** Panel cầu thủ đang điều khiển (góc dưới-trái): số áo, vị trí, thanh thể lực. */
export function PlayerPanel({ controlled }: { controlled: HudSnapshot['controlled'] }) {
  if (!controlled) return null;
  const level = staminaLevel(controlled.stamina);
  return (
    <div className="hud-panel hud-player">
      <span className="display num hud-player__num">{controlled.number}</span>
      <div className="hud-player__body">
        <div className="hud-player__name">
          <span>{POSITION_NAME[controlled.position]}</span>
          <abbr
            className={`pos pos--${controlled.position}`}
            title={POSITION_NAME[controlled.position]}
          >
            {controlled.position}
          </abbr>
        </div>
        <div className="hud-player__stamina">
          <span className="label">Thể lực</span>
          <span
            className={`bar bar--thin hud-stamina hud-stamina--${level}`}
            role="meter"
            aria-label="Thể lực"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={controlled.stamina}
          >
            <span
              className="bar__fill"
              style={{ '--v': `${controlled.stamina}%` } as CSSProperties}
            />
          </span>
          <span className="num hud-player__pct">{controlled.stamina}%</span>
        </div>
      </div>
    </div>
  );
}

/** Chú thích màu thanh lực (match.html, góc trên-trái) — thanh lực thật vẽ trên đầu cầu thủ. */
export function PowerLegend() {
  return (
    <div className="hud-legend">
      <span className="label">Thanh lực (giữ phím)</span>
      {(
        [
          ['pass', 'Chuyền · S/A'],
          ['through', 'Chọc khe · W'],
          ['shot', 'Sút · D'],
        ] as const
      ).map(([tone, text]) => (
        <span key={tone} className="hud-legend__row">
          <span className={`power hud-legend__bar--${tone}`} aria-hidden="true">
            <i />
          </span>
          {text}
        </span>
      ))}
    </div>
  );
}

const css = (n: number) => `#${n.toString(16).padStart(6, '0')}`;
const TEAM_CSS = { home: css(COLORS.team.home), away: css(COLORS.team.away) } as const;

/** Vạch sân: khung, đường giữa sân, hai vòng cấm. */
function drawPitch(ctx: CanvasRenderingContext2D): void {
  const a = toMinimap({ x: -HALF_LENGTH, y: -HALF_WIDTH });
  const b = toMinimap({ x: HALF_LENGTH, y: HALF_WIDTH });
  ctx.strokeStyle = 'rgb(232 240 230 / 0.45)';
  ctx.lineWidth = 1;
  ctx.strokeRect(a.x, a.y, b.x - a.x, b.y - a.y);
  const mid = toMinimap({ x: 0, y: 0 });
  ctx.beginPath();
  ctx.moveTo(mid.x, a.y);
  ctx.lineTo(mid.x, b.y);
  ctx.stroke();
  for (const side of [-1, 1]) {
    const p = toMinimap({ x: side * HALF_LENGTH, y: -PENALTY_AREA_WIDTH / 2 });
    const q = toMinimap({
      x: side * (HALF_LENGTH - PENALTY_AREA_DEPTH),
      y: PENALTY_AREA_WIDTH / 2,
    });
    ctx.strokeRect(Math.min(p.x, q.x), p.y, Math.abs(q.x - p.x), q.y - p.y);
  }
}

function drawFrame(ctx: CanvasRenderingContext2D, frame: MinimapFrame): void {
  ctx.clearRect(0, 0, MINIMAP_W, MINIMAP_H);
  drawPitch(ctx);
  for (const p of frame.players) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.controlled ? 4 : 3, 0, Math.PI * 2);
    ctx.fillStyle = TEAM_CSS[p.team];
    ctx.fill();
    if (p.controlled) {
      ctx.strokeStyle = COLORS.text;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }
  ctx.beginPath();
  ctx.arc(frame.ball.x, frame.ball.y, 2.5, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = COLORS.bgCss;
  ctx.lineWidth = 1;
  ctx.stroke();
}

/**
 * Minimap góc trên-phải: 14 chấm màu đội + bóng trắng, vẽ trên canvas 2D nhỏ ~10 lần/giây từ state
 * mới nhất (`stateRef`, renderer cập nhật mỗi khung hình) — không qua React state.
 */
export function Minimap({ stateRef }: { stateRef: { readonly current: MatchState | null } }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(MINIMAP_W * dpr);
    canvas.height = Math.round(MINIMAP_H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const draw = () => {
      const state = stateRef.current;
      if (state) drawFrame(ctx, minimapFrame(state));
    };
    draw();
    const id = window.setInterval(draw, 1000 / MINIMAP_HZ);
    return () => window.clearInterval(id);
  }, [stateRef]);
  return (
    <div className="hud-panel hud-minimap">
      <canvas ref={canvasRef} style={{ width: MINIMAP_W, height: MINIMAP_H }} aria-hidden="true" />
    </div>
  );
}
