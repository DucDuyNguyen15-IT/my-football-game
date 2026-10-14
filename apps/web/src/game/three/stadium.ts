/**
 * Khán đài + cột đèn pha ("Sân đêm", DESIGN.md §1). Khán đài chỉ ở phía xa và hai đầu sân —
 * phía gần là chỗ đặt camera. Khán giả là chấm màu trên texture canvas, sinh tất định.
 */
import * as THREE from 'three';
import { HALF_LENGTH, HALF_WIDTH } from '@pitch/sim';
import { RUNOFF_M } from './pitch';

const TIERS = 6;
const TIER_DEPTH = 1.6;
const TIER_RISE = 1.1;
const CROWD_COLORS = ['#3fa9f5', '#ff7a45', '#edf2ec', '#c8f031', '#9db0a6', '#213530'];

/** Texture khán giả: lưới chấm màu, PRNG đơn giản để lần nào vẽ cũng giống nhau. */
function crowdTexture(): THREE.CanvasTexture {
  const w = 256;
  const h = 32;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  let seed = 7;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  if (ctx) {
    ctx.fillStyle = '#111d18';
    ctx.fillRect(0, 0, w, h);
    for (let y = 2; y < h; y += 5) {
      for (let x = 2; x < w; x += 4) {
        if (rand() < 0.25) continue;
        ctx.fillStyle = CROWD_COLORS[Math.floor(rand() * CROWD_COLORS.length)] ?? '#9db0a6';
        ctx.fillRect(x + rand(), y, 2, 3);
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/**
 * Một dãy khán đài dài `length` (theo trục x cục bộ), bậc thang lùi về −z cục bộ; mặt ghế là mặt
 * +z của mỗi bậc nên xoay `rotationY` để +z cục bộ hướng vào sân.
 */
function stand(
  length: number,
  center: THREE.Vector3,
  rotationY: number,
  crowd: THREE.Texture,
  concrete: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const map = crowd.clone();
  map.repeat.set(length / 8, 1);
  map.needsUpdate = true;
  const seats = new THREE.MeshLambertMaterial({ map });
  for (let i = 0; i < TIERS; i++) {
    const height = TIER_RISE * (i + 1);
    const step = new THREE.Mesh(new THREE.BoxGeometry(length, height, TIER_DEPTH), [
      concrete,
      concrete,
      concrete,
      concrete,
      seats,
      concrete,
    ]);
    step.position.set(0, height / 2, -i * TIER_DEPTH);
    g.add(step);
  }
  g.position.copy(center);
  g.rotation.y = rotationY;
  return g;
}

function floodlight(
  x: number,
  z: number,
  pole: THREE.Material,
  lamp: THREE.Material,
): THREE.Group {
  const g = new THREE.Group();
  const height = 22;
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.4, height, 8), pole);
  mast.position.y = height / 2;
  g.add(mast);
  const head = new THREE.Mesh(new THREE.BoxGeometry(3.2, 1.6, 0.4), lamp);
  head.position.y = height;
  g.add(head);
  g.position.set(x, 0, z);
  // Mặt đèn (+z cục bộ) hướng vào giữa sân.
  g.rotation.y = Math.atan2(-x, -z);
  return g;
}

export function buildStadium(): THREE.Group {
  const g = new THREE.Group();
  const crowd = crowdTexture();
  const concrete = new THREE.MeshLambertMaterial({ color: 0x1a2722 });
  const edgeZ = HALF_WIDTH + RUNOFF_M;
  const edgeX = HALF_LENGTH + RUNOFF_M;
  const tierSpan = TIERS * TIER_DEPTH;

  // Phía xa (−z) và hai đầu sân.
  g.add(stand(edgeX * 2 + tierSpan, new THREE.Vector3(0, 0, -edgeZ - 1), 0, crowd, concrete));
  g.add(stand(edgeZ * 2, new THREE.Vector3(edgeX + 1, 0, 0), -Math.PI / 2, crowd, concrete));
  g.add(stand(edgeZ * 2, new THREE.Vector3(-edgeX - 1, 0, 0), Math.PI / 2, crowd, concrete));

  const pole = new THREE.MeshLambertMaterial({ color: 0x2a3d35 });
  const lamp = new THREE.MeshBasicMaterial({ color: 0xfff6d8 });
  const lx = edgeX + tierSpan * 0.6;
  const lz = edgeZ + tierSpan * 0.6;
  for (const [x, z] of [
    [lx, lz],
    [-lx, lz],
    [lx, -lz],
    [-lx, -lz],
  ] as const) {
    g.add(floodlight(x, z, pole, lamp));
  }
  return g;
}
