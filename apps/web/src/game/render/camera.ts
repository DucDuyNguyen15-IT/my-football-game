/**
 * Toạ độ & camera truyền hình cho trận 3D (ADR-0009), thuần (không Three.js) để test trong Node.
 * Quy ước thế giới 3D: x = sim x (dọc sân, sang phải màn hình), y = độ cao, z = sim y (hướng về
 * phía người xem). Camera đứng trên khán đài phía +z nhìn chéo xuống, nên mũi tên lên/xuống vẫn là
 * sim −y/+y như bản 2D.
 */
import { HALF_LENGTH } from '@pitch/sim';
import type { Vec2 } from '@pitch/sim';

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
