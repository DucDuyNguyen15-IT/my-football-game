import { describe, expect, it } from 'vitest';
import { balanceSetup } from '../balance';
import { cpuEasyTeam, starterLikeTeam } from '../fixtures/demoTeams';
import { createMatch, step } from '../match';
import { vec2, ZERO } from '../math/vec2';
import { NO_INPUT, type MatchState } from '../types';

describe('đánh đầu trong trận', () => {
  // Review Fable V1: hai người sát bóng từng đánh đầu qua lại mỗi tick (bóng leo 1,1 → 2,5 m).
  it('không có cú đánh đầu nào trong lúc khoá chạm bóng của cú đánh đầu trước còn hạn', () => {
    let s = createMatch(balanceSetup('easy', 5));
    let rapid = 0;
    let headers = 0;
    while (s.phase !== 'full_time' && s.phase !== 'shootout') {
      const prev = s;
      s = step(s, NO_INPUT);
      const lock = s.kickLock;
      if (
        lock?.touch === 'header' &&
        prev.kickLock !== lock &&
        prev.kickLock?.untilTick !== lock.untilTick
      ) {
        headers++;
        if (prev.kickLock?.touch !== undefined && s.tick < prev.kickLock.untilTick) rapid++;
      }
    }
    expect(headers).toBeGreaterThan(0);
    expect(rapid).toBe(0);
  });

  // Bóng ngang đầu sát người đang điều khiển (giữa sân, mọi người khác ở xa, tắt AI).
  const ME = 'home-P5';
  function scene(): MatchState {
    const s = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed: 3, difficulty: 'easy' });
    const players = s.players.map((p, i) =>
      p.id === ME
        ? { ...p, pos: vec2(0, 0), vel: ZERO }
        : { ...p, pos: vec2(-12 + (i % 7) * 4, i < 7 ? -18 : 18), vel: ZERO },
    );
    return {
      ...s,
      phase: 'play',
      ballDead: false,
      restart: null,
      players,
      ballOwnerId: null,
      ball: { pos: vec2(0.3, 0), z: 1.9, vz: 0, vel: vec2(-2, 0) },
      controlledId: ME,
      kickLock: null,
      ai: null,
    };
  }

  it('người đang điều khiển chỉ đánh đầu khi giữ D', () => {
    expect(step(scene(), NO_INPUT).kickLock?.touch).toBeUndefined();
    const headed = step(scene(), { ...NO_INPUT, shoot: true }).kickLock;
    expect(headed).toMatchObject({ playerId: ME, touch: 'header' });
  });
});
