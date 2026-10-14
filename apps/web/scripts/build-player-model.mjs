/**
 * `pnpm assets` — dựng model cầu thủ cho trận 3D (task 5.18d, ADR-0009) từ file Mixamo gốc trong
 * `assets-src/mixamo/` (không commit: giấy phép Mixamo không cho phát tán file gốc, repo public).
 * Kết quả `apps/web/public/models/player.glb` cũng bị Git bỏ qua; thiếu file thì game dùng cầu thủ khối.
 *
 * Việc làm: nạp Y Bot + các clip đã chọn, ghim tại chỗ (sim tự di chuyển cầu thủ: bỏ dịch chuyển
 * ngang của hông, giữ độ cao để ngã/xoạc vẫn thấp người), đổi cm → m, xuất GLB.
 */
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
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

/**
 * Clip thêm, không có trong Soccer Game Pack: tải riêng từ Mixamo (Y Bot, **bỏ** "In Place" để đo được
 * tốc độ bước) vào `assets-src/mixamo/` hoặc `assets-src/mixamo/extra/`, tên nào trong danh sách cũng
 * được (không phân biệt hoa thường). Thiếu file thì bỏ qua — game dùng `jog` thay thế.
 */
const OPTIONAL_CLIPS = {
  walk: ['walking', 'walk'],
  run: ['fast run', 'running', 'run'],
};

/** File `<tên>.fbx` đầu tiên khớp (không phân biệt hoa thường) trong các thư mục clip thêm. */
function findOptional(names) {
  for (const dir of [SRC, join(SRC, 'extra')]) {
    if (!existsSync(dir)) continue;
    const files = readdirSync(dir);
    for (const name of names) {
      const hit = files.find((f) => f.toLowerCase() === `${name}.fbx`);
      if (hit) return join(dir, hit);
    }
  }
  return null;
}
/** Clip chạy/đi: đo tốc độ bước (m/s) từ dịch chuyển hông trước khi ghim, để web phát khớp chân. */
const LOCOMOTION = new Set(['jog', 'jog_back', 'strafe_left', 'strafe_right', 'walk', 'run']);

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

/** Tốc độ ngang (m/s) của hông trong clip — Mixamo dùng cm. */
function strideSpeed(clip) {
  const hips = clip.tracks.find((t) => t.name.endsWith('Hips.position'));
  if (!hips || clip.duration === 0) return 0;
  const v = hips.values;
  const n = v.length - 3;
  return Math.hypot(v[n] - v[0], v[n + 2] - v[2]) / 100 / clip.duration;
}

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
// FBXLoader để lại thông tin biến đổi gốc trong userData → GLTFExporter ghi thành extras (~50 KB thừa).
character.traverse((o) => (o.userData = {}));

const clips = [];
/** Tốc độ bước của clip di chuyển, ghi vào `extras` của GLB (web đọc ở `playerModel.ts`). */
const clipSpeeds = {};
function addClip(name, path) {
  const clip = loadFbx(path).animations[0];
  clip.name = name;
  clip.tracks = clip.tracks.filter((t) => !FINGER.test(t.name));
  if (LOCOMOTION.has(name)) {
    const speed = strideSpeed(clip);
    if (speed > 0.3) clipSpeeds[name] = Number(speed.toFixed(2));
  }
  pinInPlace(clip);
  clips.push(clip);
}
for (const [name, file] of Object.entries(CLIPS)) {
  const path = join(PACK, `${file}.fbx`);
  if (!existsSync(path)) {
    console.error(`Thiếu ${path}`);
    process.exit(1);
  }
  addClip(name, path);
}
for (const [name, files] of Object.entries(OPTIONAL_CLIPS)) {
  const path = findOptional(files);
  if (path) addClip(name, path);
  else console.warn(`Bỏ qua clip "${name}": chưa có ${files.map((f) => `${f}.fbx`).join(' / ')}`);
}

// Mixamo dùng cm; bọc ngoài một nhóm thu nhỏ 0,01 để model cao ~1,8 m.
const scene = new THREE.Group();
scene.name = 'Player';
scene.userData = { clipSpeeds };
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
console.log('Tốc độ bước (m/s):', clipSpeeds);
console.log(`Đã ghi ${OUT} (${(out.byteLength / 1e6).toFixed(2)} MB, ${clips.length} clip)`);
