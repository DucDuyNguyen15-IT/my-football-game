// pnpm --filter @pitch/server cards:generate — sinh lại src/db/seed/cards.json (tất định theo CARD_SEED).
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CARDS_SEED_FILE } from '../src/db/seed';
import { generateCards } from './card-generator';

const rows = generateCards();
mkdirSync(dirname(CARDS_SEED_FILE), { recursive: true });
writeFileSync(CARDS_SEED_FILE, `${JSON.stringify(rows, null, 2)}\n`);
console.log(`Đã ghi ${rows.length} thẻ vào ${CARDS_SEED_FILE}`);
