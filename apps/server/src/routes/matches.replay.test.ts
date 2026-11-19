// SEC-07: server tự chạy lại trận từ seed + đội đã lưu + log input (worker thread thật, sim thật).
import { and, eq } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { StartMatchResponse, INPUT_LOG_MAX_CHARS, type StartedMatch } from '@pitch/shared';
import { buildMatchSetup, encodeLog, playScriptedMatch, replayMatch } from '@pitch/sim';
import { BODY_LIMIT_BYTES } from '../app';
import { MATCH_REWARD } from '../config/economy';
import { seedCards } from '../db/seed';
import { analyticsEvents, coinTransactions, matches } from '../db/schema';
import { createTestApp, FakeClock, resetTestData, testDb } from '../../test/helpers';

const clock = new FakeClock();
// Seed trận lấy từ rng giả lập tất định: mỗi lần chạy test ra cùng trận.
let counter = 0;
const { app } = createTestApp(clock, { replay: 'real', rng: (n) => (counter++ * 7919 + 13) % n });
afterAll(() => app.close());

beforeEach(async () => {
  counter = 0;
  clock.set('2026-01-01T00:00:00Z');
  await resetTestData(testDb());
  await seedCards(testDb());
});

const json = { 'content-type': 'application/json' };
const MIN = 60_000;

async function signup(): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username: 'nguoi_choi', password: 'mat-khau-dai', acceptTerms: true },
    headers: json,
  });
  return res.cookies.find((c) => c.name === 'sid')!.value;
}

const startMatch = async (sid: string, difficulty: 'easy' | 'hard' = 'easy') =>
  StartMatchResponse.parse(
    (
      await app.inject({
        method: 'POST',
        url: '/api/v1/matches',
        payload: { difficulty },
        headers: json,
        cookies: { sid },
      })
    ).json(),
  ).data;

const submit = (sid: string, m: StartedMatch, body: object) =>
  app.inject({
    method: 'POST',
    url: `/api/v1/matches/${m.matchId}/result`,
    payload: { token: m.token, ...body },
    headers: json,
    cookies: { sid },
  });

/** Đá trận thật bằng sim với input kịch bản, như client sẽ làm. */
function play(m: StartedMatch, difficulty: 'easy' | 'hard', inputSeed: number, subAtTick?: number) {
  const setup = buildMatchSetup({ ...m, difficulty });
  const { log, final } = playScriptedMatch(setup, inputSeed, {
    ...(subAtTick !== undefined && { subAtTick }),
  });
  const so = final.shootout;
  const goals = (k: boolean[]) => k.filter(Boolean).length;
  return {
    log,
    ticks: final.tick,
    body: {
      inputLog: log,
      homeGoals: final.score.home,
      awayGoals: final.score.away,
      ...(so && { shootout: { home: goals(so.home), away: goals(so.away) } }),
    },
  };
}

const events = async (name: string) =>
  testDb().select().from(analyticsEvents).where(eq(analyticsEvents.name, name));
const rewards = async () =>
  testDb().select().from(coinTransactions).where(eq(coinTransactions.type, 'match_reward'));

describe('POST /matches/:id/result — server replay (SEC-07)', () => {
  it('log thật (có thay người) → 200, thưởng theo tỉ số replay; nộp lại không cộng lần 2', async () => {
    const sid = await signup();
    const m = await startMatch(sid);
    const g = play(m, 'easy', 3, 3000);
    clock.advance(g.ticks * (1000 / 60) + MIN);

    const res = await submit(sid, m, g.body);
    expect(res.statusCode, res.body).toBe(200);
    const { outcome, reward } = res.json().data;
    expect(reward).toBe(MATCH_REWARD.easy[outcome as keyof typeof MATCH_REWARD.easy]);
    const [row] = await testDb()
      .select()
      .from(matches)
      .where(eq(matches.id, Number(m.matchId)));
    expect(row).toMatchObject({
      status: 'finished',
      homeGoals: g.body.homeGoals,
      awayGoals: g.body.awayGoals,
    });

    const again = await submit(sid, m, g.body);
    expect(again.statusCode).toBe(200);
    expect(again.json().data.reward).toBe(reward);
    expect(await rewards()).toHaveLength(reward > 0 ? 1 : 0);
  });

  it('sửa tỉ số client báo → 422 + analytics match_replay_mismatch; trận vẫn nộp đúng được', async () => {
    const sid = await signup();
    const m = await startMatch(sid);
    const g = play(m, 'easy', 4);
    clock.advance(g.ticks * (1000 / 60) + MIN);

    const bad = await submit(sid, m, { ...g.body, homeGoals: g.body.homeGoals + 20 });
    expect(bad.statusCode).toBe(422);
    expect(bad.json().error.code).toBe('match_token_invalid');
    expect(await events('match_replay_mismatch')).toHaveLength(1);
    expect(await rewards()).toHaveLength(0);
    const [row] = await testDb()
      .select()
      .from(matches)
      .where(eq(matches.id, Number(m.matchId)));
    expect(row!.status).toBe('started');

    expect((await submit(sid, m, g.body)).statusCode).toBe(200);
  });

  it('log cụt / hỏng / thừa / quá lớn bị từ chối', async () => {
    const sid = await signup();
    const m = await startMatch(sid);
    const g = play(m, 'easy', 5);
    clock.advance(g.ticks * (1000 / 60) + MIN);

    const short = encodeLog({ runs: [[1200, 0]], subs: [] }); // hết log khi chưa tới full_time
    for (const inputLog of [short, g.log.slice(0, -3), `${g.log}AAAA`, 'AAAA', 'AAAAAAAA']) {
      const res = await submit(sid, m, { ...g.body, inputLog });
      expect(res.statusCode, inputLog.slice(0, 20)).toBe(422);
    }
    // Sai bảng chữ / dài quá trần → 400 (schema); body quá 64 KiB → 400 (handler lỗi chung gộp mọi 4xx của Fastify).
    expect((await submit(sid, m, { ...g.body, inputLog: 'a b' })).statusCode).toBe(400);
    expect((await submit(sid, m, { ...g.body, inputLog: '' })).statusCode).toBe(400);
    const huge = 'A'.repeat(INPUT_LOG_MAX_CHARS + 1);
    expect((await submit(sid, m, { ...g.body, inputLog: huge })).statusCode).toBe(400);
    const res = await submit(sid, m, { ...g.body, inputLog: 'A'.repeat(BODY_LIMIT_BYTES) });
    expect(res.statusCode).toBe(400);
    expect(await rewards()).toHaveLength(0);
    // Thiếu inputLog hẳn → 400.
    expect((await submit(sid, m, { ...g.body, inputLog: undefined })).statusCode).toBe(400);
  });

  it('log của trận khác (seed/đội khác) → 422', async () => {
    const sid = await signup();
    const a = await startMatch(sid);
    const b = await startMatch(sid); // huỷ trận a (mỗi người một trận đang đá), nên nộp cho b
    const mine = play(b, 'easy', 6);
    // Chọn log của a sao cho chạy trên b ra tỉ số khác tỉ số a báo (phép thử có ý nghĩa).
    let other = play(a, 'easy', 6);
    for (let k = 7; k < 40; k++) {
      const onB = replayMatch(buildMatchSetup({ ...b, difficulty: 'easy' }), other.log);
      if (onB.score.home !== other.body.homeGoals || onB.score.away !== other.body.awayGoals) break;
      other = play(a, 'easy', k);
    }
    clock.advance(Math.max(other.ticks, mine.ticks) * (1000 / 60) + MIN);

    const res = await submit(sid, b, other.body);
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('match_token_invalid');
    expect((await submit(sid, b, mine.body)).statusCode).toBe(200);
  }, 60_000);

  it('log dài hơn thời gian thực đã trôi từ lúc phát token → 422 (không nộp nhanh hơn người thật)', async () => {
    const sid = await signup();
    const m = await startMatch(sid);
    const g = play(m, 'easy', 7);
    clock.advance(360 * 1000 + 1); // qua mức tối thiểu 360 s nhưng trận cần ~400 s
    expect(g.ticks / 60).toBeGreaterThan(366);
    const res = await submit(sid, m, g.body);
    expect(res.statusCode).toBe(422);
    expect(await rewards()).toHaveLength(0);
  });

  it('hai lần nộp đồng thời cùng một trận → chỉ cộng thưởng một lần', async () => {
    const sid = await signup();
    const m = await startMatch(sid, 'hard');
    const g = play(m, 'hard', 8);
    clock.advance(g.ticks * (1000 / 60) + MIN);
    const [x, y] = await Promise.all([submit(sid, m, g.body), submit(sid, m, g.body)]);
    expect([x.statusCode, y.statusCode]).toEqual([200, 200]);
    expect(x.json().data.reward).toBe(y.json().data.reward);
    const paid = await testDb()
      .select()
      .from(matches)
      .where(and(eq(matches.id, Number(m.matchId)), eq(matches.status, 'finished')));
    expect(paid).toHaveLength(1);
    expect((await rewards()).length).toBeLessThanOrEqual(1);
  });
});
