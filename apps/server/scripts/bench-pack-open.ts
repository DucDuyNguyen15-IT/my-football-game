// pnpm --filter @pitch/server bench:packs — đo độ trễ `POST /api/v1/packs/:code/open` dưới tải nhẹ
// (task 8.3): autocannon, mặc định 20 kết nối × 15 giây, mỗi kết nối là một người chơi riêng, mỗi
// request một Idempotency-Key mới.
//
// Tự dựng server trong tiến trình này (cổng BENCH_PORT, mặc định 3102) với **rate limit tắt** và route
// dev bật để cấp xu qua `POST /dev/grant-coins` (có ghi sổ cái). Ghi rất nhiều dữ liệu → chỉ chạy trên
// DB tên chứa "perf":
//   DATABASE_URL=postgres://pitch:pitch@localhost:5432/pitch_perf_b pnpm --filter @pitch/server bench:packs
// Không nằm trong `pnpm check`.
import { randomBytes, randomUUID } from 'node:crypto';
import autocannon from 'autocannon';
import { buildApp } from '../src/app';
import { PACKS, type PackCode } from '../src/config/economy';
import { createDb } from '../src/db/client';
import { runMigrations } from '../src/db/migrate';
import { seedCards } from '../src/db/seed';
import { findLedgerMismatches } from '../src/services/ledger';
import { perfDatabaseUrl, percentile } from './bench-util';

const PORT = Number(process.env.BENCH_PORT ?? 3102);
const CONNECTIONS = Number(process.env.BENCH_CONNECTIONS ?? 20);
const DURATION_SEC = Number(process.env.BENCH_DURATION_SEC ?? 15);
const PACK = (process.env.BENCH_PACK ?? 'pack1') as PackCode;
if (!Object.hasOwn(PACKS, PACK)) throw new Error(`Không có gói ${PACK}`);
/** Mỗi lần cấp tối đa 1.000.000 xu (GrantCoinsRequest); cấp nhiều lần để không hết xu giữa chừng. */
const GRANT_AMOUNT = 1_000_000;
const GRANTS_PER_USER = Number(process.env.BENCH_GRANTS ?? 5);

const url = perfDatabaseUrl();
await runMigrations(url);
{
  const { db, pool } = createDb(url);
  await seedCards(db);
  await pool.end();
}

const app = buildApp({
  databaseUrl: url,
  logger: false,
  rateLimit: false,
  enableDevRoutes: true,
  secureCookies: false,
});
await app.listen({ port: PORT, host: '127.0.0.1' });
const base = `http://127.0.0.1:${PORT}`;

async function post(path: string, body: unknown, cookie?: string): Promise<Response> {
  const res = await fetch(`${base}/api/v1${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(cookie && { cookie }) },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${path} → ${res.status} ${await res.text()}`);
  return res;
}

/** Đăng ký một người chơi mới, cấp xu qua route dev, trả về cookie phiên. */
async function createPlayer(i: number, runId: string): Promise<string> {
  const res = await post('/auth/register', {
    username: `bench_${runId}_${i}`,
    password: `bench-${randomBytes(9).toString('hex')}`,
  });
  const cookie = res.headers.getSetCookie()[0]?.split(';')[0];
  if (!cookie) throw new Error('Đăng ký không trả cookie phiên');
  for (let g = 0; g < GRANTS_PER_USER; g++) {
    await post('/dev/grant-coins', { amount: GRANT_AMOUNT }, cookie);
  }
  return cookie;
}

try {
  const runId = randomBytes(3).toString('hex');
  const cookies: string[] = [];
  for (let i = 0; i < CONNECTIONS; i++) cookies.push(await createPlayer(i, runId));

  const latencies: number[] = [];
  const statuses = new Map<number, number>();
  let nextClient = 0;
  const body = JSON.stringify({ payment: 'coins' });

  const result = await autocannon({
    url: base,
    connections: CONNECTIONS,
    duration: DURATION_SEC,
    setupClient: (client) => {
      const cookie = cookies[nextClient++ % cookies.length]!;
      client.setRequests([
        {
          method: 'POST',
          path: `/api/v1/packs/${PACK}/open`,
          body,
          headers: { 'content-type': 'application/json', cookie },
          setupRequest: (req) => ({
            ...req,
            headers: { ...req.headers, 'idempotency-key': randomUUID() },
          }),
        },
      ]);
      client.on('response', (status, _bytes, responseTime) => {
        latencies.push(responseTime);
        statuses.set(status, (statuses.get(status) ?? 0) + 1);
      });
    },
  });

  const { db, pool } = createDb(url);
  const mismatches = await findLedgerMismatches(db);
  await pool.end();

  const ok = statuses.get(200) ?? 0;
  console.log(`\nPOST /api/v1/packs/${PACK}/open — ${CONNECTIONS} kết nối × ${DURATION_SEC} s`);
  console.table({
    'số request': latencies.length,
    'HTTP 200': ok,
    'không phải 2xx': latencies.length - ok,
    'lỗi kết nối': result.errors,
    timeout: result.timeouts,
    'req/s (TB)': result.requests.average,
    'p50 (ms)': percentile(latencies, 50).toFixed(1),
    'p95 (ms)': percentile(latencies, 95).toFixed(1),
    'p99 (ms)': percentile(latencies, 99).toFixed(1),
    'max (ms)': Math.max(...latencies).toFixed(1),
    'TB (ms)': (latencies.reduce((a, b) => a + b, 0) / latencies.length).toFixed(1),
    'sổ cái lệch': mismatches.length,
  });
  console.log('Mã trạng thái:', Object.fromEntries(statuses));
  if (ok !== latencies.length || mismatches.length > 0) process.exitCode = 1;
} finally {
  await app.close();
}
