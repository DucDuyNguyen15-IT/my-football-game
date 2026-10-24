import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import type { Db } from './client';
import { cards } from './schema';

/** File danh mục thẻ do `scripts/generate-cards.ts` sinh ra (task 6.2). */
export const CARDS_SEED_FILE = fileURLToPath(new URL('./seed/cards.json', import.meta.url));

/**
 * Nạp danh mục thẻ vào `cards` (ghi đè theo `id`, chạy lại nhiều lần được). Trả số thẻ đã nạp;
 * 0 nếu chưa có file seed.
 */
export async function seedCards(db: Db, file = CARDS_SEED_FILE): Promise<number> {
  if (!existsSync(file)) return 0;
  const rows = JSON.parse(readFileSync(file, 'utf8')) as (typeof cards.$inferInsert)[];
  if (rows.length === 0) return 0;
  await db
    .insert(cards)
    .values(rows)
    .onConflictDoUpdate({
      target: cards.id,
      set: Object.fromEntries(
        Object.keys(rows[0]!)
          .filter((k) => k !== 'id')
          .map((k) => {
            const col = cards[k as keyof typeof cards.$inferInsert];
            return [k, sql.raw(`excluded."${col.name}"`)];
          }),
      ),
    });
  return rows.length;
}
