/**
 * Toạ độ & camera truyền hình cho trận 3D (ADR-0009), thuần (không Three.js) để test trong Node.
 * Quy ước thế giới 3D: x = sim x (dọc sân, sang phải màn hình), y = độ cao, z = sim y (hướng về
 * phía người xem). Camera đứng trên khán đài phía +z nhìn chéo xuống, nên mũi tên lên/xuống vẫn là
 * sim −y/+y như bản 2D.
 */
import { HALF_LENGTH, restartAim } from '@pitch/sim';
import type { MatchState, RestartType, TeamSide, Vec2 } from '@pitch/sim';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export function toWorld(p: Vec2, height = 0): Vec3 {
  return { x: p.x, y: height, z: p.y };
}

export interface CameraState {
  /** Vị trí camera. */
  pos: Vec3;
  /** Điểm camera nhìn vào (trên mặt cỏ). */
  look: Vec3;
}

/** Điểm nhìn không chạy quá chừng này (m) về hai đầu sân — vẫn thấy khung thành mà không lộ khoảng trống. */
export const CAMERA_X_LIMIT = HALF_LENGTH - 10;
const CAMERA_HEIGHT = 13;
/** Khoảng cách theo z từ điểm nhìn tới camera. */
const CAMERA_BACK = 26;
/** Điểm nhìn theo bóng sang ngang sân chỉ một phần, giữ cảm giác camera cố định trên khán đài. */
const LOOK_Z_FOLLOW = 0.7;
/** Tốc độ bám (1/s): càng lớn càng sát bóng. */
const FOLLOW_RATE = 3.5;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function cameraFor(look: Vec3): CameraState {
  return { look, pos: { x: look.x, y: CAMERA_HEIGHT, z: look.z + CAMERA_BACK } };
}

export function initialCamera(): CameraState {
  return cameraFor({ x: 0, y: 0, z: 0 });
}

/** Camera một khung hình sau: tiến dần (hàm mũ theo `dt`) tới điểm nhìn mong muốn theo bóng. */
export function followCamera(cam: CameraState, ball: Vec2, dt: number): CameraState {
  const targetX = clamp(ball.x, -CAMERA_X_LIMIT, CAMERA_X_LIMIT);
  const targetZ = ball.y * LOOK_Z_FOLLOW;
  const k = 1 - Math.exp(-FOLLOW_RATE * dt);
  return cameraFor({
    x: cam.look.x + (targetX - cam.look.x) * k,
    y: 0,
    z: cam.look.z + (targetZ - cam.look.z) * k,
  });
}

/** Tình huống cố định dùng góc sau lưng người đá (ném biên, giao bóng giữ góc truyền hình). */
const SET_PIECE_TYPES: ReadonlySet<RestartType> = new Set([
  'free_kick',
  'penalty',
  'corner',
  'goal_kick',
]);
/** Lùi đủ xa và đủ thấp để quả bóng nằm trong khung hình, trên thanh phím HUD (camera 38°). */
const SET_PIECE_BACK = 6.5;
const SET_PIECE_HEIGHT = 1.7;
/** Điểm nhìn phía trước bóng theo hướng ngắm (m), hơi cao để thấy khung thành. */
const SET_PIECE_AHEAD = 20;
const SET_PIECE_LOOK_Y = 1;

/**
 * Hướng ngắm khi nên dùng góc sau lưng: đội người chơi (`home`, như `HUMAN_TEAM` của sim) đang hưởng
 * đá phạt/phạt đền/phạt góc/phát bóng và không tự lái; ngược lại `null` (giữ góc truyền hình).
 */
export function setPieceAim(
  state: Pick<MatchState, 'restart' | 'half' | 'autopilot'>,
  team: TeamSide = 'home',
): { spot: Vec2; aim: Vec2 } | null {
  const r = state.restart;
  if (!r || r.team !== team || state.autopilot || !SET_PIECE_TYPES.has(r.type)) return null;
  return { spot: r.spot, aim: restartAim(r, state.half) };
}

/** Camera sau bóng ngược hướng ngắm, ngang tầm người, nhìn theo hướng ngắm. */
export function setPieceCamera(spot: Vec2, aim: Vec2): CameraState {
  return {
    pos: { x: spot.x - aim.x * SET_PIECE_BACK, y: SET_PIECE_HEIGHT, z: spot.y - aim.y * SET_PIECE_BACK },
    look: {
      x: spot.x + aim.x * SET_PIECE_AHEAD,
      y: SET_PIECE_LOOK_Y,
      z: spot.y + aim.y * SET_PIECE_AHEAD,
    },
  };
}

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
  z: a.z + (b.z - a.z) * t,
});

/**
 * Quay camera 180° quanh trục đứng qua điểm nhìn: đội khách (PvP) nhìn cùng chỗ nhưng từ phía
 * khán đài đối diện, sân nhà của mình ở dưới màn hình.
 */
export function flipCamera(cam: CameraState): CameraState {
  return {
    pos: { x: 2 * cam.look.x - cam.pos.x, y: cam.pos.y, z: 2 * cam.look.z - cam.pos.z },
    look: cam.look,
  };
}

/** Trộn hai góc máy, `t` 0 → `a`, 1 → `b` (có làm mượt hai đầu). */
export function blendCamera(a: CameraState, b: CameraState, t: number): CameraState {
  // Hai đầu trả đúng camera gốc (lerp a + (b − a)·1 lệch số thực).
  if (t <= 0) return a;
  if (t >= 1) return b;
  const s = t * t * (3 - 2 * t);
  return { pos: lerp3(a.pos, b.pos, s), look: lerp3(a.look, b.look, s) };
}
