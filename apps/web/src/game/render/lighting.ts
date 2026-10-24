/**
 * Ánh sáng theo thời điểm trận (task 5.21), thuần để test: màu nền/sương mù, đèn bán cầu, "mặt
 * trời" (đèn chính đổ bóng), màu vòm trời, sao và độ sáng đèn pha rọi sân.
 */
import type { TimeOfDay } from '../bridge';
import { COLORS } from './colors';

export interface Lighting {
  background: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  sunColor: number;
  sunIntensity: number;
  /** Vị trí đèn chính (m); thấp = bóng đổ dài. */
  sunPos: readonly [number, number, number];
  skyHorizon: number;
  skyZenith: number;
  stars: boolean;
  /** Nhân vào cường độ 4 đèn spot rọi sân (0 = tắt). */
  floodScale: number;
}

export const LIGHTING: Record<TimeOfDay, Lighting> = {
  night: {
    background: COLORS.bg,
    hemiSky: 0xcfe3ff,
    hemiGround: 0x0b1a10,
    hemiIntensity: 1.1,
    sunColor: 0xfff4e0,
    sunIntensity: 2.4,
    sunPos: [-18, 40, 22],
    skyHorizon: 0x16302a,
    skyZenith: 0x03070a,
    stars: true,
    floodScale: 1,
  },
  dusk: {
    background: 0x3a2a35,
    hemiSky: 0xffd2b0,
    hemiGround: 0x1d1612,
    hemiIntensity: 1.0,
    sunColor: 0xffa060,
    sunIntensity: 2.6,
    sunPos: [-40, 16, 12],
    skyHorizon: 0xf08a50,
    skyZenith: 0x232a4d,
    stars: false,
    floodScale: 0.5,
  },
  day: {
    background: 0xa9cdec,
    hemiSky: 0xe3f0ff,
    hemiGround: 0x3d5a32,
    hemiIntensity: 1.3,
    sunColor: 0xfff8ea,
    sunIntensity: 2.9,
    sunPos: [-15, 45, 25],
    skyHorizon: 0xd2e7f7,
    skyZenith: 0x4c8fd4,
    stars: false,
    floodScale: 0,
  },
};
