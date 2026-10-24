import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CardsResponse } from '@pitch/shared';
import { seedCards } from '../db/seed';
import { createTestApp, resetTestData, testDb } from '../../test/helpers';

describe('GET /api/v1/cards', () => {
  const { app } = createTestApp();

  beforeAll(async () => {
    await resetTestData(testDb());
    await seedCards(testDb());
    await app.ready();
  });
  afterAll(async () => {
    await app.close();
  });

  it('trả toàn bộ danh mục đúng contract, có ETag', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/cards' });
    expect(res.statusCode).toBe(200);
    const body = CardsResponse.parse(res.json());
    expect(body.data).toHaveLength(150);
    expect(body.data[0]).toMatchObject({ id: '1', code: 'GK-0001', rarity: 'bronze' });
    expect(res.headers.etag).toMatch(/^".+"$/);
  });

  it('If-None-Match khớp → 304 không body', async () => {
    const first = await app.inject({ method: 'GET', url: '/api/v1/cards' });
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/cards',
      headers: { 'if-none-match': first.headers.etag as string },
    });
    expect(res.statusCode).toBe(304);
    expect(res.body).toBe('');
  });

  it('danh mục chia theo độ hiếm để bốc thẻ', async () => {
    const { byRarity, byId } = await app.cardCatalog();
    expect(byRarity.bronze).toHaveLength(60);
    expect(byRarity.legend).toHaveLength(15);
    expect(byRarity.legend.every((c) => c.rarity === 'legend')).toBe(true);
    expect(byId.get('150')?.rarity).toBe('legend');
  });
});
