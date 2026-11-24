/**
 * Cầu thủ dùng model Mixamo (task 5.18d): nạp `public/models/player.glb` do `pnpm assets` sinh ra
 * (không commit — giấy phép Mixamo). Thiếu file thì `loadPlayerModel` trả null và trận giữ cầu thủ
 * khối tạm. Mỗi cầu thủ là một bản sao skeleton + `AnimationMixer`; chọn clip ở `render/animation.ts`.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { MatchState, PlayerState, TeamSide } from '@pitch/sim';
import {
  baseClip,
  diveClip,
  heldBall,
  locomotionFor,
  type ClipName,
  type ClipSpeeds,
  type HeldBall,
} from '../render/animation';
import { KIT_REGION_BOUNDS, REGION, kitColors } from '../render/kit';
import { COLORS } from '../render/colors';
import { playerNumber } from '../render/view';
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
    tagBodyRegions(gltf.scene);
    return { scene: gltf.scene, clips: new Map(gltf.animations.map((a) => [a.name, a])), speeds };
  } catch {
    return null;
  }
}

/**
 * Gắn thuộc tính `aRestPos` (toạ độ ở tư thế gốc chữ T, mét) để fragment shader phân vùng
 * áo/quần/tất/da/tóc/giày sắc nét từng pixel mà không bị nội suy nhầm qua các vùng trung gian.
 * Geometry dùng chung cho mọi bản sao nên chỉ tính một lần lúc nạp.
 */
function tagBodyRegions(scene: THREE.Object3D): void {
  scene.updateMatrixWorld(true);
  const v = new THREE.Vector3();
  scene.traverse((o) => {
    if (!(o instanceof THREE.SkinnedMesh)) return;
    o.skeleton.update();
    const count = (o.geometry as THREE.BufferGeometry).getAttribute('position').count;
    const restPos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      o.getVertexPosition(i, v).applyMatrix4(o.matrixWorld);
      restPos[i * 3] = v.x;
      restPos[i * 3 + 1] = v.y;
      restPos[i * 3 + 2] = v.z;
    }
    o.geometry.setAttribute('aRestPos', new THREE.BufferAttribute(restPos, 3));
  });
}

const f32 = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));

const REGION_GLSL = (() => {
  const b = KIT_REGION_BOUNDS;
  return `int bodyRegionFrag(vec3 p) {
  float ax = abs(p.x);
  float y = p.y;
  float z = p.z;
  if (ax > ${f32(b.shoulderX)} && y > ${f32(b.sleeveArmMinY)}) {
    return ax < ${f32(b.sleeveEndX)} ? ${REGION.shirt} : ${REGION.skin};
  }
  float hairY = max(${f32(b.hairBackMinY)}, ${f32(b.hairY)} + min(0.0, z) * ${f32(b.hairBackSlope)});
  if (y > hairY) return ${REGION.hair};
  float neckDist = length(vec2(p.x, (z - ${f32(b.neckCenterZ)}) * ${f32(b.neckScaleZ)}));
  if (y > ${f32(b.headY)} || (y > ${f32(b.collarY)} && neckDist < ${f32(b.neckRadius)})) {
    return ${REGION.skin};
  }
  if (y > ${f32(b.waistY)}) return ${REGION.shirt};
  if (y > ${f32(b.shortsHemY)}) return ${REGION.shorts};
  if (y > ${f32(b.sockTopY)}) return ${REGION.skin};
  if (y > ${f32(b.bootTopY)}) return ${REGION.socks};
  return ${REGION.boots};
}`;
})();

/** Material tô màu theo vùng: bảng màu `palette` (thứ tự REGION) đè lên màu gốc, chiếu sáng per-pixel. */
function kitMaterial(palette: readonly number[]): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0.04 });
  const pal = palette.map((c) => new THREE.Color(c));
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uPal = { value: pal };
    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec3 aRestPos;
varying vec3 vRestPos;`,
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vRestPos = aRestPos;`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform vec3 uPal[${pal.length}];
varying vec3 vRestPos;
${REGION_GLSL}`,
      )
      .replace(
        'vec4 diffuseColor = vec4( diffuse, opacity );',
        'vec4 diffuseColor = vec4( uPal[bodyRegionFrag(vRestPos)], opacity );',
      );
  };
  // Mọi bộ quần áo cùng một chương trình shader, chỉ khác uniform.
  m.customProgramCacheKey = () => 'kit-std';
  return m;
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
  /** Model cũ (chưa chạy lại `pnpm assets`) thiếu clip này thì phát clip thay thế. */
  fallback?: ClipName;
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
  // Chuyền chân phải gốc: chạm ~0,43 s.
  pass_alt: { start: 0, speed: 1.5, fallback: 'pass' },
  shot: { start: 0.3, speed: 1.6 },
  penalty: { start: 0.6, speed: 1.5 },
  header: { start: 0.45, speed: 1.3 },
  // Đầu chạm bóng ~0,56 s; phần sau đứng chờ dài nên cắt ở 1,6 s.
  header_alt: { start: 0.15, speed: 1.3, stop: 1.6, fallback: 'header' },
  // Móc bóng: bàn chân nhanh nhất ~0,77 s; sim cho bóng đi ngay nên bỏ đoạn bật người lên.
  scissor: { start: 0.62, speed: 1.2, fallback: 'shot' },
  throw_in: { start: 1.4, speed: 1.3 },
  tackle: { start: 0, speed: 1.5 },
  trip: { start: 0, speed: 1.5, next: 'get_up' },
  stumble: { start: 0, speed: 1.2, source: 'trip', stop: 0.35 },
  get_up: { start: 0.4, speed: 2.4 },
  // Bắt bóng phát lúc sim đã ôm bóng: `start` = lúc hai tay khép − ~0,15 s × `speed` (đo ở `pnpm assets`).
  gk_scoop: { start: 0.45, speed: 1.2, fallback: 'gk_catch' },
  gk_catch_low: { start: 0.22, speed: 1.2, fallback: 'gk_catch' },
  gk_catch: { start: 0.1, speed: 1.2 },
  gk_catch_high: { start: 0.65, speed: 1.2, fallback: 'gk_catch' },
  // Bật nhảy bắt bóng bổng: hai tay khép trên đầu ~1,49 s (bỏ đoạn chạy lên vì hông đã ghim).
  gk_catch_leap: { start: 1.1, speed: 1.6, fallback: 'gk_catch_high' },
  // Đổ người sát cỏ: tay chạm bóng ~0,85 s, phát sớm như bay người (~0,4 s sau khi bắt đầu lao).
  gk_block_left: { start: 0.3, speed: 1.4, fallback: 'gk_dive_left' },
  gk_block_right: { start: 0.3, speed: 1.4, fallback: 'gk_dive_right' },
  gk_block_alt_left: { start: 0.5, speed: 1.4, fallback: 'gk_block_left' },
  gk_block_alt_right: { start: 0.5, speed: 1.4, fallback: 'gk_block_right' },
  // Thủng lưới: bóng đã qua, nhảy với cao nhất (0,73 s) ngay sau đó.
  gk_miss: { start: 0.45, speed: 1.3 },
  gk_dive_left: { start: 0.35, speed: 1.4 },
  gk_dive_right: { start: 0.35, speed: 1.4 },
  // Bay người vươn cao: chế từ clip bay người (`pnpm assets`), cùng nhịp.
  gk_dive_high_left: { start: 0.35, speed: 1.4, fallback: 'gk_dive_left' },
  gk_dive_high_right: { start: 0.35, speed: 1.4, fallback: 'gk_dive_right' },
  gk_throw: { start: 0.9, speed: 1.3 },
  gk_kick: { start: 1.47, speed: 1.3 },
};
const FADE_SEC = 0.15;
/** Clip có bản thay thế: phát xen kẽ để động tác lặp lại không giống hệt nhau. */
const ALTERNATES: Partial<Record<ClipName, ClipName>> = {
  pass: 'pass_alt',
  pass_l: 'pass_alt_l',
  header: 'header_alt',
  gk_block_left: 'gk_block_alt_left',
  gk_block_right: 'gk_block_alt_right',
};
/** Tốc độ phát clip một lần dao động ±chừng này (tỉ lệ) giữa các lần. */
const SPEED_JITTER = 0.08;
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
/** Đang chạy: tốc độ phải ở mức đứng liên tục chừng này (s) mới đổi sang idle — quay đầu làm vận tốc qua 0 trong 80–270 ms (C5 G1). */
const IDLE_ENTER_SEC = 0.3;
const IDLE_CLIPS = new Set<ClipName | undefined>(['idle', 'gk_idle']);

/** Material dùng chung cho mọi cầu thủ cùng bộ màu (áo, quần, tất, da, tóc). */
export class ModelMaterials {
  private readonly kits = new Map<string, THREE.MeshStandardMaterial>();

  kit(palette: readonly number[]): THREE.MeshStandardMaterial {
    const key = palette.join(',');
    let m = this.kits.get(key);
    if (!m) {
      m = kitMaterial(palette);
      this.kits.set(key, m);
    }
    return m;
  }

  dispose(): void {
    for (const m of this.kits.values()) m.dispose();
    this.kits.clear();
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
  /** Đếm số lần phát clip một lần: chọn bản thay thế và độ dao động tốc độ (tất định theo người). */
  private variant: number;
  /** Số giây liên tục sim báo đứng yên trong lúc clip lặp vẫn là clip di chuyển. */
  private slowSec = 0;
  private readonly team: TeamSide;
  private readonly isKeeper: boolean;
  private readonly playerId: string;
  private readonly materials: ModelMaterials;

  constructor(model: PlayerModel, p: PlayerState, materials: ModelMaterials, avatarSeed?: string) {
    this.root = cloneSkinned(model.scene);
    this.team = p.team;
    this.isKeeper = p.position === 'GK';
    this.playerId = p.id;
    this.materials = materials;
    this.root.traverse((o) => {
      if (!(o instanceof THREE.SkinnedMesh)) return;
      o.castShadow = true;
      // Khung bao của skinned mesh không theo hoạt ảnh: tắt cắt khung để không biến mất khi ngã.
      o.frustumCulled = false;
    });
    this.setAvatarSeed(avatarSeed);
    this.attachNumber(playerNumber(p.id));
    this.speeds = model.speeds;
    this.variant = playerNumber(p.id);
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
      const next = ONE_SHOT[baseClip(this.oneShot.clip)]?.next;
      // clampWhenFinished giữ khung cuối với trọng số 1: không fade ra thì trộn mãi với clip lặp.
      e.action.fadeOut(FADE_SEC);
      this.oneShot = null;
      if (next) this.trigger(next);
    });
  }

  /** Cập nhật màu da/tóc theo `avatar_seed` của thẻ (hoặc theo id nếu chưa có thẻ). */
  setAvatarSeed(avatarSeed?: string): void {
    const material = this.materials.kit(
      kitColors(this.team, this.isKeeper, this.playerId, avatarSeed),
    );
    this.root.traverse((o) => {
      if (o instanceof THREE.SkinnedMesh && o.material !== material) {
        o.material = material;
      }
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

  /** Clip đang chủ đạo (một lần nếu có, không thì clip lặp) — cho công cụ soi chuyển động. */
  get clipName(): string {
    return this.oneShot?.clip ?? this.loop?.getClip().name ?? '';
  }

  /** Phát clip một lần (chuyền, sút, xoạc…), đè lên clip lặp đang chạy. */
  trigger(wanted: ClipName): void {
    this.variant += 1;
    const alt = ALTERNATES[wanted];
    const clip = alt && this.variant % 2 === 1 && this.actions.has(alt) ? alt : wanted;
    this.play(clip, 1 + SPEED_JITTER * Math.sin(this.variant * 2.4));
  }

  private play(clip: ClipName, jitter: number): void {
    const base = ONE_SHOT[baseClip(clip)] ?? { start: 0, speed: 1 };
    const cfg = { ...base, speed: base.speed * jitter };
    // Model cũ chưa dựng lại (`pnpm assets`): thiếu bản chân trái thì dùng bản chân phải.
    const action =
      this.actions.get(cfg.source ?? clip) ?? this.actions.get(cfg.source ?? baseClip(clip));
    if (!action) {
      if (cfg.fallback) this.play(cfg.fallback, jitter);
      return;
    }
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
    // Clip một lần (bắt bóng, sút…) chen vào thì đếm lại thời gian đứng từ đầu.
    if (this.oneShot) this.slowSec = 0;
    if (!this.oneShot) {
      const current = this.loop?.getClip().name as ClipName | undefined;
      const loco = locomotionFor(p, this.speeds, current);
      lean = loco.lean;
      const stopping =
        IDLE_CLIPS.has(loco.clip) && current !== undefined && !IDLE_CLIPS.has(current);
      this.slowSec = stopping ? this.slowSec + dt : 0;
      // Dừng thoáng qua: giữ clip đang chạy (không đổi tốc độ phát) tới khi đứng đủ lâu.
      const action =
        stopping && this.slowSec < IDLE_ENTER_SEC ? this.loop : this.actions.get(loco.clip);
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
      if (action && action === this.actions.get(loco.clip)) action.timeScale = loco.timeScale;
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
    const stop = ONE_SHOT[baseClip(shot.clip)]?.stop;
    if (stop !== undefined && shot.action.time >= stop) return true;
    return (
      GROUNDED.has(baseClip(shot.clip)) &&
      state.phase === 'play' &&
      state.tackleRecovery[p.id] === undefined &&
      Math.hypot(p.vel.x, p.vel.y) > MOVING_SPEED
    );
  }
}
