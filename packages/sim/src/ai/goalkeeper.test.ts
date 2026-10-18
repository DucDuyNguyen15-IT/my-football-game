import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, starterLikeTeam } from '../fixtures/demoTeams';
import { createMatch } from '../match';
import { length, sub, vec2, ZERO, type Vec2 } from '../math/vec2';
import { GOAL_WIDTH, HALF_LENGTH } from '../pitch';
import { seedRng } from '../rng';
import {
  keeperCatchChance,
  keeperReachFor,
  keeperReactionTicks,
  keeperSaveChance,
} from '../stats/params';
import type { BallState, PlayerState } from '../types';
import { asKicker, diveTarget, keeperContact, keeperTarget, resolveSave } from './goalkeeper';

/*
 * Thủ môn đội nhà giữ khung thành phía −x (hiệp 1). Đội khách tấn công về −x.
 */

const base = createMatch({ home: starterLikeTeam, away: cpuEasyTeam, seed: 1, difficulty: 'easy' });
const GOAL_X = -HALF_LENGTH;

function gkWith(over: Partial<PlayerState['stats']> = {}, pos: Vec2 = vec2(GOAL_X + 1, 0)) {
  const gk = base.players.find((p) => p.id === 'home-GK')!;
  return { ...gk, pos, vel: ZERO, stats: { ...gk.stats, ...over } };
}

/** Mọi người đứng xa khung thành đội nhà, trừ người được đặt chỗ. */
function players(at: Record<string, Vec2> = {}): PlayerState[] {
  return base.players.map((p, i) => ({
    ...p,
    pos: at[p.id] ?? vec2(10 + i * 0.5, p.team === 'home' ? -18 : 18),
    vel: ZERO,
  }));
}

const ball = (pos: Vec2, vel: Vec2 = ZERO, z = 0): BallState => ({ pos, vel, z, vz: 0 });

describe('tham số thủ môn', () => {
  it('Phản xạ cao phản ứng nhanh hơn; Vị trí cao với xa hơn; Bắt bóng cao bắt dính nhiều hơn', () => {
    expect(keeperReactionTicks(90)).toBeLessThan(keeperReactionTicks(50));
    expect(keeperSaveChance(90)).toBeGreaterThan(keeperSaveChance(50));
    expect(Number.isInteger(keeperReactionTicks(50))).toBe(true);
    expect(keeperReachFor(90)).toBeGreaterThan(keeperReachFor(50));
    expect(keeperCatchChance(90, 15)).toBeGreaterThan(keeperCatchChance(50, 15));
    expect(keeperCatchChance(70, 28)).toBeLessThan(keeperCatchChance(70, 12));
  });
});

describe('keeperTarget — chọn vị trí', () => {
  it('bóng ở xa giữa sân → đứng gần vạch, giữa khung thành', () => {
    const t = keeperTarget(gkWith(), ball(vec2(10, 0)), players(), null, 1);
    expect(t.x).toBeGreaterThan(GOAL_X);
    expect(t.x).toBeLessThan(GOAL_X + 4);
    expect(Math.abs(t.y)).toBeLessThan(0.1);
  });

  it('bóng lệch một bên → dịch về phía đó nhưng không ra ngoài cột', () => {
    const t = keeperTarget(gkWith(), ball(vec2(GOAL_X + 15, 12)), players(), null, 1);
    expect(t.y).toBeGreaterThan(0.3);
    expect(t.y).toBeLessThanOrEqual(GOAL_WIDTH / 2);
  });

  it('Vị trí cao đứng theo góc bóng sát hơn Vị trí thấp', () => {
    // Ngoài vòng cấm (không thuộc trường hợp ra đón bóng).
    const b = ball(vec2(GOAL_X + 14, 8));
    const good = keeperTarget(gkWith({ positioning: 90 }), b, players(), null, 1);
    const poor = keeperTarget(gkWith({ positioning: 40 }), b, players(), null, 1);
    expect(good.y).toBeGreaterThan(poor.y);
  });

  it('đối phương dẫn bóng vào vòng cấm, đối mặt → lao ra thu hẹp góc', () => {
    const carrierAt = vec2(GOAL_X + 9, 2);
    const ps = players({ 'away-P6': carrierAt });
    const t = keeperTarget(gkWith(), ball(carrierAt), ps, 'away-P6', 1);
    expect(t.x).toBeGreaterThan(GOAL_X + 3);
    expect(t.x).toBeLessThan(carrierAt.x);
  });

  it('bóng lăn chậm trong vòng cấm, không ai giữ → ra đón bóng', () => {
    const at = vec2(GOAL_X + 7, -3);
    const t = keeperTarget(gkWith(), ball(at, vec2(-1, 0)), players(), null, 1);
    expect(length(sub(t, at))).toBeLessThan(1.5);
  });

  it('bóng chết trong vòng cấm (collect = false) → không ra nhặt bóng, đứng chọn vị trí', () => {
    const at = vec2(GOAL_X + 7, -3);
    const t = keeperTarget(gkWith(), ball(at), players(), null, 1, false);
    expect(length(sub(t, at))).toBeGreaterThan(3);
  });

  it('hiệp 2 đổi sân: thủ môn đội nhà giữ khung thành phía +x', () => {
    const gk = gkWith({}, vec2(HALF_LENGTH - 1, 0));
    const t = keeperTarget(gk, ball(vec2(0, 0)), players(), null, 2);
    expect(t.x).toBeGreaterThan(HALF_LENGTH - 4);
  });
});

describe('diveTarget', () => {
  it('bóng bay về khung thành → điểm cắt ngang đường thủ môn đứng', () => {
    const gk = gkWith({ positioning: 99 });
    const t = diveTarget(gk, ball(vec2(GOAL_X + 15, 0), vec2(-20, 2)), 1);
    expect(t).not.toBeNull();
    expect(t!.x).toBeCloseTo(gk.pos.x, 9);
    expect(t!.y).toBeCloseTo(1.4, 9);
  });

  it('Vị trí thấp đổ người quá đà ra phía bóng đi chéo', () => {
    const shot = ball(vec2(GOAL_X + 15, 0), vec2(-20, 2));
    const good = diveTarget(gkWith({ positioning: 99 }), shot, 1)!;
    const poor = diveTarget(gkWith({ positioning: 40 }), shot, 1)!;
    expect(poor.y).toBeGreaterThan(good.y);
  });

  it('bóng đi ra xa khung thành hoặc chệch hẳn → null', () => {
    const gk = gkWith();
    expect(diveTarget(gk, ball(vec2(GOAL_X + 15, 0), vec2(20, 0)), 1)).toBeNull();
    expect(diveTarget(gk, ball(vec2(GOAL_X + 15, 0), vec2(-20, 15)), 1)).toBeNull();
  });
});

describe('resolveSave', () => {
  it('Bắt bóng 90 bắt dính nhiều hơn 50 (1.000 lần); đẩy ra thì bóng rời khung thành', () => {
    const shot = ball(vec2(GOAL_X + 1.5, 0.3), vec2(-18, 0), 0.5);
    const catches = (handling: number) => {
      let n = 0;
      for (let seed = 1; seed <= 1000; seed++) {
        const r = resolveSave(gkWith({ handling }), shot, seedRng(seed), 1);
        if (r.outcome === 'catch') n++;
        else expect(r.ball.vel.x).toBeGreaterThan(0);
      }
      return n;
    };
    expect(catches(90)).toBeGreaterThan(catches(50));
  });
});

describe('keeperContact — bóng trúng phần nào', () => {
  const diving = (vy: number) => ({ ...gkWith(), vel: vec2(0, vy) });

  it('lao người: bóng phía trước hướng lao trúng tay, phía sau trúng chân, giữa trúng thân', () => {
    const at = (y: number) => ball(vec2(GOAL_X + 1.3, y), vec2(-18, 0), 0.5);
    expect(keeperContact(diving(6), at(0.8), true)).toBe('hands');
    expect(keeperContact(diving(6), at(-0.8), true)).toBe('legs');
    expect(keeperContact(diving(6), at(0), true)).toBe('body');
    expect(keeperContact(diving(-6), at(-0.8), true)).toBe('hands');
  });

  it('đứng đón: bóng cao hoặc ngay trước mặt thì tay, bóng sệt lệch sang thì chân', () => {
    const gk = gkWith();
    expect(keeperContact(gk, ball(vec2(GOAL_X + 1.3, 0.9), ZERO, 1.2), true)).toBe('hands');
    expect(keeperContact(gk, ball(vec2(GOAL_X + 1.3, 0), ZERO, 0), true)).toBe('hands');
    expect(keeperContact(gk, ball(vec2(GOAL_X + 1.3, 0.9), ZERO, 0), true)).toBe('legs');
  });

  it('chưa kịp phản ứng: bóng thấp trúng chân, bóng cao trúng thân', () => {
    const gk = gkWith();
    expect(keeperContact(gk, ball(vec2(GOAL_X + 1.3, 0), ZERO, 0.1), false)).toBe('legs');
    expect(keeperContact(gk, ball(vec2(GOAL_X + 1.3, 0), ZERO, 1), false)).toBe('body');
  });
});

describe('resolveSave theo chỗ chạm', () => {
  const shot = ball(vec2(GOAL_X + 1.5, 0.3), vec2(-18, 0), 0.5);
  const catches = (contact: 'hands' | 'body' | 'legs') => {
    let n = 0;
    for (let seed = 1; seed <= 1000; seed++) {
      const r = resolveSave(gkWith({ handling: 90 }), shot, seedRng(seed), 1, contact);
      if (r.outcome === 'catch') n++;
      else expect(r.ball.vel.x).toBeGreaterThan(0);
    }
    return n;
  };

  it('trúng chân luôn văng ra; trúng tay bắt dính nhiều hơn trúng thân', () => {
    expect(catches('legs')).toBe(0);
    expect(catches('hands')).toBeGreaterThan(catches('body'));
    expect(catches('body')).toBeGreaterThan(0);
  });
});

describe('asKicker', () => {
  it('thủ môn chuyền/phát bóng bằng chỉ số Phát bóng; cầu thủ khác giữ nguyên', () => {
    const gk = gkWith({ kicking: 77, passing: 30 });
    expect(asKicker(gk).stats.passing).toBe(77);
    const mf = base.players.find((p) => p.id === 'home-P3')!;
    expect(asKicker(mf)).toBe(mf);
  });
});
