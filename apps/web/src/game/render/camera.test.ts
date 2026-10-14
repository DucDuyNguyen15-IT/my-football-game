import { describe, expect, it } from 'vitest';
import { HALF_LENGTH, HALF_WIDTH } from '@pitch/sim';
import { CAMERA_X_LIMIT, followCamera, initialCamera, toWorld } from './camera';

describe('toWorld', () => {
  it('sim x → x, độ cao → y, sim y → z (phía người xem là +z)', () => {
    expect(toWorld({ x: 3, y: -4 })).toEqual({ x: 3, y: 0, z: -4 });
    expect(toWorld({ x: 3, y: -4 }, 1.5)).toEqual({ x: 3, y: 1.5, z: -4 });
  });
});

describe('followCamera', () => {
  const settle = (ball: { x: number; y: number }) => {
    let cam = initialCamera();
    for (let i = 0; i < 600; i++) cam = followCamera(cam, ball, 1 / 60);
    return cam;
  };

  it('bám theo bóng dọc sân, camera đứng ngoài đường biên gần (phía +z) và trên cao', () => {
    const cam = settle({ x: 10, y: 0 });
    expect(cam.look.x).toBeCloseTo(10, 1);
    expect(cam.pos.x).toBeCloseTo(10, 1);
    expect(cam.pos.z).toBeGreaterThan(HALF_WIDTH);
    expect(cam.pos.y).toBeGreaterThan(5);
  });

  it('không chạy quá hai đầu sân', () => {
    expect(settle({ x: HALF_LENGTH, y: 0 }).look.x).toBeCloseTo(CAMERA_X_LIMIT, 1);
    expect(settle({ x: -HALF_LENGTH, y: 0 }).look.x).toBeCloseTo(-CAMERA_X_LIMIT, 1);
  });

  it('bóng sang phía xa thì điểm nhìn lùi theo nhưng ít hơn bóng (giữ góc truyền hình)', () => {
    const far = settle({ x: 0, y: -HALF_WIDTH });
    expect(far.look.z).toBeLessThan(0);
    expect(far.look.z).toBeGreaterThan(-HALF_WIDTH);
  });

  it('đi mượt: một khung hình chỉ dịch một phần quãng đường, không vượt quá đích', () => {
    const cam = followCamera(initialCamera(), { x: 20, y: 0 }, 1 / 60);
    expect(cam.look.x).toBeGreaterThan(0);
    expect(cam.look.x).toBeLessThan(5);
  });
});
