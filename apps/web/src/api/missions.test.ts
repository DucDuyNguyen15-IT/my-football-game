import { describe, expect, it } from 'vitest';
import { QueryClient } from '@tanstack/react-query';
import { dismissExpiredClaims, keepUnreadClaims, msUntilNextGmt7Midnight } from './missions';

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

describe('keepUnreadClaims', () => {
  const item = { code: 'win_1', title: 'Thắng 1 trận', day: '2026-11-15', reward: 100 };
  const shown = { items: [item], balance: 600 };
  const empty = { items: [], balance: 600 };
  it('gọi lại trả rỗng → giữ nguyên danh sách đang hiện (cùng tham chiếu)', () => {
    expect(keepUnreadClaims(shown, empty)).toBe(shown);
  });
  it('lần đầu hoặc có thưởng mới → lấy kết quả mới', () => {
    expect(keepUnreadClaims(undefined, empty)).toBe(empty);
    const next = { items: [{ ...item, day: '2026-11-16' }], balance: 700 };
    expect(keepUnreadClaims(shown, next)).toBe(next);
  });
});

describe('dismissExpiredClaims (F4)', () => {
  it('xoá items nhưng giữ nguyên dataUpdatedAt để qua 00:00 vẫn gọi lại', () => {
    const qc = new QueryClient();
    const key = ['missions', 'expired-claim', 'u1'];
    const old = Date.parse('2026-11-15T23:50:00+07:00');
    qc.setQueryData(
      key,
      { items: [{ code: 'win_1', title: 'x', day: '2026-11-15', reward: 100 }], balance: 600 },
      { updatedAt: old },
    );
    dismissExpiredClaims(qc, 'u1');
    expect(qc.getQueryData<{ items: unknown[] }>(key)?.items).toEqual([]);
    expect(qc.getQueryState(key)?.dataUpdatedAt).toBe(old);
  });
});
