import { describe, expect, it } from 'vitest';
import {
  AVATAR_BEARDS,
  AVATAR_FACE_WIDTHS,
  AVATAR_HAIR_STYLES,
  AVATAR_HAIRS,
  AVATAR_JAW_RATIOS,
  AVATAR_MOUTH_STYLES,
  AVATAR_SKINS,
  avatarSpec,
} from './avatar';

describe('avatarSpec', () => {
  it('cùng seed → cùng khuôn mặt', () => {
    expect(avatarSpec('a1b2c3')).toEqual(avatarSpec('a1b2c3'));
  });

  it('seed khác nhau cho khuôn mặt đa dạng, mọi tham số trong tập cho phép', () => {
    const specs = Array.from({ length: 200 }, (_, i) => avatarSpec(`seed-${i}`));
    for (const s of specs) {
      expect(AVATAR_SKINS).toContain(s.skin);
      expect(AVATAR_HAIRS).toContain(s.hair);
      expect(AVATAR_FACE_WIDTHS).toContain(s.faceWidth);
      expect(AVATAR_JAW_RATIOS).toContain(s.jawRatio);
      expect(s.hairStyle).toBeGreaterThanOrEqual(0);
      expect(s.hairStyle).toBeLessThan(AVATAR_HAIR_STYLES);
      expect(s.beard).toBeGreaterThanOrEqual(0);
      expect(s.beard).toBeLessThan(AVATAR_BEARDS);
      expect(s.mouthStyle).toBeGreaterThanOrEqual(0);
      expect(s.mouthStyle).toBeLessThan(AVATAR_MOUTH_STYLES);
      expect(s.browY).toBeGreaterThanOrEqual(36.4);
      expect(s.browY).toBeLessThanOrEqual(37.8);
      expect(s.eyeGap).toBeGreaterThanOrEqual(7.3);
      expect(s.eyeGap).toBeLessThanOrEqual(8.3);
      expect(s.browTilt).toBeGreaterThanOrEqual(-0.8);
      expect(s.browTilt).toBeLessThanOrEqual(1.2);
    }
    const distinct = new Set(specs.map((s) => JSON.stringify(s)));
    expect(distinct.size).toBeGreaterThan(150);
    expect(new Set(specs.map((s) => s.hairStyle)).size).toBe(AVATAR_HAIR_STYLES);
    expect(new Set(specs.map((s) => s.beard)).size).toBe(AVATAR_BEARDS);
    expect(new Set(specs.map((s) => s.mouthStyle)).size).toBe(AVATAR_MOUTH_STYLES);
    expect(new Set(specs.map((s) => s.skin)).size).toBe(AVATAR_SKINS.length);
  });
});
