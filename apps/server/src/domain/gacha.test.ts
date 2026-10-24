import { describe, expect, it } from 'vitest';
import { Rarity } from '@pitch/shared';
import { chiSquarePValue, chiSquareStat, seededRng } from '../../test/stats';
import { BOX_COMPOSITION, PACKS } from '../config/economy';
import {
  boxTotal,
  drawTickets,
  freshLeft,
  guaranteeAvailable,
  nextOdds,
  pickCard,
  type Box,
  type BoxLeft,
} from './gacha';

const fresh = (): Box => ({ left: freshLeft(), cycle: 1 });
const box = (left: Partial<BoxLeft>, cycle = 1): Box => ({
  left: { bronze: 0, silver: 0, gold: 0, legend: 0, ...left },
  cycle,
});
const count = (rs: readonly string[], r: Rarity) => rs.filter((x) => x === r).length;

describe('stats helper', () => {
  it('chiSquarePValue khớp bảng tra', () => {
    expect(chiSquarePValue(7.815, 3)).toBeCloseTo(0.05, 3);
    expect(chiSquarePValue(11.345, 3)).toBeCloseTo(0.01, 3);
    expect(chiSquarePValue(341.4, 300)).toBeCloseTo(0.05, 2);
    expect(chiSquarePValue(0, 3)).toBe(1);
  });
});

describe('cấu hình', () => {
  it('hộp 2/10/30/58, gói 1 = 100 xu, gói 5 = 450 xu có bảo đảm (PRD §6.3)', () => {
    expect(BOX_COMPOSITION).toEqual({ bronze: 58, silver: 30, gold: 10, legend: 2 });
    expect(PACKS.pack1).toEqual({ size: 1, price: 100, guarantee: false, freeCredit: false });
    expect(PACKS.pack5).toEqual({ size: 5, price: 450, guarantee: true, freeCredit: true });
  });
});

describe('drawTickets', () => {
  it('bốc hết 100 phiếu → đúng 2/10/30/58, lặp nhiều hộp (gói 1 và gói 5)', () => {
    const rng = seededRng(1);
    for (const pack of [PACKS.pack1, PACKS.pack5]) {
      let b = fresh();
      for (let cycle = 1; cycle <= 50; cycle++) {
        const got: string[] = [];
        for (let i = 0; i < 100 / pack.size; i++) {
          const res = drawTickets(b, pack.size, pack, rng);
          got.push(...res.rarities);
          b = res.box;
        }
        expect(boxTotal(b.left)).toBe(0);
        expect(b.cycle).toBe(cycle);
        for (const r of Rarity.options) expect(count(got, r)).toBe(BOX_COMPOSITION[r]);
      }
    }
  });

  it('không sửa hộp đầu vào', () => {
    const b = fresh();
    drawTickets(b, 5, { guarantee: true }, seededRng(2));
    expect(b).toEqual(fresh());
  });

  it('10.000 hộp: tần suất độ hiếm ở từng vị trí bốc khớp lý thuyết (chi-bình phương)', () => {
    const BOXES = 10_000;
    const probs = Rarity.options.map((r) => BOX_COMPOSITION[r] / 100);
    const idx = Object.fromEntries(Rarity.options.map((r, i) => [r, i])) as Record<Rarity, number>;
    const counts = Array.from({ length: 100 }, () => [0, 0, 0, 0]);
    const rng = seededRng(20261025);
    for (let n = 0; n < BOXES; n++) {
      let b = fresh();
      for (let pos = 0; pos < 100; pos++) {
        const res = drawTickets(b, 1, { guarantee: false }, rng);
        counts[pos]![idx[res.rarities[0]!]]!++;
        b = res.box;
      }
    }
    let pooled = 0;
    for (const observed of counts) {
      const stat = chiSquareStat(observed, probs);
      pooled += stat;
      // Bonferroni cho 100 vị trí.
      expect(chiSquarePValue(stat, 3)).toBeGreaterThan(0.01 / 100);
    }
    expect(chiSquarePValue(pooled, 3 * 100)).toBeGreaterThan(0.01);
  });

  it('gói 5 không bao giờ ra 5 Đồng khi hộp còn Bạc+', () => {
    const rng = seededRng(3);
    let checked = 0;
    for (let n = 0; n < 5000; n++) {
      const left: BoxLeft = { bronze: rng(59), silver: rng(2), gold: rng(2), legend: rng(2) };
      if (boxTotal(left) === 0) continue;
      const b = box(left);
      const { rarities } = drawTickets(b, 5, PACKS.pack5, rng);
      if (guaranteeAvailable(b, 5)) {
        expect(count(rarities, 'bronze')).toBeLessThan(5);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(3000);
  });

  it('phiếu bảo đảm bốc trong nhóm Bạc+ theo tỉ lệ số còn lại', () => {
    // Hộp 4 Đồng + 1 Bạc + 1 Huyền thoại; rng ép 4 lượt đầu rơi vào Đồng (cuối dãy cộng dồn).
    const b = box({ bronze: 4, silver: 1, legend: 1 });
    const seen = new Set<string>();
    for (let s = 0; s < 200; s++) {
      const rng = seededRng(s);
      let call = 0;
      const forced = (max: number) => (call++ < 4 ? max - 1 : rng(max));
      const { rarities } = drawTickets(b, 5, PACKS.pack5, forced);
      expect(rarities.slice(0, 4)).toEqual(['bronze', 'bronze', 'bronze', 'bronze']);
      expect(['silver', 'legend']).toContain(rarities[4]);
      seen.add(rarities[4]!);
    }
    expect(seen).toEqual(new Set(['silver', 'legend']));
  });

  it('hộp chỉ còn Đồng → không bảo đảm', () => {
    const b = box({ bronze: 10 });
    expect(guaranteeAvailable(b, 5)).toBe(false);
    const { rarities, box: after } = drawTickets(b, 5, PACKS.pack5, seededRng(4));
    expect(rarities).toEqual(Array(5).fill('bronze'));
    expect(after.left.bronze).toBe(5);
  });

  it('làm mới giữa gói: 2 phiếu cuối của hộp cũ + 3 phiếu từ hộp mới, cycle + 1', () => {
    const b = box({ bronze: 2 }, 7);
    expect(guaranteeAvailable(b, 5)).toBe(true);
    const { rarities, box: after } = drawTickets(b, 5, PACKS.pack5, seededRng(5));
    expect(rarities.slice(0, 2)).toEqual(['bronze', 'bronze']);
    expect(after.cycle).toBe(8);
    expect(boxTotal(after.left)).toBe(97);
    // Lượt cuối vẫn được bảo đảm vì hộp mới có Bạc+.
    expect(count(rarities, 'bronze')).toBeLessThan(5);
  });

  it('hộp rỗng → làm mới trước lượt đầu', () => {
    const { box: after } = drawTickets(box({}, 3), 1, PACKS.pack1, seededRng(6));
    expect(after.cycle).toBe(4);
    expect(boxTotal(after.left)).toBe(99);
  });
});

describe('nextOdds', () => {
  it('= số còn lại / tổng còn lại', () => {
    expect(nextOdds(fresh())).toEqual({ bronze: 0.58, silver: 0.3, gold: 0.1, legend: 0.02 });
    expect(nextOdds(box({ bronze: 3, legend: 1 }))).toEqual({
      bronze: 0.75,
      silver: 0,
      gold: 0,
      legend: 0.25,
    });
  });

  it('hộp rỗng → tỉ lệ hộp mới', () => {
    expect(nextOdds(box({}))).toEqual(nextOdds(fresh()));
  });
});

describe('pickCard', () => {
  const catalog = { bronze: ['b1', 'b2', 'b3'], silver: ['s1'], gold: [], legend: ['l1'] };

  it('chọn đều trong độ hiếm', () => {
    const rng = seededRng(7);
    const tally: Record<string, number> = {};
    for (let i = 0; i < 30_000; i++) {
      const c = pickCard(catalog, 'bronze', rng);
      tally[c] = (tally[c] ?? 0) + 1;
    }
    expect(Object.keys(tally).sort()).toEqual(['b1', 'b2', 'b3']);
    const p = chiSquarePValue(chiSquareStat(Object.values(tally), [1 / 3, 1 / 3, 1 / 3]), 2);
    expect(p).toBeGreaterThan(0.01);
  });

  it('độ hiếm không có thẻ → lỗi rõ ràng', () => {
    expect(() => pickCard(catalog, 'gold', seededRng(8))).toThrow(/gold/);
  });
});
