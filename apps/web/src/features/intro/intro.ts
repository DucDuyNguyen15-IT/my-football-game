/**
 * Intro 3D lúc mở game (task 6.6): logic thuần để test trong Node — có chạy intro không, đường bay
 * camera, độ sáng đèn sân theo thời gian. Phần vẽ nằm ở `game/three/IntroRenderer.ts`.
 */
import { HALF_LENGTH, HALF_WIDTH } from '@pitch/sim';
import type { CameraState, Vec3 } from '../../game/render/camera';

export const INTRO_SEEN_KEY = 'mfg.introSeen';
/** Tổng thời lượng intro (s); hết thì tự vào màn đăng nhập/menu. */
export const INTRO_DURATION_SEC = 4.5;
/** Camera bay trong chừng này giây rồi đứng yên. */
export const CAMERA_FLY_SEC = 3.8;
/** Logo chữ MFG bắt đầu hiện (s). */
export const LOGO_AT_SEC = 2.4;
/** Màn tĩnh (giảm chuyển động / không có WebGL) tự qua sau chừng này ms. */
export const STATIC_INTRO_MS = 1400;
/** Đèn sân bật dần trong khoảng [bắt đầu, kết thúc] (s). */
const FLOOD_ON: readonly [number, number] = [0.5, 1.6];

export type IntroMode = 'none' | 'full' | 'static';

/** Chỉ chạy lần đầu mỗi phiên; không chen vào khi mở thẳng trận; giảm chuyển động → bản tĩnh. */
export function introMode(opts: {
  seen: boolean;
  reducedMotion: boolean;
  path: string;
}): IntroMode {
  if (opts.seen || opts.path.startsWith('/play')) return 'none';
  return opts.reducedMotion ? 'static' : 'full';
}

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>;

/** sessionStorage có thể bị chặn (chế độ riêng tư) → coi như chưa xem, không ném lỗi. */
export function readIntroSeen(storage: KeyStore | null): boolean {
  try {
    return storage?.getItem(INTRO_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen(storage: KeyStore | null): void {
  try {
    storage?.setItem(INTRO_SEEN_KEY, '1');
  } catch {
    // Không lưu được thì lần sau xem lại intro — chấp nhận được.
  }
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  z: a.z + (b.z - a.z) * k,
});

/** Bắt đầu: sát cỏ ở góc sân, nhìn về vòng tròn giữa sân. */
export const INTRO_START: CameraState = {
  pos: { x: -HALF_LENGTH + 3, y: 1.6, z: HALF_WIDTH - 2 },
  look: { x: -HALF_LENGTH / 3, y: 1.2, z: 0 },
};
/** Kết thúc: góc máy truyền hình cao, nhìn toàn sân. */
export const INTRO_END: CameraState = {
  pos: { x: 0, y: 24, z: HALF_WIDTH + 30 },
  look: { x: 0, y: 0, z: 0 },
};

/** Camera ở giây `t`: bay lên và lùi ra theo đường cong êm, có vòng nhẹ sang ngang. */
export function introCamera(t: number): CameraState {
  const k = easeInOut(clamp01(t / CAMERA_FLY_SEC));
  const pos = lerp3(INTRO_START.pos, INTRO_END.pos, k);
  // Vòng sang ngang (về 0 ở hai đầu) để có cảm giác bay quanh sân, không đi thẳng.
  pos.x += Math.sin(k * Math.PI) * HALF_LENGTH * 0.35;
  return { pos, look: lerp3(INTRO_START.look, INTRO_END.look, k) };
}

/** Độ sáng đèn pha 0…1 ở giây `t` (tắt → bật dần). */
export function floodLevel(t: number): number {
  return easeInOut(clamp01((t - FLOOD_ON[0]) / (FLOOD_ON[1] - FLOOD_ON[0])));
}
