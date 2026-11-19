// Entry của worker thread: chạy `replayMatch` ngoài event loop chính (ADR-0011). Một lần cho mỗi job.
import { parentPort, workerData } from 'node:worker_threads';
import { replayMatch, ReplayLogError, type MatchSetup, type ReplayResult } from '@pitch/sim';

export type ReplayJob = { setup: MatchSetup; inputLog: string };
export type ReplayReply = { ok: true; result: ReplayResult } | { ok: false; error: string };

const { setup, inputLog } = workerData as ReplayJob;
let reply: ReplayReply;
try {
  reply = { ok: true, result: replayMatch(setup, inputLog) };
} catch (err) {
  // Log hỏng (ReplayLogError) là lỗi của client; lỗi khác (setup hỏng…) cũng coi là không hợp lệ.
  reply = {
    ok: false,
    error: err instanceof ReplayLogError ? err.message : 'Không chạy lại được trận',
  };
}
parentPort!.postMessage(reply);
