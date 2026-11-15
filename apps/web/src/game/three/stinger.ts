/**
 * Khối hiển thị hiệu ứng chuyển cảnh (stinger truyền hình) độc lập, dùng lại được:
 * - Bản 3D (mức Trung/Cao): vẽ trong `stingerScene` riêng bằng Three.js (2 cánh cửa chớp vát chéo +
 *   huy hiệu bát giác MFG khối đùn `ExtrudeGeometry` kim loại vàng + 48 hạt bụi vàng `THREE.Points`).
 *   Không thêm đèn, không đổ bóng, không thêm pass hậu kỳ; chỉ 4 draw call (~2.200 tam giác); biên
 *   dịch sẵn shader bằng `renderer.compile()` ngay khi tạo.
 * - Bản 2D (đồ hoạ Thấp hoặc khi FPS trượt < 50): dải chéo tối viền vàng `--r-gold-base` (#d49b1a)
 *   kèm biểu tượng MFG quét ngang bằng CSS/SVG.
 * - `prefers-reduced-motion: reduce`: chỉ mờ đen nhanh (250 ms), không xoay/quét.
 * - Nhãn tình huống ("PHÁT BÓNG", "PHẠT GÓC", "NÉM BIÊN", "ĐÁ PHẠT", "PHẠT ĐỀN", "XEM LẠI",
 *   "LUÂN LƯU", "LƯỢT N") phủ bằng HTML/SVG nét bên trên theo đúng token v3 "Sa Bàn Hoàng Kim".
 */
import * as THREE from 'three';
import type { GraphicsQuality } from '../bridge';
import {
  RollingFps,
  buildTransitionSpec,
  dollyOffset,
  resolveTransitionMode,
  sampleTransitionCurve,
  transitionDurationSec,
  chainedStart,
  hidesPlay,
  type BuildTransitionOptions,
  type TransitionKind,
  type TransitionMode,
  type TransitionSpec,
} from '../render/transition';

export interface TransitionPlayOptions extends BuildTransitionOptions {
  /** Gọi đúng một lần tại thời điểm stinger vừa che kín khung hình (`progress = 0.5`). */
  onCovered?: () => void;
}

interface ActiveTransition {
  spec: TransitionSpec;
  mode: TransitionMode;
  durationSec: number;
  elapsedSec: number;
  coveredCalled: boolean;
  coveredAtSec: number | null;
  onCovered?: () => void;
  spinSign: 1 | -1;
  spinMult: number;
}

const SPARK_COUNT = 48;

/** Nghiêng chữ/khối theo góc thể thao (-8° ≈ hệ số trượt 0.14). */
const italicX = (x: number, y: number): number => x + y * 0.14;

function polygonShape(pts: readonly (readonly [number, number])[], italic = false): THREE.Shape {
  const s = new THREE.Shape();
  pts.forEach(([rawX, y], i) => {
    const x = italic ? italicX(rawX, y) : rawX;
    if (i === 0) s.moveTo(x, y);
    else s.lineTo(x, y);
  });
  s.closePath();
  return s;
}

function octagonPoints(radius: number, cutRatio = 0.414): [number, number][] {
  const c = radius * cutRatio;
  const r = radius;
  return [
    [-c, r],
    [c, r],
    [r, c],
    [r, -c],
    [c, -r],
    [-c, -r],
    [-r, -c],
    [-r, c],
  ];
}

/** Gộp nhiều BufferGeometry cùng thuộc tính `position`, `normal` và gắn nhãn vùng vật liệu `aPart`. */
function mergeTaggedGeometries(
  parts: readonly { geo: THREE.BufferGeometry; partId: number }[],
): THREE.BufferGeometry {
  const nonIndexed = parts.map(({ geo, partId }) => {
    const g = geo.index ? geo.toNonIndexed() : geo.clone();
    geo.dispose();
    g.computeVertexNormals();
    const count = g.getAttribute('position').count;
    const partAttr = new Float32Array(count);
    partAttr.fill(partId);
    g.setAttribute('aPart', new THREE.BufferAttribute(partAttr, 1));
    return g;
  });

  let totalVertices = 0;
  for (const g of nonIndexed) totalVertices += g.getAttribute('position').count;

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const partIds = new Float32Array(totalVertices);

  let offset = 0;
  for (const g of nonIndexed) {
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const norm = g.getAttribute('normal') as THREE.BufferAttribute;
    const part = g.getAttribute('aPart') as THREE.BufferAttribute;
    positions.set(pos.array as Float32Array, offset * 3);
    normals.set(norm.array as Float32Array, offset * 3);
    partIds.set(part.array as Float32Array, offset);
    offset += pos.count;
    g.dispose();
  }

  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  merged.setAttribute('aPart', new THREE.BufferAttribute(partIds, 1));
  return merged;
}

/**
 * Tạo khối đùn 3D biểu tượng bát giác "Sa Bàn Hoàng Kim" kèm chữ nổi `MFG` (1 mesh duy nhất):
 * - `aPart = 0`: mặt khiên nỉ ngọc lục bảo đậm (#071c14)
 * - `aPart = 1`: viền khung bát giác vàng kim chải xước (#d49b1a)
 * - `aPart = 2`: chữ khối đùn `M F G` và thanh định vị vàng rực 24K (#ffe58f)
 */
function buildCrestGeometry(): THREE.BufferGeometry {
  // 1. Tấm khiên bát giác nền tối
  const shieldShape = polygonShape(octagonPoints(1.38));
  const shieldGeo = new THREE.ExtrudeGeometry(shieldShape, {
    depth: 0.16,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  shieldGeo.translate(0, 0, -0.08);

  // 2. Vành bát giác kim loại vàng bao quanh
  const outerRing = polygonShape(octagonPoints(1.56));
  const innerHole = new THREE.Path();
  octagonPoints(1.26)
    .slice()
    .reverse()
    .forEach(([x, y], i) => {
      if (i === 0) innerHole.moveTo(x, y);
      else innerHole.lineTo(x, y);
    });
  innerHole.closePath();
  outerRing.holes.push(innerHole);
  const ringGeo = new THREE.ExtrudeGeometry(outerRing, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  ringGeo.translate(0, 0, -0.06);

  // 3. Ba chữ cái khối đùn M - F - G nghiêng thể thao
  const shapeM = polygonShape(
    [
      [-0.95, -0.44],
      [-0.78, -0.44],
      [-0.78, 0.1],
      [-0.64, -0.3],
      [-0.5, 0.1],
      [-0.5, -0.44],
      [-0.33, -0.44],
      [-0.33, 0.44],
      [-0.51, 0.44],
      [-0.64, 0.04],
      [-0.77, 0.44],
      [-0.95, 0.44],
    ],
    true,
  );
  const shapeF = polygonShape(
    [
      [-0.18, -0.44],
      [0.0, -0.44],
      [0.0, -0.06],
      [0.24, -0.06],
      [0.24, 0.1],
      [0.0, 0.1],
      [0.0, 0.28],
      [0.3, 0.28],
      [0.3, 0.44],
      [-0.18, 0.44],
    ],
    true,
  );
  const shapeG = polygonShape(
    [
      [0.52, -0.44],
      [0.84, -0.44],
      [0.95, -0.32],
      [0.95, 0.08],
      [0.66, 0.08],
      [0.66, -0.07],
      [0.78, -0.07],
      [0.78, -0.28],
      [0.58, -0.28],
      [0.58, 0.28],
      [0.78, 0.28],
      [0.78, 0.19],
      [0.95, 0.19],
      [0.95, 0.32],
      [0.84, 0.44],
      [0.52, 0.44],
      [0.4, 0.32],
      [0.4, -0.32],
    ],
    true,
  );
  const lettersGeo = new THREE.ExtrudeGeometry([shapeM, shapeF, shapeG], {
    depth: 0.2,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.025,
    bevelSegments: 2,
  });
  lettersGeo.translate(0, 0, 0.08);

  // 4. Hai thanh vạch vàng khắc trên/dưới chữ MFG
  const topBar = polygonShape([
    [-0.72, 0.66],
    [0.72, 0.66],
    [0.64, 0.74],
    [-0.64, 0.74],
  ]);
  const botBar = polygonShape([
    [-0.64, -0.74],
    [0.64, -0.74],
    [0.72, -0.66],
    [-0.72, -0.66],
  ]);
  const barsGeo = new THREE.ExtrudeGeometry([topBar, botBar], {
    depth: 0.14,
    bevelEnabled: true,
    bevelThickness: 0.02,
    bevelSize: 0.02,
    bevelSegments: 1,
  });
  barsGeo.translate(0, 0, 0.08);

  return mergeTaggedGeometries([
    { geo: shieldGeo, partId: 0 },
    { geo: ringGeo, partId: 1 },
    { geo: lettersGeo, partId: 2 },
    { geo: barsGeo, partId: 2 },
  ]);
}

/**
 * Cánh cửa chớp 3D vát chéo (-14°): `side = -1` (cánh trái) hoặc `+1` (cánh phải).
 * Gồm tấm nền nỉ/than tối (`aPart = 0`) + thanh gờ kim loại vàng nổi dọc mép khớp (`aPart = 1`).
 */
function buildShutterGeometry(side: -1 | 1): THREE.BufferGeometry {
  const slant = 1.35;
  const w = 13.5;
  const h = 6.2;
  const overlap = 0.08 * -side;

  const panelShape =
    side === -1
      ? polygonShape([
          [-w, -h],
          [overlap - slant, -h],
          [overlap + slant, h],
          [-w, h],
        ])
      : polygonShape([
          [overlap - slant, -h],
          [w, -h],
          [w, h],
          [overlap + slant, h],
        ]);

  const panelGeo = new THREE.ExtrudeGeometry(panelShape, {
    depth: 0.18,
    bevelEnabled: true,
    bevelThickness: 0.05,
    bevelSize: 0.04,
    bevelSegments: 2,
  });
  panelGeo.translate(0, 0, -0.18);

  // Thanh gờ vàng kim loại chạy dọc mép cắt chéo
  const railW = 0.22;
  const railOffset = side === -1 ? -0.14 : 0.14;
  const railShape = polygonShape([
    [railOffset - slant - railW / 2, -h],
    [railOffset - slant + railW / 2, -h],
    [railOffset + slant + railW / 2, h],
    [railOffset + slant - railW / 2, h],
  ]);
  const railGeo = new THREE.ExtrudeGeometry(railShape, {
    depth: 0.22,
    bevelEnabled: true,
    bevelThickness: 0.04,
    bevelSize: 0.03,
    bevelSegments: 2,
  });
  railGeo.translate(0, 0, -0.06);

  return mergeTaggedGeometries([
    { geo: panelGeo, partId: 0 },
    { geo: railGeo, partId: 1 },
  ]);
}

/** Shader kim loại vàng "Sa Bàn Hoàng Kim" + ánh viền Fresnel + vệt sáng quét (không cần đèn). */
function createMetallicStingerMaterial(transparent = true): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent,
    depthWrite: true,
    depthTest: true,
    toneMapped: false,
    uniforms: {
      uSweep: { value: 0.5 },
      uOpacity: { value: 1.0 },
      uAccent: { value: new THREE.Color(0xd49b1a) },
    },
    vertexShader: /* glsl */ `
      attribute float aPart;
      varying vec3 vNormal;
      varying vec3 vLocalNormal;
      varying vec3 vViewPos;
      varying vec3 vWorldPos;
      varying float vPart;

      void main() {
        vPart = aPart;
        vLocalNormal = normalize(normal);
        vNormal = normalize(normalMatrix * normal);
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPos = -mvPosition.xyz;
        vWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;
        gl_Position = projectionMatrix * mvPosition;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uSweep;
      uniform float uOpacity;
      uniform vec3 uAccent;
      varying vec3 vNormal;
      varying vec3 vLocalNormal;
      varying vec3 vViewPos;
      varying vec3 vWorldPos;
      varying float vPart;

      void main() {
        vec3 N = normalize(vNormal);
        vec3 V = normalize(vViewPos);

        // Hướng phản chiếu giả lập studio 3 nguồn sáng sân vận động (không cần đèn thật)
        vec3 L1 = normalize(vec3(-0.45, 0.72, 0.52));
        vec3 L2 = normalize(vec3(0.58, -0.35, 0.73));
        vec3 H1 = normalize(L1 + V);
        vec3 H2 = normalize(L2 + V);

        float diff1 = max(dot(N, L1), 0.0);
        float diff2 = max(dot(N, L2), 0.0);
        float spec1 = pow(max(dot(N, H1), 0.0), 28.0);
        float spec2 = pow(max(dot(N, H2), 0.0), 16.0);
        float fresnel = pow(1.0 - max( abs(dot(N, V)), 0.0 ), 2.6);

        // Cạnh vát (bevel) của tấm nền cũng ánh vàng kim loại
        float isBevel = smoothstep(0.95, 0.72, abs(vLocalNormal.z));
        float metalMask = clamp(vPart + isBevel * 0.85, 0.0, 2.0);

        // Màu nền nỉ ngọc lục bảo / than chì tối (--c-pitch-felt-deep -> #07140f)
        vec3 feltDeep = vec3(0.028, 0.082, 0.062);
        vec3 feltMid = vec3(0.058, 0.185, 0.136);
        vec3 darkPanel = mix(feltDeep, feltMid, diff1 * 0.55 + 0.15);
        darkPanel += uAccent * (fresnel * 0.22);

        // Màu vàng kim loại nhiều tầng (--r-gold-lo -> --r-gold-base #d49b1a -> --r-gold-hi #ffe58f)
        vec3 goldLo = vec3(0.24, 0.15, 0.02);
        vec3 goldBase = mix(vec3(0.831, 0.608, 0.102), uAccent, 0.22);
        vec3 goldHi = vec3(1.0, 0.898, 0.561);
        vec3 goldSpec = vec3(1.0, 0.97, 0.85);

        float envBand = clamp(N.y * 0.5 + 0.5 + N.x * 0.25, 0.0, 1.0);
        vec3 goldCol = mix(goldLo, goldBase, smoothstep(0.0, 0.55, envBand + diff1 * 0.4));
        goldCol = mix(goldCol, goldHi, smoothstep(0.45, 0.95, diff1 * 0.7 + diff2 * 0.35));
        goldCol += goldSpec * (spec1 * 0.85 + spec2 * 0.35);
        goldCol += goldHi * (fresnel * 0.65);

        // Chữ nổi MFG (vPart > 1.5) sáng rực hơn một nấc để tách khỏi vành khiên
        if (vPart > 1.5) {
          goldCol = mix(goldCol, goldSpec, 0.24 + spec1 * 0.35);
        }

        vec3 col = mix(darkPanel, goldCol, clamp(metalMask, 0.0, 1.0));

        // Vệt sáng quét chéo ngang mặt kim loại
        float sweepCoord = (vWorldPos.x * 0.18 + vWorldPos.y * 0.08) + 0.5;
        float sweepPos = mix(-0.35, 1.35, uSweep);
        float sweepBand = exp(-pow((sweepCoord - sweepPos) * 5.5, 2.0));
        col += mix(vec3(0.12, 0.09, 0.02), goldSpec * 0.72, clamp(metalMask, 0.15, 1.0)) * sweepBand;

        gl_FragColor = vec4(col, uOpacity);
      }
    `,
  });
}

/** Hệ hạt vàng nhẹ (`THREE.Points`, 48 hạt cố định) bay quanh huy hiệu, tính hoàn toàn trong shader. */
function buildSparkPoints(): { points: THREE.Points; material: THREE.ShaderMaterial } {
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(SPARK_COUNT * 3);
  const seed = new Float32Array(SPARK_COUNT * 3);

  let s = 42;
  const rand = (): number => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };

  for (let i = 0; i < SPARK_COUNT; i++) {
    const angle = (i / SPARK_COUNT) * Math.PI * 2 + rand() * 0.35;
    const radius = 1.2 + rand() * 3.1;
    pos[i * 3] = Math.cos(angle) * radius;
    pos[i * 3 + 1] = Math.sin(angle) * radius * 0.65;
    pos[i * 3 + 2] = (rand() - 0.5) * 1.6;

    seed[i * 3] = rand() * Math.PI * 2;
    seed[i * 3 + 1] = 0.6 + rand() * 1.4;
    seed[i * 3 + 2] = 6.0 + rand() * 10.0;
  }

  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3));

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    uniforms: {
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
    },
    vertexShader: /* glsl */ `
      attribute vec3 aSeed;
      uniform float uProgress;
      varying float vAlpha;

      void main() {
        float phase = aSeed.x + uProgress * 3.2 * aSeed.y;
        vec3 p = position;
        p.x += cos(phase) * 0.35;
        p.y += sin(phase) * 0.35 + (uProgress - 0.5) * 0.9;
        p.z += sin(phase * 0.7) * 0.4;
        vAlpha = 0.45 + 0.55 * sin(phase * 2.0);
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_PointSize = aSeed.z * (4.5 / max(1.0, -mv.z));
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uOpacity;
      varying float vAlpha;

      void main() {
        vec2 uv = gl_PointCoord * 2.0 - 1.0;
        // Hạt hình thoi vàng kim
        float diamond = abs(uv.x) + abs(uv.y);
        float mask = smoothstep(1.0, 0.15, diamond);
        vec3 gold = mix(vec3(0.831, 0.608, 0.102), vec3(1.0, 0.94, 0.7), mask);
        gl_FragColor = vec4(gold, mask * vAlpha * uOpacity);
      }
    `,
  });

  const points = new THREE.Points(geo, material);
  points.frustumCulled = false;
  return { points, material };
}

const ACCENT_BY_KIND: Record<TransitionKind, number> = {
  goal_kick: 0xd49b1a,
  corner: 0xd49b1a,
  throw_in: 0xc9961a,
  free_kick: 0xe6ad22,
  penalty: 0xffc83b,
  replay_in: 0xffe074,
  replay_out: 0xd49b1a,
  kickoff: 0xd49b1a,
  second_half: 0xffe074,
  shootout: 0xffb838,
  shootout_turn: 0xe5a220,
};

export class MatchStinger {
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 16 / 9, 0.1, 30);

  private readonly shutterMat: THREE.ShaderMaterial;
  private readonly crestMat: THREE.ShaderMaterial;
  private readonly sparkMat: THREE.ShaderMaterial;

  private readonly leftShutter: THREE.Mesh;
  private readonly rightShutter: THREE.Mesh;
  private readonly crestMesh: THREE.Mesh;
  private readonly sparkPoints: THREE.Points;

  private readonly overlayEl: HTMLDivElement;
  private readonly plaqueEl: HTMLElement;
  private readonly labelEl: HTMLElement;
  private readonly sublabelEl: HTMLElement;

  private readonly rollingFps = new RollingFps(120, 45);
  private preset: GraphicsQuality = 'high';
  private active: ActiveTransition | null = null;
  private lastCoveredAtMs: number | null = null;
  private lastReducedMotion = false;
  private lastLabelVisible = false;

  constructor(
    private readonly parent: HTMLElement,
    private readonly renderer: THREE.WebGLRenderer,
  ) {
    this.camera.position.set(0, 0, 6.5);
    this.camera.lookAt(0, 0, 0);

    this.shutterMat = createMetallicStingerMaterial(false);
    this.crestMat = createMetallicStingerMaterial(true);

    this.leftShutter = new THREE.Mesh(buildShutterGeometry(-1), this.shutterMat);
    this.rightShutter = new THREE.Mesh(buildShutterGeometry(1), this.shutterMat);
    this.crestMesh = new THREE.Mesh(buildCrestGeometry(), this.crestMat);
    this.leftShutter.frustumCulled = false;
    this.rightShutter.frustumCulled = false;
    this.crestMesh.frustumCulled = false;

    const sparks = buildSparkPoints();
    this.sparkPoints = sparks.points;
    this.sparkMat = sparks.material;

    this.scene.add(this.leftShutter, this.rightShutter, this.crestMesh, this.sparkPoints);

    const dom = this.createOverlayDom();
    this.overlayEl = dom.root;
    this.plaqueEl = dom.plaque;
    this.labelEl = dom.label;
    this.sublabelEl = dom.sublabel;
    this.parent.appendChild(this.overlayEl);
  }

  /**
   * Làm nóng toàn bộ shader và Pipeline State Object (PSO) của stinger ngay trên framebuffer thật
   * lúc khởi tạo trận (với `uOpacity = 0`) để lần chuyển cảnh đầu tiên không bao giờ khựng khung hình.
   */
  warmUp(): void {
    const { renderer, scene, camera } = this;
    renderer.compile(scene, camera);
    const prevShutterOpacity = (this.shutterMat.uniforms.uOpacity as { value: number }).value;
    const prevCrestOpacity = (this.crestMat.uniforms.uOpacity as { value: number }).value;
    const prevSparkOpacity = (this.sparkMat.uniforms.uOpacity as { value: number }).value;
    const prevAutoClear = renderer.autoClear;

    (this.shutterMat.uniforms.uOpacity as { value: number }).value = 0;
    (this.crestMat.uniforms.uOpacity as { value: number }).value = 0;
    (this.sparkMat.uniforms.uOpacity as { value: number }).value = 0;
    // Vật liệu cửa chớp đục (uOpacity không làm trong suốt): đẩy hai cánh ra ngoài khung trước khi vẽ,
    // nếu không khung đầu tiên của trận là hai cánh khép kín (review L1).
    this.leftShutter.position.set(-50, 0, 0);
    this.rightShutter.position.set(50, 0, 0);
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(scene, camera);

    renderer.autoClear = prevAutoClear;
    (this.shutterMat.uniforms.uOpacity as { value: number }).value = prevShutterOpacity;
    (this.crestMat.uniforms.uOpacity as { value: number }).value = prevCrestOpacity;
    (this.sparkMat.uniforms.uOpacity as { value: number }).value = prevSparkOpacity;
  }

  /** Cập nhật preset đồ hoạ hiện tại (`low` dùng bản 2D, `high` dùng bản 3D trừ khi FPS < 50). */
  setPreset(preset: GraphicsQuality): void {
    this.preset = preset;
  }

  /** Ghi thời gian khung hình (ms) để tự hạ cấp sang 2D nếu FPS thực tế xuống dưới 50. */
  recordFrame(frameMs: number): void {
    this.rollingFps.record(frameMs);
  }

  /**
   * Phát hiệu ứng chuyển cảnh. Hỗ trợ truyền trực tiếp `TransitionKind` (vd `'corner'`) hoặc
   * `TransitionSpec` đã dựng sẵn từ `detectTransition(prev, curr)`.
   * Gọi `options.onCovered` đúng lúc màn hình vừa được che kín (`progress = 0.5`).
   */
  play(
    kindOrSpec: TransitionKind | TransitionSpec,
    options: TransitionPlayOptions = {},
  ): void {
    const spec =
      typeof kindOrSpec === 'string'
        ? buildTransitionSpec(kindOrSpec, options)
        : options.label || options.sublabel || options.team || options.turn
          ? buildTransitionSpec(kindOrSpec.kind, {
              label: options.label ?? kindOrSpec.label,
              sublabel: options.sublabel ?? kindOrSpec.sublabel,
              team: options.team ?? kindOrSpec.team,
              turn: options.turn ?? kindOrSpec.turn,
            })
          : kindOrSpec;

    // Stinger cũ còn chạy: bắt đầu từ đúng độ che hiện tại; onCovered cũ chưa gọi thì gọi cùng lúc
    // với lượt mới khi màn che kín (không gọi sớm lúc màn còn hở — review M1).
    const old = this.active;
    const chained = chainedStart(
      old && {
        progress: old.durationSec > 0 ? old.elapsedSec / old.durationSec : 1,
        covered: old.coveredCalled,
      },
    );
    const oldCovered = chained.carryCovered ? old?.onCovered : undefined;
    const newCovered = options.onCovered;
    const onCovered =
      oldCovered && newCovered
        ? () => {
            oldCovered();
            newCovered();
          }
        : (oldCovered ?? newCovered);

    const reducedMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.lastReducedMotion = reducedMotion;

    const mode = resolveTransitionMode({
      preset: this.preset,
      reducedMotion,
      recentFps: this.rollingFps.average(),
    });
    const durationSec = transitionDurationSec(spec, mode);
    const spinSign: 1 | -1 = spec.turn !== null && spec.turn % 2 === 0 ? -1 : 1;
    const spinMult =
      spec.kind === 'replay_in' ? 1.45 : spec.kind === 'shootout_turn' ? 0.8 : 1.0;

    this.active = {
      spec,
      mode,
      durationSec,
      elapsedSec: chained.progress * durationSec,
      coveredCalled: false,
      coveredAtSec: null,
      onCovered,
      spinSign,
      spinMult,
    };

    const accentHex = ACCENT_BY_KIND[spec.kind];
    (this.shutterMat.uniforms.uAccent as { value: THREE.Color }).value.setHex(accentHex);
    (this.crestMat.uniforms.uAccent as { value: THREE.Color }).value.setHex(accentHex);

    this.labelEl.textContent = spec.label;
    this.sublabelEl.textContent = spec.sublabel;
    if (this.overlayEl.dataset.mode !== mode) this.overlayEl.dataset.mode = mode;
    if (this.overlayEl.dataset.kind !== spec.kind) this.overlayEl.dataset.kind = spec.kind;
    const teamTag = spec.team ?? 'neutral';
    if (this.overlayEl.dataset.team !== teamTag) this.overlayEl.dataset.team = teamTag;
    this.overlayEl.style.opacity = '1';

    this.applyProgress(chained.progress);
  }

  /** Tiến hiệu ứng thêm `dt` giây; kích hoạt `onCovered` ngay khi vượt mốc che kín `0.5`. */
  update(dt: number): void {
    const a = this.active;
    if (!a) return;

    a.elapsedSec += Math.max(0, dt);
    const progress = a.durationSec > 0 ? Math.min(1, a.elapsedSec / a.durationSec) : 1;

    if (!a.coveredCalled && progress >= 0.5) {
      a.coveredCalled = true;
      a.coveredAtSec = a.elapsedSec;
      this.lastCoveredAtMs = performance.now();
      a.onCovered?.();
    }

    if (progress >= 1) {
      this.active = null;
      this.lastLabelVisible = false;
      this.overlayEl.style.opacity = '0';
      this.plaqueEl.style.opacity = '0';
      return;
    }

    this.applyProgress(progress);
  }

  isActive(): boolean {
    return this.active !== null;
  }

  /** Stinger còn che cảnh sân (chưa bắt đầu mở): renderer dừng sim và không nhận phím (review H1). */
  isHidingPlay(): boolean {
    const a = this.active;
    if (!a) return false;
    return hidesPlay(a.durationSec > 0 ? a.elapsedSec / a.durationSec : 1, a.mode);
  }

  /** Stinger đang che kín 100% khung hình — renderer có thể bỏ vẽ cảnh sân phía sau để tiết kiệm GPU. */
  isFullyCovering(): boolean {
    const a = this.active;
    if (!a) return false;
    const progress = a.durationSec > 0 ? a.elapsedSec / a.durationSec : 0;
    return sampleTransitionCurve(progress, a.mode).fullyCovered;
  }

  /** Độ lệch dolly camera sau khi vừa mở màn che (êm dần về 0). */
  currentDollyOffset(nowMs = performance.now()): { y: number; z: number } {
    if (this.lastCoveredAtMs === null) return { y: 0, z: 0 };
    const elapsedSec = Math.max(0, (nowMs - this.lastCoveredAtMs) / 1000);
    return dollyOffset(elapsedSec, this.lastReducedMotion);
  }

  /** Vẽ lớp 3D stinger đè lên khung hình (chỉ chạy khi đang ở chế độ `3d`). */
  render(skippedMainScene = false): void {
    const a = this.active;
    if (!a || a.mode !== '3d') return;

    const { renderer, scene, camera } = this;
    const prevAutoClear = renderer.autoClear;
    renderer.autoClear = false;
    if (skippedMainScene) {
      renderer.clear(true, true, false);
    } else {
      renderer.clearDepth();
    }
    renderer.render(scene, camera);
    renderer.autoClear = prevAutoClear;
  }

  resize(width: number, height: number): void {
    if (width <= 0 || height <= 0) return;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
  }

  dispose(): void {
    this.active = null;
    this.overlayEl.remove();
    this.leftShutter.geometry.dispose();
    this.rightShutter.geometry.dispose();
    this.crestMesh.geometry.dispose();
    this.sparkPoints.geometry.dispose();
    this.shutterMat.dispose();
    this.crestMat.dispose();
    this.sparkMat.dispose();
  }

  private applyProgress(progress: number): void {
    const a = this.active;
    if (!a) return;
    const sample = sampleTransitionCurve(progress, a.mode);

    if (a.mode === '3d') {
      const split = sample.shutterSplit;
      const spreadX = 8.4 * split;
      const spreadY = 1.15 * split;
      const spreadZ = -1.6 * split;

      this.leftShutter.position.set(-spreadX, spreadY, spreadZ);
      this.leftShutter.rotation.set(0, 0.28 * split, 0);

      this.rightShutter.position.set(spreadX, -spreadY, spreadZ);
      this.rightShutter.rotation.set(0, -0.28 * split, 0);

      // Đặt huy hiệu 3D ở khoảng giữa bảng tỉ số phía trên và bảng nhãn v3 phía dưới (y = 0.16).
      this.crestMesh.position.set(0, 0.16, sample.crestZ);
      this.crestMesh.rotation.set(
        sample.crestRotX,
        sample.crestRotY * a.spinSign * a.spinMult,
        -0.06 * (1 - sample.cover),
      );
      this.crestMesh.scale.setScalar(sample.crestScale * 0.62);

      (this.shutterMat.uniforms.uSweep as { value: number }).value = sample.sweep;
      (this.shutterMat.uniforms.uOpacity as { value: number }).value = 1;
      (this.crestMat.uniforms.uSweep as { value: number }).value = sample.sweep;
      (this.crestMat.uniforms.uOpacity as { value: number }).value = sample.crestOpacity;

      (this.sparkMat.uniforms.uProgress as { value: number }).value = progress;
      (this.sparkMat.uniforms.uOpacity as { value: number }).value =
        sample.cover * sample.crestOpacity;

      if (sample.labelOpacity > 0.001) {
        this.lastLabelVisible = true;
        this.plaqueEl.style.opacity = sample.labelOpacity.toFixed(3);
        this.plaqueEl.style.transform = `translate3d(-50%, -50%, 0) scale(${sample.labelScale.toFixed(3)})`;
      } else if (this.lastLabelVisible) {
        this.lastLabelVisible = false;
        this.plaqueEl.style.opacity = '0';
      }
      return;
    }

    const style = this.overlayEl.style;
    style.setProperty('--stinger-cover', sample.cover.toFixed(3));
    style.setProperty('--stinger-split', sample.shutterSplit.toFixed(3));
    style.setProperty('--stinger-label-opacity', sample.labelOpacity.toFixed(3));
    style.setProperty('--stinger-label-scale', sample.labelScale.toFixed(3));
    this.plaqueEl.style.opacity = sample.labelOpacity.toFixed(3);
    this.plaqueEl.style.transform = `translate3d(-50%, -50%, 0) scale(${sample.labelScale.toFixed(3)})`;
  }

  private createOverlayDom(): {
    root: HTMLDivElement;
    plaque: HTMLElement;
    label: HTMLElement;
    sublabel: HTMLElement;
  } {
    const root = document.createElement('div');
    root.className = 'stinger-overlay';
    root.setAttribute('aria-hidden', 'true');
    root.style.opacity = '0';

    root.innerHTML =
      '<div class="stinger-2d">' +
      '<div class="stinger-2d__wing stinger-2d__wing--left"></div>' +
      '<div class="stinger-2d__wing stinger-2d__wing--right"></div>' +
      '<div class="stinger-2d__crest">' +
      '<span class="stinger-2d__monogram" data-text="MFG">MFG</span>' +
      '</div>' +
      '</div>' +
      '<div class="stinger-scrim"></div>' +
      '<div class="stinger-plaque" style="opacity:0">' +
      '<span class="stinger-plaque__sub">TÌNH HUỐNG CỐ ĐỊNH</span>' +
      '<strong class="stinger-plaque__label">GIAO BÓNG</strong>' +
      '</div>';

    const plaque = root.querySelector('.stinger-plaque') as HTMLElement;
    const label = root.querySelector('.stinger-plaque__label') as HTMLElement;
    const sublabel = root.querySelector('.stinger-plaque__sub') as HTMLElement;
    return { root, plaque, label, sublabel };
  }
}
