import { describe, expect, it } from 'vitest';
import {
  FATIGUE_THRESHOLD,
  accelFor,
  controlRadiusFor,
  lobRangeFor,
  passAngleErrFor,
  passPowerErrFor,
  shotAngleErrFor,
  shotHeightErrFor,
  shotSpeedFor,
  turnLossCosFor,
  fatigueFactor,
  runSpeedFor,
  sprintSpeedFor,
  staminaDrainMultFor,
  statScale,
} from './params';

const STATS = [1, 25, 50, 75, 99];

/** Mỗi phần tử lớn hơn hẳn phần tử trước. */
const strictlyIncreasing = (xs: number[]) => xs.every((x, i) => i === 0 || x > xs[i - 1]!);
const strictlyDecreasing = (xs: number[]) => xs.every((x, i) => i === 0 || x < xs[i - 1]!);

describe('statScale — nội suy tuyến tính có kẹp', () => {
  it('chỉ số 1 → min, 99 → max', () => {
    expect(statScale(1, 4, 8)).toBe(4);
    expect(statScale(99, 4, 8)).toBe(8);
  });

  it('kẹp chỉ số ngoài khoảng 1–99', () => {
    expect(statScale(-20, 4, 8)).toBe(4);
    expect(statScale(150, 4, 8)).toBe(8);
  });

  it('NaN coi như chỉ số thấp nhất', () => {
    expect(statScale(Number.NaN, 4, 8)).toBe(4);
  });
});

describe('ánh xạ chỉ số → tham số (đơn điệu)', () => {
  it('Tốc độ cao → chạy nhanh hơn, nước rút nhanh hơn, tăng tốc mạnh hơn', () => {
    expect(strictlyIncreasing(STATS.map(runSpeedFor))).toBe(true);
    expect(strictlyIncreasing(STATS.map(sprintSpeedFor))).toBe(true);
    expect(strictlyIncreasing(STATS.map(accelFor))).toBe(true);
  });

  it('nước rút luôn nhanh hơn chạy thường', () => {
    for (const s of STATS) expect(sprintSpeedFor(s)).toBeGreaterThan(runSpeedFor(s));
  });

  it('Thể lực cao → hệ số hao thấp hơn', () => {
    expect(strictlyDecreasing(STATS.map(staminaDrainMultFor))).toBe(true);
    expect(staminaDrainMultFor(99)).toBeGreaterThan(0);
  });
});

describe('fatigueFactor', () => {
  it('từ ngưỡng 30% trở lên không ảnh hưởng', () => {
    expect(fatigueFactor(100)).toBe(1);
    expect(fatigueFactor(FATIGUE_THRESHOLD)).toBe(1);
  });

  it('dưới 30% giảm dần theo thể lực còn lại', () => {
    const xs = [29, 20, 10, 0].map(fatigueFactor);
    expect(strictlyDecreasing(xs)).toBe(true);
    expect(xs[0]).toBeLessThan(1);
    expect(fatigueFactor(0)).toBeGreaterThan(0);
  });

  it('kẹp thể lực ngoài khoảng 0–100', () => {
    expect(fatigueFactor(-5)).toBe(fatigueFactor(0));
    expect(fatigueFactor(250)).toBe(1);
  });
});

describe('ánh xạ chỉ số → kiểm soát bóng, chuyền, sút (đơn điệu)', () => {
  it('Rê bóng cao → bán kính khống chế lớn hơn, chịu được cú xoay gắt hơn', () => {
    expect(strictlyIncreasing(STATS.map(controlRadiusFor))).toBe(true);
    // Ngưỡng là cos góc giữa hướng chạy và hướng bấm: càng thấp thì góc xoay được càng lớn.
    expect(strictlyDecreasing(STATS.map(turnLossCosFor))).toBe(true);
    for (const s of STATS) {
      expect(turnLossCosFor(s)).toBeLessThanOrEqual(1);
      expect(turnLossCosFor(s)).toBeGreaterThanOrEqual(-1);
    }
  });

  it('Chuyền cao → sai số góc/lực nhỏ hơn, chuyền bổng xa hơn', () => {
    expect(strictlyDecreasing(STATS.map(passAngleErrFor))).toBe(true);
    expect(strictlyDecreasing(STATS.map(passPowerErrFor))).toBe(true);
    expect(strictlyIncreasing(STATS.map(lobRangeFor))).toBe(true);
    expect(passAngleErrFor(99)).toBeGreaterThan(0);
  });

  it('Sút cao → sút mạnh hơn, sai số góc và độ cao nhỏ hơn', () => {
    expect(strictlyIncreasing(STATS.map(shotSpeedFor))).toBe(true);
    expect(strictlyDecreasing(STATS.map(shotAngleErrFor))).toBe(true);
    expect(strictlyDecreasing(STATS.map(shotHeightErrFor))).toBe(true);
    expect(shotAngleErrFor(99)).toBeGreaterThan(0);
  });
});
