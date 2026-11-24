import { beforeEach, describe, expect, it } from 'vitest';
import { matches, pvpMatches } from '../db/schema';
import { createUser, resetTestData, testDb } from '../../test/helpers';
import { countRewardedMatches } from './matches';

const DAY = '2026-03-10';
const db = testDb();

beforeEach(() => resetTestData(db));

async function row(userId: number, n: number, v: Partial<typeof matches.$inferInsert> = {}) {
  await db.insert(matches).values({
    userId,
    tokenHash: `h${userId}-${n}`,
    difficulty: 'hard',
    seed: 1,
    squadSnapshot: {},
    rewardEligible: true,
    startedAt: new Date(),
    rewardDay: DAY,
    ...v,
  });
}

describe('countRewardedMatches (PvP)', () => {
  it('đếm reward > 0 hoặc consumes_daily_cap; trận đấu máy giữ cách đếm cũ', async () => {
    const u = await createUser(db, 'a');
    await row(u.id, 1, { reward: 60 }); // đấu máy có thưởng
    await row(u.id, 2, { reward: 0 }); // đấu máy hết trần: không đếm
    await row(u.id, 3, { reward: 0, consumesDailyCap: true }); // xử thua ranked: đếm
    await row(u.id, 4, { reward: 0, rewardDay: '2026-03-11', consumesDailyCap: true }); // ngày khác
    expect(await countRewardedMatches(db, u.id, DAY)).toBe(2);
  });

  it('mặc định dòng mới mode=cpu; ràng buộc pvp_matches và UNIQUE (pvp_match_id, user_id)', async () => {
    const a = await createUser(db, 'a');
    const b = await createUser(db, 'b');
    await row(a.id, 1);
    const [m] = await db.select().from(matches);
    expect(m).toMatchObject({ mode: 'cpu', pvpMatchId: null, consumesDailyCap: false });

    const base = {
      kind: 'ranked' as const,
      seed: 1,
      squadSnapshot: {},
      startedAt: new Date(),
    };
    await expect(
      db.insert(pvpMatches).values({ ...base, homeUserId: a.id, awayUserId: a.id }),
    ).rejects.toThrow();
    await expect(
      db.insert(pvpMatches).values({ ...base, homeUserId: a.id, awayUserId: b.id, homeGoals: 21 }),
    ).rejects.toThrow();
    const [p] = await db
      .insert(pvpMatches)
      .values({ ...base, homeUserId: a.id, awayUserId: b.id })
      .returning();
    expect(p!.status).toBe('live');
    await row(a.id, 2, { mode: 'pvp_ranked', pvpMatchId: p!.id, opponentUserId: b.id });
    await expect(
      row(a.id, 3, { mode: 'pvp_ranked', pvpMatchId: p!.id, opponentUserId: b.id }),
    ).rejects.toThrow();
  });
});
