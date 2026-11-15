import { describe, expect, it } from 'vitest';
import { msUntilNextGmt7Midnight } from './missions';

describe('msUntilNextGmt7Midnight', () => {
  it('23:59 GMT+7 → còn 1 phút', () => {
    expect(msUntilNextGmt7Midnight(Date.parse('2026-11-15T23:59:00+07:00'))).toBe(60_000);
  });
  it('đúng 00:00 GMT+7 → còn trọn 1 ngày', () => {
    expect(msUntilNextGmt7Midnight(Date.parse('2026-11-16T00:00:00+07:00'))).toBe(86_400_000);
  });
  it('16:59 UTC (= 23:59 GMT+7) không lấy theo ngày UTC', () => {
    expect(msUntilNextGmt7Midnight(Date.parse('2026-11-15T16:59:00Z'))).toBe(60_000);
  });
});
