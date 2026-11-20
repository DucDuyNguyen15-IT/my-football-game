import { substitute } from '../rules/substitution';
import { createMatch, step } from '../match';
import { decodeInput, InputRecorder } from '../replay';
import { nextInt, seedRng } from '../rng';
import { NO_INPUT, type MatchSetup, type MatchState, type PlayerInput } from '../types';

/**
 * Input kịch bản cho test (sim, server, e2e): mỗi 5–40 tick đổi sang một hướng/nút ngẫu nhiên (theo
 * `inputSeed`), cộng một lượt thay người ở `subAtTick` nếu có. Đá tới hết trận, trả log + state cuối.
 */
export function playScriptedMatch(
  setup: MatchSetup,
  inputSeed = 1,
  opts: { subAtTick?: number; maxTicks?: number; onStep?: (s: MatchState) => void } = {},
): { log: string; final: MatchState } {
  const rec = new InputRecorder();
  let s = createMatch(setup);
  let rng = seedRng(inputSeed);
  let input: PlayerInput = NO_INPUT;
  let hold = 0;
  const maxTicks = opts.maxTicks ?? 60 * 60 * 40;
  while (s.phase !== 'full_time' && s.tick < maxTicks) {
    if (
      opts.subAtTick !== undefined &&
      s.tick >= opts.subAtTick &&
      s.ballDead &&
      s.subsUsed.home === 0 &&
      s.bench.home[0]
    ) {
      const out = s.players.find((p) => p.team === 'home' && p.position !== 'GK');
      const r = substitute(s, 'home', out?.id ?? '', s.bench.home[0].slot);
      if (r.ok) {
        rec.sub(s.tick, out!.id, s.bench.home[0].slot);
        s = r.state;
      }
    }
    if (hold-- <= 0) {
      let v: number;
      [v, rng] = nextInt(rng, 0, 9 * 512 - 1);
      // Hầu hết đoạn không bấm nút để trận có bóng chạy; mã ngẫu nhiên đủ phủ mọi nút.
      input = decodeInput(v % 3 === 0 ? v : v % 9);
      [hold, rng] = nextInt(rng, 5, 40);
    }
    rec.tick(input);
    s = step(s, input);
    opts.onStep?.(s);
  }
  return { log: rec.encode(), final: s };
}
