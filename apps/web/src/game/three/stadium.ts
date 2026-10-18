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
export const FLOODLIGHT_HEIGHT = 22;
/** Mặt đèn sáng hơn trắng (tuyến tính) để hậu kỳ bloom loé lên; không hậu kỳ thì vẫn là trắng. */
const LAMP_GLOW = 6;
/** Mái khán đài: cao hơn bậc trên cùng chừng này mét, nhô ra trước mép khán đài chừng này mét. */
const ROOF_GAP = 3.2;
const ROOF_OVERHANG = 2;
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

function floodlight(x: number, z: number, pole: THREE.Material, lamp: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  const height = FLOODLIGHT_HEIGHT;
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

const EDGE_Z = HALF_WIDTH + RUNOFF_M;
const EDGE_X = HALF_LENGTH + RUNOFF_M;
const TIER_SPAN = TIERS * TIER_DEPTH;

/** Chân 4 cột đèn pha (x, z) ở 4 góc sân, ngoài khán đài. */
export function floodlightSpots(): { x: number; z: number }[] {
  const lx = EDGE_X + TIER_SPAN * 0.6;
  const lz = EDGE_Z + TIER_SPAN * 0.6;
  return [
    { x: lx, z: lz },
    { x: -lx, z: lz },
    { x: lx, z: -lz },
    { x: -lx, z: -lz },
  ];
}

/** Một mái che nghiêng phía trên dãy khán đài, mép trước có dải đèn sáng. */
function roof(length: number, center: THREE.Vector3, rotationY: number): THREE.Group {
  const g = new THREE.Group();
  const top = TIERS * TIER_RISE + ROOF_GAP;
  const depth = TIER_SPAN + ROOF_OVERHANG;
  const sheet = new THREE.Mesh(
    new THREE.BoxGeometry(length, 0.3, depth),
    new THREE.MeshLambertMaterial({ color: 0x0f1916 }),
  );
  // Mái dốc nhẹ về phía sau; mép trước (+z cục bộ) nhô ra trước khán đài.
  sheet.position.set(0, top, -TIER_SPAN / 2 + ROOF_OVERHANG / 2);
  sheet.rotation.x = -0.08;
  sheet.castShadow = true;
  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(length * 0.96, 0.12, 0.25),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(0xfff6d8).multiplyScalar(LAMP_GLOW / 2) }),
  );
  strip.position.set(0, top - 0.3, ROOF_OVERHANG - 0.1);
  g.add(sheet, strip);
  // Cột đỡ phía sau.
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0x2a3d35 });
  for (let i = -2; i <= 2; i++) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.4, top, 0.4), pillarMat);
    pillar.position.set((i * length) / 5, top / 2, -TIER_SPAN + 0.3);
    g.add(pillar);
  }
  g.position.copy(center);
  g.rotation.y = rotationY;
  return g;
}

/** Mái che ba dãy khán đài (chỉ bật ở mức đồ hoạ Cao). */
export function buildRoofs(): THREE.Group {
  const g = new THREE.Group();
  g.add(roof(EDGE_X * 2 + TIER_SPAN, new THREE.Vector3(0, 0, -EDGE_Z - 1), 0));
  g.add(roof(EDGE_Z * 2, new THREE.Vector3(EDGE_X + 1, 0, 0), -Math.PI / 2));
  g.add(roof(EDGE_Z * 2, new THREE.Vector3(-EDGE_X - 1, 0, 0), Math.PI / 2));
  return g;
}

export function buildStadium(): THREE.Group {
  const g = new THREE.Group();
  const crowd = crowdTexture();
  const concrete = new THREE.MeshLambertMaterial({ color: 0x1a2722 });
  const edgeZ = EDGE_Z;
  const edgeX = EDGE_X;
  const tierSpan = TIER_SPAN;

  // Phía xa (−z) và hai đầu sân.
  g.add(stand(edgeX * 2 + tierSpan, new THREE.Vector3(0, 0, -edgeZ - 1), 0, crowd, concrete));
  g.add(stand(edgeZ * 2, new THREE.Vector3(edgeX + 1, 0, 0), -Math.PI / 2, crowd, concrete));
  g.add(stand(edgeZ * 2, new THREE.Vector3(-edgeX - 1, 0, 0), Math.PI / 2, crowd, concrete));

  const pole = new THREE.MeshLambertMaterial({ color: 0x2a3d35 });
  const lamp = new THREE.MeshBasicMaterial({
    color: new THREE.Color(0xfff6d8).multiplyScalar(LAMP_GLOW),
  });
  for (const { x, z } of floodlightSpots()) g.add(floodlight(x, z, pole, lamp));
  return g;
}
