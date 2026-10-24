/**
 * Intro 3D lúc mở game (task 6.6): camera bay qua sân đêm, đèn pha bật dần. Tái dùng sân, khán đài,
 * vòm trời và đèn pha của renderer trận; đường bay + độ sáng lấy từ `features/intro/intro.ts`.
 */
import * as THREE from 'three';
import { floodLevel, INTRO_DURATION_SEC, introCamera } from '../../features/intro/intro';
import { COLORS } from '../render/colors';
import { LIGHTING } from '../render/lighting';
import { buildFloodSpots, buildSky, setFloodScale, setSkyLook } from './effects';
import { buildPitch, NetRig } from './pitch';
import { buildRoofs, buildStadium } from './stadium';

/** Đèn nền khi đèn pha còn tắt: đủ thấy bóng sân tối, không đen kịt. */
const AMBIENT_FLOOR = 0.12;

export class IntroRenderer {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.5, 400);
  private readonly hemi: THREE.HemisphereLight;
  private readonly sun: THREE.DirectionalLight;
  private readonly spots: THREE.Group;
  private readonly observer: ResizeObserver;
  private raf = 0;
  private start = -1;
  private finished = false;

  /** Ném lỗi nếu trình duyệt không tạo được WebGL — người gọi chuyển sang intro tĩnh. */
  constructor(
    private readonly host: HTMLElement,
    private readonly onDone: () => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.domElement.style.display = 'block';
    host.appendChild(this.renderer.domElement);

    const night = LIGHTING.night;
    this.scene.background = new THREE.Color(COLORS.bg);
    this.scene.fog = new THREE.Fog(night.skyHorizon, 70, 220);
    this.hemi = new THREE.HemisphereLight(night.hemiSky, night.hemiGround, 0);
    this.sun = new THREE.DirectionalLight(night.sunColor, 0);
    this.sun.position.set(...night.sunPos);
    const sky = buildSky();
    setSkyLook(sky, night.skyHorizon, night.skyZenith, true);
    this.spots = buildFloodSpots();
    this.scene.add(
      this.hemi,
      this.sun,
      buildPitch(new NetRig()),
      buildStadium(),
      buildRoofs(),
      sky,
      this.spots,
    );

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(host);
    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  private resize(): void {
    const w = Math.max(1, this.host.clientWidth);
    const h = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private readonly frame = (now: number): void => {
    if (this.start < 0) this.start = now;
    const t = (now - this.start) / 1000;
    const cam = introCamera(t);
    this.camera.position.set(cam.pos.x, cam.pos.y, cam.pos.z);
    this.camera.lookAt(cam.look.x, cam.look.y, cam.look.z);

    const level = floodLevel(t);
    const light = AMBIENT_FLOOR + (1 - AMBIENT_FLOOR) * level;
    this.hemi.intensity = LIGHTING.night.hemiIntensity * light;
    this.sun.intensity = LIGHTING.night.sunIntensity * level;
    setFloodScale(this.spots, level);
    this.renderer.render(this.scene, this.camera);

    if (t >= INTRO_DURATION_SEC && !this.finished) {
      this.finished = true;
      this.onDone();
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  dispose(): void {
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    const materials = new Set<THREE.Material>();
    this.scene.traverse((obj) => {
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
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
