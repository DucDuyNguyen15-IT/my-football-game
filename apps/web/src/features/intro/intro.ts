/**
 * Intro 3D lúc mở game: logic thuần để test trong Node — có chạy intro không, kịch bản theo thời gian
 * (camera, quả bóng, đèn). Phần vẽ nằm ở `game/three/IntroRenderer.ts`.
 *
 * Kịch bản: sân tối, một luồng đèn rọi quả bóng trên chấm phạt đền, camera lượn sát quanh bóng →
 * bốn cột đèn pha bật lần lượt → bóng được sút cong vào góc lưới, lưới rung → camera kéo lên toàn
 * cảnh sân, logo MFG hiện.
 */
import { GOAL_HEIGHT, GOAL_WIDTH, HALF_LENGTH, HALF_WIDTH, PENALTY_SPOT_DIST } from '@pitch/sim';
import type { CameraState, Vec3 } from '../../game/render/camera';

export const INTRO_SEEN_KEY = 'mfg.introSeen';
/** Tổng thời lượng intro (s); hết thì tự vào màn đăng nhập/menu. */
export const INTRO_DURATION_SEC = 7.4;
/** Logo chữ MFG bắt đầu hiện (s). */
export const LOGO_AT_SEC = 5;
/** Màn tĩnh (giảm chuyển động / không có WebGL) tự qua sau chừng này ms. */
export const STATIC_INTRO_MS = 1400;
/** Bóng rời chấm phạt đền / chạm lưới (s). */
export const KICK_SEC = 3.1;
export const NET_HIT_SEC = 3.75;
/** Bóng rơi từ lưới xuống cỏ trong chừng này giây. */
const DROP_SEC = 0.45;
/**
 * Bán kính vẽ bóng — bằng `BALL_DRAW_RADIUS` (`game/three/actors.ts`); không import để `IntroGate`
 * không kéo Three.js vào bundle chính.
 */
export const BALL_R = 0.13;
/** Đèn pha cột thứ i (thứ tự `floodlightSpots()`) bắt đầu bật ở giây này: hai cột sau khung trước. */
const FLOOD_START: readonly number[] = [1.9, 2.45, 2.15, 2.7];
const FLOOD_RAMP_SEC = 0.35;
/** Đèn rọi bóng: sáng lên trong chừng này giây, giảm còn mức nền khi đèn pha đã bật hết. */
const KEY_LIGHT_IN_SEC = 0.6;
const KEY_LIGHT_REST = 0.35;
const KEY_LIGHT_OUT_SEC = 1;

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
/** Vào đoạn với tốc độ như cũ (đạo hàm 1 ở 0), dừng hẳn ở cuối (đạo hàm 0 ở 1). */
const settle = (t: number) => t + t * t - t * t * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const v3 = (x: number, y: number, z: number): Vec3 => ({ x, y, z });
const lerp3 = (a: Vec3, b: Vec3, k: number): Vec3 => ({
  x: a.x + (b.x - a.x) * k,
  y: a.y + (b.y - a.y) * k,
  z: a.z + (b.z - a.z) * k,
});

/** Chấm phạt đền trước khung thành phía +x — nơi đặt bóng. */
export const BALL_SPOT: Vec3 = v3(HALF_LENGTH - PENALTY_SPOT_DIST, BALL_R, 0);
/** Điểm bóng găm vào lưới: góc trên bên phải (nhìn từ chấm phạt đền), sau vạch cuối. */
export const NET_TARGET: Vec3 = v3(HALF_LENGTH + 0.7, GOAL_HEIGHT * 0.72, GOAL_WIDTH * 0.32);
/** Bóng nằm yên trong lưới sau khi rơi. */
const BALL_REST: Vec3 = v3(HALF_LENGTH + 0.9, BALL_R, GOAL_WIDTH * 0.36);
/** Độ vồng và độ cong ngang (m) của đường bóng bay. */
const SHOT_LOFT = 0.9;
const SHOT_CURL = -1.1;

export interface IntroBall {
  pos: Vec3;
  /** Góc xoay của bóng (rad) quanh trục ngang — tăng khi bóng bay. */
  spin: number;
}

/** Quả bóng ở giây `t`: nằm yên → bay cong vào lưới → rơi xuống cỏ trong lưới. */
export function introBall(t: number): IntroBall {
  if (t <= KICK_SEC) return { pos: { ...BALL_SPOT }, spin: 0 };
  if (t <= NET_HIT_SEC) {
    const k = (t - KICK_SEC) / (NET_HIT_SEC - KICK_SEC);
    const pos = lerp3(BALL_SPOT, NET_TARGET, k);
    const arc = 4 * k * (1 - k);
    pos.y += SHOT_LOFT * arc;
    // Cong kiểu "bẻ lòng": lệch ra ngoài giữa đường rồi vào lại đích.
    pos.z += SHOT_CURL * arc;
    return { pos, spin: k * 14 };
  }
  const k = clamp01((t - NET_HIT_SEC) / DROP_SEC);
  return { pos: lerp3(NET_TARGET, BALL_REST, k * k), spin: 14 + easeOut(k) * 2 };
}

interface Key extends CameraState {
  t: number;
}

/** Kết thúc: góc máy truyền hình cao, nhìn toàn sân (logo nằm giữa khung hình). */
export const INTRO_END: CameraState = {
  pos: v3(0, 24, HALF_WIDTH + 30),
  look: v3(0, 0, 0),
};

/**
 * Các mốc camera. Giữa hai mốc nội suy Catmull-Rom (đường cong liền, không khựng ở mỗi mốc), riêng
 * đoạn cuối hãm dần để dừng êm ở `INTRO_END`.
 */
const KEYS: readonly Key[] = [
  // Sát cỏ, sau-trái quả bóng, khung thành mờ phía sau.
  { t: 0, pos: v3(20.4, 0.32, -1.5), look: v3(22.2, 0.16, 0) },
  // Lượn sang ngang bóng.
  { t: 1.4, pos: v3(22.6, 0.4, -1.7), look: v3(22, 0.18, 0) },
  // Vòng ra sau bóng, nhìn về khung thành khi đèn pha bật.
  { t: 2.7, pos: v3(20.3, 0.7, 0.8), look: v3(25, 0.8, 0.2) },
  // Bám theo đường bóng.
  { t: 3.6, pos: v3(25.2, 1.2, 1.1), look: v3(HALF_LENGTH, 1.3, 1.4) },
  // Né sang bên thấy lưới rung.
  { t: 4.5, pos: v3(25.5, 3.5, 8), look: v3(HALF_LENGTH, 1, 0.8) },
  { t: 6.8, ...INTRO_END },
];

function catmull(p0: number, p1: number, p2: number, p3: number, u: number): number {
  const u2 = u * u;
  const u3 = u2 * u;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u3)
  );
}

function spline(a: Vec3, b: Vec3, c: Vec3, d: Vec3, u: number): Vec3 {
  return v3(
    catmull(a.x, b.x, c.x, d.x, u),
    catmull(a.y, b.y, c.y, d.y, u),
    catmull(a.z, b.z, c.z, d.z, u),
  );
}

/** Camera ở giây `t`; sau mốc cuối đứng yên. */
export function introCamera(t: number): CameraState {
  const last = KEYS.length - 1;
  if (t <= 0) return { pos: { ...KEYS[0]!.pos }, look: { ...KEYS[0]!.look } };
  if (t >= KEYS[last]!.t) return { pos: { ...INTRO_END.pos }, look: { ...INTRO_END.look } };
  let i = 0;
  while (KEYS[i + 1]!.t < t) i++;
  const k0 = KEYS[Math.max(0, i - 1)]!;
  const k1 = KEYS[i]!;
  const k2 = KEYS[i + 1]!;
  const k3 = KEYS[Math.min(last, i + 2)]!;
  let u = (t - k1.t) / (k2.t - k1.t);
  if (i + 1 === last) u = settle(u);
  const look = spline(k0.look, k1.look, k2.look, k3.look, u);
  return {
    pos: spline(k0.pos, k1.pos, k2.pos, k3.pos, u),
    // Lúc bóng bay và vừa vào lưới, ánh nhìn kéo về phía quả bóng để bóng không trôi khỏi khung hình.
    look: lerp3(look, introBall(t).pos, BALL_FOLLOW * ballFollow(t)),
  };
}

/** Mức camera bám theo bóng: 0 → 1 ngay sau cú sút, giữ tới lúc bóng nằm trong lưới, rồi nhả dần. */
const BALL_FOLLOW = 0.75;
function ballFollow(t: number): number {
  const on = clamp01((t - KICK_SEC) / 0.2);
  const off = clamp01((t - NET_HIT_SEC - 0.4) / 0.8);
  return easeOut(on) * (1 - easeOut(off));
}

/** Thời điểm camera tới mốc cuối và đứng yên. */
export const CAMERA_SETTLE_SEC = KEYS[KEYS.length - 1]!.t;

/**
 * Độ sáng cột đèn pha thứ `i` (0…1) ở giây `t`. Lúc bật chớp tắt một nhịp như bóng cao áp mồi đèn.
 */
export function floodBank(t: number, i: number): number {
  const start = FLOOD_START[i] ?? FLOOD_START[FLOOD_START.length - 1]!;
  const u = clamp01((t - start) / FLOOD_RAMP_SEC);
  if (u <= 0) return 0;
  if (u >= 1) return 1;
  const flicker = u > 0.25 && u < 0.45 ? 0.25 : 1;
  return easeOut(u) * flicker;
}

/** Độ sáng chung của sân (0…1): trung bình bốn cột đèn — dùng cho đèn môi trường. */
export function floodLevel(t: number): number {
  let sum = 0;
  for (let i = 0; i < FLOOD_START.length; i++) sum += floodBank(t, i);
  return sum / FLOOD_START.length;
}

/**
 * Đèn rọi quả bóng (0…1): sáng dần từ màn tối, dịu xuống khi đèn pha đã sáng, tắt hẳn sau khi bóng
 * vào lưới (không để vệt sáng trên chấm phạt đền trống ở cảnh toàn sân).
 */
export function keyLight(t: number): number {
  const on = easeOut(clamp01(t / KEY_LIGHT_IN_SEC));
  const off = clamp01((t - NET_HIT_SEC) / KEY_LIGHT_OUT_SEC);
  return on * (1 - (1 - KEY_LIGHT_REST) * floodLevel(t)) * (1 - off);
}
