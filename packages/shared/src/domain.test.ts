import { describe, expect, it } from 'vitest';
import { Rarity } from './domain';

describe('Rarity', () => {
  it('có đúng 4 độ hiếm theo thứ tự tăng dần', () => {
    expect(Rarity.options).toEqual(['bronze', 'silver', 'gold', 'legend']);
  });
});
