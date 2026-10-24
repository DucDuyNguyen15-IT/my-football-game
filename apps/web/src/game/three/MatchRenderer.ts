/**
 * Vẽ trận 3D bằng Three.js (ADR-0009): chỉ vẽ `MatchState` và đọc phím. Mọi luật/vật lý/AI nằm trong
 * `@pitch/sim`. Vòng lặp bước cố định: gom thời gian thực vào accumulator, chạy `step` đủ số tick
 * 1/60 s, rồi vẽ nội suy giữa tick trước và tick hiện tại (ARCHITECTURE §6).
 */
import * as THREE from 'three';
import {
  TICK_DT,
  createMatch,
  step,
  substitute,
  type MatchSetup,
  type MatchState,
  type PlayerState,
} from '@pitch/sim';
import type { GraphicsSettings, MatchBridge } from '../bridge';
import { NO_KEYS, createTapLatch, keyForCode, keysToInput, type KeyState } from '../input/keyboard';
import { followCamera, initialCamera, type CameraState } from '../render/camera';
import { COLORS } from '../render/colors';
import { animationEvents, heldBall, type HeldBall } from '../render/animation';
import { chargeMeter, lerp, lerpPos } from '../render/view';
import { ActorKit, BALL_DRAW_RADIUS, headingFromFacing } from './actors';
import { buildGrass, type Grass } from './grass';
import { buildPitch, NetRig } from './pitch';
import { loadPlayerModel, ModelActor, ModelMaterials, type PlayerModel } from './playerModel';
import { buildAdBoards, buildRoofs, buildStadium } from './stadium';
import { buildCrowd, type Crowd } from './crowd';
import {
  buildFloodSpots,
  buildSky,
  createPostFx,
  setFloodScale,
  setSkyLook,
  type PostFx,
} from './effects';
import { LIGHTING } from '../render/lighting';
import {
  DEFAULT_GRAPHICS,
  pixelRatioFor,
  resolveQuality,
  type QualitySettings,
} from '../render/quality';

/** Khung hình bị treo lâu (tab ẩn, debugger) thì bỏ bớt thời gian, không chạy dồn hàng trăm tick. */
const MAX_FRAME_SEC = 0.25;
/** Độ phơi sáng khi tone mapping ACES (mức Cao) — giữ màu đội gần token thiết kế. */
const TONE_EXPOSURE = 1.15;
const MARKER_Y = 2.2;
const CHARGE_BAR_Y = 2.75;
/** Màu thanh lực: chuyền xanh dương, sút màu chanh (nút chính). */
const CHARGE_COLORS = { ground: 0x5cc8ff, lob: 0x5cc8ff, shot: COLORS.accent } as const;
const DEBUG_REFRESH_MS = 250;
/** Bóng trượt giữa tay và vị trí sim trong chừng này giây (lúc bắt / ném), không nhảy cóc. */
const BALL_BLEND_SEC = 0.12;
/** Cầu thủ khối (chưa có model): bóng cầm tay trước người chừng này mét, cao ngang ngực / trên đầu. */
const HELD_BALL_AHEAD = 0.35;
const CHEST_BALL_Y = 1.1;
const OVERHEAD_BALL_Y = 2.1;

const isGoal = (a: MatchState, b: MatchState): boolean =>
  b.score.home + b.score.away > a.score.home + a.score.away;

/** Giải phóng geometry/material/texture của cả cây (dùng chung thì chỉ giải phóng một lần). */
function disposeTree(root: THREE.Object3D): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    geometries.add(obj.geometry as THREE.BufferGeometry);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats as THREE.Material[]) materials.add(m);
  });
  for (const g of geometries) g.dispose();
  for (const m of materials) {
    for (const value of Object.values(m)) {
      if (value instanceof THREE.Texture) value.dispose();
    }
    m.dispose();
  }
}

export class MatchRenderer {
  private prev: MatchState;
  private curr: MatchState;
  private accumulator = 0;
  private lastTime = 0;
  private raf = 0;
  private cam: CameraState = initialCamera();

  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
  private readonly actors = new Map<string, THREE.Object3D>();
  /** Cầu thủ dùng model Mixamo (sau khi nạp xong `player.glb`); trống thì vẽ cầu thủ khối. */
  private readonly models = new Map<string, ModelActor>();
  private playerModel: PlayerModel | null = null;
  private readonly kit = new ActorKit();
  private modelMaterials: ModelMaterials | null = null;
  private disposed = false;
  private readonly ball: THREE.Mesh;
  /** Vị trí bóng khung hình trước, để xoay bóng theo quãng đường lăn. */
  private readonly ballLast = new THREE.Vector3();
  private readonly sun: THREE.DirectionalLight;
  private readonly hemi: THREE.HemisphereLight;
  /** Bầu trời, mái khán đài, đèn spot: chỉ hiện ở mức Cao. */
  private readonly highOnly: { sky: THREE.Object3D; roofs: THREE.Object3D; spots: THREE.Object3D };
  private readonly postFx: PostFx;
  private readonly nets = new NetRig();
  private readonly grass: Grass;
  private readonly crowd: Crowd;
  private readonly boards: ReturnType<typeof buildAdBoards>;
  private q: QualitySettings = resolveQuality(DEFAULT_GRAPHICS);
  private readonly ballShadow: THREE.Mesh;
  private readonly marker: THREE.Mesh;
  private readonly chargeBar: ReturnType<ActorKit['createChargeBar']>;
  /** Bóng chuyển giữa tay và vị trí sim: trượt từ `ballBlendFrom` trong BALL_BLEND_SEC. */
  private ballInHands = false;
  private ballBlend = 0;
  private readonly ballBlendFrom = new THREE.Vector3();
  private readonly ballTarget = new THREE.Vector3();

  private held: KeyState = { ...NO_KEYS };
  private readonly taps = createTapLatch();
  private readonly resizeObserver: ResizeObserver;
  private debug: { el: HTMLElement; frames: number; at: number } | null = null;

  constructor(
    private readonly parent: HTMLElement,
    setup: MatchSetup,
    private readonly bridge?: MatchBridge,
    graphics: GraphicsSettings = DEFAULT_GRAPHICS,
  ) {
    this.curr = createMatch(setup);
    this.prev = this.curr;

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.toneMappingExposure = TONE_EXPOSURE;
    this.renderer.domElement.style.display = 'block';
    parent.appendChild(this.renderer.domElement);

    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.Fog(COLORS.bg, 70, 140);
    this.hemi = new THREE.HemisphereLight(0xcfe3ff, 0x0b1a10, 1.1);
    this.scene.add(this.hemi);
    // "Đèn pha" chính: chiếu chéo từ trên cao, đổ bóng cầu thủ xuống cỏ.
    const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
    sun.position.set(-18, 40, 22);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    // Bóng đổ mềm: bias nhỏ tránh sọc trên cỏ, normalBias tránh "bóng tách chân".
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.02;
    Object.assign(sun.shadow.camera, { left: -38, right: 38, top: 28, bottom: -28, far: 120 });
    this.sun = sun;
    this.scene.add(sun);

    this.scene.add(buildPitch(this.nets), buildStadium());
    this.grass = buildGrass();
    this.scene.add(this.grass.object);
    this.crowd = buildCrowd();
    this.boards = buildAdBoards();
    this.scene.add(this.crowd.object, this.boards.object);
    this.highOnly = { sky: buildSky(), roofs: buildRoofs(), spots: buildFloodSpots() };
    this.scene.add(this.highOnly.sky, this.highOnly.roofs, this.highOnly.spots);
    this.postFx = createPostFx(this.renderer, this.scene, this.camera);
    for (const p of this.curr.players) this.addActor(p);
    const { kit } = this;
    this.ball = kit.createBall();
    this.ballShadow = kit.createBlobShadow();
    this.marker = kit.createMarker();
    this.chargeBar = kit.createChargeBar();
    this.scene.add(this.ball, this.ballShadow, this.marker, this.chargeBar.group);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(parent);
    this.setGraphics(graphics);

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    if (import.meta.env.DEV) this.createDebugOverlay();

    this.draw(1, 0);
    this.bridge?.onState(this.curr);
    this.raf = requestAnimationFrame(this.frame);
    void loadPlayerModel().then((model) => {
      if (model && !this.disposed) this.useModel(model);
    });
  }

  /** Nhân vật cho cầu thủ mới xuất hiện (đầu trận, người vào thay): model nếu đã nạp, không thì khối. */
  private addActor(p: PlayerState): THREE.Object3D {
    let root: THREE.Object3D;
    if (this.playerModel && this.modelMaterials) {
      const actor = new ModelActor(this.playerModel, p, this.modelMaterials);
      this.models.set(p.id, actor);
      root = actor.root;
    } else {
      root = this.kit.createPlayer(p);
    }
    this.actors.set(p.id, root);
    this.scene.add(root);
    return root;
  }

  /** Lệnh từ React (thay người) áp vào sim; lệnh sai luật bị sim từ chối, bỏ qua. */
  private applyCommands(): void {
    const commands = this.bridge?.takeCommands?.() ?? [];
    if (commands.length === 0) return;
    for (const c of commands) {
      const r = substitute(this.curr, 'home', c.outId, c.benchSlot);
      if (r.ok) this.curr = r.state;
    }
    // Người vào đứng đúng chỗ người ra: không nội suy từ tick trước.
    this.prev = this.curr;
    this.bridge?.onState(this.curr);
  }

  /** Thay cầu thủ khối bằng model có hoạt ảnh (nạp xong sau khi trận đã chạy). */
  private useModel(model: PlayerModel): void {
    this.playerModel = model;
    const materials = new ModelMaterials();
    this.modelMaterials = materials;
    for (const p of this.curr.players) {
      const placeholder = this.actors.get(p.id);
      const actor = new ModelActor(model, p, materials);
      if (placeholder) {
        actor.root.position.copy(placeholder.position);
        actor.root.rotation.y = placeholder.rotation.y;
        this.scene.remove(placeholder);
      }
      this.actors.set(p.id, actor.root);
      this.models.set(p.id, actor);
      this.scene.add(actor.root);
    }
  }

  setGraphics(graphics: GraphicsSettings): void {
    const q = resolveQuality(graphics);
    this.q = q;
    const { renderer, sun } = this;
    renderer.setPixelRatio(pixelRatioFor(q, window.devicePixelRatio));
    const shadowType = q.softShadows ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
    const toneMapping = q.postFx ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    const recompile =
      renderer.shadowMap.enabled !== q.shadows ||
      renderer.shadowMap.type !== shadowType ||
      renderer.toneMapping !== toneMapping;
    renderer.shadowMap.enabled = q.shadows;
    renderer.shadowMap.type = shadowType;
    renderer.toneMapping = toneMapping;
    if (sun.shadow.mapSize.x !== q.shadowMapSize) {
      sun.shadow.mapSize.set(q.shadowMapSize, q.shadowMapSize);
      // Map cũ đúng kích thước cũ: bỏ đi để Three.js tạo lại.
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
    this.highOnly.sky.visible = q.skyAndRoof;
    this.highOnly.roofs.visible = q.skyAndRoof;
    this.highOnly.spots.visible = q.floodSpots;
    this.grass.object.visible = q.grass3d;
    this.crowd.object.visible = q.crowd;
    // Có vòm trời thì sương mù xa hơn để không phủ mất khán đài.
    if (this.scene.fog instanceof THREE.Fog) this.scene.fog.far = q.skyAndRoof ? 220 : 140;
    this.postFx.setBloom(q.bloomStrength);
    this.postFx.setAo(q.ssao);
    this.applyLighting(graphics);
    if (recompile) {
      // Material phải biên dịch lại shader khi đổi shadow map / tone mapping.
      this.scene.traverse((obj) => {
        if (!(obj instanceof THREE.Mesh)) return;
        const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
        for (const m of mats as THREE.Material[]) m.needsUpdate = true;
      });
    }
    this.resize();
  }

  /** Ánh sáng theo thời điểm trận (đêm / hoàng hôn / ngày). */
  private applyLighting(graphics: GraphicsSettings): void {
    const l = LIGHTING[graphics.timeOfDay];
    const { scene, hemi, sun } = this;
    if (scene.background instanceof THREE.Color) scene.background.setHex(l.background);
    // Sương mù cùng màu chân trời để khán đài tan vào nền.
    scene.fog?.color.setHex(this.q.skyAndRoof ? l.skyHorizon : l.background);
    hemi.color.setHex(l.hemiSky);
    hemi.groundColor.setHex(l.hemiGround);
    hemi.intensity = l.hemiIntensity;
    sun.color.setHex(l.sunColor);
    sun.intensity = l.sunIntensity;
    sun.position.set(...l.sunPos);
    setSkyLook(this.highOnly.sky, l.skyHorizon, l.skyZenith, l.stars);
    setFloodScale(this.highOnly.spots, l.floodScale);
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.resizeObserver.disconnect();
    this.postFx.dispose();
    disposeTree(this.scene);
    if (this.playerModel) disposeTree(this.playerModel.scene);
    this.renderer.dispose();
    // Trình duyệt chỉ cho ~16 WebGL context sống cùng lúc; trả ngay thay vì chờ GC.
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.debug?.el.remove();
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const name = keyForCode(e.code);
    if (!name) return;
    // Mũi tên không cuộn trang.
    e.preventDefault();
    if (!e.repeat) this.taps.press(name);
    this.held = { ...this.held, [name]: true };
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    const name = keyForCode(e.code);
    if (name) this.held = { ...this.held, [name]: false };
  };

  /** Mất focus (Alt+Tab) thì trình duyệt không gửi keyup — coi như nhả hết phím. */
  private readonly onBlur = (): void => {
    this.held = { ...NO_KEYS };
  };

  private readonly frame = (now: number): void => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = this.lastTime === 0 ? 0 : Math.min((now - this.lastTime) / 1000, MAX_FRAME_SEC);
    this.lastTime = now;
    this.applyCommands();

    if (this.bridge?.isPaused()) {
      // Tạm dừng: không chạy sim, không dồn thời gian; phím bấm trong menu không tính vào trận.
      this.accumulator = 0;
      this.taps.consume();
    } else {
      this.accumulator += dt;
      const input = keysToInput(this.taps.sample(this.held));
      let ticked = false;
      while (this.accumulator >= TICK_DT) {
        this.prev = this.curr;
        this.curr = step(this.curr, input);
        this.accumulator -= TICK_DT;
        ticked = true;
        for (const e of animationEvents(this.prev, this.curr))
          this.models.get(e.playerId)?.trigger(e.clip);
        if (isGoal(this.prev, this.curr)) this.onGoal();
      }
      if (ticked) {
        this.taps.consume();
        this.bridge?.onState(this.curr);
      }
    }
    this.draw(this.accumulator / TICK_DT, dt, this.bridge?.isPaused() ? 0 : dt);
    if (this.q.postFx) this.postFx.render();
    else this.renderer.render(this.scene, this.camera);
    if (this.debug) this.refreshDebug(now);
  };

  /** Bàn thắng vừa được ghi (tick này): lưới rung ở khung thành bóng vào. */
  private onGoal(): void {
    const { ball } = this.curr;
    const side = ball.pos.x >= 0 ? 1 : -1;
    this.nets.hit(side, new THREE.Vector3(ball.pos.x, BALL_DRAW_RADIUS + ball.z, ball.pos.y));
    this.crowd.cheer();
  }

  /** Vẽ trạng thái nội suy: `alpha` = 0 là tick trước, 1 là tick hiện tại. */
  private draw(alpha: number, dt: number, animDt = dt): void {
    const { prev, curr } = this;
    const prevById = new Map(prev.players.map((p) => [p.id, p]));
    const onPitch = new Set<string>();

    for (const p of curr.players) {
      const actor = this.actors.get(p.id) ?? this.addActor(p);
      onPitch.add(p.id);
      const pos = lerpPos((prevById.get(p.id) ?? p).pos, p.pos, alpha);
      actor.position.set(pos.x, 0, pos.y);
      const model = this.models.get(p.id);
      if (model) model.update(animDt, p, curr, headingFromFacing(p.facing));
      else actor.rotation.y = headingFromFacing(p.facing);
    }
    // Người bị thẻ đỏ / bị thay rời sân (tài nguyên dùng chung, giải phóng khi huỷ renderer).
    for (const [id, actor] of this.actors) {
      if (onPitch.has(id)) continue;
      this.scene.remove(actor);
      this.actors.delete(id);
      this.models.delete(id);
    }

    const controlled = this.actors.get(curr.controlledId);
    this.marker.visible = controlled !== undefined && !curr.autopilot;
    if (controlled) {
      const bob = Math.sin(performance.now() / 180) * 0.08;
      this.marker.position.set(controlled.position.x, MARKER_Y + bob, controlled.position.z);
    }

    const meter = controlled ? chargeMeter(curr) : null;
    const bar = this.chargeBar;
    bar.group.visible = meter !== null;
    if (meter && controlled) {
      bar.group.position.set(controlled.position.x, CHARGE_BAR_Y, controlled.position.z);
      bar.group.quaternion.copy(this.camera.quaternion);
      bar.fill.scale.x = Math.max(0.001, meter.fill);
      bar.fillMat.color.setHex(CHARGE_COLORS[meter.kind]);
    }

    const ground = lerpPos(prev.ball.pos, curr.ball.pos, alpha);
    const z = Math.max(0, lerp(prev.ball.z, curr.ball.z, alpha));
    // Sim đặt bóng ở chân người giữ; thủ môn ôm bóng / người ném biên thì vẽ bóng trong tay.
    const held = heldBall(curr);
    const inHands = held !== null && this.handBall(held, this.ballTarget);
    if (!inHands) this.ballTarget.set(ground.x, BALL_DRAW_RADIUS + z, ground.y);
    if (inHands !== this.ballInHands) {
      this.ballInHands = inHands;
      this.ballBlendFrom.copy(this.ball.position);
      this.ballBlend = BALL_BLEND_SEC;
    }
    this.ballBlend = Math.max(0, this.ballBlend - dt);
    if (this.ballBlend > 0) {
      const t = 1 - this.ballBlend / BALL_BLEND_SEC;
      this.ball.position.lerpVectors(this.ballBlendFrom, this.ballTarget, t);
    } else {
      this.ball.position.copy(this.ballTarget);
    }
    const moved = this.ball.position.clone().sub(this.ballLast).setY(0);
    const dist = moved.length();
    if (dist > 1e-4 && dist < 2) {
      const axis = new THREE.Vector3(moved.z, 0, -moved.x).normalize();
      this.ball.rotateOnWorldAxis(axis, dist / BALL_DRAW_RADIUS);
    }
    this.ballLast.copy(this.ball.position);
    const drawnZ = Math.max(0, this.ball.position.y - BALL_DRAW_RADIUS);
    this.ballShadow.position.set(this.ball.position.x, 0.015, this.ball.position.z);
    this.ballShadow.scale.setScalar(1 / (1 + drawnZ * 0.35));

    if (dt > 0) this.cam = followCamera(this.cam, ground, dt);
    const { pos, look } = this.cam;
    this.nets.update(animDt);
    const timeSec = performance.now() / 1000;
    if (this.grass.object.visible) this.grass.update(look.x, look.z, timeSec);
    if (this.crowd.object.visible) this.crowd.update(animDt, timeSec);
    this.boards.update(timeSec);
    this.camera.position.set(pos.x, pos.y, pos.z);
    this.camera.lookAt(look.x, look.y, look.z);
  }

  /** Điểm bóng trong tay người cầm: theo xương tay của model, cầu thủ khối thì trước ngực/trên đầu. */
  private handBall(held: HeldBall, out: THREE.Vector3): boolean {
    if (this.models.get(held.playerId)?.ballInHands(out)) return true;
    const actor = this.actors.get(held.playerId);
    const p = this.curr.players.find((q) => q.id === held.playerId);
    if (!actor || !p) return false;
    const y = held.grip === 'throw_in' ? OVERHEAD_BALL_Y : CHEST_BALL_Y;
    out.set(
      actor.position.x + p.facing.x * HELD_BALL_AHEAD,
      y,
      actor.position.z + p.facing.y * HELD_BALL_AHEAD,
    );
    return true;
  }

  private resize(): void {
    const w = this.parent.clientWidth;
    const h = this.parent.clientHeight;
    if (w === 0 || h === 0) return;
    this.renderer.setSize(w, h);
    this.postFx.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Overlay FPS chỉ khi dev. */
  private createDebugOverlay(): void {
    const el = document.createElement('div');
    Object.assign(el.style, {
      position: 'absolute',
      left: '8px',
      top: '8px',
      padding: '4px 6px',
      background: '#000000aa',
      color: COLORS.text,
      font: '13px ui-monospace, monospace',
      pointerEvents: 'none',
      zIndex: '5',
    });
    this.parent.appendChild(el);
    this.debug = { el, frames: 0, at: performance.now() };
  }

  private refreshDebug(now: number): void {
    const d = this.debug;
    if (!d) return;
    d.frames++;
    if (now - d.at < DEBUG_REFRESH_MS) return;
    const fps = Math.round((d.frames * 1000) / (now - d.at));
    d.frames = 0;
    d.at = now;
    const { curr } = this;
    d.el.textContent = `FPS ${fps} · tick ${curr.tick} · ${curr.phase} · ${curr.score.home}–${curr.score.away}`;
  }
}
