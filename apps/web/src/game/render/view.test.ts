import { describe, expect, it } from 'vitest';
import { MAX_CHARGE_TICKS, PASS_FULL_CHARGE_TICKS, TICK_RATE } from '@pitch/sim';
import {
  COUNTDOWN_ARC_STEPS,
  COUNTDOWN_VISIBLE_SEC,
  SNAP_DISTANCE,
  chargeMeter,
  countdownArcStep,
  countdownRing,
  lerpPos,
  shirtNumber,
} from './view';

describe('lerpPos', () => {
  it('nội suy tuyến tính giữa tick trước và tick hiện tại', () => {
    const prev = { x: 0, y: 0 };
    const curr = { x: 0.2, y: -0.1 };
    expect(lerpPos(prev, curr, 0)).toEqual(prev);
    expect(lerpPos(prev, curr, 1)).toEqual(curr);
    const mid = lerpPos(prev, curr, 0.5);
    expect(mid.x).toBeCloseTo(0.1);
    expect(mid.y).toBeCloseTo(-0.05);
  });

  it('dịch chuyển tức thời (xa hơn SNAP_DISTANCE) thì vẽ thẳng vị trí mới', () => {
    const curr = { x: SNAP_DISTANCE + 1, y: 0 };
    expect(lerpPos({ x: 0, y: 0 }, curr, 0.1)).toBe(curr);
  });
});

describe('shirtNumber', () => {
  it('GK = 1, P1–P6 = 2–7, B1–B5 = 8–12', () => {
    expect(shirtNumber('GK')).toBe(1);
    expect(shirtNumber('P1')).toBe(2);
    expect(shirtNumber('P6')).toBe(7);
    expect(shirtNumber('B1')).toBe(8);
    expect(shirtNumber('B5')).toBe(12);
  });
});

describe('chargeMeter', () => {
  const none = { shotChargeTicks: 0, passCharge: null };

  it('không nạp lực thì không có thanh', () => {
    expect(chargeMeter(none)).toBeNull();
  });

  it('giữ D: thanh sút đầy dần tới MAX_CHARGE_TICKS', () => {
    expect(chargeMeter({ ...none, shotChargeTicks: MAX_CHARGE_TICKS / 2 })).toEqual({
      kind: 'shot',
      fill: 0.5,
    });
    expect(chargeMeter({ ...none, shotChargeTicks: MAX_CHARGE_TICKS * 2 })?.fill).toBe(1);
  });

  it('giữ S/A: thanh chuyền theo số tick đã giữ', () => {
    const passCharge = {
      kind: 'lob' as const,
      ticks: PASS_FULL_CHARGE_TICKS / 4,
      dir: { x: 1, y: 0 },
      through: false,
    };
    expect(chargeMeter({ ...none, passCharge })).toEqual({ kind: 'lob', fill: 0.25 });
  });

  it('giữ W / Q+W: thanh chọc khe (màu riêng), cùng nhịp đầy như chuyền', () => {
    const passCharge = {
      kind: 'ground' as const,
      ticks: PASS_FULL_CHARGE_TICKS / 2,
      dir: { x: 1, y: 0 },
      through: true,
    };
    expect(chargeMeter({ ...none, passCharge })).toEqual({ kind: 'through', fill: 0.5 });
  });
});

describe('countdownRing', () => {
  const SHOWN = COUNTDOWN_VISIBLE_SEC * TICK_RATE;
  const freeKick = {
    kind: 'free_kick' as const,
    playerId: 'home-P4',
    deadlineTick: 100 + 15 * TICK_RATE,
  };
  const keeper = {
    kind: 'keeper_hold' as const,
    playerId: 'home-GK',
    deadlineTick: 40 + 10 * TICK_RATE,
  };
  const at = (d: typeof freeKick | typeof keeper, left: number) =>
    countdownRing({ actionDeadline: d, tick: d.deadlineTick - left });

  it('không có hạn chót thì không có vòng', () => {
    expect(countdownRing({ actionDeadline: null, tick: 5 })).toBeNull();
  });

  it.each([
    ['đá phạt / luân lưu 15 s', freeKick],
    ['thủ môn ôm bóng 10 s', keeper],
  ] as const)('%s: còn hơn 5 giây thì chưa hiện', (_name, d) => {
    expect(at(d, 10 * TICK_RATE)).toBeNull();
    expect(at(d, SHOWN + 1)).toBeNull();
  });

  it.each([
    ['đá phạt / luân lưu 15 s', freeKick],
    ['thủ môn ôm bóng 10 s', keeper],
  ] as const)('%s: vừa hiện ở 5 giây — số 5, vòng đầy vàng', (_name, d) => {
    expect(at(d, SHOWN)).toEqual({ playerId: d.playerId, seconds: 5, elapsed: 0 });
    expect(countdownArcStep(at(d, SHOWN)!.elapsed)).toBe(0);
  });

  it('số chạy 5 → 1 (làm tròn lên), cung đen tăng đều trong 5 giây cuối', () => {
    expect(at(freeKick, 4 * TICK_RATE + 1)!.seconds).toBe(5);
    expect(at(freeKick, 4 * TICK_RATE)!.seconds).toBe(4);
    expect(at(freeKick, 4 * TICK_RATE)!.elapsed).toBeCloseTo(0.2);
    const half = at(keeper, 2.5 * TICK_RATE)!;
    expect(half.seconds).toBe(3);
    expect(half.elapsed).toBeCloseTo(0.5);
    expect(at(keeper, 1)!.seconds).toBe(1);
    expect(at(keeper, 1)!.elapsed).toBeCloseTo(1 - 1 / SHOWN);
  });

  it('hết hạn (thủ môn đang lấy đà phát bóng hộ): 0 giây, cả vòng đen', () => {
    const ring = countdownRing({ actionDeadline: keeper, tick: keeper.deadlineTick + 20 })!;
    expect(ring).toMatchObject({ seconds: 0, elapsed: 1 });
    expect(countdownArcStep(ring.elapsed)).toBe(COUNTDOWN_ARC_STEPS);
  });

  it('nấc viền: chưa hết giờ thì chưa đủ vòng', () => {
    expect(countdownArcStep(0)).toBe(0);
    expect(countdownArcStep(0.5)).toBe(COUNTDOWN_ARC_STEPS / 2);
    expect(countdownArcStep(0.9999)).toBe(COUNTDOWN_ARC_STEPS - 1);
  });
});
