import { describe, expect, it } from 'vitest';
import { DAILY_MISSION_COUNT, MISSIONS } from '../config/economy';
import { advanceProgress, missionDelta, pickDailyMissions } from './missions';

describe('pickDailyMissions', () => {
  it('chọn đúng 3 nhiệm vụ không trùng và tất định theo (userId, day)', () => {
    const a = pickDailyMissions(42, '2026-03-10');
    const b = pickDailyMissions(42, '2026-03-10');
    expect(a).toHaveLength(DAILY_MISSION_COUNT);
    expect(a).toEqual(b);
    expect(new Set(a.map((m) => m.code)).size).toBe(DAILY_MISSION_COUNT);
    const allCodes = new Set<string>(MISSIONS.map((m) => m.code));
    for (const m of a) expect(allCodes.has(m.code)).toBe(true);
  });

  it('thay đổi ngày hoặc user tạo bộ nhiệm vụ đa dạng qua nhiều cặp', () => {
    const combos = new Set<string>();
    for (let d = 1; d <= 10; d++) {
      combos.add(
        pickDailyMissions(1, `2026-03-${String(d).padStart(2, '0')}`)
          .map((m) => m.code)
          .join(','),
      );
    }
    for (let u = 1; u <= 10; u++) {
      combos.add(
        pickDailyMissions(u, '2026-03-10')
          .map((m) => m.code)
          .join(','),
      );
    }
    expect(combos.size).toBeGreaterThan(5);
  });
});

describe('missionDelta & advanceProgress', () => {
  it('pack_opened chỉ tăng pack_open', () => {
    expect(missionDelta('pack_open', { type: 'pack_opened' })).toBe(1);
    expect(missionDelta('match_win', { type: 'pack_opened' })).toBe(0);
    expect(missionDelta('match_goals', { type: 'pack_opened' })).toBe(0);
    expect(missionDelta('match_hard', { type: 'pack_opened' })).toBe(0);
    expect(missionDelta('match_play', { type: 'pack_opened' })).toBe(0);
    expect(missionDelta('match_clean_sheet', { type: 'pack_opened' })).toBe(0);
  });

  it('match_finished: thắng thường & thắng luân lưu tính win; ghi bàn, Khó, sạch lưới', () => {
    const winEasyClean = {
      type: 'match_finished' as const,
      mode: 'cpu' as const,
      difficulty: 'easy' as const,
      outcome: 'win' as const,
      homeGoals: 3,
      awayGoals: 0,
    };
    expect(missionDelta('match_win', winEasyClean)).toBe(1);
    expect(missionDelta('match_goals', winEasyClean)).toBe(3);
    expect(missionDelta('match_hard', winEasyClean)).toBe(0);
    expect(missionDelta('match_play', winEasyClean)).toBe(1);
    expect(missionDelta('match_clean_sheet', winEasyClean)).toBe(1);
    expect(missionDelta('pack_open', winEasyClean)).toBe(0);

    const shootoutWinHard = {
      type: 'match_finished' as const,
      mode: 'cpu' as const,
      difficulty: 'hard' as const,
      outcome: 'shootout_win' as const,
      homeGoals: 2,
      awayGoals: 2,
    };
    expect(missionDelta('match_win', shootoutWinHard)).toBe(1);
    expect(missionDelta('match_goals', shootoutWinHard)).toBe(2);
    expect(missionDelta('match_hard', shootoutWinHard)).toBe(1);
    expect(missionDelta('match_play', shootoutWinHard)).toBe(1);
    expect(missionDelta('match_clean_sheet', shootoutWinHard)).toBe(0);

    for (const outcome of ['draw', 'loss', 'shootout_loss'] as const) {
      expect(
        missionDelta('match_win', {
          type: 'match_finished',
          mode: 'cpu',
          difficulty: 'easy',
          outcome,
          homeGoals: 0,
          awayGoals: 1,
        }),
      ).toBe(0);
    }
  });

  it('match_hard chỉ đếm trận đấu máy; trận pvp vẫn tính win/goals/play', () => {
    const pvp = {
      type: 'match_finished' as const,
      mode: 'pvp' as const,
      difficulty: 'hard' as const,
      outcome: 'win' as const,
      homeGoals: 2,
      awayGoals: 0,
    };
    expect(missionDelta('match_hard', pvp)).toBe(0);
    expect(missionDelta('match_hard', { ...pvp, mode: 'cpu' })).toBe(1);
    expect(missionDelta('match_win', pvp)).toBe(1);
    expect(missionDelta('match_goals', pvp)).toBe(2);
    expect(missionDelta('match_play', pvp)).toBe(1);
    expect(missionDelta('match_clean_sheet', pvp)).toBe(1);
  });

  it('advanceProgress kẹp trần tại target và bỏ qua delta <= 0', () => {
    expect(advanceProgress(1, 3, 5)).toBe(3);
    expect(advanceProgress(2, 3, 1)).toBe(3);
    expect(advanceProgress(2, 3, 0)).toBe(2);
    expect(advanceProgress(2, 3, -1)).toBe(2);
  });
});
