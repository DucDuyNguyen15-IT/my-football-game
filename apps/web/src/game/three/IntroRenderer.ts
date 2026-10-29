/**
 * Intro 3D lúc mở game: đèn rọi quả bóng trên chấm phạt đền, đèn pha bật từng cột, bóng bay vào
 * lưới, camera kéo lên toàn cảnh. Tái dùng sân, khán đài, vòm trời, đèn pha và hậu kỳ bloom của
 * renderer trận; kịch bản theo thời gian lấy từ `features/intro/intro.ts`. Bóng/khung thành dùng
 * model nếu đã chạy `pnpm assets` (`propModels.ts`), không thì bản vẽ bằng code.
 */
import * as THREE from 'three';
import {
  BALL_R,
  BALL_SPOT,
  floodBank,
  floodLevel,
  INTRO_DURATION_SEC,
  introBall,
  introCamera,
  keyLight,
  NET_HIT_SEC,
} from '../../features/intro/intro';
import { COLORS } from '../render/colors';
import { LIGHTING } from '../render/lighting';
import { buildFloodSpots, buildSky, createPostFx, setFloodLevels, setSkyLook } from './effects';
import { buildPitch, NetRig } from './pitch';
import { loadBallModel, loadGoalModel, swapGoals } from './propModels';
import { buildRoofs, buildStadium, FLOOD_LAMP_NAME, floodlightSpots } from './stadium';

/** Đèn nền khi đèn pha còn tắt: đủ thấy bóng sân tối, không đen kịt. */
const AMBIENT_FLOOR = 0.06;
/** Chờ model tối đa chừng này ms rồi chạy luôn với bản vẽ bằng code. */
const MODEL_WAIT_MS = 1500;
/** Đèn rọi bóng treo trên chấm phạt đền. */
const KEY_HEIGHT = 7;
const KEY_INTENSITY = 260;
const BLOOM_STRENGTH = 0.7;
/** Mặt đèn pha lúc tắt vẫn hơi ánh (phần của độ sáng khi bật). */
const LAMP_OFF = 0.06;

export class IntroRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(40, 16 / 9, 0.05, 400);
  private readonly postFx;
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly key: THREE.SpotLight;
  private readonly spots: THREE.Group;
  /** Mặt đèn pha theo cột (thứ tự `floodlightSpots()`), mỗi mặt một material riêng để bật lần lượt. */
  private readonly lamps: { mat: THREE.MeshBasicMaterial; base: THREE.Color; bank: number }[] = [];
  private readonly nets = new NetRig();
  private readonly pitch: THREE.Group;
  private ball: THREE.Object3D;
  private readonly observer: ResizeObserver;
  private raf = 0;
  private start = -1;
  private last = 0;
  private netHit = false;
  private finished = false;
  private disposed = false;

  /**
   * Ném lỗi nếu trình duyệt không tạo được WebGL — người gọi chuyển sang intro tĩnh. `onStart` gọi
   * khi đồng hồ intro bắt đầu chạy (sau khi chờ model) để logo chữ canh đúng nhịp.
   */
  constructor(
    private readonly host: HTMLElement,
    private readonly onDone: () => void,
    private readonly onStart: () => void = () => {},
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // SMAA trong hậu kỳ
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);
    this.postFx = createPostFx(this.renderer, this.scene, this.camera);
    this.postFx.setBloom(BLOOM_STRENGTH);

    const night = LIGHTING.night;
    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.Fog(night.skyHorizon, 70, 220);
    this.hemi = new THREE.HemisphereLight(night.hemiSky, night.hemiGround, 0);
    this.sun = new THREE.DirectionalLight(night.sunColor, 0);
    this.sun.position.set(...night.sunPos);
    const sky = buildSky();
    setSkyLook(sky, night.skyHorizon, night.skyZenith, true);
    this.spots = buildFloodSpots();

    // Đèn rọi thẳng xuống quả bóng, đổ bóng tròn mềm lên cỏ.
    this.key = new THREE.SpotLight(0xfff4e0, 0, 0, 0.22, 0.7, 2);
    this.key.position.set(BALL_SPOT.x, KEY_HEIGHT, BALL_SPOT.z);
    this.key.target.position.set(BALL_SPOT.x, 0, BALL_SPOT.z);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.camera.near = 3;
    this.key.shadow.camera.far = 12;
    this.key.shadow.bias = -0.0005;

    this.pitch = buildPitch(this.nets);
    const stadium = buildStadium();
    this.collectLamps(stadium);
    this.ball = fallbackBall();
    this.scene.add(
      this.hemi,
      this.sun,
      this.key,
      this.key.target,
      this.pitch,
      stadium,
      buildRoofs(),
      sky,
      this.spots,
      this.ball,
    );
    this.applyFrame(0);

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    void this.loadModels().then(() => {
      if (this.disposed) return;
      this.onStart();
      this.raf = requestAnimationFrame(this.frame);
    });
  }

  /** Nạp bóng + khung thành thật; quá `MODEL_WAIT_MS` thì chạy luôn (model tới sau vẫn được thay). */
  private loadModels(): Promise<void> {
    const ball = loadBallModel().then((model) => {
      if (!model || this.disposed) return;
      model.scale.setScalar(BALL_R);
      model.position.copy(this.ball.position);
      model.rotation.copy(this.ball.rotation);
      this.scene.remove(this.ball);
      disposeMeshes(this.ball);
      this.ball = model;
      this.scene.add(model);
    });
    const goal = loadGoalModel().then((model) => {
      if (model && !this.disposed) swapGoals(this.pitch, model, this.nets);
    });
    const timeout = new Promise<void>((resolve) => window.setTimeout(resolve, MODEL_WAIT_MS));
    return Promise.race([Promise.all([ball, goal]).then(() => {}), timeout]).catch(() => {});
  }

  /** Mặt đèn pha → cột gần nhất trong `floodlightSpots()`; tách material để bật từng cột. */
  private collectLamps(stadium: THREE.Object3D): void {
    stadium.updateMatrixWorld(true);
    const banks = floodlightSpots();
    const at = new THREE.Vector3();
    stadium.traverse((o) => {
      if (!(o instanceof THREE.Mesh) || o.name !== FLOOD_LAMP_NAME) return;
      o.getWorldPosition(at);
      let bank = 0;
      let best = Infinity;
      banks.forEach((b, i) => {
        const d = (b.x - at.x) ** 2 + (b.z - at.z) ** 2;
        if (d < best) [best, bank] = [d, i];
      });
      const mat = (o.material as THREE.MeshBasicMaterial).clone();
      o.material = mat;
      this.lamps.push({ mat, base: mat.color.clone(), bank });
    });
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.postFx.setSize(w, h, this.renderer.getPixelRatio());
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Đặt camera, bóng, đèn theo giây `t` của kịch bản. */
  private applyFrame(t: number): void {
    const cam = introCamera(t);
    this.camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    this.camera.lookAt(cam.look.x, cam.look.y, cam.look.z);

    const ball = introBall(t);
    this.ball.position.set(ball.pos.x, ball.pos.y, ball.pos.z);
    this.ball.rotation.set(0, 0, -ball.spin);

    const banks = floodlightSpots().map((_, i) => floodBank(t, i));
    setFloodLevels(this.spots, banks);
    for (const lamp of this.lamps) {
      const level = banks[lamp.bank] ?? 0;
      lamp.mat.color.copy(lamp.base).multiplyScalar(LAMP_OFF + (1 - LAMP_OFF) * level);
    }
    const level = floodLevel(t);
    const night = LIGHTING.night;
    this.hemi.intensity = night.hemiIntensity * (AMBIENT_FLOOR + (1 - AMBIENT_FLOOR) * level);
    this.sun.intensity = night.sunIntensity * level;
    this.key.intensity = KEY_INTENSITY * keyLight(t);
  }

  private readonly frame = (now: number): void => {
    if (this.start < 0) this.start = this.last = now;
    const t = (now - this.start) / 1000;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;

    this.applyFrame(t);
    if (!this.netHit && t >= NET_HIT_SEC) {
      this.netHit = true;
      this.nets.hit(1, this.ball.position);
    }
    this.nets.update(dt);
    this.postFx.render();

    if (t >= INTRO_DURATION_SEC && !this.finished) {
      this.finished = true;
      this.onDone();
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    disposeMeshes(this.scene);
    this.postFx.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}

/** Bóng trắng trơn khi chưa có `ball.glb`. */
function fallbackBall(): THREE.Mesh {
  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(BALL_R, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.45 }),
  );
  ball.castShadow = true;
  return ball;
}

function disposeMeshes(root: THREE.Object3D): void {
  const materials = new Set<THREE.Material>();
  root.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh || obj instanceof THREE.Points || obj instanceof THREE.Line))
      return;
    (obj.geometry as THREE.BufferGeometry).dispose();
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    for (const m of mats as THREE.Material[]) materials.add(m);
  });
  for (const m of materials) {
    for (const value of Object.values(m)) if (value instanceof THREE.Texture) value.dispose();
    m.dispose();
  }
}
