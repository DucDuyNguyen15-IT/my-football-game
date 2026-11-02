import { describe, expect, it } from 'vitest';
import { upgradeAttemptFor } from './player-cards';

describe('upgradeAttemptFor — Idempotency-Key khi ép thẻ', () => {
  const keys = () => {
    let n = 0;
    return () => `k${++n}`;
  };

  it('lần đầu sinh key mới', () => {
    expect(upgradeAttemptFor(null, '1', '2', keys())).toEqual({
      playerCardId: '1',
      materialId: '2',
      key: 'k1',
    });
  });

  it('thử lại cùng thẻ + cùng nguyên liệu sau lỗi tạm thời → giữ key cũ', () => {
    const prev = { playerCardId: '1', materialId: '2', key: 'old' };
    expect(upgradeAttemptFor(prev, '1', '2', keys())).toBe(prev);
  });

  it('đổi nguyên liệu hoặc thẻ → key mới', () => {
    const prev = { playerCardId: '1', materialId: '2', key: 'old' };
    expect(upgradeAttemptFor(prev, '1', '3', keys()).key).toBe('k1');
    expect(upgradeAttemptFor(prev, '4', '2', keys()).key).toBe('k1');
  });
});
