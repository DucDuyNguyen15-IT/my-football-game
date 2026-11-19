// Tương phản WCAG của token màu ở CẢ HAI giao diện (người dùng yêu cầu tối đối lập sáng + tương phản tốt nhất).
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./tokens.css', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/** Lấy các `--tên: #hex` trong khối CSS bắt đầu bằng `selector {`. */
function hexTokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`thiếu khối ${selector}`);
  const body = css.slice(start, css.indexOf('\n}', start));
  return Object.fromEntries(
    [...body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map((m) => [m[1]!, m[2]!.toLowerCase()]),
  );
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
}

const light = hexTokens(':root');
const dark = { ...light, ...hexTokens(":root[data-theme='dark']") };

/** [chữ/viền, nền, tỉ lệ tối thiểu, ghi chú]. 7 = AAA chữ thường; 4.5 = AA; 3 = viền/focus/icon. */
export const PAIRS: [string, string, number, string][] = [
  ['--c-text', '--c-bg', 7, 'chữ chính / nền'],
  ['--c-text', '--c-surface-1', 7, 'chữ chính / bề mặt 1'],
  ['--c-text', '--c-surface-2', 7, 'chữ chính / bề mặt 2'],
  ['--c-text', '--c-surface-3', 7, 'chữ chính / bề mặt 3'],
  ['--c-text-muted', '--c-bg', 7, 'chữ phụ / nền'],
  ['--c-text-muted', '--c-surface-1', 7, 'chữ phụ / bề mặt 1'],
  ['--c-text-muted', '--c-surface-2', 4.5, 'chữ phụ / bề mặt 2 (nút bị khoá)'],
  ['--c-text-faint', '--c-bg', 4.5, 'chữ mờ / nền'],
  ['--c-text-faint', '--c-surface-1', 4.5, 'chữ mờ / bề mặt 1'],
  ['--c-accent-ink', '--c-accent', 4.5, 'chữ nút chính'],
  ['--c-accent-ink', '--c-accent-hover', 4.5, 'chữ nút chính (hover)'],
  ['--c-accent', '--c-bg', 4.5, 'link / tab chọn trên nền'],
  ['--c-accent', '--c-surface-1', 4.5, 'link trên bề mặt 1'],
  ['--c-danger', '--c-surface-1', 4.5, 'nút nguy hiểm / lỗi'],
  ['--c-danger', '--c-bg', 4.5, 'thông báo lỗi trên nền'],
  ['--c-warning', '--c-surface-1', 4.5, 'cảnh báo'],
  ['--c-success', '--c-surface-1', 4.5, 'thành công'],
  ['--c-info', '--c-surface-1', 4.5, 'thông tin'],
  ['--c-coin', '--c-bg', 4.5, 'số xu trên nền'],
  ['--c-coin', '--c-surface-1', 4.5, 'số xu trên bề mặt 1'],
  ['--c-accent-ink', '--c-coin', 4.5, 'chữ nút mua bằng xu'],
  ['--c-line-control', '--c-bg', 3, 'viền ô nhập / nút phụ'],
  ['--c-line-control', '--c-surface-1', 3, 'viền ô nhập trên bề mặt 1'],
  ['--c-line-strong', '--c-surface-2', 1.5, 'viền nút bị khoá (trang trí)'],
  ['--c-focus', '--c-bg', 3, 'vòng focus / nền'],
  ['--c-focus', '--c-surface-1', 3, 'vòng focus / bề mặt 1'],
];

describe('tương phản token màu', () => {
  it('khối prefers-color-scheme: dark giống hệt khối [data-theme=dark] (không lệch nhau)', () => {
    const media = css.slice(css.indexOf('@media (prefers-color-scheme: dark)'));
    const inMedia = Object.fromEntries(
      [...media.slice(0, media.indexOf('\n}')).matchAll(/(--[\w-]+):\s*(#[0-9a-f]{6})\b/gi)].map(
        (m) => [m[1]!, m[2]!.toLowerCase()],
      ),
    );
    expect(inMedia).toEqual(hexTokens(":root[data-theme='dark']"));
  });

  it('giao diện tối là đối lập thật của sáng: nền tối, chữ sáng', () => {
    expect(luminance(light['--c-bg']!)).toBeGreaterThan(0.7);
    expect(luminance(dark['--c-bg']!)).toBeLessThan(0.02);
    expect(luminance(dark['--c-text']!)).toBeGreaterThan(0.7);
  });

  for (const [name, tokens] of [
    ['sáng', light],
    ['tối', dark],
  ] as const) {
    it.each(PAIRS)(`${name}: %s trên %s ≥ %s (%s)`, (fg, bg, min) => {
      expect(contrast(tokens[fg]!, tokens[bg]!)).toBeGreaterThanOrEqual(min);
    });
  }
});
