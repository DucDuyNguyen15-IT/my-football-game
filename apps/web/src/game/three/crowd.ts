/**
 * Khán giả 3D (task 5.21, tắt được): mỗi người là một khối thân + đầu, vẽ bằng một InstancedMesh
 * ngồi trên các bậc khán đài. Lắc lư nhẹ khi bóng lăn, đứng bật dậy nhún nhảy khi có bàn thắng —
 * toàn bộ chuyển động nằm trong vertex shader (một uniform thời gian + một mức cổ vũ).
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { standRows } from './stadium';

const SEAT_SPACING = 0.62;
/** Ghế trống (không vẽ người) theo tỉ lệ này. */
const EMPTY_SEATS = 0.12;
const SHIRT_COLORS = [
  0x3fa9f5, 0xff7a45, 0xedf2ec, 0xc8f031, 0x9db0a6, 0x2c4a7a, 0xd94848, 0x213530,
];
/** Mức cổ vũ giảm về 0 sau chừng này giây. */
const CHEER_SEC = 5;

export interface Crowd {
  object: THREE.Object3D;
  cheer(): void;
  update(dt: number, timeSec: number): void;
}

function personGeometry(): THREE.BufferGeometry {
  const body = new THREE.BoxGeometry(0.42, 0.55, 0.3);
  body.translate(0, 0.28, 0);
  const head = new THREE.SphereGeometry(0.12, 8, 6);
  head.translate(0, 0.7, 0);
  // Đầu màu da: dùng thuộc tính `aSkin` = 1 để shader không nhân màu áo.
  const tag = (g: THREE.BufferGeometry, v: number) =>
    g.setAttribute(
      'aSkin',
      new THREE.Float32BufferAttribute(new Array(g.getAttribute('position').count).fill(v), 1),
    );
  tag(body, 0);
  tag(head, 1);
  const merged = mergeGeometries([body.toNonIndexed(), head.toNonIndexed()]);
  if (!merged) throw new Error('merge person geometry');
  return merged;
}

export function buildCrowd(): Crowd {
  let seed = 19;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const seats: { pos: THREE.Vector3; yaw: number }[] = [];
  for (const row of standRows()) {
    const n = Math.floor(row.length / SEAT_SPACING);
    for (let i = 0; i < n; i++) {
      if (rand() < EMPTY_SEATS) continue;
      const t = (i + 0.5) / n - 0.5 + (rand() - 0.5) * 0.004;
      seats.push({
        pos: row.start.clone().addScaledVector(row.dir, t * row.length),
        yaw: row.yaw,
      });
    }
  }

  const uniforms = { uTime: { value: 0 }, uCheer: { value: 0 } };
  const material = new THREE.MeshLambertMaterial();
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float uTime;
        uniform float uCheer;
        attribute float aSkin;
        varying float vSkin;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vSkin = aSkin;
        vec4 seat = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float phase = fract(sin(dot(seat.xz, vec2(12.9898, 78.233))) * 43758.5453) * 6.2831;
        // Ngồi: lắc nhẹ. Cổ vũ: đứng dậy (cao thêm) và nhún theo nhịp riêng.
        transformed.x += sin(uTime * 1.3 + phase) * 0.03 * position.y;
        float jump = max(0.0, sin(uTime * 9.0 + phase)) * 0.35 * uCheer;
        transformed.y += position.y * 0.35 * uCheer + jump;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vSkin;`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.62, 0.45, 0.33), vSkin);`,
      );
  };

  const mesh = new THREE.InstancedMesh(personGeometry(), material, seats.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);
  const one = new THREE.Vector3(1, 1, 1);
  const color = new THREE.Color();
  seats.forEach((s, i) => {
    q.setFromAxisAngle(up, s.yaw + (rand() - 0.5) * 0.4);
    const h = 0.9 + rand() * 0.2;
    mesh.setMatrixAt(i, m.compose(s.pos, q, one.set(1, h, 1)));
    mesh.setColorAt(i, color.setHex(SHIRT_COLORS[Math.floor(rand() * SHIRT_COLORS.length)]!));
  });
  // Đổ bóng hơn mười nghìn người lên khán đài tốn mà khó thấy: tắt.
  mesh.castShadow = false;

  let cheer = 0;
  return {
    object: mesh,
    cheer() {
      cheer = 1;
    },
    update(dt, timeSec) {
      cheer = Math.max(0, cheer - dt / CHEER_SEC);
      uniforms.uTime.value = timeSec;
      // Giữ đứng lâu rồi mới ngồi xuống: bình phương cho đuôi thoải.
      uniforms.uCheer.value = Math.min(1, cheer * 1.6) ** 2;
    },
  };
}
