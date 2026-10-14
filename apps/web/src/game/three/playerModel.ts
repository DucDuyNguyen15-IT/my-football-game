/**
 * Cầu thủ dùng model Mixamo (task 5.18d): nạp `public/models/player.glb` do `pnpm assets` sinh ra
 * (không commit — giấy phép Mixamo). Thiếu file thì `loadPlayerModel` trả null và trận giữ cầu thủ
 * khối tạm. Mỗi cầu thủ là một bản sao skeleton + `AnimationMixer`; chọn clip ở `render/animation.ts`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { MatchState, PlayerState } from '@pitch/sim';
import { diveClip, locomotionFor, type ClipName } from '../render/animation';
import { COLORS } from '../render/colors';
import { shirtNumber } from '../render/view';
import { numberTexture } from './actors';

export const PLAYER_MODEL_URL = '/models/player.glb';

export interface PlayerModel {
  scene: THREE.Object3D;
  clips: ReadonlyMap<string, THREE.AnimationClip>;
}

/** Nạp model; null nếu chưa có file (máy chưa chạy `pnpm assets`) hoặc file hỏng. */
export async function loadPlayerModel(): Promise<PlayerModel | null> {
  const res = await fetch(PLAYER_MODEL_URL).catch(() => null);
  if (!res?.ok) return null;
  const buf = await res.arrayBuffer();
  // Dev server có thể trả index.html thay cho file thiếu: kiểm tra chữ ký GLB.
  const magic = new TextDecoder().decode(new Uint8Array(buf, 0, Math.min(4, buf.byteLength)));
  if (magic !== 'glTF') return null;
  try {
    const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(buf, '');
    return { scene: gltf.scene, clips: new Map(gltf.animations.map((a) => [a.name, a])) };
  } catch {
    return null;
  }
}

/**
 * Clip một lần: bắt đầu từ `start` giây (cắt đoạn chạy đà để cú chạm bóng khớp lúc sim cho bóng
 * đi), phát nhanh `speed` lần; `next` nối tiếp ngay sau (ngã → đứng dậy).
 */
const ONE_SHOT: Partial<Record<ClipName, { start: number; speed: number; next?: ClipName }>> = {
  pass: { start: 0.12, speed: 1.3 },
  shot: { start: 0.45, speed: 1.2 },
  penalty: { start: 0.75, speed: 1.2 },
  header: { start: 0.45, speed: 1.3 },
  throw_in: { start: 1.1, speed: 1.3 },
  tackle: { start: 0, speed: 1.25 },
  trip: { start: 0, speed: 1.2, next: 'get_up' },
  get_up: { start: 0, speed: 1.3 },
  gk_catch: { start: 0.1, speed: 1.2 },
  gk_dive_left: { start: 0.35, speed: 1.4 },
  gk_dive_right: { start: 0.35, speed: 1.4 },
  gk_throw: { start: 0.8, speed: 1.3 },
  gk_kick: { start: 1.2, speed: 1.3 },
};
const FADE_SEC = 0.15;
/** Tốc độ xoay người về hướng mặt (1/s), tránh giật khi sim đổi hướng tức thì. */
const TURN_RATE = 12;

/** Material dùng chung cho mọi cầu thủ cùng màu áo. */
export class ModelMaterials {
  private readonly bodies = new Map<number, THREE.MeshLambertMaterial>();
  readonly joints = new THREE.MeshLambertMaterial({ color: COLORS.shorts });

  body(color: number): THREE.MeshLambertMaterial {
    let m = this.bodies.get(color);
    if (!m) {
      m = new THREE.MeshLambertMaterial({ color });
      this.bodies.set(color, m);
    }
    return m;
  }
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

export class ModelActor {
  readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private loop: THREE.AnimationAction | null = null;
  private oneShot: { clip: ClipName; action: THREE.AnimationAction } | null = null;

  constructor(model: PlayerModel, p: PlayerState, materials: ModelMaterials) {
    this.root = cloneSkinned(model.scene);
    const color = p.position === 'GK' ? COLORS.keeper[p.team] : COLORS.team[p.team];
    this.root.traverse((o) => {
      if (!(o instanceof THREE.SkinnedMesh)) return;
      o.material = o.name.includes('Joints') ? materials.joints : materials.body(color);
      o.castShadow = true;
      // Khung bao của skinned mesh không theo hoạt ảnh: tắt cắt khung để không biến mất khi ngã.
      o.frustumCulled = false;
    });
    this.attachNumber(shirtNumber(p.slot));

    this.mixer = new THREE.AnimationMixer(this.root);
    for (const [name, clip] of model.clips) {
      this.actions.set(name as ClipName, this.mixer.clipAction(clip));
    }
    this.mixer.addEventListener('finished', (e) => {
      if (this.oneShot?.action !== e.action) return;
      const next = ONE_SHOT[this.oneShot.clip]?.next;
      this.oneShot = null;
      if (next) this.trigger(next);
    });
  }

  /** Số áo sau lưng, gắn vào xương ngực (Mixamo: đơn vị cm, +Z là phía trước). */
  private attachNumber(n: number): void {
    const spine = this.root.getObjectByName('mixamorigSpine2');
    if (!spine) return;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 26),
      new THREE.MeshBasicMaterial({
        map: numberTexture(n, COLORS.shirtInk),
        transparent: true,
        depthWrite: false,
      }),
    );
    plate.position.set(0, 6, -16);
    plate.rotation.y = Math.PI;
    spine.add(plate);
  }

  /** Phát clip một lần (chuyền, sút, xoạc…), đè lên clip lặp đang chạy. */
  trigger(clip: ClipName): void {
    const action = this.actions.get(clip);
    if (!action) return;
    const cfg = ONE_SHOT[clip] ?? { start: 0, speed: 1 };
    this.oneShot?.action.fadeOut(FADE_SEC);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.timeScale = cfg.speed;
    action.time = Math.min(cfg.start, action.getClip().duration * 0.9);
    action.fadeIn(FADE_SEC).play();
    this.loop?.fadeOut(FADE_SEC);
    this.loop = null;
    this.oneShot = { clip, action };
  }

  /** Mỗi khung hình: xoay người, chọn clip lặp theo vận tốc, chạy mixer. `dt` = 0 khi tạm dừng. */
  update(dt: number, p: PlayerState, state: MatchState, heading: number): void {
    const turn = wrapAngle(heading - this.root.rotation.y);
    this.root.rotation.y += turn * Math.min(1, TURN_RATE * dt);

    if (!this.oneShot) {
      const dive = diveClip(p, state);
      if (dive) this.trigger(dive);
    }
    if (!this.oneShot) {
      const loco = locomotionFor(p);
      const action = this.actions.get(loco.clip);
      if (action && action !== this.loop) {
        action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(FADE_SEC).play();
        this.loop?.fadeOut(FADE_SEC);
        this.loop = action;
      }
      if (action) action.timeScale = loco.timeScale;
    }
    this.mixer.update(dt);
  }
}
