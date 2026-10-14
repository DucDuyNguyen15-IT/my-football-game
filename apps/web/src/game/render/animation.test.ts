import { describe, expect, it } from 'vitest';
import {
  createMatch,
  cpuEasyTeam,
  starterLikeTeam,
  type MatchState,
  type PlayerState,
} from '@pitch/sim';
import {
  JOG_CLIP_SPEED,
  RUN_MIN_SPEED,
  SPRINT_LEAN_MIN_SPEED,
  WALK_MAX_SPEED,
  animationEvents,
  diveClip,
  locomotionFor,
} from './animation';

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

  it('có clip đi bộ / chạy nhanh thì dùng theo tốc độ, phát khớp tốc độ bước đo được', () => {
    const speeds = { walk: 1.5, run: 6 };
    const walk = locomotionFor(p(v(WALK_MAX_SPEED - 0.5, 0)), speeds);
    expect(walk.clip).toBe('walk');
    expect(walk.timeScale).toBeCloseTo((WALK_MAX_SPEED - 0.5) / 1.5);
    expect(locomotionFor(p(v(3, 0)), speeds).clip).toBe('jog');
    expect(locomotionFor(p(v(5, 0)), speeds).clip).toBe('run');
    const sprint = locomotionFor(p(v(7.5, 0)), speeds);
    expect(sprint).toMatchObject({ clip: 'run', lean: 0 });
    expect(sprint.timeScale).toBeCloseTo(7.5 / 6);
  });

  it('thiếu clip chạy nhanh → jog, cúi người về trước khi chạy nhanh', () => {
    const sprint = locomotionFor(p(v(SPRINT_LEAN_MIN_SPEED + 2, 0)));
    expect(sprint.clip).toBe('jog');
    expect(sprint.lean).toBeGreaterThan(0.1);
    expect(locomotionFor(p(v(4, 0))).lean).toBe(0);
    expect(locomotionFor(p(v(1, 0))).clip).toBe('jog');
  });

  it('quanh ngưỡng đổi clip: giữ clip đang phát, không nhảy qua lại', () => {
    const speeds = { run: 5.7 };
    const at = (speed: number, current: 'jog' | 'run') =>
      locomotionFor(p(v(speed, 0)), speeds, current).clip;
    expect(at(RUN_MIN_SPEED, 'jog')).toBe('jog');
    expect(at(RUN_MIN_SPEED, 'run')).toBe('run');
    expect(at(RUN_MIN_SPEED + 0.5, 'jog')).toBe('run');
    expect(at(RUN_MIN_SPEED - 0.5, 'run')).toBe('jog');
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

  const tackled = (
    prev: MatchState,
    over: Partial<NonNullable<MatchState['lastTackle']>>,
  ): MatchState => ({
    ...prev,
    tick: prev.tick + 1,
    lastTackle: {
      tick: prev.tick + 1,
      tacklerId: ME,
      victimId: null,
      outcome: 'miss',
      victimReaction: null,
      ...over,
    },
  });

  it('xoạc hụt → tackle', () => {
    const prev = base();
    expect(animationEvents(prev, tackled(prev, {}))).toEqual([{ playerId: ME, clip: 'tackle' }]);
  });

  it('xoạc trúng bóng → người xoạc tackle, người bị xoạc trip (ngã) hoặc stumble (vấp)', () => {
    const prev = base();
    const won = (victimReaction: 'fall' | 'stumble') =>
      animationEvents(prev, tackled(prev, { outcome: 'won', victimId: 'away-P4', victimReaction }));
    expect(won('fall')).toEqual([
      { playerId: ME, clip: 'tackle' },
      { playerId: 'away-P4', clip: 'trip' },
    ]);
    expect(won('stumble')[1]).toEqual({ playerId: 'away-P4', clip: 'stumble' });
  });

  it('cú xoạc cũ (đã báo ở tick trước) không phát lại', () => {
    const prev = tackled(base(), {});
    expect(animationEvents(prev, { ...prev, tick: prev.tick + 1 })).toEqual([]);
  });

  it('xoạc phạm lỗi → người xoạc tackle, người bị xoạc trip, mỗi người một lần', () => {
    const prev = { ...base(), ballOwnerId: 'away-P4' };
    const curr: MatchState = {
      ...tackled(prev, { outcome: 'foul', victimId: 'away-P4' }),
      phase: 'dead_ball',
      ballOwnerId: null,
      restart: { type: 'free_kick', team: 'away', spot: v(0, 0), takerId: 'away-P4', startTick: 1 },
    };
    expect(animationEvents(prev, curr)).toEqual([
      { playerId: ME, clip: 'tackle' },
      { playerId: 'away-P4', clip: 'trip' },
    ]);
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
