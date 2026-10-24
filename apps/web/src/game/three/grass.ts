/**
 * Cỏ 3D (task 5.21, mức Cao): sợi cỏ instancing trong một mảng quanh điểm camera nhìn. Mảng ghép từ
 * các ô giống hệt nhau cạnh TILE_M nên dời mảng theo bội số TILE_M thì sợi cỏ đứng yên trên sân;
 * mép mảng thấp dần về 0 để không thấy ranh giới. Màu lấy theo sọc sân, sợi nằm trên vạch vôi thì
 * trắng, lay nhẹ theo gió — tất cả trong shader nên CPU chỉ đặt lại vị trí mảng.
 */
import * as THREE from 'three';
import {
  CENTER_CIRCLE_RADIUS,
  HALF_LENGTH,
  HALF_WIDTH,
  PENALTY_AREA_DEPTH,
  PENALTY_AREA_WIDTH,
  PENALTY_SPOT_DIST,
} from '@pitch/sim';
import { COLORS } from '../render/colors';
import { LINE_W, RUNOFF_M, STRIPES, stripeColors } from './pitch';

const TILE_M = 2;
/** Mảng cỏ: rộng theo x, sâu theo z (m); dịch về phía camera vì phía gần nhìn rõ sợi hơn. */
const PATCH_X = 48;
const PATCH_Z = 32;
const PATCH_TOWARD_CAMERA = 4;
/** Sợi cỏ mỗi m². */
const DENSITY = 36;
const BLADE_H = 0.07;
const BLADE_W = 0.025;
/** Độ sáng trung bình của vân cỏ (`pitch.ts` grassTexture) để sợi cỏ cùng tông với mặt sân. */
const TEXTURE_TONE = 0.86;

export interface Grass {
  object: THREE.Object3D;
  /** Đặt mảng quanh điểm nhìn (x, z) của camera và cho gió chạy theo thời gian (s). */
  update(lookX: number, lookZ: number, timeSec: number): void;
}

export function buildGrass(): Grass {
  // Một sợi = tam giác đứng, pháp tuyến hướng lên để được chiếu sáng như mặt cỏ.
  const blade = new THREE.BufferGeometry();
  blade.setAttribute(
    'position',
    new THREE.Float32BufferAttribute([-BLADE_W / 2, 0, 0, BLADE_W / 2, 0, 0, 0, BLADE_H, 0], 3),
  );
  blade.setAttribute('normal', new THREE.Float32BufferAttribute([0, 1, 0, 0, 1, 0, 0, 1, 0], 3));

  const perTile = Math.round(TILE_M * TILE_M * DENSITY);
  const tilesX = Math.ceil(PATCH_X / TILE_M);
  const tilesZ = Math.ceil(PATCH_Z / TILE_M);
  const count = perTile * tilesX * tilesZ;

  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const tile = Array.from({ length: perTile }, () => ({
    x: rand() * TILE_M,
    z: rand() * TILE_M,
    yaw: rand() * Math.PI,
    h: 0.6 + rand() * 0.8,
  }));

  const [colA, colB] = stripeColors();
  const uniforms = {
    uTime: { value: 0 },
    uCenter: { value: new THREE.Vector2() },
    uColA: { value: new THREE.Color(colA).multiplyScalar(TEXTURE_TONE) },
    uColB: { value: new THREE.Color(colB).multiplyScalar(TEXTURE_TONE) },
    uChalk: { value: new THREE.Color(COLORS.pitchLine) },
  };
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        /* glsl */ `#include <common>
        uniform float uTime;
        uniform vec2 uCenter;
        uniform vec3 uColA;
        uniform vec3 uColB;
        uniform vec3 uChalk;
        float sdBox(vec2 p, vec2 b) {
          vec2 q = abs(p) - b;
          return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0);
        }
        // Khoảng cách tới vạch vôi gần nhất (khớp buildPitch).
        float lineDist(vec2 p) {
          float d = abs(sdBox(p, vec2(${HALF_LENGTH.toFixed(3)}, ${HALF_WIDTH.toFixed(3)})));
          if (abs(p.y) < ${HALF_WIDTH.toFixed(3)}) d = min(d, abs(p.x));
          d = min(d, abs(length(p) - ${CENTER_CIRCLE_RADIUS.toFixed(3)}));
          d = min(d, length(p) - 0.12);
          float s = sign(p.x);
          vec2 box = vec2(s * ${(HALF_LENGTH - PENALTY_AREA_DEPTH / 2).toFixed(3)}, 0.0);
          d = min(d, abs(sdBox(p - box, vec2(${(PENALTY_AREA_DEPTH / 2).toFixed(3)}, ${(PENALTY_AREA_WIDTH / 2).toFixed(3)}))));
          vec2 spot = vec2(s * ${(HALF_LENGTH - PENALTY_SPOT_DIST).toFixed(3)}, 0.0);
          d = min(d, length(p - spot) - 0.12);
          if (abs(p.x) < ${(HALF_LENGTH - PENALTY_AREA_DEPTH).toFixed(3)})
            d = min(d, abs(length(p - spot) - ${CENTER_CIRCLE_RADIUS.toFixed(3)}));
          vec2 corner = vec2(s * ${HALF_LENGTH.toFixed(3)}, sign(p.y) * ${HALF_WIDTH.toFixed(3)});
          if (abs(p.x) < ${HALF_LENGTH.toFixed(3)} && abs(p.y) < ${HALF_WIDTH.toFixed(3)})
            d = min(d, abs(length(p - corner) - 1.0));
          return d;
        }`,
      )
      .replace(
        '#include <begin_vertex>',
        /* glsl */ `#include <begin_vertex>
        vec4 root = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 wp = root.xz;
        float h = position.y / ${BLADE_H.toFixed(3)};
        // Thấp dần về mép mảng và ngoài dải cỏ quanh sân.
        vec2 rel = abs(wp - uCenter) / vec2(${(PATCH_X / 2).toFixed(1)}, ${(PATCH_Z / 2).toFixed(1)});
        float fade = 1.0 - smoothstep(0.7, 1.0, max(rel.x, rel.y));
        vec2 outside = abs(wp) - vec2(${(HALF_LENGTH + RUNOFF_M).toFixed(1)}, ${(HALF_WIDTH + RUNOFF_M).toFixed(1)});
        if (max(outside.x, outside.y) > 0.0) fade = 0.0;
        transformed.y *= fade;
        float gust = sin(uTime * 1.7 + wp.x * 0.35 + wp.y * 0.21) * 0.5 + 0.5;
        transformed.x += (0.012 + 0.02 * gust) * h * h;
        float band = ${((2 * HALF_LENGTH) / STRIPES).toFixed(4)};
        float idx = floor((wp.x + ${HALF_LENGTH.toFixed(3)}) / band);
        bool inPitch = abs(wp.x) < ${HALF_LENGTH.toFixed(3)} && abs(wp.y) < ${HALF_WIDTH.toFixed(3)};
        vec3 base = (inPitch && mod(idx, 2.0) > 0.5) ? uColB : uColA;
        if (lineDist(wp) < ${(LINE_W / 2).toFixed(3)}) base = uChalk;
        vColor = base * mix(0.75, 1.12, h);`,
      );
  };

  const mesh = new THREE.InstancedMesh(blade, material, count);
  mesh.receiveShadow = true;
  // Mảng luôn quanh camera: không để Three.js cắt theo bounding sphere của hình gốc.
  mesh.frustumCulled = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const s = new THREE.Vector3();
  const p = new THREE.Vector3();
  let i = 0;
  for (let tx = 0; tx < tilesX; tx++) {
    for (let tz = 0; tz < tilesZ; tz++) {
      for (const b of tile) {
        p.set(tx * TILE_M + b.x - PATCH_X / 2, 0, tz * TILE_M + b.z - PATCH_Z / 2);
        q.setFromAxisAngle(up, b.yaw);
        s.set(1, b.h, 1);
        mesh.setMatrixAt(i++, m.compose(p, q, s));
      }
    }
  }

  return {
    object: mesh,
    update(lookX, lookZ, timeSec) {
      const cz = lookZ + PATCH_TOWARD_CAMERA;
      mesh.position.set(
        Math.round(lookX / TILE_M) * TILE_M,
        0.005,
        Math.round(cz / TILE_M) * TILE_M,
      );
      uniforms.uCenter.value.set(lookX, cz);
      uniforms.uTime.value = timeSec;
    },
  };
}
