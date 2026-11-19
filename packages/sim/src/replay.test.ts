import { describe, expect, it } from 'vitest';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam } from './fixtures/demoTeams';
import { playScriptedMatch } from './fixtures/scriptedMatch';
import { createMatch, step } from './match';
import {
  buildMatchSetup,
  decodeInput,
  decodeLog,
  encodeInput,
  encodeLog,
  MAX_LOG_TICKS,
  replayMatch,
  ReplayLogError,
} from './replay';

const setup = (seed: number, hard = false) =>
  buildMatchSetup({
    seed,
    difficulty: hard ? 'hard' : 'easy',
    home: starterLikeTeam,
    away: hard ? cpuHardTeam : cpuEasyTeam,
  });

describe('mã hoá log', () => {
  it('encode/decode input là song ánh trên mọi mã', () => {
    for (let c = 0; c < 9 * 512; c++) expect(encodeInput(decodeInput(c))).toBe(c);
  });

  it('log khứ hồi, chặn log hỏng/quá dài', () => {
    const log = {
      runs: [
        [5, 0],
        [3, 20],
      ] as [number, number][],
      subs: [{ tick: 4, out: 'P1' as const, bench: 'B1' as const }],
    };
    const { totalTicks, ...back } = decodeLog(encodeLog(log));
    expect(back).toEqual(log);
    expect(totalTicks).toBe(8);
    const good = encodeLog(log);
    expect(() => decodeLog(good.slice(0, -2))).toThrow(ReplayLogError);
    expect(() => decodeLog(good + 'AA')).toThrow(ReplayLogError);
    expect(() => decodeLog('!!!!')).toThrow(ReplayLogError);
    expect(() => decodeLog(encodeLog({ runs: [[MAX_LOG_TICKS + 1, 0]], subs: [] }))).toThrow(
      ReplayLogError,
    );
    expect(() => decodeLog(encodeLog({ runs: [[0, 0]], subs: [] }))).toThrow(ReplayLogError);
    expect(() => decodeLog(encodeLog({ runs: [[1, 9 * 512]], subs: [] }))).toThrow(ReplayLogError);
  });
});

describe('replayMatch', () => {
  it('chạy lại log của chính nó ra đúng tỉ số, có thay người', () => {
    for (const seed of [3, 4]) {
      const s = setup(seed, seed === 4);
      const { log, final } = playScriptedMatch(s, seed, { subAtTick: 3000 });
      expect(final.phase).toBe('full_time');
      expect(final.substitutions).toHaveLength(1);
      const r = replayMatch(s, log);
      expect(r.phase).toBe('full_time');
      expect(r.score).toEqual(final.score);
      expect(r.ticks).toBe(final.tick);
    }
  });

  it('log cụt không tới full_time; log của seed khác thường cho kết quả khác', () => {
    const s = setup(5);
    const { log } = playScriptedMatch(s, 9);
    const cut = replayMatch(s, encodeLog({ runs: [[600, 0]], subs: [] }));
    expect(cut.phase).not.toBe('full_time');
    expect(replayMatch(setup(6), log).ticks).toBeGreaterThan(0);
  });

  it('trận ~24.000 tick đổi input mỗi 4 tick vẫn gọn (< 40.000 ký tự, dưới giới hạn body 64 KiB)', () => {
    const runs = Array.from({ length: 6000 }, (_, i) => [4, (i * 7919) % 4608] as [number, number]);
    expect(encodeLog({ runs, subs: [] }).length).toBeLessThan(40_000);
  });
});

/** Hash trạng thái; đổi khi sim đổi số học → báo hiệu lệch tất định giữa các phiên bản/engine. */
describe('golden hash (tất định số học)', () => {
  it('state sau 3000 tick với input kịch bản không đổi', () => {
    let s = createMatch(setup(42));
    for (let i = 0; i < 3000; i++) {
      s = step(s, decodeInput((Math.imul((i >> 4) + 1, 2654435761) >>> 0) % 4608));
    }
    // FNV-1a 32-bit trên JSON state (không cần mật mã, chỉ cần phát hiện đổi).
    let h = 2166136261;
    for (const ch of JSON.stringify(s)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
    expect(h).toBe(2036198609);
  });
});
