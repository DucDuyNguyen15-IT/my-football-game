import { useEffect, useRef } from 'react';
import type { MatchSetup } from '@pitch/sim';
import type { GraphicsQuality, MatchBridge } from './bridge';
import { MatchRenderer } from './three/MatchRenderer';

/**
 * Ranh giới React ↔ Three.js (ADR-0003, ADR-0009): tạo renderer khi mount, huỷ hẳn (canvas, WebGL
 * context, listener phím) khi unmount để vào/ra trận nhiều lần không rò tài nguyên.
 * Đổi `quality` không tạo lại trận.
 */
export function MatchCanvas({
  setup,
  bridge,
  quality = 'high',
}: {
  setup: MatchSetup;
  bridge?: MatchBridge;
  quality?: GraphicsQuality;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MatchRenderer | null>(null);
  const qualityRef = useRef(quality);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    const renderer = new MatchRenderer(parent, setup, bridge, qualityRef.current);
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = null;
      renderer.dispose();
    };
  }, [setup, bridge]);

  useEffect(() => {
    qualityRef.current = quality;
    rendererRef.current?.setQuality(quality);
  }, [quality]);

  return (
    <div
      ref={hostRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
}
