import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { expect, test } from '@playwright/test';
import {
  analyzeMotion,
  clipWindows,
  DEFAULT_THRESHOLDS,
  type MotionIssue,
  type MotionLog,
} from '../apps/web/src/game/render/motionLog';
import { cutClip, sheetsEnabled, type ClipResult } from './motionMedia';

/**
 * Soi chuyển động (review C5): đá một trận autopilot có quay video + ghi từng khung (`?motion=1`),
 * phân tích chỗ giật rồi cắt clip ffmpeg quanh từng đoạn nghi. `pnpm motion` — xem skill
 * `.claude/skills/soi-chuyen-dong/SKILL.md`. Không nằm trong `pnpm e2e`.
 *
 * Biến môi trường: MOTION_HALF (giây/hiệp, mặc định 30), MOTION_GFX (low|medium|high, mặc định high),
 * MOTION_REPLAY=0 tắt phát lại bàn thắng, MOTION_THRESHOLDS='{"spinReversals":5}' chỉnh ngưỡng,
 * MOTION_MAX_CLIPS (mặc định 20), MOTION_SHEETS=0 tắt ảnh ghép, MOTION_OUT thư mục ra.
 */
const HALF = Number(process.env.MOTION_HALF ?? 30);
const GFX = process.env.MOTION_GFX ?? 'high';
const REPLAY = process.env.MOTION_REPLAY !== '0';
const MAX_CLIPS = Number(process.env.MOTION_MAX_CLIPS ?? 20);
const TH = { ...DEFAULT_THRESHOLDS, ...JSON.parse(process.env.MOTION_THRESHOLDS ?? '{}') };
const VIEW = { width: 1280, height: 720 };

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

test('soi chuyển động: trận autopilot → log + báo cáo + clip', async ({ browser }) => {
  // Sim chạy theo FPS (khung dài bị kẹp) nên máy chậm thì trận dài hơn giờ thật.
  test.setTimeout((HALF * 2 + 300) * 1000 * 4);
  mkdirSync(OUT, { recursive: true });
  const context = await browser.newContext({
    viewport: VIEW,
    locale: 'vi-VN',
    recordVideo: { dir: OUT, size: VIEW },
  });
  // Video bắt đầu khi tạo trang: mốc để đổi giờ tường của log sang giây trong video.
  const videoStart = Date.now();
  const page = await context.newPage();
  await page.addInitScript(
    ([gfx, replay]) => {
      window.sessionStorage.setItem('mfg.introSeen', '1');
      window.localStorage.setItem(
        'pitch.gfx',
        JSON.stringify({ preset: gfx, overrides: { replay: replay === '1' } }),
      );
    },
    [GFX, REPLAY ? '1' : '0'],
  );
  const consoleErrors: string[] = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
  page.on('pageerror', (e) => consoleErrors.push(String(e)));

  const username = `mo_${Date.now().toString(36)}`;
  const password = 'motion-mat-khau-123';
  await page.goto('/login?mode=register');
  await page.getByLabel('Tên đăng nhập').fill(username);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(password);
  await page.getByLabel('Nhập lại mật khẩu', { exact: true }).fill(password);
  await page.getByRole('checkbox', { name: /Tôi đồng ý/ }).check();
  await page.getByRole('button', { name: 'Tạo tài khoản & nhận quà' }).click();
  await expect(page).toHaveURL(/\/shop/);

  await page.goto(`/play?difficulty=normal&autopilot=1&half=${HALF}&motion=1`);
  // Chờ pha full_time trong log (không chờ màn kết quả: server chỉ chấm trận `half=10`).
  await page.waitForFunction(
    () => {
      const f = (window as Window & { __motionLog?: MotionLog }).__motionLog?.frames;
      return f?.[f.length - 1]?.phase === 'full_time';
    },
    undefined,
    { timeout: 0, polling: 1000 },
  );
  await page.waitForTimeout(1500);

  const log = (await page.evaluate(
    () => (window as Window & { __motionLog?: MotionLog }).__motionLog,
  )) as MotionLog | undefined;
  await context.close();
  const video = await page.video()?.path();
  expect(log?.frames.length, 'log rỗng — trang có ?motion=1 chưa?').toBeGreaterThan(0);
  const frames = log!.frames;
  writeFileSync(join(OUT, 'log.json'), JSON.stringify(log));

  const issues = analyzeMotion(log!, TH);
  const windows = clipWindows(issues);
  const toVideo = (t: number) => Math.max(0, (t - videoStart) / 1000);

  // Clip ffmpeg (ưu tiên đoạn có nhiều phát hiện nhất).
  const clips: ClipResult[] = [];
  const ranked = windows
    .map((w, i) => ({ ...w, i }))
    .sort((a, b) => b.issues.length - a.issues.length)
    .slice(0, MAX_CLIPS);
  if (video) {
    for (const w of ranked) {
      const base = `clip-${String(w.i + 1).padStart(2, '0')}-${sec(w.from - videoStart)}s`;
      try {
        clips[w.i] = cutClip(video, OUT, base, toVideo(w.from), toVideo(w.to));
      } catch (e) {
        consoleErrors.push(`ffmpeg lỗi (${base}): ${String(e)}`);
      }
    }
  }
  /** Vị trí (x,z) các đối tượng lúc bắt đầu đoạn nghi, để tìm trên ảnh. */
  const posAt = (who: string, tick: number): string => {
    const f = frames.find((x) => x.tick >= tick) ?? frames[frames.length - 1]!;
    const p = who === 'ball' ? f.ball : who === 'camera' ? f.cam : f.players[who];
    if (!p) return '';
    return who === 'ball' || who === 'camera'
      ? ` @(${p[0].toFixed(1)}, ${p[2].toFixed(1)})`
      : ` @(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`;
  };

  // Báo cáo.
  const ms = frames
    .map((f) => f.ms)
    .filter((x) => x > 0)
    .sort((a, b) => a - b);
  const pct = (p: number) => ms[Math.min(ms.length - 1, Math.floor(ms.length * p))] ?? 0;
  const byKind = new Map<string, number>();
  const byWho = new Map<string, number>();
  for (const i of issues) {
    byKind.set(i.kind, (byKind.get(i.kind) ?? 0) + 1);
    byWho.set(i.who, (byWho.get(i.who) ?? 0) + 1);
  }
  const lines = [
    `# Soi chuyển động — ${stamp}`,
    '',
    `Trận autopilot ${HALF} s/hiệp, đồ hoạ ${GFX}, phát lại ${REPLAY ? 'bật' : 'tắt'}, ${VIEW.width}×${VIEW.height}.`,
    `${frames.length} khung · FPS TB ${(1000 / (ms.reduce((a, b) => a + b, 0) / ms.length)).toFixed(1)} · khung p50 ${pct(0.5).toFixed(1)} ms / p95 ${pct(0.95).toFixed(1)} ms / max ${pct(1).toFixed(0)} ms.`,
    `Video gốc: \`${video ?? '(không có)'}\` · log: \`log.json\` · ngưỡng: \`${JSON.stringify(TH)}\``,
    '',
    '## Tổng hợp',
    '',
    '| Loại | Số đoạn |',
    '|---|---|',
    ...[...byKind].map(([k, n]) => `| ${KIND_VI[k as MotionIssue['kind']]} (\`${k}\`) | ${n} |`),
    '',
    `Nhiều nhất theo đối tượng: ${
      [...byWho]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([w, n]) => `${w} (${n})`)
        .join(', ') || '—'
    }`,
    '',
    `## Đoạn nghi (giây tính theo video; \`@(x, z)\` = vị trí trên sân lúc bắt đầu đoạn${sheetsEnabled() ? '' : '; ảnh ghép tắt'})`,
    '',
    ...windows.flatMap((w, i) => [
      `### ${i + 1}. ${sec(w.from - videoStart)}–${sec(w.to - videoStart)} s · tick ${w.issues[0]!.tick} · ${w.issues[0]!.phase}${clips[i] ? ` · [${clips[i]!.clip}](${clips[i]!.clip})` : ''}`,
      ...(clips[i]?.sheet
        ? [
            `[ảnh ghép](${clips[i]!.sheet}) — ${clips[i]!.labelled ? 'nhãn vàng = giây trong video' : 'không có nhãn: ô đọc trái→phải, trên→dưới, ~7 khung/giây từ đầu đoạn'}`,
          ]
        : []),
      ...w.issues.map(
        (x) => `- ${KIND_VI[x.kind]} · \`${x.who}\`${posAt(x.who, x.tick)} · ${x.detail}`,
      ),
      '',
    ]),
    consoleErrors.length
      ? '## Lỗi console\n\n' + consoleErrors.map((e) => `- ${e}`).join('\n')
      : '',
  ];
  writeFileSync(join(OUT, 'report.md'), lines.join('\n'));
  console.info(
    `[motion] ${issues.length} phát hiện, ${windows.length} đoạn → ${join(OUT, 'report.md')}`,
  );
});
