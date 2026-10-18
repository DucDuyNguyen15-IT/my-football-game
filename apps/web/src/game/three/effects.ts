/**
 * Hiệu ứng chỉ bật ở mức đồ hoạ Cao (`render/quality.ts`): bầu trời đêm có sao, đèn spot rọi từ
 * cột đèn pha, hậu kỳ (bloom cho đèn, tone mapping ACES, khử răng cưa SMAA).
 */
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FLOODLIGHT_HEIGHT, floodlightSpots } from './stadium';

const SKY_RADIUS = 300;
const STAR_COUNT = 900;
/** Chỉ phần sáng hơn mức này (tuyến tính) mới loé: bóng đèn pha, không phải vạch vôi. */
const BLOOM_THRESHOLD = 1.05;
const BLOOM_RADIUS = 0.45;
const SPOT_INTENSITY = 1800;
const SPOT_ANGLE = 0.42;

/** Vòm trời: chuyển màu từ chân trời xanh lục tối lên đỉnh gần đen, rắc sao (PRNG cố định). */
export function buildSky(): THREE.Group {
  const g = new THREE.Group();
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(SKY_RADIUS, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        horizon: { value: new THREE.Color(0x16302a) },
        zenith: { value: new THREE.Color(0x03070a) },
      },
      vertexShader: /* glsl */ `
        varying float vH;
        void main() {
          vH = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 horizon;
        uniform vec3 zenith;
        varying float vH;
        void main() {
          gl_FragColor = vec4(mix(horizon, zenith, smoothstep(-0.05, 0.6, vH)), 1.0);
        }`,
    }),
  );
  g.add(dome);

  let seed = 11;
  const rand = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const pos: number[] = [];
  const r0 = SKY_RADIUS * 0.95;
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = rand() * Math.PI * 2;
    // Chỉ nửa trên, thưa dần về chân trời.
    const y = 0.15 + rand() * 0.85;
    const r = Math.sqrt(1 - y * y);
    pos.push(Math.cos(theta) * r * r0, y * r0, Math.sin(theta) * r * r0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.add(
    new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: 0xcfe3ff, size: 1.1, sizeAttenuation: false, fog: false }),
    ),
  );
  return g;
}

/** 4 đèn spot đặt ở đầu cột đèn pha, rọi vào giữa sân (không đổ bóng để rẻ). */
export function buildFloodSpots(): THREE.Group {
  const g = new THREE.Group();
  for (const { x, z } of floodlightSpots()) {
    const spot = new THREE.SpotLight(0xfff1d6, SPOT_INTENSITY, 0, SPOT_ANGLE, 0.6, 2);
    spot.position.set(x, FLOODLIGHT_HEIGHT, z);
    spot.target.position.set(x * 0.15, 0, z * 0.15);
    g.add(spot, spot.target);
  }
  return g;
}

export interface PostFx {
  render(): void;
  setSize(width: number, height: number, pixelRatio: number): void;
  setBloom(strength: number): void;
  dispose(): void;
}

/**
 * Chuỗi hậu kỳ: cảnh → render target half float → bloom → tone mapping + sRGB → SMAA. Đo trên máy
 * dev: MSAA 4× trên render target làm FPS giảm một nửa, SMAA gần như không tốn.
 */
export function createPostFx(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.Camera,
): PostFx {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0, BLOOM_RADIUS, BLOOM_THRESHOLD);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const smaa = new SMAAPass();
  composer.addPass(smaa);
  return {
    render: () => composer.render(),
    setSize: (w, h, ratio) => {
      composer.setPixelRatio(ratio);
      composer.setSize(w, h);
      // Bloom vốn mờ: chạy ở nửa độ phân giải gần như không khác mà rẻ hơn 4 lần.
      bloom.setSize((w * ratio) / 2, (h * ratio) / 2);
    },
    setBloom: (strength) => {
      bloom.strength = strength;
      bloom.enabled = strength > 0;
    },
    dispose: () => {
      bloom.dispose();
      smaa.dispose();
      composer.dispose();
    },
  };
}
