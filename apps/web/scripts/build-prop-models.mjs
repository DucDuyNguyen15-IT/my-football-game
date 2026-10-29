/**
 * `pnpm assets` (phần đạo cụ) — nén model bóng và khung thành tải từ Sketchfab cho intro và trận 3D.
 * File gốc để ở `assets-src/sketchfab/` (không commit: chưa rõ giấy phép, repo public). Kết quả
 * `apps/web/public/models/{ball,goal}.glb` cũng bị Git bỏ qua; thiếu file thì game vẽ bóng/khung bằng code.
 *
 * Toạ độ chuẩn sau khi dựng (web tự co giãn về kích thước sim lúc nạp, xem `three/propModels.ts`):
 *   - ball.glb: tâm ở gốc, bán kính 1.
 *   - goal.glb: mét, chân khung ở y = 0, giữa khung ở z = 0, mặt khung (cột + xà) ở phía −x, lưới lùi
 *     về +x bắt đầu từ x = 0. Node `frame` = cột + xà, các node `net` = lưới.
 */
import { existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getBounds, NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  meshopt,
  metalRough,
  prune,
  textureCompress,
  transformMesh,
  weld,
} from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import sharp from 'sharp';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(root, 'assets-src', 'sketchfab');
const OUT_DIR = join(root, 'apps', 'web', 'public', 'models');
const BALL_SRC = join(SRC, 'football.glb');
const GOAL_SRC = join(SRC, 'football_net.glb');
/** Bóng chỉ chiếm vài chục pixel trong trận, cận cảnh ở intro: 1024 là đủ nét. */
const BALL_TEXTURE_PX = 1024;

await MeshoptEncoder.ready;
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
mkdirSync(OUT_DIR, { recursive: true });

/** Gỡ cây node của Sketchfab (xoay Z-up, đơn vị cm…) và nướng biến đổi vào đỉnh: mọi mesh ở gốc. */
function bakeTransforms(doc) {
  const scene = doc.getRoot().getDefaultScene() ?? doc.getRoot().listScenes()[0];
  const meshNodes = doc
    .getRoot()
    .listNodes()
    .filter((n) => n.getMesh());
  // Tính hết ma trận thế giới trước khi đụng vào cây (gỡ node cha làm sai ma trận của node con).
  const worlds = meshNodes.map((n) => n.getWorldMatrix());
  meshNodes.forEach((node, i) => {
    let mesh = node.getMesh();
    // Mesh dùng chung cho nhiều node thì tách bản riêng, kẻo nướng hai lần.
    if (mesh.listParents().filter((p) => p.propertyType === 'Node').length > 1) {
      mesh = mesh.clone();
      node.setMesh(mesh);
    }
    transformMesh(mesh, worlds[i]);
    node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
  });
  for (const child of scene.listChildren()) scene.removeChild(child);
  for (const node of meshNodes) {
    node.getParentNode()?.removeChild(node);
    scene.addChild(node);
  }
  // Đèn / camera / node rỗng của file gốc.
  for (const node of doc.getRoot().listNodes()) if (!node.getMesh()) node.dispose();
  return scene;
}

/** Ma trận 4×4 cột-trước (glTF): xoay quanh Y góc `rotY`, rồi co `s`, rồi dời `t`. */
function matrix(rotY, s, t) {
  const c = Math.cos(rotY);
  const n = Math.sin(rotY);
  return [c * s, 0, -n * s, 0, 0, s, 0, 0, n * s, 0, c * s, 0, t[0], t[1], t[2], 1];
}

function transformScene(scene, m) {
  for (const node of scene.listChildren()) {
    const mesh = node.getMesh();
    if (mesh) transformMesh(mesh, m);
  }
}

async function finish(doc, out) {
  await doc.transform(
    weld(),
    dedup(),
    prune(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  await io.write(out, doc);
  const kb = Math.round(statSync(out).size / 1024);
  console.log(`✔ ${out} (${kb} KB)`);
}

async function buildBall() {
  const doc = await io.read(BALL_SRC);
  // three.js không còn đọc KHR_materials_pbrSpecularGlossiness → đổi sang metal-rough.
  await doc.transform(metalRough());
  const scene = bakeTransforms(doc);
  const { min, max } = getBounds(scene);
  const r = Math.max(...[0, 1, 2].map((i) => (max[i] - min[i]) / 2));
  const c = [0, 1, 2].map((i) => (min[i] + max[i]) / 2);
  transformScene(
    scene,
    matrix(
      0,
      1 / r,
      c.map((v) => -v / r),
    ),
  );
  for (const node of scene.listChildren()) node.setName('ball');
  await doc.transform(
    textureCompress({
      encoder: sharp,
      targetFormat: 'webp',
      resize: [BALL_TEXTURE_PX, BALL_TEXTURE_PX],
    }),
  );
  await finish(doc, join(OUT_DIR, 'ball.glb'));
}

async function buildGoal() {
  const doc = await io.read(GOAL_SRC);
  const scene = bakeTransforms(doc);
  for (const node of [...scene.listChildren()]) {
    const name = node.getMesh()?.getName() ?? '';
    if (name.startsWith('Plane'))
      node.dispose(); // tấm nền dưới khung — sân đã có cỏ
    else if (name.startsWith('Cylinder')) node.setName('frame');
    else node.setName('net');
  }
  // File gốc: khung ở +x, lưới lùi về −x → xoay 180° để lưới lùi về +x.
  transformScene(scene, matrix(Math.PI, 1, [0, 0, 0]));
  const { min, max } = getBounds(scene);
  transformScene(scene, matrix(0, 1, [-min[0], -min[1], -(min[2] + max[2]) / 2]));
  // Lưới là ~35k dải rời (4 đỉnh/dải, không chung cạnh) nên simplify không giảm được: giữ nguyên.
  await finish(doc, join(OUT_DIR, 'goal.glb'));
}

let built = 0;
for (const [src, build] of [
  [BALL_SRC, buildBall],
  [GOAL_SRC, buildGoal],
]) {
  if (!existsSync(src)) {
    console.warn(`Bỏ qua: thiếu ${src} — game dùng bản vẽ bằng code.`);
    continue;
  }
  await build();
  built++;
}
if (built === 0) console.warn('Không dựng được đạo cụ nào (xem assets-src/sketchfab/).');
