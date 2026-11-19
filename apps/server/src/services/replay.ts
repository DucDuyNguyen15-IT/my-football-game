// Chạy lại trận trong worker thread (SEC-07, ADR-0011): không chặn event loop, có timeout.
import { Worker } from 'node:worker_threads';
import type { MatchSetup, ReplayResult } from '@pitch/sim';
import type { ReplayJob, ReplayReply } from '../replay-worker';

/** Một trận ~24.000 tick chạy ~0,5 s; 5 s là dư rộng cho máy chậm/bận. */
export const REPLAY_TIMEOUT_MS = 5000;

export type ReplayOutcome =
  | { ok: true; result: ReplayResult }
  | { ok: false; reason: 'invalid_log' | 'failed'; message: string };

export type ReplayRunner = (setup: MatchSetup, inputLog: string) => Promise<ReplayOutcome>;

// Bản build (tsup) có `replay-worker.js` cạnh `server.js`; chạy từ nguồn (dev/test) thì nạp .ts bằng tsx.
const fromSource = import.meta.url.endsWith('.ts');
const workerUrl = new URL(
  fromSource ? '../replay-worker.ts' : './replay-worker.js',
  import.meta.url,
);

// Đường tuyệt đối tới tsx của server: `--import tsx` trần tìm theo cwd nên hỏng khi chạy test từ gốc repo.
const tsxLoader = new URL('../../node_modules/tsx/dist/esm/index.mjs', import.meta.url).href;

export const runReplayInWorker: ReplayRunner = (setup, inputLog) =>
  new Promise((resolve) => {
    const worker = new Worker(workerUrl, {
      workerData: { setup, inputLog } satisfies ReplayJob,
      ...(fromSource && { execArgv: ['--import', tsxLoader] }),
    });
    let settled = false;
    const finish = (outcome: ReplayOutcome) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      resolve(outcome);
    };
    const timer = setTimeout(
      () => finish({ ok: false, reason: 'failed', message: 'Chạy lại trận quá thời gian' }),
      REPLAY_TIMEOUT_MS,
    );
    worker.once('message', (m: ReplayReply) =>
      finish(m.ok ? m : { ok: false, reason: 'invalid_log', message: m.error }),
    );
    worker.once('error', (e) =>
      finish({ ok: false, reason: 'failed', message: `Worker lỗi: ${e.message}` }),
    );
  });
