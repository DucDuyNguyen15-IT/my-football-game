import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { PackBox } from '@pitch/shared';
import { ApiClientError } from '../../api/client';
import { attemptFor, isTransient } from '../../api/packs';
import { BoxMeter, formatOdds, onlyBronzeLeft } from './BoxMeter';
import { openErrorMessage } from './ShopPage';

const box = (left: PackBox['left'], cycle = 1): PackBox => {
  const total = left.bronze + left.silver + left.gold + left.legend;
  const odds = (n: number) => (total ? n / total : 0);
  return {
    left,
    total,
    nextOdds: {
      bronze: odds(left.bronze),
      silver: odds(left.silver),
      gold: odds(left.gold),
      legend: odds(left.legend),
    },
    cycle,
  };
};

describe('<BoxMeter>', () => {
  it('hiện số phiếu còn và tỉ lệ lần bốc kế (1 chữ số thập phân)', () => {
    const html = renderToStaticMarkup(
      <BoxMeter box={box({ bronze: 56, silver: 28, gold: 9, legend: 2 })} />,
    );
    expect(html).toContain('<b>95</b>/100 phiếu');
    expect(html).toContain('58,9%');
    expect(html).toContain('29,5%');
    expect(html).toContain('9,5%');
    expect(html).toContain('2,1%');
    expect(html).not.toContain('chỉ còn thẻ Đồng');
  });

  it('hộp chỉ còn Đồng → cảnh báo gói 5 không bảo đảm', () => {
    const b = box({ bronze: 3, silver: 0, gold: 0, legend: 0 });
    expect(onlyBronzeLeft(b)).toBe(true);
    expect(renderToStaticMarkup(<BoxMeter box={b} />)).toContain('Hộp chỉ còn thẻ Đồng');
    expect(onlyBronzeLeft(box({ bronze: 3, silver: 1, gold: 0, legend: 0 }))).toBe(false);
  });

  it('formatOdds', () => {
    expect(formatOdds(0.58)).toBe('58%');
    expect(formatOdds(2 / 95)).toBe('2,1%');
    expect(formatOdds(0)).toBe('0%');
  });
});

describe('Idempotency-Key khi mở gói', () => {
  let n = 0;
  const gen = () => `key-${++n}`;

  it('lần mua mới → key mới; thử lại cùng gói + cách trả → giữ key', () => {
    const first = attemptFor(null, 'pack5', 'coins', gen);
    expect(attemptFor(first, 'pack5', 'coins', gen).key).toBe(first.key);
    expect(attemptFor(first, 'pack1', 'coins', gen).key).not.toBe(first.key);
    expect(attemptFor(first, 'pack5', 'free_credit', gen).key).not.toBe(first.key);
  });

  it('chỉ lỗi mạng/5xx là tạm thời (giữ key để thử lại)', () => {
    expect(isTransient(new ApiClientError('network_error', 0, 'x'))).toBe(true);
    expect(isTransient(new ApiClientError('internal_error', 500, 'x'))).toBe(true);
    expect(isTransient(new ApiClientError('insufficient_coins', 409, 'x'))).toBe(false);
  });

  it('không đủ xu → thông báo rõ', () => {
    expect(openErrorMessage(new ApiClientError('insufficient_coins', 409, 'x'))).toBe(
      'Không đủ xu để mở gói này.',
    );
  });
});
