import { describe, expect, it } from 'vitest';
import { createMatch, HALF_LENGTH, HALF_WIDTH, starterLikeTeam, cpuEasyTeam } from '@pitch/sim';

const vec2 = (x: number, y: number) => ({ x, y });
import { MINIMAP_H, MINIMAP_PAD, MINIMAP_W, minimapFrame, toMinimap } from './minimap';

describe('toMinimap', () => {
  it('tâm sân → tâm minimap', () => {
    expect(toMinimap(vec2(0, 0))).toEqual({ x: MINIMAP_W / 2, y: MINIMAP_H / 2 });
  });

  it('cùng hướng camera: +x sang phải, +y (phía người xem) xuống dưới', () => {
    const corner = toMinimap(vec2(HALF_LENGTH, HALF_WIDTH));
    expect(corner).toEqual({ x: MINIMAP_W - MINIMAP_PAD, y: MINIMAP_H - MINIMAP_PAD });
    const opposite = toMinimap(vec2(-HALF_LENGTH, -HALF_WIDTH));
    expect(opposite).toEqual({ x: MINIMAP_PAD, y: MINIMAP_PAD });
  });

  it('bóng ra ngoài sân bị kẹp ở mép', () => {
    expect(toMinimap(vec2(HALF_LENGTH + 5, -HALF_WIDTH - 3))).toEqual({
      x: MINIMAP_W - MINIMAP_PAD,
      y: MINIMAP_PAD,
    });
  });
});

describe('minimapFrame', () => {
  const state = createMatch({
    home: starterLikeTeam,
    away: cpuEasyTeam,
    seed: 1,
    difficulty: 'easy',
  });

  it('14 chấm theo đội, đánh dấu đúng người đang điều khiển', () => {
    const f = minimapFrame(state);
    expect(f.players).toHaveLength(14);
    expect(f.players.filter((p) => p.team === 'home')).toHaveLength(7);
    expect(f.players.filter((p) => p.controlled)).toHaveLength(1);
    expect(f.ball).toEqual(toMinimap(state.ball.pos));
  });

  it('trận tự đá (autopilot) không đánh dấu ai', () => {
    const f = minimapFrame({ ...state, autopilot: true });
    expect(f.players.some((p) => p.controlled)).toBe(false);
  });
});
