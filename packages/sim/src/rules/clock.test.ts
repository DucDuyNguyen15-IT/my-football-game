import { describe, expect, it } from 'vitest';
import { TICK_RATE } from '../tick';
import {
  addedMinutesFor,
  advanceClock,
  matchClock,
  MAX_ADDED_MINUTES,
  regulationTicks,
  RESTART_GRACE_TICKS,
} from './clock';

const REG = 180 * TICK_RATE;
/** 1 phút game của hiệp 180 s = 4 s thật. */
const MIN = REG / 45;

describe('addedMinutesFor — bù giờ', () => {
  it('không chờ quá lâu, không bàn thắng → không bù giờ', () => {
    expect(addedMinutesFor({ overrunTicks: 0, goals: 0 }, 180)).toBe(0);
  });

  it('chờ quá thời gian cho phép bao nhiêu thì bù bấy nhiêu, làm tròn lên phút', () => {
    expect(addedMinutesFor({ overrunTicks: 1, goals: 0 }, 180)).toBe(1);
    expect(addedMinutesFor({ overrunTicks: MIN, goals: 0 }, 180)).toBe(1);
    expect(addedMinutesFor({ overrunTicks: MIN + 1, goals: 0 }, 180)).toBe(2);
  });

  it('mỗi bàn thắng thêm 1 phút', () => {
    expect(addedMinutesFor({ overrunTicks: 0, goals: 2 }, 180)).toBe(2);
    expect(addedMinutesFor({ overrunTicks: 1, goals: 1 }, 180)).toBe(2);
  });

  it(`tối đa ${MAX_ADDED_MINUTES} phút`, () => {
    expect(addedMinutesFor({ overrunTicks: 100 * MIN, goals: 5 }, 180)).toBe(MAX_ADDED_MINUTES);
  });

  it('thời gian cho phép là 3 s, bằng lúc đội máy tự thực hiện', () => {
    expect(RESTART_GRACE_TICKS).toBe(3 * TICK_RATE);
  });

  it('hiệp ngắn (20 s) vẫn làm tròn đúng', () => {
    const minTicks = regulationTicks(20) / 45;
    expect(addedMinutesFor({ overrunTicks: Math.floor(minTicks), goals: 1 }, 20)).toBe(2);
  });
});

describe("matchClock — đồng hồ 0'–90'", () => {
  const at = (half: 1 | 2, halfTick: number, addedMinutes: number | null = null) =>
    matchClock({ half, halfTick, halfLengthSec: 180, addedMinutes });

  it("hiệp 1 chạy 0' → 44', hết giờ chính thức là 45'", () => {
    expect(at(1, 0)).toEqual({ minute: 0, addedMinute: 0, addedMinutes: null });
    expect(at(1, MIN - 1).minute).toBe(0);
    expect(at(1, MIN).minute).toBe(1);
    expect(at(1, REG - 1).minute).toBe(44);
    expect(at(1, REG, 2)).toEqual({ minute: 45, addedMinute: 0, addedMinutes: 2 });
  });

  it("bù giờ hiện 45'+1', 45'+2'…", () => {
    expect(at(1, REG + 1, 2)).toEqual({ minute: 45, addedMinute: 1, addedMinutes: 2 });
    expect(at(1, REG + MIN + 1, 2).addedMinute).toBe(2);
  });

  it("hiệp 2 chạy 45' → 90', bù giờ 90'+N'", () => {
    expect(at(2, 0).minute).toBe(45);
    expect(at(2, REG - 1).minute).toBe(89);
    expect(at(2, REG + 1, 1)).toEqual({ minute: 90, addedMinute: 1, addedMinutes: 1 });
  });
});

describe('advanceClock', () => {
  const noStop = { overrunTicks: 0, goals: 0 };

  it('trước hết giờ chính thức: chưa công bố bù giờ, chưa hết hiệp', () => {
    expect(advanceClock(REG - 1, 180, noStop, null)).toEqual({
      addedMinutes: null,
      halfOver: false,
    });
  });

  it('không bù giờ → hết hiệp đúng tick cuối giờ chính thức', () => {
    expect(advanceClock(REG, 180, noStop, null)).toEqual({ addedMinutes: 0, halfOver: true });
  });

  it('có bù giờ → công bố ở cuối giờ chính thức, hết hiệp sau đúng số phút bù', () => {
    const stop = { overrunTicks: 0, goals: 1 };
    expect(advanceClock(REG, 180, stop, null)).toEqual({ addedMinutes: 1, halfOver: false });
    expect(advanceClock(REG + MIN - 1, 180, stop, 1).halfOver).toBe(false);
    expect(advanceClock(REG + MIN, 180, stop, 1).halfOver).toBe(true);
  });

  it('bù giờ đã công bố thì không đổi dù bóng chết thêm', () => {
    const later = { overrunTicks: 10 * MIN, goals: 3 };
    expect(advanceClock(REG + 5, 180, later, 1).addedMinutes).toBe(1);
  });
});
