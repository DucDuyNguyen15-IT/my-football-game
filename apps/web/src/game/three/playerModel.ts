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
import {
  diveClip,
  heldBall,
  locomotionFor,
  type ClipName,
  type ClipSpeeds,
  type HeldBall,
} from '../render/animation';
import { COLORS } from '../render/colors';
import { shirtNumber } from '../render/view';
import { numberTexture } from './actors';

export const PLAYER_MODEL_URL = '/models/player.glb';

export interface PlayerModel {
  scene: THREE.Object3D;
  clips: ReadonlyMap<string, THREE.AnimationClip>;
  /** Tốc độ bước đo lúc `pnpm assets` (extras của node `Player`); file cũ không có thì rỗng. */
  speeds: ClipSpeeds;
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
    let speeds: ClipSpeeds = {};
    gltf.scene.traverse((o) => {
      const s = (o.userData as { clipSpeeds?: ClipSpeeds }).clipSpeeds;
      if (s) speeds = s;
    });
    return { scene: gltf.scene, clips: new Map(gltf.animations.map((a) => [a.name, a])), speeds };
  } catch {
    return null;
  }
}

interface OneShot {
  /** Bắt đầu từ giây này của clip. */
  start: number;
  /** Phát nhanh chừng này lần. */
  speed: number;
  /** Clip nối tiếp ngay sau (ngã → đứng dậy). */
  next?: ClipName;
  /** Dùng hoạt ảnh của clip khác (vấp = đoạn đầu của ngã). */
  source?: ClipName;
  /** Dừng ở giây này của clip rồi trả về chạy/đứng. */
  stop?: number;
}

/**
 * Clip một lần. Sim cho bóng đi ngay lúc bấm nên `start` cắt đoạn chạy đà, chừa lại nhịp vung chân
 * ngắn trước lúc chạm (đo tốc độ bàn chân): chuyền chạm ~0,23 s, sút ~0,45 s, phạt đền ~0,75 s.
 * Xoạc nằm xuống ~0,5 s, nằm tới ~0,95 s, đứng dậy xong 1,77 s — phát vừa khung 1,2 s sim khoá
 * (`TACKLE_RECOVERY_TICKS`); ngã + đứng dậy vừa 1,5 s (`VICTIM_FALL_TICKS`).
 * Ném biên: hai tay giơ bóng qua đầu 1,0–1,5 s, thả bóng ~1,55 s — chờ ném thì đứng ở 1,2 s
 * (`THROW_IN_HOLD_SEC`), ném thì phát từ nhịp vung ra trước.
 * Thủ môn: sim lấy đà KEEPER_WINDUP_TICKS (0,5 s) rồi mới nhả bóng, clip phát từ lúc bắt đầu lấy đà
 * nên `start` = khung chạm − 0,5 s × `speed`: ném rời tay ~1,55 s, phát bóng chạm chân ~2,12 s.
 */
const ONE_SHOT: Partial<Record<ClipName, OneShot>> = {
  pass: { start: 0.1, speed: 1.5 },
  shot: { start: 0.3, speed: 1.6 },
  penalty: { start: 0.6, speed: 1.5 },
  header: { start: 0.45, speed: 1.3 },
  throw_in: { start: 1.4, speed: 1.3 },
  tackle: { start: 0, speed: 1.5 },
  trip: { start: 0, speed: 1.5, next: 'get_up' },
  stumble: { start: 0, speed: 1.2, source: 'trip', stop: 0.35 },
  get_up: { start: 0.4, speed: 2.4 },
  gk_catch: { start: 0.1, speed: 1.2 },
  gk_dive_left: { start: 0.35, speed: 1.4 },
  gk_dive_right: { start: 0.35, speed: 1.4 },
  gk_throw: { start: 0.9, speed: 1.3 },
  gk_kick: { start: 1.47, speed: 1.3 },
};
const FADE_SEC = 0.15;
/** Clip nằm sân: sim đã cho chạy lại (hết khoá, bóng sống) mà còn phát thì cắt về chạy. */
const GROUNDED = new Set<ClipName>(['tackle', 'trip', 'get_up']);
const MOVING_SPEED = 1;
/** Clip chạy tiến (cùng kiểu chu kỳ bước): đổi qua lại thì giữ pha. */
const STRIDE = new Set<ClipName>(['walk', 'jog', 'run']);
/** Khung của clip `throw_in` giữ nguyên lúc chờ ném: hai tay cầm bóng trên đầu. */
const THROW_IN_HOLD_SEC = 1.2;
/** Hai bàn tay gần hơn chừng này (m) thì bóng nằm giữa hai tay; xa hơn thì kẹp bên tay phải. */
const TWO_HAND_GRIP = 0.45;
/** Bóng lệch khỏi cổ tay ra ngoài chừng này (m) để nằm trong lòng bàn tay, không lún vào người. */
const PALM_OFFSET = 0.12;
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
const tmpHand = new THREE.Vector3();
const isThrowing = (held: HeldBall | null, p: PlayerState) =>
  held?.grip === 'throw_in' && held.playerId === p.id;

export class ModelActor {
  readonly root: THREE.Object3D;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipName, THREE.AnimationAction>();
  private loop: THREE.AnimationAction | null = null;
  /** `hold`: khung đứng yên (chờ ném biên) — hết cảnh thì nhả. */
  private oneShot: { clip: ClipName; action: THREE.AnimationAction; hold?: true } | null = null;
  private readonly speeds: ClipSpeeds;
  private readonly spine: THREE.Object3D | undefined;
  private readonly hands: readonly [THREE.Object3D, THREE.Object3D] | null;

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
    this.speeds = model.speeds;
    this.spine = this.root.getObjectByName('mixamorigSpine');
    const right = this.root.getObjectByName('mixamorigRightHand');
    const left = this.root.getObjectByName('mixamorigLeftHand');
    this.hands = right && left ? [right, left] : null;

    this.mixer = new THREE.AnimationMixer(this.root);
    for (const [name, clip] of model.clips) {
      this.actions.set(name as ClipName, this.mixer.clipAction(clip));
    }
    this.mixer.addEventListener('finished', (e) => {
      if (this.oneShot?.action !== e.action) return;
      const next = ONE_SHOT[this.oneShot.clip]?.next;
      // clampWhenFinished giữ khung cuối với trọng số 1: không fade ra thì trộn mãi với clip lặp.
      e.action.fadeOut(FADE_SEC);
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
    const cfg = ONE_SHOT[clip] ?? { start: 0, speed: 1 };
    const action = this.actions.get(cfg.source ?? clip);
    if (!action) return;
    if (this.oneShot?.action === action) {
      // Đang đứng ở khung giữ của chính clip này (chờ ném biên): chạy tiếp, không trộn với chính nó.
      action.paused = false;
      action.timeScale = cfg.speed;
      action.time = Math.min(cfg.start, action.getClip().duration * 0.9);
      this.oneShot = { clip, action };
      return;
    }
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

  /** Đứng yên ở giây `time` của `clip` (tư thế giữ bóng) tới khi `trigger` chạy tiếp hoặc hết cảnh. */
  private holdPose(clip: ClipName, time: number): void {
    const action = this.actions.get(clip);
    if (!action || this.oneShot?.action === action) return;
    this.oneShot?.action.fadeOut(FADE_SEC);
    action.reset();
    action.setLoop(THREE.LoopOnce, 1);
    action.clampWhenFinished = true;
    action.time = time;
    action.paused = true;
    action.fadeIn(FADE_SEC).play();
    this.loop?.fadeOut(FADE_SEC);
    this.loop = null;
    this.oneShot = { clip, action, hold: true };
  }

  /**
   * Điểm bóng nằm trong tay (toạ độ thế giới), gọi sau `update` của khung hình. Hai tay khép (bắt
   * bóng, ném biên) thì giữa hai tay; tay buông thì kẹp bên tay phải. False nếu model thiếu xương tay.
   */
  ballInHands(out: THREE.Vector3): boolean {
    if (!this.hands) return false;
    const [right, left] = this.hands;
    right.getWorldPosition(out);
    left.getWorldPosition(tmpHand);
    if (out.distanceTo(tmpHand) < TWO_HAND_GRIP) {
      out.add(tmpHand).multiplyScalar(0.5);
      return true;
    }
    // Đẩy bóng ra ngoài theo phương ngang từ trục người tới tay phải.
    this.root.getWorldPosition(tmpHand);
    tmpHand.set(out.x - tmpHand.x, 0, out.z - tmpHand.z);
    if (tmpHand.lengthSq() > 0) out.addScaledVector(tmpHand.normalize(), PALM_OFFSET);
    return true;
  }

  /** Mỗi khung hình: xoay người, chọn clip lặp theo vận tốc, chạy mixer. `dt` = 0 khi tạm dừng. */
  update(dt: number, p: PlayerState, state: MatchState, heading: number): void {
    const turn = wrapAngle(heading - this.root.rotation.y);
    this.root.rotation.y += turn * Math.min(1, TURN_RATE * dt);

    const held = heldBall(state);
    const throwing = isThrowing(held, p);
    if (this.oneShot && this.shouldEnd(this.oneShot, p, state, throwing)) {
      this.oneShot.action.fadeOut(FADE_SEC);
      this.oneShot = null;
    }
    if (throwing) this.holdPose('throw_in', THROW_IN_HOLD_SEC);
    if (!this.oneShot) {
      const dive = diveClip(p, state);
      if (dive) this.trigger(dive);
    }
    let lean = 0;
    if (!this.oneShot) {
      const current = this.loop?.getClip().name as ClipName | undefined;
      const loco = locomotionFor(p, this.speeds, current);
      lean = loco.lean;
      const action = this.actions.get(loco.clip);
      if (action && action !== this.loop) {
        action.reset().setLoop(THREE.LoopRepeat, Infinity);
        // Đi ↔ chạy ↔ chạy nhanh: giữ nhịp bước (cùng pha chu kỳ) để chân không giật khi trộn.
        if (this.loop && current && STRIDE.has(current) && STRIDE.has(loco.clip)) {
          const phase = this.loop.time / this.loop.getClip().duration;
          action.time = phase * action.getClip().duration;
        }
        action.fadeIn(FADE_SEC).play();
        this.loop?.fadeOut(FADE_SEC);
        this.loop = action;
      }
      if (action) action.timeScale = loco.timeScale;
    }
    this.mixer.update(dt);
    // Mixer ghi đè xoay xương mỗi khung nên cộng thêm sau đó; +X cục bộ của Spine = cúi về trước.
    if (this.spine && lean > 0) this.spine.rotation.x += lean;
  }

  /** Clip một lần đã tới điểm dừng (`stop`), hoặc nằm sân mà sim đã cho chạy lại. */
  private shouldEnd(
    shot: { clip: ClipName; action: THREE.AnimationAction; hold?: true },
    p: PlayerState,
    state: MatchState,
    throwing: boolean,
  ): boolean {
    if (shot.hold) return !throwing;
    const stop = ONE_SHOT[shot.clip]?.stop;
    if (stop !== undefined && shot.action.time >= stop) return true;
    return (
      GROUNDED.has(shot.clip) &&
      state.phase === 'play' &&
      state.tackleRecovery[p.id] === undefined &&
      Math.hypot(p.vel.x, p.vel.y) > MOVING_SPEED
    );
  }
}
