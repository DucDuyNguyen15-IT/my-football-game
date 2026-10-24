import type { PlayerStats } from '@pitch/shared';
import { describe, expect, it } from 'vitest';
import { shootBall, shotTarget } from './actions/shoot';
import { cpuEasyTeam, starterLikeTeam } from './fixtures/demoTeams';
import { createMatch, step } from './match';
import { vec2, ZERO } from './math/vec2';
import { HALF_LENGTH } from './pitch';
import { nextFloat, seedRng } from './rng';
import { dribbleBall } from './rules/possession';
import { TICK_RATE } from './tick';
import { NO_INPUT, type MatchState } from './types';

/*
 * Thủ môn trong trận (task 5.8b). Đội khách sút vào khung thành đội nhà (phía −x, hiệp 1);
 * mọi cầu thủ khác đứng xa ở phần sân bên kia.
 */

const setup = { home: starterLikeTeam, away: cpuEasyTeam, seed: 5, difficulty: 'easy' as const };
const GK = 'home-GK';
const SHOOTER = 'away-P6';

type Result = 'goal' | 'saved' | 'missed';

/** Một cú sút chuẩn từ ~16 m, góc và điểm nhắm theo `seed`; thủ môn có `gkStats` cho trước. */
function shoot(seed: number, gkStats: Partial<PlayerStats>): Result {
  const s0 = createMatch(setup);
  let rng = seedRng(seed);
  let f: number;
  [f, rng] = nextFloat(rng);
  const from = vec2(-HALF_LENGTH + 16, (f - 0.5) * 10);
  [f, rng] = nextFloat(rng);
  const target = shotTarget(-1, f * 2 - 1);
  const players = s0.players.map((p, i) => {
    if (p.id === GK) {
      const stats = { ...p.stats, ...gkStats };
      return { ...p, pos: vec2(-HALF_LENGTH + 1.5, 0), vel: ZERO, stats };
    }
    if (p.id === SHOOTER) return { ...p, pos: from, vel: ZERO };
    return { ...p, pos: vec2(12 + (i % 7) * 2, p.team === 'home' ? -15 : 15), vel: ZERO };
  });
  const shooter = players.find((p) => p.id === SHOOTER)!;
  const kicked = shootBall(shooter, from, target, 0.9, rng);
  let s: MatchState = {
    ...s0,
    phase: 'play',
    ballDead: false,
    restart: null,
    players,
    ball: kicked.ball,
    rng: kicked.rng,
    ballOwnerId: null,
    kickLock: { playerId: SHOOTER, untilTick: s0.tick + 12 },
    lastTouchTeam: 'away',
    lastShot: { team: 'away', tick: s0.tick },
    controlledId: 'home-P3',
  };
  for (let i = 0; i < 2 * TICK_RATE; i++) {
    s = step(s, NO_INPUT);
    if (s.score.away > 0) return 'goal';
    if (s.ballOwnerId === GK || (s.lastShot === null && s.lastTouchTeam === 'home')) return 'saved';
    if (s.phase !== 'play') return 'missed';
  }
  return 'missed';
}

describe('thủ môn cản phá', () => {
  const count = (gkStats: Partial<PlayerStats>) => {
    const tally: Record<Result, number> = { goal: 0, saved: 0, missed: 0 };
    for (let seed = 1; seed <= 500; seed++) tally[shoot(seed, gkStats)]++;
    return tally;
  };

  it('Phản xạ 90 cản nhiều cú sút hơn Phản xạ 50 (500 cú, seed cố định)', () => {
    const good = count({ reflexes: 90 });
    const poor = count({ reflexes: 50 });
    expect(good.saved).toBeGreaterThan(poor.saved);
    expect(good.goal).toBeLessThan(poor.goal);
    // Không phải cú nào cũng cản được.
    expect(good.goal).toBeGreaterThan(0);
    // 1000 cú sút: chạy song song cả repo trên máy yếu có lúc quá 5 s mặc định.
  }, 30_000);
});

describe('thủ môn có bóng', () => {
  it('bắt bóng xong giữ một lúc rồi phát bóng, không rê bóng lên', () => {
    const s0 = createMatch({ ...setup, autopilot: true });
    const players = s0.players.map((p) =>
      p.id === 'away-GK' ? { ...p, pos: vec2(HALF_LENGTH - 2, 0), vel: ZERO } : p,
    );
    const gk = players.find((p) => p.id === 'away-GK')!;
    let s: MatchState = {
      ...s0,
      phase: 'play',
      ballDead: false,
      restart: null,
      players,
      ballOwnerId: gk.id,
      ownerSinceTick: s0.tick,
      ball: dribbleBall(gk),
    };
    let released = -1;
    for (let i = 0; i < 3 * TICK_RATE && released < 0; i++) {
      s = step(s, NO_INPUT);
      if (s.ballOwnerId !== gk.id) released = i;
      else expect(s.players.find((p) => p.id === gk.id)!.pos.x).toBeGreaterThan(HALF_LENGTH - 3);
    }
    expect(released).toBeGreaterThan(TICK_RATE / 2);
    expect(released).toBeLessThan(2 * TICK_RATE);
  });
});
