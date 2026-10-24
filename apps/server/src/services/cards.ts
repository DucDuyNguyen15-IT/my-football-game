import { createHash } from 'node:crypto';
import { asc } from 'drizzle-orm';
import { Rarity, type Card } from '@pitch/shared';
import type { Db } from '../db/client';
import { cards } from '../db/schema';

/** Danh mục thẻ (chỉ đọc lúc chạy) nạp một lần khi khởi động. */
export interface CardCatalog {
  all: readonly Card[];
  byId: ReadonlyMap<string, Card>;
  /** Để bốc đều một mẫu trong độ hiếm (gacha, task 6.4–6.5). */
  byRarity: Readonly<Record<Rarity, readonly Card[]>>;
  /** ETag mạnh của `GET /cards`, đổi khi danh mục đổi. */
  etag: string;
}

export function toCard(row: typeof cards.$inferSelect): Card {
  const { id, code, name, nickname, position, rarity, ovr, avatarSeed, ...stats } = row;
  return { id: String(id), code, name, nickname, position, rarity, stats, ovr, avatarSeed };
}

export function buildCatalog(all: Card[]): CardCatalog {
  const byRarity = Object.fromEntries(
    Rarity.options.map((r) => [r, all.filter((c) => c.rarity === r)]),
  ) as Record<Rarity, Card[]>;
  const hash = createHash('sha256').update(JSON.stringify(all)).digest('base64url');
  return {
    all,
    byId: new Map(all.map((c) => [c.id, c])),
    byRarity,
    etag: `"${hash.slice(0, 27)}"`,
  };
}

export async function loadCardCatalog(db: Db): Promise<CardCatalog> {
  const rows = await db.select().from(cards).orderBy(asc(cards.id));
  return buildCatalog(rows.map(toCard));
}
