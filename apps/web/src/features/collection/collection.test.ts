import { describe, expect, it } from 'vitest';
import type { Card, Rarity } from '@pitch/shared';
import {
  isValuableSale,
  loadSavedFilter,
  matchesQuery,
  newCardIds,
  readFilter,
  saleTotal,
  saveFilter,
  writeFilter,
} from './collection';

const card = (id: string, rarity: Rarity, name = 'Rafinho Duarte'): Card => ({
  id,
  code: `FW-${id}`,
  name,
  nickname: 'Ma tốc độ',
  position: 'FW',
  rarity,
  stats: {
    pace: 80,
    shooting: 80,
    passing: 80,
    dribbling: 80,
    defending: 40,
    stamina: 70,
    reflexes: 10,
    handling: 10,
    positioning: 10,
    kicking: 10,
  },
  ovr: 78,
  avatarSeed: 'a1b2c3d4',
  foot: 'right',
  weakFoot: 3,
});

const catalog = new Map<string, Card>([
  ['1', card('1', 'bronze', 'Nguyễn Đức Anh')],
  ['2', card('2', 'silver')],
  ['3', card('3', 'gold')],
  ['4', card('4', 'legend')],
]);
const prices = { bronze: 10, silver: 25, gold: 80, legend: 300 };

describe('bộ lọc trên URL', () => {
  it('đọc/ghi khứ hồi, bỏ giá trị lạ', () => {
    const f = readFilter(new URLSearchParams('pos=FW&rarity=gold&sort=acquired&q=duc&squad=1'));
    expect(f).toEqual({ position: 'FW', rarity: 'gold', sort: 'acquired', q: 'duc', squad: true });
    expect(readFilter(writeFilter(f))).toEqual(f);
    expect(readFilter(new URLSearchParams('pos=XX&rarity=bad&sort=zzz'))).toEqual({
      position: undefined,
      rarity: undefined,
      sort: '-ovr',
      q: '',
      squad: false,
    });
    expect(writeFilter(readFilter(new URLSearchParams())).toString()).toBe('');
  });

  it('tìm tên không phân biệt dấu', () => {
    expect(matchesQuery(catalog.get('1')!, 'duc anh')).toBe(true);
    expect(matchesQuery(catalog.get('1')!, 'NGUYEN')).toBe(true);
    expect(matchesQuery(catalog.get('1')!, 'tốc')).toBe(true);
    expect(matchesQuery(catalog.get('1')!, 'xyz')).toBe(false);
    expect(matchesQuery(catalog.get('1')!, '  ')).toBe(true);
  });
});

describe('bán thẻ', () => {
  it('tổng giá theo độ hiếm, không phụ thuộc cấp +', () => {
    const sel = [
      { cardId: '1', level: 0 },
      { cardId: '2', level: 3 },
      { cardId: '4', level: 0 },
    ];
    expect(saleTotal(sel, catalog, prices)).toBe(10 + 25 + 300);
  });

  it('cần bấm giữ khi có Vàng+ hoặc thẻ đã +', () => {
    expect(
      isValuableSale(
        [
          { cardId: '1', level: 0 },
          { cardId: '2', level: 0 },
        ],
        catalog,
      ),
    ).toBe(false);
    expect(isValuableSale([{ cardId: '3', level: 0 }], catalog)).toBe(true);
    expect(isValuableSale([{ cardId: '4', level: 0 }], catalog)).toBe(true);
    expect(isValuableSale([{ cardId: '1', level: 1 }], catalog)).toBe(true);
  });
});

describe('nhãn MỚI khi mở gói', () => {
  it('mẫu chưa có trong kho là mới; trùng mẫu trong gói chỉ thẻ đầu là mới', () => {
    const opened = [
      { id: '10', cardId: '1' },
      { id: '11', cardId: '2' },
      { id: '12', cardId: '2' },
      { id: '13', cardId: '3' },
    ];
    expect([...newCardIds(opened, new Set(['1']))]).toEqual(['11', '13']);
  });
});

describe('nhớ bộ lọc trong localStorage (nguyên tắc 20)', () => {
  it('lưu và khôi phục bộ lọc hợp lệ, bỏ qua từ khoá tìm kiếm tạm', () => {
    const map = new Map<string, string>();
    const store = {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
    } as unknown as Storage;

    expect(loadSavedFilter(store)).toBeNull();
    saveFilter(store, { position: 'FW', rarity: 'gold', sort: '-acquired', q: 'duc', squad: true });
    expect(loadSavedFilter(store)).toEqual({
      position: 'FW',
      rarity: 'gold',
      sort: '-acquired',
      squad: true,
    });
  });

  it('localStorage lỗi hoặc JSON hỏng → trả null, không ném lỗi', () => {
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    } as unknown as Storage;
    expect(() => saveFilter(broken, { sort: '-ovr', q: '', squad: false })).not.toThrow();
    expect(loadSavedFilter(broken)).toBeNull();
    expect(loadSavedFilter(null)).toBeNull();

    const corrupt = {
      getItem: () => '{bad-json',
      setItem: () => {},
    } as unknown as Storage;
    expect(loadSavedFilter(corrupt)).toBeNull();

    const weird = {
      getItem: () => JSON.stringify({ position: 'XX', rarity: 'mythic', sort: 'bad', squad: '1' }),
      setItem: () => {},
    } as unknown as Storage;
    expect(loadSavedFilter(weird)).toEqual({
      position: undefined,
      rarity: undefined,
      sort: '-ovr',
      squad: false,
    });
  });
});
