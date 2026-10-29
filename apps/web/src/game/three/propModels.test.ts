import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { GOAL_DEPTH, GOAL_HEIGHT, GOAL_WIDTH, HALF_LENGTH } from '@pitch/sim';
import { goalMatrix } from './propModels';

// Kích thước goal.glb sau `pnpm assets`: rộng 6,1 m, cao 2,07 m, sâu 2,13 m, cột dày 0,09 m.
const SIZE = { x: 2.13, y: 2.07, z: 6.1 };
const FRAME = 0.09;
const R = FRAME / 2;

const at = (m: THREE.Matrix4, x: number, y: number, z: number) =>
  new THREE.Vector3(x, y, z).applyMatrix4(m);

describe('goalMatrix', () => {
  for (const side of [1, -1] as const) {
    it(`khung đầu sân ${side}: tâm cột trên vạch cuối, đúng bề rộng/chiều cao/độ sâu của sim`, () => {
      const m = goalMatrix(SIZE, FRAME, side);
      const halfW = (SIZE.z - FRAME) / 2;
      for (const z of [-halfW, halfW]) {
        const post = at(m, R, 0, z);
        expect(post.x).toBeCloseTo(side * HALF_LENGTH);
        expect(post.y).toBeCloseTo(0);
        expect(Math.abs(post.z)).toBeCloseTo(GOAL_WIDTH / 2);
      }
      expect(at(m, R, SIZE.y - R, 0).y).toBeCloseTo(GOAL_HEIGHT);
      // Lưới lùi ra sau vạch cuối, không lấn vào sân.
      expect(at(m, SIZE.x, 0, 0).x).toBeCloseTo(side * (HALF_LENGTH + GOAL_DEPTH));
    });
  }
});
