import { describe, expect, it } from 'vitest';
import {
  createMatch,
  cpuEasyTeam,
  starterLikeTeam,
  type MatchState,
  type PlayerState,
} from '@pitch/sim';
import { JOG_CLIP_SPEED, animationEvents, diveClip, locomotionFor } from './animation';

const base = (): MatchState => ({
  ...createMatch({ home: starterLikeTeam, away: cpuEasyTeam, difficulty: 'easy', seed: 1 }),
  phase: 'play',
  restart: null,
  ballDead: false,
});
const v = (x: number, y: number) => ({ x, y });
const withPlayer = (s: MatchState, id: string, over: Partial<PlayerState>): MatchState => ({
  ...s,
  players: s.players.map((p) => (p.id === id ? { ...p, ...over } : p)),
});
const player = (s: MatchState, id: string) => s.players.find((p) => p.id === id)!;

describe('locomotionFor', () => {
  const p = (vel: { x: number; y: number }, facing = v(1, 0), position: 'MF' | 'GK' = 'MF') =>
    ({ ...player(base(), 'home-P3'), vel, facing, position }) as PlayerState;

  it('đứng yên → idle (thủ môn: gk_idle)', () => {
    expect(locomotionFor(p(v(0, 0))).clip).toBe('idle');
    expect(locomotionFor(p(v(0.1, 0), v(1, 0), 'GK')).clip).toBe('gk_idle');
  });

  it('chạy về phía trước → jog, tốc độ phát theo tốc độ chạy', () => {
    const run = locomotionFor(p(v(JOG_CLIP_SPEED * 2, 0)));
    expect(run.clip).toBe('jog');
    expect(run.timeScale).toBeCloseTo(2);
  });

  it('chạy lùi / chạy ngang theo hướng so với mặt', () => {
    expect(locomotionFor(p(v(-3, 0))).clip).toBe('jog_back');
    // Mặt hướng +x (sim), trái của nhân vật là −y sim (z thế giới = sim y, camera nhìn từ +z).
    expect(locomotionFor(p(v(0, -3))).clip).toBe('strafe_left');
    expect(locomotionFor(p(v(0, 3))).clip).toBe('strafe_right');
  });
});

describe('diveClip', () => {
  it('thủ môn lao nhanh sang ngang khi bóng tự do sau cú sút đối phương → bay người đúng phía', () => {
    const s0 = { ...base(), ballOwnerId: null, lastShot: { team: 'home' as const, tick: 0 } };
    const gk = { ...player(s0, 'away-GK'), facing: v(-1, 0) };
    // Mặt −x: trái nhân vật là +y sim.
    expect(diveClip({ ...gk, vel: v(0, 6) }, s0)).toBe('gk_dive_left');
    expect(diveClip({ ...gk, vel: v(0, -6) }, s0)).toBe('gk_dive_right');
    expect(diveClip({ ...gk, vel: v(0, 1) }, s0)).toBeNull();
    expect(diveClip({ ...gk, vel: v(0, 6) }, { ...s0, lastShot: null })).toBeNull();
  });
});

describe('animationEvents', () => {
  const ME = 'home-P3';
  const owning = (s: MatchState) => ({ ...s, ballOwnerId: ME, ownerSinceTick: s.tick });
  const kicked = (s: MatchState, over: Partial<MatchState> = {}): MatchState => ({
    ...s,
    tick: s.tick + 1,
    ballOwnerId: null,
    kickLock: { playerId: ME, untilTick: s.tick + 13 },
    ...over,
  });

  it('vừa rời bóng do chuyền → pass; do sút → shot', () => {
    const prev = owning(base());
    expect(animationEvents(prev, kicked(prev))).toEqual([{ playerId: ME, clip: 'pass' }]);
    const shot = kicked(prev, { lastShot: { team: 'home', tick: prev.tick + 1 } });
    expect(animationEvents(prev, shot)).toEqual([{ playerId: ME, clip: 'shot' }]);
  });

  it('bóng cao ngang đầu lúc chạm → header', () => {
    const prev = { ...owning(base()), ball: { ...base().ball, z: 1.5 } };
    expect(animationEvents(prev, kicked(prev))[0]?.clip).toBe('header');
  });

  it('thực hiện ném biên / phạt đền dùng động tác riêng', () => {
    const s = base();
    const restart = (type: 'throw_in' | 'penalty'): MatchState => ({
      ...s,
      phase: 'dead_ball',
      restart: { type, team: 'home', spot: v(0, 0), takerId: ME, startTick: 0 },
    });
    const after = (prev: MatchState, over: Partial<MatchState> = {}) =>
      kicked(prev, { phase: 'play', restart: null, ...over });
    expect(animationEvents(restart('throw_in'), after(restart('throw_in')))[0]?.clip).toBe(
      'throw_in',
    );
    const pen = restart('penalty');
    const penShot = after(pen, { lastShot: { team: 'home', tick: pen.tick + 1 } });
    expect(animationEvents(pen, penShot)[0]?.clip).toBe('penalty');
  });

  it('bắt đầu xoạc → tackle', () => {
    const prev = base();
    const curr = { ...prev, tick: prev.tick + 1, tackleRecovery: { [ME]: prev.tick + 40 } };
    expect(animationEvents(prev, curr)).toEqual([{ playerId: ME, clip: 'tackle' }]);
  });

  it('bị phạm lỗi (đang dẫn bóng thì thành đá phạt cho đội mình) → trip', () => {
    const prev = owning(base());
    const curr: MatchState = {
      ...prev,
      tick: prev.tick + 1,
      phase: 'dead_ball',
      ballOwnerId: null,
      restart: { type: 'free_kick', team: 'home', spot: v(0, 0), takerId: ME, startTick: 1 },
    };
    expect(animationEvents(prev, curr)).toEqual([{ playerId: ME, clip: 'trip' }]);
  });

  it('thủ môn bắt được cú sút → gk_catch', () => {
    const prev = { ...base(), ballOwnerId: null, lastShot: { team: 'home' as const, tick: 0 } };
    const curr = { ...prev, tick: prev.tick + 1, ballOwnerId: 'away-GK' };
    expect(animationEvents(prev, curr)).toEqual([{ playerId: 'away-GK', clip: 'gk_catch' }]);
  });

  it('không có gì xảy ra → không có sự kiện', () => {
    const s = withPlayer(base(), ME, { vel: v(2, 0) });
    expect(animationEvents(s, { ...s, tick: s.tick + 1 })).toEqual([]);
  });
});
