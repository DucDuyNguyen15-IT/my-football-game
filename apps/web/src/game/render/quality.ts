/**
 * Cấu hình đồ hoạ (ADR-0009), thuần (không Three.js) để test. Hai preset — Thấp: cho máy trung bình,
 * không bóng đổ thật, không hậu kỳ; Cao: bóng đổ mềm, đèn pha rọi, bloom, bầu trời, khán giả, cỏ 3D,
 * SSAO — và người chơi bật/tắt riêng từng chi tiết đè lên preset (task 5.21).
 */
import type { GraphicsQuality, GraphicsSettings, GraphicsToggle, TimeOfDay } from '../bridge';

export interface QualitySettings {
  /** Trần devicePixelRatio. */
  maxPixelRatio: number;
  shadows: boolean;
  /** Cạnh shadow map của đèn chính (px). */
  shadowMapSize: number;
  /** PCF mềm (đắt hơn) thay cho PCF thường. */
  softShadows: boolean;
  /** Hậu kỳ: bloom + tone mapping ACES + SMAA. Tắt thì vẽ thẳng ra màn hình (MSAA của canvas). */
  postFx: boolean;
  /** Cường độ bloom (0 = tắt). */
  bloomStrength: number;
  /** 4 đèn spot rọi từ cột đèn pha xuống sân (không đổ bóng). */
  floodSpots: boolean;
  /** Bầu trời, mái khán đài. */
  skyAndRoof: boolean;
  /** Sợi cỏ 3D (instancing) quanh khu vực camera đang nhìn. */
  grass3d: boolean;
  /** Khán giả trên khán đài, cổ vũ khi có bàn thắng. */
  crowd: boolean;
  /** Che bóng môi trường (cần hậu kỳ). */
  ssao: boolean;
  /** Phát lại quay chậm sau bàn thắng (không tốn GPU, chỉ là tuỳ chọn trải nghiệm). */
  replay: boolean;
}

export const QUALITY: Record<GraphicsQuality, QualitySettings> = {
  low: {
    maxPixelRatio: 1,
    shadows: false,
    shadowMapSize: 1024,
    softShadows: false,
    postFx: false,
    bloomStrength: 0,
    floodSpots: false,
    skyAndRoof: false,
    grass3d: false,
    crowd: false,
    ssao: false,
    replay: true,
  },
  high: {
    maxPixelRatio: 2,
    shadows: true,
    shadowMapSize: 2048,
    softShadows: true,
    postFx: true,
    bloomStrength: 0.55,
    floodSpots: true,
    skyAndRoof: true,
    grass3d: true,
    crowd: true,
    ssao: true,
    replay: true,
  },
};

/** Thứ tự hiện trong menu Tuỳ chỉnh đồ hoạ. */
export const GRAPHICS_TOGGLES: readonly { key: GraphicsToggle; label: string }[] = [
  { key: 'shadows', label: 'Bóng đổ' },
  { key: 'postFx', label: 'Hậu kỳ (bloom, khử răng cưa)' },
  { key: 'ssao', label: 'Che bóng môi trường (SSAO)' },
  { key: 'floodSpots', label: 'Đèn pha rọi sân' },
  { key: 'skyAndRoof', label: 'Bầu trời & mái khán đài' },
  { key: 'grass3d', label: 'Cỏ 3D' },
  { key: 'crowd', label: 'Khán giả' },
  { key: 'replay', label: 'Phát lại bàn thắng' },
];

export const TIMES_OF_DAY: readonly { key: TimeOfDay; label: string }[] = [
  { key: 'night', label: 'Đêm' },
  { key: 'dusk', label: 'Hoàng hôn' },
  { key: 'day', label: 'Ngày' },
];

export const DEFAULT_GRAPHICS: GraphicsSettings = {
  preset: 'high',
  overrides: {},
  timeOfDay: 'night',
};

/** Preset + phần người chơi bật/tắt riêng. Bloom và SSAO chạy trong hậu kỳ nên tắt hậu kỳ là tắt cả hai. */
export function resolveQuality(settings: GraphicsSettings): QualitySettings {
  const q: QualitySettings = { ...QUALITY[settings.preset], ...settings.overrides };
  if (!q.postFx) {
    q.bloomStrength = 0;
    q.ssao = false;
  } else if (q.bloomStrength === 0) {
    q.bloomStrength = QUALITY.high.bloomStrength;
  }
  return q;
}

const TOGGLE_KEYS = new Set<string>(GRAPHICS_TOGGLES.map((t) => t.key));
const TIME_KEYS = new Set<string>(TIMES_OF_DAY.map((t) => t.key));

/** Đọc cài đặt đã lưu (localStorage). Bản cũ chỉ lưu `'low' | 'high'`; hỏng thì về mặc định. */
export function parseGraphicsSettings(raw: string | null): GraphicsSettings {
  if (raw === 'low' || raw === 'high') return { ...DEFAULT_GRAPHICS, preset: raw };
  if (!raw) return DEFAULT_GRAPHICS;
  try {
    const v = JSON.parse(raw) as Partial<GraphicsSettings> | null;
    if (typeof v !== 'object' || v === null) return DEFAULT_GRAPHICS;
    const overrides: GraphicsSettings['overrides'] = {};
    for (const [k, on] of Object.entries(v.overrides ?? {})) {
      if (TOGGLE_KEYS.has(k) && typeof on === 'boolean') overrides[k as GraphicsToggle] = on;
    }
    return {
      preset: v.preset === 'low' ? 'low' : 'high',
      overrides,
      timeOfDay:
        typeof v.timeOfDay === 'string' && TIME_KEYS.has(v.timeOfDay)
          ? v.timeOfDay
          : DEFAULT_GRAPHICS.timeOfDay,
    };
  } catch {
    return DEFAULT_GRAPHICS;
  }
}

/** Bật/tắt một chi tiết: trùng với preset thì bỏ khỏi `overrides` (menu hiện "đúng preset"). */
export function toggleGraphics(
  settings: GraphicsSettings,
  key: GraphicsToggle,
  on: boolean,
): GraphicsSettings {
  const overrides = { ...settings.overrides };
  if (QUALITY[settings.preset][key] === on) delete overrides[key];
  else overrides[key] = on;
  return { ...settings, overrides };
}

/** Pixel ratio thực dùng: theo màn hình nhưng không vượt trần của mức đồ hoạ. */
export function pixelRatioFor(q: QualitySettings, devicePixelRatio: number): number {
  return Math.max(1, Math.min(devicePixelRatio || 1, q.maxPixelRatio));
}
