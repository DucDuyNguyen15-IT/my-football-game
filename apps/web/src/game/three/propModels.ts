/**
 * Bóng và khung thành dùng model Sketchfab: nạp `public/models/{ball,goal}.glb` do `pnpm assets` sinh
 * ra (không commit — chưa rõ giấy phép, repo public). Thiếu file thì hàm nạp trả null và cảnh giữ
 * bóng/khung vẽ bằng code. Toạ độ chuẩn của hai file: xem `scripts/build-prop-models.mjs`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { GOAL_DEPTH, GOAL_HEIGHT, GOAL_WIDTH, HALF_LENGTH } from '@pitch/sim';
import { CODE_GOAL_NAME, type NetRig } from './pitch';

export const BALL_MODEL_URL = '/models/ball.glb';
export const GOAL_MODEL_URL = '/models/goal.glb';

async function loadGlb(url: string): Promise<THREE.Object3D | null> {
  const res = await fetch(url).catch(() => null);
  if (!res?.ok) return null;
  const buf = await res.arrayBuffer();
  // Dev server có thể trả index.html thay cho file thiếu: kiểm tra chữ ký GLB.
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(4, buf.byteLength)));
  if (magic !== 'glTF') return null;
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buf, '');
    return gltf.scene;
  } catch {
    return null;
  }
}

/** Bóng bán kính 1, tâm ở gốc; null nếu chưa có file. Co lại bằng `scale.setScalar(bán kính)`. */
export async function loadBallModel(): Promise<THREE.Object3D | null> {
  const scene = await loadGlb(BALL_MODEL_URL);
  scene?.traverse((o) => {
    if (o instanceof THREE.Mesh) o.castShadow = true;
  });
  return scene;
}

export interface GoalModel {
  frame: THREE.BufferGeometry[];
  net: THREE.BufferGeometry[];
  /** Kích thước hộp bao cả khung (m, toạ độ chuẩn). */
  size: THREE.Vector3;
  /** Bề dày cột theo trục x = đường kính cột. */
  frameDepth: number;
}

/** Geometry đã nướng biến đổi node, toạ độ dạng float (file meshopt lưu số nguyên lượng tử hoá). */
function bakedGeometry(mesh: THREE.Mesh): THREE.BufferGeometry {
  const src = mesh.geometry;
  const geo = new THREE.BufferGeometry();
  for (const name of ['position', 'normal'] as const) {
    const a = src.getAttribute(name);
    if (!a) continue;
    const out = new Float32Array(a.count * 3);
    for (let i = 0; i < a.count; i++) {
      out[i * 3] = a.getX(i);
      out[i * 3 + 1] = a.getY(i);
      out[i * 3 + 2] = a.getZ(i);
    }
    geo.setAttribute(name, new THREE.BufferAttribute(out, 3));
  }
  if (src.index) geo.setIndex(src.index.clone());
  geo.applyMatrix4(mesh.matrixWorld);
  return geo;
}

/** Khung thành ở toạ độ chuẩn; null nếu chưa có file hoặc file thiếu node `frame`/`net`. */
export async function loadGoalModel(): Promise<GoalModel | null> {
  const scene = await loadGlb(GOAL_MODEL_URL);
  if (!scene) return null;
  scene.updateMatrixWorld(true);
  const frame: THREE.BufferGeometry[] = [];
  const net: THREE.BufferGeometry[] = [];
  scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    // GLTFLoader gắn mesh vào node cùng tên hoặc làm con của node đó.
    const name = o.name || o.parent?.name || '';
    (name.startsWith('frame') ? frame : net).push(bakedGeometry(o));
  });
  if (frame.length === 0 || net.length === 0) return null;
  const box = new THREE.Box3();
  for (const g of [...frame, ...net]) {
    g.computeBoundingBox();
    box.union(g.boundingBox!);
  }
  const frameBox = new THREE.Box3();
  for (const g of frame) frameBox.union(g.boundingBox!);
  return {
    frame,
    net,
    size: box.getSize(new THREE.Vector3()),
    frameDepth: frameBox.max.x - frameBox.min.x,
  };
}

/**
 * Ma trận đưa khung toạ độ chuẩn về đầu sân `side`: tâm cột trên vạch cuối, cách nhau `GOAL_WIDTH`,
 * tâm xà cao `GOAL_HEIGHT`, mép sau lưới lùi `GOAL_DEPTH` — đúng chỗ bóng va cột/lưới trong sim.
 */
export function goalMatrix(
  size: { x: number; y: number; z: number },
  frameDepth: number,
  side: 1 | -1,
): THREE.Matrix4 {
  const r = frameDepth / 2;
  const scale = new THREE.Matrix4().makeScale(
    GOAL_DEPTH / (size.x - r),
    GOAL_HEIGHT / (size.y - r),
    GOAL_WIDTH / (size.z - frameDepth),
  );
  return new THREE.Matrix4()
    .makeTranslation(side * HALF_LENGTH, 0, 0)
    .multiply(new THREE.Matrix4().makeRotationY(side === 1 ? 0 : Math.PI))
    .multiply(scale)
    .multiply(new THREE.Matrix4().makeTranslation(-r, 0, 0));
}

/**
 * Thay hai khung vẽ bằng code trong `pitch` (group của `buildPitch`) bằng model. Lưới mới đăng ký với
 * `rig` (toạ độ thế giới, giữ bản gốc ở `userData.base`) nên vẫn rung khi có bàn thắng.
 */
export function swapGoals(pitch: THREE.Object3D, model: GoalModel, rig: NetRig): void {
  const frameMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 });
  const netMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    roughness: 0.9,
    side: THREE.DoubleSide,
  });
  const old = pitch.children.filter((c) => c.name === CODE_GOAL_NAME);
  for (const codeGoal of old) {
    const side = codeGoal.userData.side as 1 | -1;
    const m = goalMatrix(model.size, model.frameDepth, side);
    const g = new THREE.Group();
    for (const src of model.frame) {
      const mesh = new THREE.Mesh(src.clone().applyMatrix4(m), frameMat);
      mesh.castShadow = true;
      g.add(mesh);
    }
    rig.clear(side);
    for (const src of model.net) {
      const geo = src.clone().applyMatrix4(m);
      geo.userData.base = Float32Array.from(geo.getAttribute('position').array);
      const mesh = new THREE.Mesh(geo, netMat);
      rig.add(side, mesh);
      g.add(mesh);
    }
    pitch.remove(codeGoal);
    disposeTree(codeGoal);
    pitch.add(g);
  }
}

function disposeTree(root: THREE.Object3D): void {
  root.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    o.geometry.dispose();
    for (const m of [o.material].flat() as THREE.Material[]) m.dispose();
  });
}
