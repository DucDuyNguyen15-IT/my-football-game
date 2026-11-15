// Task 7.3 — toàn vẹn sổ cái (PRD §7.4, ARCHITECTURE §3.4): đối soát sau chuỗi thao tác ngẫu nhiên
// có seed, thao tác đồng thời hỗn hợp, và script `ledger:check`.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { eq, sql } from 'drizzle-orm';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { OpenPackResponse, SquadResponse, StartMatchResponse } from '@pitch/shared';
import { PACKS, STARTER_SQUAD } from '../config/economy';
import { seedCards } from '../db/seed';
import { cardUpgrades, coinTransactions, dailyMissions, packOpenings, users } from '../db/schema';
import { findLedgerMismatches, findMissionRewardMismatches } from '../services/ledger';
import {
  createTestApp,
  FakeClock,
  resetTestData,
  TEST_DATABASE_URL,
  testDb,
} from '../../test/helpers';
import {
  apiClient,
  dbState,
  expectLedgerConsistent,
  giveCard,
  MIN,
  seededRng,
  type TestUser,
} from '../../test/client';

const clock = new FakeClock();
/** Seed cố định: chạy lại cho cùng chuỗi thao tác + cùng kết quả ép thẻ (gacha vẫn dùng CSPRNG). */
const SEED = 20261113;
let appRng = seededRng(SEED);
const { app } = createTestApp(clock, { enableDevRoutes: true, rng: (n) => appRng(n) });
const api = apiClient(app);
afterAll(() => app.close());

beforeEach(async () => {
  clock.set('2026-01-01T00:00:00Z');
  appRng = seededRng(SEED);
  await resetTestData(testDb());
  await seedCards(testDb());
});

/** Mã HTTP được phép khi request đúng hình thức nhưng có thể bị luật nghiệp vụ từ chối. */
const BUSINESS_STATUS = [200, 201, 404, 409, 422];

describe('đối soát sổ cái sau chuỗi thao tác ngẫu nhiên (seed cố định)', () => {
  it('mọi người chơi: coins = SUM(ledger.amount), balance_after liên tục, không âm', async () => {
    const rng = seededRng(SEED + 1);
    const players: TestUser[] = [];
    for (let i = 0; i < 5; i++) players.push(await api.signup(`nguoi_choi_${i}`, 1500 + 500 * i));
    const lastPack = new Map<
      number,
      { code: string; payment: string; key: string; body: string }
    >();
    const done: Record<string, number> = {};
    const ok = (op: string, status: number) => {
      expect(BUSINESS_STATUS, `${op} → ${status}`).toContain(status);
      if (status < 300) done[op] = (done[op] ?? 0) + 1;
    };
    const pick = <T>(items: readonly T[]): T => items[rng(items.length)]!;

    const STEPS = 260;
    for (let step = 0; step < STEPS; step++) {
      const user = pick(players);
      const roll = rng(100);
      if (roll < 35) {
        const code = roll < 22 ? 'pack1' : 'pack5';
        const payment = roll >= 31 ? 'free_credit' : 'coins';
        const key = randomUUID();
        const res = await api.openPack(user, code, { payment }, key);
        ok('pack', res.statusCode);
        if (res.statusCode === 200) {
          lastPack.set(user.userId, { code, payment, key, body: res.body });
        }
      } else if (roll < 40) {
        // Gửi lại đúng request mở gói gần nhất (cùng Idempotency-Key) → nguyên văn kết quả cũ.
        const prev = lastPack.get(user.userId);
        if (prev) {
          const res = await api.openPack(user, prev.code, { payment: prev.payment }, prev.key);
          expect(res.statusCode).toBe(200);
          expect(res.body).toBe(prev.body);
          done.replay = (done.replay ?? 0) + 1;
        }
      } else if (roll < 60) {
        const { spare, cards } = await dbState(user.userId);
        // Thỉnh thoảng cố bán cả thẻ đang trong đội hình → 409, không đổi gì.
        const pool = rng(8) === 0 ? cards : spare;
        if (pool.length > 0) {
          const ids = new Set<string>();
          for (let n = 1 + rng(3); n > 0; n--) ids.add(String(pick(pool).id));
          ok('sell', (await api.sell(user, { playerCardIds: [...ids] })).statusCode);
        }
      } else if (roll < 80) {
        const { spare, cards } = await dbState(user.userId);
        if (spare.length > 0) {
          const target = pick(cards);
          const material = pick(spare);
          const res = await api.upgrade(user, target.id, { materialId: String(material.id) });
          ok('upgrade', res.statusCode);
        }
      } else if (roll < 96) {
        const started = await api.startMatch(user, { difficulty: pick(['easy', 'hard']) });
        expect(started.statusCode).toBe(201);
        const m = StartMatchResponse.parse(started.json()).data;
        clock.advance(6 * MIN);
        const homeGoals = rng(5);
        const awayGoals = rng(5);
        const shootout =
          homeGoals === awayGoals && rng(2) === 0 ? { home: 3 + rng(2), away: rng(3) } : undefined;
        const body = { token: m.token, homeGoals, awayGoals, ...(shootout && { shootout }) };
        const res = await api.submitResult(user, m.matchId, body);
        expect(res.statusCode).toBe(200);
        if (res.json().data.reward > 0) done.reward = (done.reward ?? 0) + 1;
        // Nộp lại cùng token → không cộng lần hai.
        if (rng(3) === 0) {
          expect((await api.submitResult(user, m.matchId, body)).statusCode).toBe(200);
        }
      } else {
        const amount = rng(2) === 0 ? 200 + rng(400) : -(1 + rng(300));
        ok('grant', (await api.call(user, 'POST', '/dev/grant-coins', { amount })).statusCode);
      }

      if (step % 20 === 19 || step === STEPS - 1) {
        for (const p of players) await expectLedgerConsistent(p.userId);
        expect(await findLedgerMismatches(testDb())).toEqual([]);
      }
    }

    // Chuỗi phải thật sự đi qua mọi loại giao dịch xu, không thì đối soát vô nghĩa.
    for (const op of ['pack', 'replay', 'sell', 'upgrade', 'reward', 'grant']) {
      expect(done[op] ?? 0, `số lần ${op} thành công`).toBeGreaterThan(0);
    }
    const types = await testDb()
      .selectDistinct({ type: coinTransactions.type })
      .from(coinTransactions);
    expect(types.map((t) => t.type).sort()).toEqual([
      'admin_adjust',
      'card_sale',
      'match_reward',
      'pack_purchase',
      'upgrade_fee',
    ]);
  }, 120_000);
});

describe('thao tác đồng thời hỗn hợp', () => {
  type Job = [name: string, run: () => ReturnType<typeof api.call>];

  /** Một loạt request trái ngược nhau của cùng một người chơi; trả lời theo tên để kiểm chéo. */
  async function burst(user: TestUser, order: (n: number) => number) {
    const uid = user.userId;
    const b1 = await giveCard(uid, 'bronze');
    const b2 = await giveCard(uid, 'bronze');
    const b3 = await giveCard(uid, 'bronze');
    const b4 = await giveCard(uid, 'bronze');
    const s1 = await giveCard(uid, 'silver');
    const s2 = await giveCard(uid, 'silver');
    const squad = SquadResponse.parse((await api.call(user, 'GET', '/squad')).json()).data;
    const sameKey = randomUUID();
    const coins = { payment: 'coins' };
    const free = { payment: 'free_credit' };

    const jobs: Job[] = [
      ...Array.from({ length: 8 }, (_, i): Job => [
        `pack1#${i}`,
        () => api.openPack(user, 'pack1', coins),
      ]),
      ['pack5#0', () => api.openPack(user, 'pack5', coins)],
      ['pack5#1', () => api.openPack(user, 'pack5', coins)],
      ['free#0', () => api.openPack(user, 'pack5', free)],
      ['free#1', () => api.openPack(user, 'pack5', free)],
      ['idem#0', () => api.openPack(user, 'pack1', coins, sameKey)],
      ['idem#1', () => api.openPack(user, 'pack1', coins, sameKey)],
      ['idem#2', () => api.openPack(user, 'pack1', coins, sameKey)],
      ['sell-b1#0', () => api.sell(user, { playerCardIds: [String(b1)] })],
      ['sell-b1#1', () => api.sell(user, { playerCardIds: [String(b1)] })],
      ['sell-b2b3', () => api.sell(user, { playerCardIds: [String(b2), String(b3)] })],
      ['up-s1-s2', () => api.upgrade(user, s1, { materialId: String(s2) })],
      ['up-s2-s1', () => api.upgrade(user, s2, { materialId: String(s1) })],
      ['up-b4-b2', () => api.upgrade(user, b4, { materialId: String(b2) })],
      ['up-b4-b1', () => api.upgrade(user, b4, { materialId: String(b1) })],
      [
        'squad-b3',
        () => api.putSquad(user, { formation: '2-3-1', slots: { ...squad.slots, B5: String(b3) } }),
      ],
      ['squad-same', () => api.putSquad(user, { formation: squad.formation, slots: squad.slots })],
      [
        'squad-321',
        () => api.putSquad(user, { formation: '3-2-1', slots: { ...squad.slots, B1: null } }),
      ],
      ['match#0', () => api.startMatch(user, { difficulty: 'easy' })],
      ['match#1', () => api.startMatch(user, { difficulty: 'hard' })],
    ];
    // Xáo thứ tự phát request theo seed (Fisher–Yates).
    for (let i = jobs.length - 1; i > 0; i--) {
      const j = order(i + 1);
      [jobs[i], jobs[j]] = [jobs[j]!, jobs[i]!];
    }
    const results = await Promise.all(
      jobs.map(async ([name, run]) => [name, await run()] as const),
    );
    return { user, given: { b1, b2, b3, b4, s1, s2 }, res: new Map(results) };
  }

  it('mở gói + bán + ép + lưu đội hình song song: không 500, không âm, không tiêu một thẻ hai lần', async () => {
    const order = seededRng(SEED + 2);
    for (let round = 0; round < 2; round++) {
      const players: TestUser[] = [];
      for (let i = 0; i < 3; i++) players.push(await api.signup(`dong_thoi_${round}_${i}`, 1000));
      const bursts = await Promise.all(players.map((p) => burst(p, order)));

      for (const { user, given, res } of bursts) {
        const status = (name: string) => res.get(name)!.statusCode;
        const okCount = (...names: string[]) => names.filter((n) => status(n) < 300).length;
        for (const [name, r] of res) {
          expect(BUSINESS_STATUS, `${name} → ${r.statusCode} ${r.body}`).toContain(r.statusCode);
        }

        await expectLedgerConsistent(user.userId);
        const state = await dbState(user.userId);

        // Một thẻ chỉ bị tiêu (bán / làm nguyên liệu) nhiều nhất một lần.
        expect(okCount('sell-b1#0', 'sell-b1#1', 'up-b4-b1')).toBeLessThanOrEqual(1);
        expect(okCount('sell-b2b3', 'up-b4-b2')).toBeLessThanOrEqual(1);
        expect(okCount('up-s1-s2', 'up-s2-s1')).toBeLessThanOrEqual(1);
        // Đội hình không bao giờ trỏ tới thẻ đã bán/đã làm nguyên liệu.
        const owned = new Set(state.cards.map((c) => c.id));
        for (const slot of state.slots) expect(owned.has(slot.playerCardId)).toBe(true);
        if (status('sell-b2b3') === 200) expect(owned.has(given.b3)).toBe(false);

        // Lượt miễn phí duy nhất của quà tân thủ chỉ dùng được một lần.
        expect(okCount('free#0', 'free#1')).toBe(1);
        expect(state.user.freePack5Credits).toBe(0);

        // Cùng Idempotency-Key: mọi câu trả lời giống hệt nhau, chỉ trừ xu một lần.
        const idem = ['idem#0', 'idem#1', 'idem#2'].map((n) => res.get(n)!);
        const idemOk = idem.filter((r) => r.statusCode === 200);
        expect(new Set(idemOk.map((r) => r.body)).size).toBeLessThanOrEqual(1);
        expect(new Set(idem.map((r) => r.statusCode)).size).toBe(1);

        // Sổ cái khớp từng bảng nghiệp vụ: mỗi lần mở gói trả xu = một dòng pack_purchase, v.v.
        const openings = await testDb()
          .select()
          .from(packOpenings)
          .where(eq(packOpenings.userId, user.userId));
        const upgrades = await testDb()
          .select()
          .from(cardUpgrades)
          .where(eq(cardUpgrades.userId, user.userId));
        const byType = (type: string) => state.ledger.filter((t) => t.type === type);
        const paid = openings.filter((o) => o.price > 0);
        expect(byType('pack_purchase')).toHaveLength(paid.length);
        expect(-byType('pack_purchase').reduce((s, t) => s + t.amount, 0)).toBe(
          paid.reduce((s, o) => s + o.price, 0),
        );
        expect(byType('upgrade_fee')).toHaveLength(upgrades.length);
        const packOk = [...res].filter(([n, r]) => /^(pack|free)/.test(n) && r.statusCode === 200);
        expect(openings).toHaveLength(packOk.length + (idemOk.length > 0 ? 1 : 0));

        // Không thẻ nào sinh ra/mất đi ngoài sổ: đầu kỳ + mở gói − bán − nguyên liệu = hiện có.
        const opened = openings.reduce(
          (s, o) => s + PACKS[o.packCode as keyof typeof PACKS].size,
          0,
        );
        const startCount = STARTER_SQUAD.slots.length + Object.keys(given).length;
        expect(state.cards).toHaveLength(
          startCount + opened - byType('card_sale').length - upgrades.length,
        );
        for (const [, r] of packOk) {
          expect(OpenPackResponse.parse(r.json()).data.balance).toBeGreaterThanOrEqual(0);
        }
      }
      expect(await findLedgerMismatches(testDb())).toEqual([]);
    }
  }, 120_000);

  it('hai người chơi không khoá chéo nhau: mở gói + vào trận xen kẽ đều xong, trừ xu đúng', async () => {
    const a = await api.signup('khoa_cheo_a', 5000);
    const b = await api.signup('khoa_cheo_b', 5000);
    const all = await Promise.all(
      Array.from({ length: 40 }, (_, i) => {
        const user = i % 2 === 0 ? a : b;
        return i % 4 < 2
          ? api.openPack(user, 'pack1', { payment: 'coins' })
          : api.startMatch(user, { difficulty: 'easy' });
      }),
    );
    expect(all.map((r) => r.statusCode).filter((s) => s >= 300)).toEqual([]);
    for (const u of [a, b]) {
      await expectLedgerConsistent(u.userId);
      expect((await dbState(u.userId)).coins).toBe(5000 - 10 * PACKS.pack1.price);
    }
  }, 60_000);
});

describe('findLedgerMismatches + script ledger:check', () => {
  const SERVER_DIR = fileURLToPath(new URL('../..', import.meta.url));
  const runScript = () =>
    spawnSync(process.execPath, ['--import', 'tsx', 'scripts/ledger-check.ts'], {
      cwd: SERVER_DIR,
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
      encoding: 'utf8',
    });

  it('sổ sạch → rỗng, exit 0; sửa tay số dư hoặc sổ cái → nêu đúng người lệch, exit ≠ 0', async () => {
    const good = await api.signup('so_sach', 700);
    const edited = await api.signup('sua_so_du', 300);
    const orphan = await api.signup('them_dong_so');
    await api.signup('chua_co_giao_dich');
    expect(await findLedgerMismatches(testDb())).toEqual([]);
    const clean = runScript();
    expect(clean.status, clean.stderr).toBe(0);
    expect(clean.stdout).toContain('0 lệch');

    // Giả lập lỗi: cộng xu không qua sổ cái; và ghi sổ cái nhưng không cộng xu.
    await testDb()
      .update(users)
      .set({ coins: sql`${users.coins} + 5000` })
      .where(eq(users.id, edited.userId));
    await testDb().insert(coinTransactions).values({
      userId: orphan.userId,
      type: 'admin_adjust',
      amount: 40,
      balanceAfter: 40,
    });

    const bad = await findLedgerMismatches(testDb());
    expect(bad).toEqual([
      {
        userId: edited.userId,
        username: 'sua_so_du',
        coins: 5300,
        ledgerSum: 300,
        lastBalanceAfter: 300,
      },
      {
        userId: orphan.userId,
        username: 'them_dong_so',
        coins: 0,
        ledgerSum: 40,
        lastBalanceAfter: 40,
      },
    ]);
    expect(bad.map((m) => m.userId)).not.toContain(good.userId);

    const dirty = runScript();
    expect(dirty.status).toBe(1);
    const out = dirty.stdout + dirty.stderr;
    expect(out).toContain('2/4');
    expect(out).toContain('sua_so_du');
    expect(out).toContain('them_dong_so');
  }, 60_000);

  it('thưởng nhiệm vụ: dòng mission_reward thừa (nhận 2 lần) hoặc nhiệm vụ đã nhận mà thiếu dòng → lệch (B3-05)', async () => {
    const u = await api.signup('nhan_hai_lan');
    expect(await findMissionRewardMismatches(testDb())).toEqual([]);
    await testDb().insert(dailyMissions).values({
      userId: u.userId,
      day: '2026-03-10',
      missionCode: 'play_match',
      progress: 1,
      target: 1,
      reward: 50,
      claimedAt: new Date(),
    });
    expect(await findMissionRewardMismatches(testDb())).toEqual([
      { userId: u.userId, ledgerCount: 0, ledgerSum: 0, claimedCount: 1, claimedSum: 50 },
    ]);
    for (let i = 0; i < 2; i++) {
      await testDb().insert(coinTransactions).values({
        userId: u.userId,
        type: 'mission_reward',
        amount: 50,
        balanceAfter: 50 * (i + 1),
      });
    }
    expect(await findMissionRewardMismatches(testDb())).toMatchObject([
      { userId: u.userId, ledgerCount: 2, claimedCount: 1 },
    ]);
    const r = runScript();
    expect(r.status).toBe(1);
    expect(r.stdout + r.stderr).toContain('thưởng nhiệm vụ');
  }, 60_000);
});
