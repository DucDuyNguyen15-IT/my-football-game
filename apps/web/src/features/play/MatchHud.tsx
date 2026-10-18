/**
 * HUD trong trận (DESIGN.md §6.2), DOM đè lên canvas: bảng tỉ số, dải sự kiện, panel cầu thủ,
 * minimap. Chỉ hiển thị `HudSnapshot` / state mới nhất; không gọi sim.
 */
import { useEffect, useRef } from 'react';
import { HALF_LENGTH, HALF_WIDTH, PENALTY_AREA_DEPTH, PENALTY_AREA_WIDTH } from '@pitch/sim';
import type { MatchState } from '@pitch/sim';
import { COLORS } from '../../game/render/colors';
import type { HudEvent, HudSnapshot } from './hud';
import { shootoutScore, staminaLevel } from './hud';
import {
  MINIMAP_H,
  MINIMAP_HZ,
  MINIMAP_W,
  minimapFrame,
  toMinimap,
  type MinimapFrame,
} from './minimap';

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
      {hud.shootout ? (
        <ShootoutRow shootout={hud.shootout} />
      ) : (
        <div className="hud-clock">
          H{hud.half} <span className="hud-clock-min">{hud.clock}</span>
        </div>
      )}
    </div>
  );
}

const MAX_DOTS = 5;

/** Một chấm mỗi lượt sút (đủ 5 chấm, chưa sút thì rỗng); sudden death thì hiện thêm chấm. */
function KickDots({ kicks, team }: { kicks: boolean[]; team: 'home' | 'away' }) {
  const n = Math.max(MAX_DOTS, kicks.length);
  return (
    <span className={`hud-kicks hud-kicks--${team}`}>
      {Array.from({ length: n }, (_, i) => {
        const k = kicks[i];
        const state = k === undefined ? 'pending' : k ? 'scored' : 'missed';
        return <span key={i} className={`hud-kick hud-kick--${state}`} />;
      })}
    </span>
  );
}

export function ShootoutRow({ shootout }: { shootout: NonNullable<HudSnapshot['shootout']> }) {
  const score = shootoutScore(shootout);
  return (
    <div className="hud-shootout" aria-label={`Luân lưu: Nhà ${score.home}, Khách ${score.away}`}>
      <KickDots kicks={shootout.home} team="home" />
      <span className="hud-shootout-label">
        Luân lưu {score.home}–{score.away}
      </span>
      <KickDots kicks={shootout.away} team="away" />
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
    <canvas
      ref={canvasRef}
      className="hud-minimap"
      style={{ width: MINIMAP_W, height: MINIMAP_H }}
      aria-hidden="true"
    />
  );
}
