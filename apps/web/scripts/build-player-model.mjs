/**
 * `pnpm assets` — dựng model cầu thủ cho trận 3D (task 5.18d, ADR-0009) từ file Mixamo gốc trong
 * `assets-src/mixamo/` (không commit: giấy phép Mixamo không cho phát tán file gốc, repo public).
 * Kết quả `apps/web/public/models/player.glb` cũng bị Git bỏ qua; thiếu file thì game dùng cầu thủ khối.
 *
 * Việc làm: nạp Y Bot + các clip đã chọn, ghim tại chỗ (sim tự di chuyển cầu thủ: bỏ dịch chuyển
 * ngang của hông, giữ độ cao để ngã/xoạc vẫn thấp người), đổi cm → m, xuất GLB.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import { GLTFExporter } from 'three/examples/jsm/exporters/GLTFExporter.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, meshopt, prune, resample, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(root, 'assets-src', 'mixamo');
const PACK = join(SRC, 'soccer-pack');
const OUT = join(root, 'apps', 'web', 'public', 'models', 'player.glb');

/** Tên clip trong game → file trong Soccer Game Pack. Đổi ở đây thì sửa cả `ClipName` ở web. */
const CLIPS = {
  idle: 'offensive idle',
  jog: 'jog forward',
  jog_back: 'jog backward',
  strafe_left: 'jog strafe left',
  strafe_right: 'jog strafe right',
  pass: 'kick soccerball',
  shot: 'strike foward jog',
  penalty: 'soccer penalty kick',
  header: 'header soccerball',
  tackle: 'soccer tackle (2)',
  trip: 'soccer trip',
  fallen: 'fallen idle',
  get_up: 'standing up',
  throw_in: 'throw in',
  gk_idle: 'goalkeeper idle (2)',
  gk_sidestep: 'goalkeeper sidestep',
  gk_catch: 'goalkeeper catch (2)',
  // Mixamo quay mặt về +Z nên +X là bên trái nhân vật: bản gốc lao sang trái (dx +2,2 m), (2) sang phải.
  gk_dive_left: 'goalkeeper diving save',
  gk_dive_right: 'goalkeeper diving save (2)',
  gk_throw: 'goalkeeper overhand throw',
  gk_kick: 'goalkeeper drop kick',
};

/** Node không có FileReader; GLTFExporter (binary) chỉ cần readAsArrayBuffer + onloadend. */
globalThis.FileReader ??= class {
  readAsArrayBuffer(blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
};

const loader = new FBXLoader();
function loadFbx(path) {
  const buf = readFileSync(path);
  return loader.parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
}

/** Ngón tay không nhìn thấy từ camera truyền hình: bỏ track để file nhẹ. */
const FINGER = /(Thumb|Index|Middle|Ring|Pinky)\d/;

/** Ghim hông tại chỗ: x/z giữ như khung đầu, y (độ cao) giữ nguyên. */
function pinInPlace(clip) {
  const hips = clip.tracks.find((t) => t.name.endsWith('Hips.position'));
  if (!hips) return;
  const v = hips.values;
  for (let i = 0; i < v.length; i += 3) {
    v[i] = v[0];
    v[i + 2] = v[2];
  }
}

const characterPath = join(SRC, 'ybot.fbx');
if (!existsSync(characterPath)) {
  console.error(`Thiếu ${characterPath} — tải Y Bot từ Mixamo (xem docs/plans 5.18d).`);
  process.exit(1);
}
const character = loadFbx(characterPath);
character.animations = [];

const clips = [];
for (const [name, file] of Object.entries(CLIPS)) {
  const path = join(PACK, `${file}.fbx`);
  if (!existsSync(path)) {
    console.error(`Thiếu ${path}`);
    process.exit(1);
  }
  const clip = loadFbx(path).animations[0];
  clip.name = name;
  clip.tracks = clip.tracks.filter((t) => !FINGER.test(t.name));
  pinInPlace(clip);
  clips.push(clip);
}

// Mixamo dùng cm; bọc ngoài một nhóm thu nhỏ 0,01 để model cao ~1,8 m.
const scene = new THREE.Group();
scene.name = 'Player';
character.scale.setScalar(0.01);
scene.add(character);
scene.updateMatrixWorld(true);

const glb = await new GLTFExporter().parseAsync(scene, {
  binary: true,
  animations: clips,
  onlyVisible: false,
});
// Nén: bỏ khung hình thừa (nội suy tuyến tính đã đủ), giảm đa giác (camera ở xa, không thấy khác),
// gộp dữ liệu trùng, nén meshopt (EXT_meshopt_compression — web giải bằng MeshoptDecoder của Three.js).
await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
const doc = await io.readBinary(new Uint8Array(glb));
await doc.transform(
  resample({ tolerance: 1e-4 }),
  weld(),
  simplify({ simplifier: MeshoptSimplifier, ratio: 0.35, error: 0.002 }),
  dedup(),
  prune(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
const out = await io.writeBinary(doc);
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, out);
console.log(`Đã ghi ${OUT} (${(out.byteLength / 1e6).toFixed(2)} MB, ${clips.length} clip)`);
