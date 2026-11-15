// pnpm --filter @pitch/server ledger:check — đối soát `users.coins` với sổ cái `coin_transactions`
// (PRD §7.4). In các người chơi lệch; exit code 1 nếu có lệch, 0 nếu sạch. Chỉ đọc DB.
import { sql } from 'drizzle-orm';
import { loadEnv } from '../src/config/env';
import { createDb } from '../src/db/client';
import {
  findLedgerChainBreaks,
  findLedgerMismatches,
  findMissionRewardMismatches,
} from '../src/services/ledger';

const { db, pool } = createDb(loadEnv().databaseUrl);
try {
  const [{ n }] = (await db.execute<{ n: string }>(sql`select count(*) as n from users`)).rows as [
    { n: string },
  ];
  const bad = await findLedgerMismatches(db);
  if (bad.length === 0) {
    console.log(`ledger:check OK — ${n} người chơi, 0 lệch.`);
  } else {
    console.error(`ledger:check LỆCH — ${bad.length}/${n} người chơi:`);
    console.table(
      bad.map((m) => ({
        userId: m.userId,
        username: m.username,
        coins: m.coins,
        ledgerSum: m.ledgerSum,
        diff: m.coins - m.ledgerSum,
        lastBalanceAfter: m.lastBalanceAfter,
      })),
    );
    process.exitCode = 1;
  }
  const chain = await findLedgerChainBreaks(db);
  if (chain.length === 0) {
    console.log('ledger:check OK — chuỗi balance_after liên tục.');
  } else {
    console.error(`ledger:check ĐỨT chuỗi balance_after — ${chain.length} người chơi:`);
    console.table(chain);
    process.exitCode = 1;
  }
  const missions = await findMissionRewardMismatches(db);
  if (missions.length === 0) {
    console.log('ledger:check OK — thưởng nhiệm vụ khớp daily_missions.');
  } else {
    console.error(`ledger:check LỆCH thưởng nhiệm vụ — ${missions.length} người chơi:`);
    console.table(missions);
    process.exitCode = 1;
  }
} finally {
  await pool.end();
}
