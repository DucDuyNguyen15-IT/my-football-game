/**
 * Cấu hình từng mức đồ hoạ (ADR-0009), thuần (không Three.js) để test. Thấp: cho máy trung bình —
 * không bóng đổ thật, không hậu kỳ. Cao: cho máy mạnh — bóng đổ mềm, đèn pha rọi, bloom, bầu trời
 * đêm, mái khán đài.
 */
import type { GraphicsQuality } from '../bridge';

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
  /** Bầu trời đêm có sao, mái khán đài. */
  skyAndRoof: boolean;
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
  },
};

/** Pixel ratio thực dùng: theo màn hình nhưng không vượt trần của mức đồ hoạ. */
export function pixelRatioFor(quality: GraphicsQuality, devicePixelRatio: number): number {
  return Math.max(1, Math.min(devicePixelRatio || 1, QUALITY[quality].maxPixelRatio));
}
