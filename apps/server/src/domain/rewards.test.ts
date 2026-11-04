import { describe, expect, it } from 'vitest';
import { MATCH_MAX_GOALS, MATCH_REWARD, MATCH_REWARD_DAILY_CAP } from '../config/economy';
import { gameDay, judgeMatchResult, matchReward } from './rewards';

describe('cấu hình thưởng trận', () => {
  it('khớp bảng PRD §7.1 (luân lưu: thắng = hoà + 50% chênh lệch, thua = 2/3 hoà)', () => {
    expect(MATCH_REWARD.easy).toEqual({
      win: 60,
      draw: 30,
      loss: 15,
      shootout_win: 45,
      shootout_loss: 20,
    });
    expect(MATCH_REWARD.hard).toEqual({
      win: 120,
      draw: 60,
      loss: 30,
      shootout_win: 90,
      shootout_loss: 40,
    });
    for (const t of [MATCH_REWARD.easy, MATCH_REWARD.hard]) {
      expect(t.shootout_win).toBe(t.draw + (t.win - t.draw) / 2);
      expect(t.shootout_loss).toBe((t.draw * 2) / 3);
      expect(t.shootout_loss).toBeGreaterThan(t.loss);
    }
    expect(MATCH_REWARD_DAILY_CAP).toBe(15);
    expect(MATCH_MAX_GOALS).toBe(20);
  });
});

describe('judgeMatchResult', () => {
  it('thắng / hoà / thua theo đội nhà', () => {
    expect(judgeMatchResult({ homeGoals: 3, awayGoals: 1 })).toEqual({ ok: true, outcome: 'win' });
    expect(judgeMatchResult({ homeGoals: 2, awayGoals: 2 })).toEqual({ ok: true, outcome: 'draw' });
    expect(judgeMatchResult({ homeGoals: 0, awayGoals: 1 })).toEqual({ ok: true, outcome: 'loss' });
  });

  it('hoà + luân lưu → thắng/thua luân lưu', () => {
    expect(
      judgeMatchResult({ homeGoals: 1, awayGoals: 1, shootout: { home: 4, away: 3 } }),
    ).toEqual({ ok: true, outcome: 'shootout_win' });
    expect(
      judgeMatchResult({ homeGoals: 0, awayGoals: 0, shootout: { home: 5, away: 6 } }),
    ).toEqual({ ok: true, outcome: 'shootout_loss' });
  });

  it('tỉ số ≤ 20 mỗi đội; 21 bị từ chối', () => {
    expect(judgeMatchResult({ homeGoals: 20, awayGoals: 20 }).ok).toBe(true);
    expect(judgeMatchResult({ homeGoals: 21, awayGoals: 0 }).ok).toBe(false);
    expect(judgeMatchResult({ homeGoals: 0, awayGoals: 21 }).ok).toBe(false);
  });

  it('luân lưu chỉ khi hoà, và phải phân thắng thua', () => {
    expect(
      judgeMatchResult({ homeGoals: 2, awayGoals: 1, shootout: { home: 4, away: 3 } }).ok,
    ).toBe(false);
    expect(
      judgeMatchResult({ homeGoals: 1, awayGoals: 1, shootout: { home: 3, away: 3 } }).ok,
    ).toBe(false);
  });
});

describe('matchReward', () => {
  it('theo độ khó + kết quả khi còn trong trần', () => {
    expect(matchReward('easy', 'win', 0)).toBe(60);
    expect(matchReward('hard', 'shootout_win', 3)).toBe(90);
    expect(matchReward('hard', 'loss', 14)).toBe(30);
  });

  it('đã đủ 15 trận có thưởng trong ngày → 0', () => {
    expect(matchReward('hard', 'win', 15)).toBe(0);
    expect(matchReward('easy', 'draw', 20)).toBe(0);
  });
});

describe('gameDay (GMT+7)', () => {
  it('đổi ngày lúc 00:00 GMT+7 = 17:00 UTC', () => {
    expect(gameDay(new Date('2026-03-10T16:59:00Z'))).toBe('2026-03-10'); // 23:59 GMT+7
    expect(gameDay(new Date('2026-03-10T17:01:00Z'))).toBe('2026-03-11'); // 00:01 GMT+7
    expect(gameDay(new Date('2026-12-31T17:00:00Z'))).toBe('2027-01-01');
  });
});
