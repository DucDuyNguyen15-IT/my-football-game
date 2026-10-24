/**
 * Mặt sân 3D: cỏ sọc, vạch phấn, khung thành có cột + lưới. Kích thước lấy từ `@pitch/sim`.
 * Toạ độ theo `render/camera.ts`: x dọc sân, y độ cao, z = sim y.
 */
import * as THREE from 'three';
import {
  CENTER_CIRCLE_RADIUS,
  GOAL_DEPTH,
  GOAL_HEIGHT,
  GOAL_WIDTH,
  HALF_LENGTH,
  HALF_WIDTH,
  PENALTY_AREA_DEPTH,
  PENALTY_AREA_WIDTH,
  PENALTY_SPOT_DIST,
  PITCH_LENGTH,
  PITCH_WIDTH,
} from '@pitch/sim';
import { COLORS } from '../render/colors';

/** Dải cỏ ngoài vạch biên. */
export const RUNOFF_M = 6;
export const STRIPES = 12;
export const LINE_W = 0.12;
/** Sọc cắt cỏ đậm hơn token một chút (±) để nhìn rõ từ camera truyền hình. */
const STRIPE_CONTRAST = 0.05;
/** Lưới rung sau bàn thắng chừng này giây. */
const NET_SHAKE_SEC = 1.1;
const NET_SHAKE_AMP = 0.35;
/** Vạch nằm nhích trên mặt cỏ để không nhấp nháy (z-fighting). */
const LINE_Y = 0.012;
const POST_R = 0.07;

function flat(geometry: THREE.BufferGeometry, material: THREE.Material, y: number): THREE.Mesh {
  const mesh = new THREE.Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

/** Vạch thẳng từ (x1, z1) tới (x2, z2) trên mặt cỏ. */
function line(x1: number, z1: number, x2: number, z2: number, mat: THREE.Material): THREE.Mesh {
  const len = Math.hypot(x2 - x1, z2 - z1);
  const mesh = flat(new THREE.PlaneGeometry(len + LINE_W, LINE_W), mat, LINE_Y);
  mesh.position.set((x1 + x2) / 2, LINE_Y, (z1 + z2) / 2);
  mesh.rotation.z = -Math.atan2(z2 - z1, x2 - x1);
  return mesh;
}

function rect(x1: number, z1: number, x2: number, z2: number, mat: THREE.Material): THREE.Mesh[] {
  return [
    line(x1, z1, x2, z1, mat),
    line(x1, z2, x2, z2, mat),
    line(x1, z1, x1, z2, mat),
    line(x2, z1, x2, z2, mat),
  ];
}

/** Ô lưới vẽ trên canvas, lặp lại trên các mặt lưới khung thành. */
function netTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Màu hai loại sọc cỏ (đã tăng tương phản). */
export function stripeColors(): [number, number] {
  const a = new THREE.Color(COLORS.pitchA).multiplyScalar(1 + STRIPE_CONTRAST);
  const b = new THREE.Color(COLORS.pitchB).multiplyScalar(1 - STRIPE_CONTRAST);
  return [a.getHex(), b.getHex()];
}

const NET_SEG_U = 10;
const NET_SEG_V = 6;

/**
 * Mặt lưới tứ giác qua 4 đỉnh [x, y, z] (theo thứ tự vòng), ô lưới ~25 cm. Chia lưới đỉnh để rung
 * phồng ra được khi bóng vào (`NetRig`).
 */
function netQuad(pts: [number, number, number][], tex: THREE.Texture): THREE.Mesh {
  const [a, b, c, d] = pts.map((v) => new THREE.Vector3(...v)) as [
    THREE.Vector3,
    THREE.Vector3,
    THREE.Vector3,
    THREE.Vector3,
  ];
  const u = a.distanceTo(b) / 0.25;
  const v = a.distanceTo(d) / 0.25;
  const pos: number[] = [];
  const uv: number[] = [];
  const index: number[] = [];
  const ab = new THREE.Vector3();
  const dc = new THREE.Vector3();
  for (let j = 0; j <= NET_SEG_V; j++) {
    const tv = j / NET_SEG_V;
    for (let i = 0; i <= NET_SEG_U; i++) {
      const tu = i / NET_SEG_U;
      ab.lerpVectors(a, b, tu);
      dc.lerpVectors(d, c, tu);
      const p = ab.lerp(dc, tv);
      pos.push(p.x, p.y, p.z);
      uv.push(tu * u, tv * v);
      if (i < NET_SEG_U && j < NET_SEG_V) {
        const k = j * (NET_SEG_U + 1) + i;
        index.push(k, k + 1, k + NET_SEG_U + 2, k, k + NET_SEG_U + 2, k + NET_SEG_U + 1);
      }
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(index);
  geo.userData.base = Float32Array.from(pos);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0.55,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  return new THREE.Mesh(geo, mat);
}

function post(len: number, mat: THREE.Material): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(POST_R, POST_R, len, 10), mat);
  mesh.castShadow = true;
  return mesh;
}

/**
 * Lưới hai khung thành rung phồng ra sau bàn thắng: đỉnh gần điểm bóng vào bị đẩy ra sau khung,
 * dao động tắt dần. Không có bàn thắng thì không đụng tới geometry.
 */
export class NetRig {
  private readonly nets: Record<'1' | '-1', THREE.Mesh[]> = { '1': [], '-1': [] };
  private shake: { side: 1 | -1; at: THREE.Vector3; t: number } | null = null;

  add(side: 1 | -1, mesh: THREE.Mesh): void {
    this.nets[side === 1 ? '1' : '-1'].push(mesh);
  }

  /** Bóng vào lưới khung thành `side` ở điểm `at` (toạ độ thế giới). */
  hit(side: 1 | -1, at: THREE.Vector3): void {
    this.shake = { side, at: at.clone(), t: 0 };
  }

  update(dt: number): void {
    const sh = this.shake;
    if (!sh) return;
    sh.t += dt;
    const done = sh.t >= NET_SHAKE_SEC;
    const amp = done ? 0 : NET_SHAKE_AMP * Math.exp(-4 * sh.t) * Math.sin(sh.t * 22 + 0.6);
    for (const mesh of this.nets[sh.side === 1 ? '1' : '-1']) {
      const attr = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
      const base = mesh.geometry.userData.base as Float32Array;
      for (let i = 0; i < attr.count; i++) {
        const x = base[i * 3]!;
        const y = base[i * 3 + 1]!;
        const z = base[i * 3 + 2]!;
        // Mép dính khung (sát vạch cuối hoặc chạm đất) gần như không rung.
        const pinned = Math.min(Math.abs(x - sh.side * HALF_LENGTH) / GOAL_DEPTH, 1);
        const d2 = (y - sh.at.y) ** 2 + (z - sh.at.z) ** 2;
        const w = Math.exp(-d2 / 1.8) * pinned * Math.min(y / 0.3, 1);
        attr.setXYZ(i, x + sh.side * amp * w, y, z);
      }
      attr.needsUpdate = true;
    }
    if (done) this.shake = null;
  }
}

/** Khung thành ở đầu sân `side` (+1 phải, −1 trái), miệng khung nằm trên vạch cuối. */
function goal(side: 1 | -1, tex: THREE.Texture, rig: NetRig): THREE.Group {
  const g = new THREE.Group();
  const net = (pts: [number, number, number][]) => {
    const mesh = netQuad(pts, tex);
    rig.add(side, mesh);
    return mesh;
  };
  const white = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const hw = GOAL_WIDTH / 2;
  const x = side * HALF_LENGTH;
  const back = side * (HALF_LENGTH + GOAL_DEPTH);

  for (const z of [-hw, hw]) {
    const p = post(GOAL_HEIGHT, white);
    p.position.set(x, GOAL_HEIGHT / 2, z);
    g.add(p);
    // Thanh đỡ lưới (mảnh hơn), từ đỉnh cột xuống mép sau của lưới.
    const drop = GOAL_HEIGHT * 0.7;
    const stay = post(Math.hypot(GOAL_DEPTH, drop), white);
    stay.scale.set(0.5, 1, 0.5);
    stay.position.set((x + back) / 2, GOAL_HEIGHT - drop / 2, z);
    stay.rotation.z = side * Math.atan2(GOAL_DEPTH, drop);
    g.add(stay);
  }
  const bar = post(GOAL_WIDTH + POST_R * 2, white);
  bar.rotation.x = Math.PI / 2;
  bar.position.set(x, GOAL_HEIGHT, 0);
  g.add(bar);

  // Lưới: mặt nghiêng từ xà xuống mép sau (cao 30%), mặt sau thấp, hai mặt bên.
  const lowBack = GOAL_HEIGHT * 0.3;
  g.add(
    net([
      [x, GOAL_HEIGHT, -hw],
      [x, GOAL_HEIGHT, hw],
      [back, lowBack, hw],
      [back, lowBack, -hw],
    ]),
    net([
      [back, lowBack, -hw],
      [back, lowBack, hw],
      [back, 0, hw],
      [back, 0, -hw],
    ]),
  );
  for (const z of [-hw, hw]) {
    g.add(
      net([
        [x, GOAL_HEIGHT, z],
        [back, lowBack, z],
        [back, 0, z],
        [x, 0, z],
      ]),
    );
  }
  return g;
}

/** Vân cỏ: nhiễu sáng-tối nhỏ (gần trắng) nhân với màu sọc, PRNG cố định. Lặp mỗi GRASS_TILE_M mét. */
const GRASS_TILE_M = 4;
function grassTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  let seed = 3;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  if (ctx) {
    ctx.fillStyle = '#e6e6e6';
    ctx.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000; i++) {
      const v = Math.floor(200 + rand() * 55);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      // Ngọn cỏ: vệt dọc mảnh.
      ctx.fillRect(rand() * size, rand() * size, 1, 2 + rand() * 3);
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** Cỏ theo mét: UV = toạ độ / GRASS_TILE_M để vân không bị kéo giãn theo kích thước mảnh. */
function grassMaterial(color: number, map: THREE.Texture, w: number, h: number) {
  const tex = map.clone();
  tex.repeat.set(w / GRASS_TILE_M, h / GRASS_TILE_M);
  tex.needsUpdate = true;
  return new THREE.MeshLambertMaterial({ color, map: tex });
}

/** Cung tròn mảnh (vạch vôi) tâm (x, z), bán kính r, từ góc a0 quét `len` radian. */
function arc(x: number, z: number, r: number, a0: number, len: number, mat: THREE.Material) {
  const mesh = flat(
    new THREE.RingGeometry(r - LINE_W / 2, r + LINE_W / 2, 48, 1, a0, len),
    mat,
    LINE_Y,
  );
  mesh.position.x = x;
  mesh.position.z = z;
  return mesh;
}

export function buildPitch(rig: NetRig): THREE.Group {
  const g = new THREE.Group();
  const grass = grassTexture();
  const band = PITCH_LENGTH / STRIPES;
  const [colorA, colorB] = stripeColors();
  const grassA = grassMaterial(colorA, grass, band, PITCH_WIDTH);
  const grassB = grassMaterial(colorB, grass, band, PITCH_WIDTH);
  const runoffW = PITCH_LENGTH + RUNOFF_M * 2;
  const runoffH = PITCH_WIDTH + RUNOFF_M * 2;

  const runoff = flat(
    new THREE.PlaneGeometry(runoffW, runoffH),
    grassMaterial(colorA, grass, runoffW, runoffH),
    0,
  );
  runoff.receiveShadow = true;
  g.add(runoff);
  const stripeGeo = new THREE.PlaneGeometry(band, PITCH_WIDTH);
  for (let i = 0; i < STRIPES; i++) {
    const s = flat(stripeGeo, i % 2 === 0 ? grassA : grassB, 0.004);
    s.position.x = -HALF_LENGTH + band * (i + 0.5);
    s.receiveShadow = true;
    g.add(s);
  }

  const chalk = new THREE.MeshBasicMaterial({ color: COLORS.pitchLine });
  g.add(...rect(-HALF_LENGTH, -HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, chalk));
  g.add(line(0, -HALF_WIDTH, 0, HALF_WIDTH, chalk));
  g.add(
    flat(
      new THREE.RingGeometry(
        CENTER_CIRCLE_RADIUS - LINE_W / 2,
        CENTER_CIRCLE_RADIUS + LINE_W / 2,
        72,
      ),
      chalk,
      LINE_Y,
    ),
  );
  const spotGeo = new THREE.CircleGeometry(0.18, 16);
  g.add(flat(spotGeo, chalk, LINE_Y));

  const tex = netTexture();
  for (const side of [-1, 1] as const) {
    const xLine = side * HALF_LENGTH;
    const xBox = side * (HALF_LENGTH - PENALTY_AREA_DEPTH);
    const hw = PENALTY_AREA_WIDTH / 2;
    g.add(line(xBox, -hw, xBox, hw, chalk));
    g.add(line(xLine, -hw, xBox, -hw, chalk));
    g.add(line(xLine, hw, xBox, hw, chalk));
    const spot = flat(spotGeo, chalk, LINE_Y);
    spot.position.x = side * (HALF_LENGTH - PENALTY_SPOT_DIST);
    g.add(spot);
    g.add(goal(side, tex, rig));
    // Cung đầu vòng cấm ("D"): phần đường tròn quanh chấm phạt đền nằm ngoài vòng cấm. Mặt phẳng
    // được xoay −90° quanh x nên góc của RingGeometry đo từ +x về phía −z.
    const reach = Math.acos((PENALTY_AREA_DEPTH - PENALTY_SPOT_DIST) / CENTER_CIRCLE_RADIUS);
    const facing = side === 1 ? Math.PI : 0;
    g.add(arc(spot.position.x, 0, CENTER_CIRCLE_RADIUS, facing - reach, 2 * reach, chalk));
    // Cung phạt góc bán kính 1 m, quay vào trong sân.
    for (const zs of [-1, 1] as const) {
      const mid = Math.atan2(zs, -side);
      g.add(arc(xLine, zs * HALF_WIDTH, 1, mid - Math.PI / 4, Math.PI / 2, chalk));
    }
  }
  return g;
}
