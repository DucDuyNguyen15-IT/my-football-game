import { describe, expect, it } from 'vitest';
import { buildMatchSetup, cpuEasyTeam, starterLikeTeam } from '@pitch/sim';
import { MAX_CONCURRENT_REPLAYS, runReplayInWorker } from './replay';

describe('runReplayInWorker', () => {
  it('vượt trần worker chạy cùng lúc → từ chối ngay (failed), không mở thêm worker', async () => {
    const setup = buildMatchSetup({
      seed: 1,
      difficulty: 'easy',
      home: starterLikeTeam,
      away: cpuEasyTeam,
    });
    const all = await Promise.all(
      Array.from({ length: MAX_CONCURRENT_REPLAYS + 1 }, () => runReplayInWorker(setup, '!')),
    );
    const busy = all.filter((o) => !o.ok && o.reason === 'failed');
    expect(busy).toHaveLength(1);
    // Các job còn lại vẫn chạy và báo log hỏng như thường; trần được trả lại sau khi xong.
    expect(all.filter((o) => !o.ok && o.reason === 'invalid_log')).toHaveLength(
      MAX_CONCURRENT_REPLAYS,
    );
    expect(await runReplayInWorker(setup, '!')).toMatchObject({ reason: 'invalid_log' });
  }, 60_000);
});
