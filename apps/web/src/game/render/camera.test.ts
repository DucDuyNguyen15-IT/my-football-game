import { describe, expect, it } from 'vitest';
import { HALF_LENGTH, HALF_WIDTH } from '@pitch/sim';
import type { Restart } from '@pitch/sim';
import {
  CAMERA_X_LIMIT,
  blendCamera,
  followCamera,
  initialCamera,
  setPieceAim,
  setPieceCamera,
  flipCamera,
  toWorld,
} from './camera';

describe('setPieceAim', () => {
  const restart = (over: Partial<Restart>): Restart => ({
    type: 'free_kick',
    team: 'home',
    spot: { x: 20, y: 5 },
    takerId: 'h9',
    startTick: 0,
    readyTick: 0,
    ...over,
  });
  const state = (r: Restart | null, autopilot = false) => ({ restart: r, half: 1 as const, autopilot });

  it('chỉ dùng cho đá phạt/phạt đền/phạt góc/phát bóng của đội người chơi', () => {
    for (const type of ['free_kick', 'penalty', 'corner', 'goal_kick'] as const) {
      expect(setPieceAim(state(restart({ type })))).not.toBeNull();
    }
    expect(setPieceAim(state(restart({ type: 'throw_in' })))).toBeNull();
    expect(setPieceAim(state(restart({ type: 'kickoff' })))).toBeNull();
    expect(setPieceAim(state(restart({ team: 'away' })))).toBeNull();
    expect(setPieceAim(state(restart({}), true))).toBeNull();
    expect(setPieceAim(state(null))).toBeNull();
  });

  it('theo hướng ngắm người chơi đã xoay', () => {
    const aim = { x: 0.6, y: 0.8 };
    expect(setPieceAim(state(restart({ aim })))?.aim).toEqual(aim);
  });
});

describe('setPieceCamera', () => {
  it('đứng sau bóng ngược hướng ngắm, thấp, nhìn về phía trước', () => {
    const cam = setPieceCamera({ x: 20, y: 5 }, { x: 1, y: 0 });
    expect(cam.pos.x).toBeLessThan(20);
    expect(cam.pos.z).toBeCloseTo(5);
    expect(cam.pos.y).toBeLessThan(4);
    expect(cam.look.x).toBeGreaterThan(20);
  });

  it('quả bóng nằm trong 2/3 nửa dưới khung hình (FOV dọc 38°), không bị cắt hay che bởi HUD', () => {
    const cam = setPieceCamera({ x: 20, y: 5 }, { x: 1, y: 0 });
    const ball = { x: 20, y: 0.11, z: 5 };
    const toBall = Math.atan2(cam.pos.y - ball.y, ball.x - cam.pos.x);
    const pitch = Math.atan2(cam.pos.y - cam.look.y, cam.look.x - cam.pos.x);
    const half = (19 * Math.PI) / 180;
    expect(Math.tan(toBall - pitch) / Math.tan(half)).toBeLessThan(0.67);
  });

  it('blendCamera: 0 và 1 trả đúng hai đầu', () => {
    const a = initialCamera();
    const b = setPieceCamera({ x: 20, y: 5 }, { x: 1, y: 0 });
    expect(blendCamera(a, b, 0)).toEqual(a);
    expect(blendCamera(a, b, 1)).toEqual(b);
  });
});

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

describe('flipCamera', () => {
  it('quay 180° quanh điểm nhìn: vẫn nhìn đúng chỗ, đứng phía đối diện', () => {
    const cam = { pos: { x: 30, y: 20, z: 40 }, look: { x: 35, y: 0, z: 2 } };
    const f = flipCamera(cam);
    expect(f.look).toEqual(cam.look);
    expect(f.pos).toEqual({ x: 40, y: 20, z: -36 });
  });
});
