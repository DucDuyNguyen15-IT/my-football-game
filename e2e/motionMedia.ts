import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

/** Phần ffmpeg dùng chung cho các spec soi chuyển động (đơn người, PvP): cắt clip + ảnh ghép. */

const FONT = 'C\\:/Windows/Fonts/arial.ttf';
const hasFont = existsSync('C:/Windows/Fonts/arial.ttf');

/** `MOTION_SHEETS=0` tắt ảnh ghép. */
export const sheetsEnabled = (): boolean => process.env.MOTION_SHEETS !== '0';

export interface ClipResult {
  clip: string;
  /** Tên file ảnh ghép (nếu có). */
  sheet?: string;
  /** Ô có nhãn thời gian video không (không thì đọc theo thứ tự trái→phải, trên→dưới). */
  labelled?: boolean;
}

/**
 * Cắt `video` từ giây `from` đến `to` thành `<base>.mp4` trong `outDir`, rồi (nếu bật) ghép khung
 * hình lấy mẫu ~7 khung/giây thành lưới 4 cột `<base>.png`. Ném lỗi nếu ffmpeg lỗi.
 */
export function cutClip(
  video: string,
  outDir: string,
  base: string,
  from: number,
  to: number,
): ClipResult {
  const clipName = `${base}.mp4`;
  const clipPath = join(outDir, clipName);
  const ff = (args: string[]) => execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...args]);
  ff([
    '-ss',
    from.toFixed(2),
    '-to',
    to.toFixed(2),
    '-i',
    video,
    '-c:v',
    'libx264',
    '-preset',
    'veryfast',
    '-crf',
    '26',
    '-an',
    clipPath,
  ]);
  if (!sheetsEnabled()) return { clip: clipName };

  const dur = Math.max(0.3, to - from);
  const n = Math.min(24, Math.max(4, Math.round(dur * 7)));
  const rows = Math.ceil(n / 4);
  const label = hasFont
    ? `,drawtext=fontfile='${FONT}':text='%{pts\\:flt\\:${from.toFixed(2)}}s':x=8:y=8:fontsize=28:fontcolor=yellow:box=1:boxcolor=black@0.6`
    : '';
  const sheetName = `${base}.png`;
  ff([
    '-i',
    clipPath,
    '-vf',
    `fps=${(n / dur).toFixed(3)},scale=480:-2${label},tile=4x${rows}`,
    '-frames:v',
    '1',
    join(outDir, sheetName),
  ]);
  return { clip: clipName, sheet: sheetName, labelled: hasFont };
}
