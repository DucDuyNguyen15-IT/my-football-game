/**
 * T006 / SC-003: cùng seed + input → cùng `stateHash` mỗi 60 tick trên Chromium, Firefox, WebKit và Node.
 * `DET_SEEDS` (mặc định 100) = số seed, mỗi seed một trận đầy đủ. Lệch thì báo seed + tick đầu tiên lệch.
 */
import { expect, test } from '@playwright/test';
import { build } from 'esbuild';
import { hashTrace, isTwoHuman } from '../packages/sim/src/fixtures/determinism';

const SEEDS = Number(process.env.DET_SEEDS ?? 100);
const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);

let bundle = '';
const nodeTraces = new Map<number, number[]>();

test.beforeAll(async () => {
  const r = await build({
    stdin: {
      contents: `import { hashTrace } from './packages/sim/src/fixtures/determinism';
        window.hashTrace = hashTrace;`,
      resolveDir: process.cwd(),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    format: 'iife',
    target: 'es2020',
  });
  bundle = r.outputFiles[0]!.text;
  for (const s of seeds) nodeTraces.set(s, hashTrace(s));
});

test(`${SEEDS} seed × trận đầy đủ: hash mỗi 60 tick khớp Node`, async ({ page, browserName }) => {
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ content: bundle });
  let ticks = 0;
  for (const seed of seeds) {
    const got = await page.evaluate(
      (s) => (window as unknown as { hashTrace(s: number): number[] }).hashTrace(s),
      seed,
    );
    const want = nodeTraces.get(seed)!;
    const at = got.findIndex((h, i) => h !== want[i]);
    expect(
      at === -1 && got.length === want.length ? 'khớp' : `lệch ở mốc #${at} (tick ~${at * 60})`,
      `${browserName} seed ${seed}`,
    ).toBe('khớp');
    ticks += want.length * 60;
  }
  console.log(`${browserName}: ${SEEDS} seed (${seeds.filter(isTwoHuman).length} hai người), ~${ticks} tick, không lệch`);
});
