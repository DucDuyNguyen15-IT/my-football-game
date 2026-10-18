/**
 * Minimap góc trên-phải (DESIGN.md §6.2), thuần (không React/DOM): đổi toạ độ sân → điểm trên
 * minimap và rút danh sách chấm từ `MatchState`. Cùng hướng với camera truyền hình: sim +x sang phải,
 * sim +y (phía người xem) xuống dưới.
 */
import { HALF_LENGTH, HALF_WIDTH, type MatchState, type TeamSide, type Vec2 } from '@pitch/sim';

/** Kích thước minimap (CSS px), cùng tỉ lệ sân 60 × 40 m. */
export const MINIMAP_W = 180;
export const MINIMAP_H = 120;
/** Lề trong (px) để chấm sát vạch không bị cắt. */
export const MINIMAP_PAD = 6;
/** Vẽ lại chừng này lần mỗi giây. */
export const MINIMAP_HZ = 10;

export interface MinimapDot {
  x: number;
  y: number;
  team: TeamSide;
  controlled: boolean;
}

export interface MinimapFrame {
  players: MinimapDot[];
  ball: { x: number; y: number };
}

/** Điểm trên sân → điểm trên minimap (px), kẹp trong khung để bóng ra ngoài vẫn thấy ở mép. */
export function toMinimap(pos: Vec2, w = MINIMAP_W, h = MINIMAP_H, pad = MINIMAP_PAD) {
  const fx = Math.min(1, Math.max(0, (pos.x + HALF_LENGTH) / (2 * HALF_LENGTH)));
  const fy = Math.min(1, Math.max(0, (pos.y + HALF_WIDTH) / (2 * HALF_WIDTH)));
  return { x: pad + fx * (w - 2 * pad), y: pad + fy * (h - 2 * pad) };
}

export function minimapFrame(
  state: Pick<MatchState, 'players' | 'ball' | 'controlledId' | 'autopilot'>,
): MinimapFrame {
  return {
    players: state.players.map((p) => ({
      ...toMinimap(p.pos),
      team: p.team,
      controlled: !state.autopilot && p.id === state.controlledId,
    })),
    ball: toMinimap(state.ball.pos),
  };
}
