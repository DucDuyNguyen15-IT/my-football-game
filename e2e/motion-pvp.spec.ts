import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import {
  analyzeMotion,
  clipWindows,
  compareMotion,
  DEFAULT_THRESHOLDS,
  type MotionIssue,
  type MotionLog,
} from '../apps/web/src/game/render/motionLog';

/**
 * Soi chuyển động bản PvP (review C5): hai context (nhà + khách) đá trận giao hữu qua phòng, mỗi trang
 * `?motion=1`, quay video riêng. Lựa chọn người chơi: cả hai bên AUTOPILOT do server bật (trận dev
 * `half=10` + autopilot, xem env `REPLAY_TEST_*` ở config motion) — nên người chơi không bấm phím.
 * Mỗi bên có report riêng ở `motion-out/<stamp>/home|away/`; `report.md` gốc có mục so sánh hai bên.
 * `pnpm motion:pvp`. Biến môi trường: MOTION_GFX, MOTION_THRESHOLDS, MOTION_MAX_CLIPS (như `motion.spec.ts`).
 */
const GFX = process.env.MOTION_GFX ?? 'high';
const MAX_CLIPS = Number(process.env.MOTION_MAX_CLIPS ?? 20);
const TH = { ...DEFAULT_THRESHOLDS, ...JSON.parse(process.env.MOTION_THRESHOLDS ?? '{}') };
const VIEW = { width: 1280, height: 720 };
const PASSWORD = 'motion-mat-khau-123';

const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const OUT = resolve(process.env.MOTION_OUT ?? join('motion-out', stamp));

const KIND_VI: Record<MotionIssue['kind'], string> = {
  teleport: 'nhảy cóc',
  zigzag: 'đổi hướng qua lại',
  spin: 'xoay qua lại',
  clip_flicker: 'animation nhấp nháy',
  camera_shake: 'camera rung',
  hitch: 'khựng khung',
};
const sec = (ms: number) => (ms / 1000).toFixed(1);

async function setup(browser: import('@playwright/test').Browser, side: 'home' | 'away') {
  const dir = join(OUT, side);
  mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: VIEW,
    locale: 'vi-VN',
    recordVideo: { dir, size: VIEW },
  });
  const videoStart = Date.now();
  const page = await ctx.newPage();
  await page.addInitScript((gfx) => {
    window.sessionStorage.setItem('mfg.introSeen', '1');
    window.localStorage.setItem(
      'pitch.gfx',
      JSON.stringify({ preset: gfx, overrides: { replay: false } }),
    );
  }, GFX);
  const errors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto('/login');
  const origin = new URL(page.url()).origin;
  const username = `mp${side[0]}_${Date.now().toString(36).slice(-6)}_${Math.floor(Math.random() * 1000)}`;
  const reg = await page.request.post('/api/v1/auth/register', {
    headers: { origin },
    data: { username, password: PASSWORD, acceptTerms: true },
  });
  expect(reg.status()).toBe(201);
  return { ctx, page, dir, videoStart, errors };
}
type Side = Awaited<ReturnType<typeof setup>>;

async function analyzeSide(s: Side, log: MotionLog, video: string | undefined, label: string) {
  const issues = analyzeMotion(log, TH);
  const windows = clipWindows(issues);
  const toVideo = (t: number) => Math.max(0, (t - s.videoStart) / 1000);
  const clips: string[] = [];
  const ranked = windows
    .map((w, i) => ({ ...w, i }))
    .sort((a, b) => b.issues.length - a.issues.length)
    .slice(0, MAX_CLIPS);
  if (video) {
    for (const w of ranked) {
      const name = `clip-${String(w.i + 1).padStart(2, '0')}-${sec(w.from - s.videoStart)}s.mp4`;
      try {
        execFileSync('ffmpeg', [
          '-loglevel',
          'error',
          '-y',
          '-ss',
          toVideo(w.from).toFixed(2),
          '-to',
          toVideo(w.to).toFixed(2),
          '-i',
          video,
          '-c:v',
          'libx264',
          '-preset',
          'veryfast',
          '-crf',
          '26',
          '-an',
          join(s.dir, name),
        ]);
        clips[w.i] = name;
      } catch (e) {
        s.errors.push(`ffmpeg lỗi (${name}): ${String(e)}`);
      }
    }
  }
  const ms = log.frames
    .map((f) => f.ms)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const pct = (p: number) => ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] ?? 0;
  const byKind = new Map<string, number>();
  for (const i of issues) byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);
  const lines = [
    `# Soi chuyển động PvP (${label}) — ${stamp}`,
    '',
    `${log.frames.length} khung · FPS TB ${(1000 / (ms.reduce((a, b) => a + b, 0) / ms.length)).toFixed(1)} · khung p50 ${pct(0.5).toFixed(1)} ms / p95 ${pct(0.95).toFixed(1)} ms / max ${pct(1).toFixed(0)} ms.`,
    `Video gốc: \`${video ?? '(không có)'}\` · log: \`log.json\` · ngưỡng: \`${JSON.stringify(TH)}\``,
    '',
    '| Loại | Số đoạn |',
    '|---|---|',
    ...[...byKind].map(([k, n]) => `| ${KIND_VI[k as MotionIssue['kind']]} (\`${k}\`) | ${n} |`),
    '',
    '## Đoạn nghi (giây tính theo video)',
    '',
    ...windows.flatMap((w, i) => [
      `### ${i + 1}. ${sec(w.from - s.videoStart)}–${sec(w.to - s.videoStart)} s · tick ${w.issues[0]!.tick} · ${w.issues[0]!.phase}${clips[i] ? ` · [${clips[i]}](${clips[i]})` : ''}`,
      ...w.issues.map((x) => `- ${KIND_VI[x.kind]} · \`${x.who}\` · ${x.detail}`),
      '',
    ]),
    s.errors.length ? '## Lỗi console\n\n' + s.errors.map((e) => `- ${e}`).join('\n') : '',
  ];
  writeFileSync(join(s.dir, 'report.md'), lines.join('\n'));
  return { issues: issues.length, windows: windows.length, frames: log.frames.length, byKind };
}

const waitFullTime = (page: Page) =>
  page.waitForFunction(
    () => {
      const f = (window as Window & { __motionLog?: MotionLog }).__motionLog?.frames;
      return f?.[f.length - 1]?.phase === 'full_time';
    },
    undefined,
    { timeout: 300_000, polling: 1000 },
  );

test('soi chuyển động PvP: hai bên đá autopilot → log + báo cáo + so sánh', async ({ browser }) => {
  test.setTimeout(900_000);
  mkdirSync(OUT, { recursive: true });
  const home = await setup(browser, 'home');
  const away = await setup(browser, 'away');
  try {
    await Promise.all([home.page.goto('/pvp?motion=1'), away.page.goto('/pvp?motion=1')]);
    await expect(home.page.getByRole('button', { name: 'Tạo phòng' })).toBeEnabled({
      timeout: 15_000,
    });
    await expect(away.page.getByRole('button', { name: 'Tạo phòng' })).toBeEnabled({
      timeout: 15_000,
    });
    await home.page.getByRole('button', { name: 'Tạo phòng' }).click();
    const code = (await home.page.getByTestId('pvp-room-code').innerText()).trim();
    await away.page.getByLabel('Nhập mã phòng').fill(code);
    await away.page.getByRole('button', { name: 'Vào phòng' }).click();

    await Promise.all([
      expect(home.page.locator('.hud-score')).toBeVisible({ timeout: 30_000 }),
      expect(away.page.locator('.hud-score')).toBeVisible({ timeout: 30_000 }),
    ]);
    await Promise.all([waitFullTime(home.page), waitFullTime(away.page)]);
    await home.page.waitForTimeout(1500);

    const logs: MotionLog[] = [];
    const videos: (string | undefined)[] = [];
    for (const s of [home, away]) {
      const log = (await s.page.evaluate(
        () => (window as Window & { __motionLog?: MotionLog }).__motionLog,
      )) as MotionLog | undefined;
      expect(log?.frames.length, 'log rỗng — trang có ?motion=1 chưa?').toBeGreaterThan(0);
      writeFileSync(join(s.dir, 'log.json'), JSON.stringify(log));
      logs.push(log!);
      videos.push(await s.page.video()?.path());
    }
    await Promise.all([home.ctx.close(), away.ctx.close()]);

    const rh = await analyzeSide(home, logs[0]!, videos[0], 'đội nhà');
    const ra = await analyzeSide(away, logs[1]!, videos[1], 'đội khách');
    const cmp = compareMotion(logs[0]!, logs[1]!);
    const row = (n: string, r: typeof rh) =>
      `| ${n} | ${r.frames} | ${r.issues} | ${r.windows} | ${[...r.byKind].map(([k, c]) => `${k} ${c}`).join(', ') || '—'} |`;
    writeFileSync(
      join(OUT, 'report.md'),
      [
        `# Soi chuyển động PvP — ${stamp}`,
        '',
        `Trận giao hữu PvP, cả hai bên autopilot (server dev half=10), đồ hoạ ${GFX}, ${VIEW.width}×${VIEW.height}.`,
        'Chi tiết từng bên: `home/report.md`, `away/report.md`.',
        '',
        '| Bên | Khung | Phát hiện | Đoạn | Theo loại |',
        '|---|---|---|---|---|',
        row('nhà', rh),
        row('khách', ra),
        '',
        '## So sánh hai bên',
        '',
        `- Tick có ở cả hai log: ${cmp.ticks}`,
        `- Vị trí cầu thủ cùng tick (khung cuối mỗi tick): lệch p95 ${cmp.pos.p95.toFixed(2)} m, max ${cmp.pos.max.toFixed(2)} m, ${cmp.pos.over} mẫu vượt ngưỡng 0.6 m (tệ nhất: ${cmp.pos.worst}) → ${cmp.pos.over === 0 ? 'TRÙNG' : 'LỆCH'}`,
        `- Camera khách = lật camera nhà: trung điểm x,z hai camera cách bóng p95 ${cmp.cam.midToBallP95.toFixed(1)} m, lệch độ cao max ${cmp.cam.yDiffMax.toFixed(2)} m → ${cmp.cam.flipOk ? 'LẬT ĐÚNG' : 'KHÔNG KHỚP'}`,
        '',
      ].join('\n'),
    );
    console.info(
      `[motion-pvp] nhà ${rh.frames} khung/${rh.issues} phát hiện, khách ${ra.frames} khung/${ra.issues}; vị trí over=${cmp.pos.over} max=${cmp.pos.max.toFixed(2)}; cam flipOk=${cmp.cam.flipOk} (midToBall p95 ${cmp.cam.midToBallP95.toFixed(1)}, yDiff ${cmp.cam.yDiffMax.toFixed(2)}) → ${join(OUT, 'report.md')}`,
    );
  } finally {
    await Promise.all([home.ctx.close().catch(() => {}), away.ctx.close().catch(() => {})]);
  }
});
