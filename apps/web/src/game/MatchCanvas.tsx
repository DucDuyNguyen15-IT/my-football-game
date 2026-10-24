import { useEffect, useRef } from 'react';
import type { MatchSetup } from '@pitch/sim';
import type { GraphicsSettings, MatchBridge } from './bridge';
import { DEFAULT_GRAPHICS } from './render/quality';
import { MatchRenderer } from './three/MatchRenderer';

/**
 * Ranh giới React ↔ Three.js (ADR-0003, ADR-0009): tạo renderer khi mount, huỷ hẳn (canvas, WebGL
 * context, listener phím) khi unmount để vào/ra trận nhiều lần không rò tài nguyên.
 * Đổi `graphics` không tạo lại trận.
 */
export function MatchCanvas({
  setup,
  bridge,
  graphics = DEFAULT_GRAPHICS,
}: {
  setup: MatchSetup;
  bridge?: MatchBridge;
  graphics?: GraphicsSettings;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MatchRenderer | null>(null);
  const graphicsRef = useRef(graphics);

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    const renderer = new MatchRenderer(parent, setup, bridge, graphicsRef.current);
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = null;
      renderer.dispose();
    };
  }, [setup, bridge]);

  useEffect(() => {
    graphicsRef.current = graphics;
    rendererRef.current?.setGraphics(graphics);
  }, [graphics]);

  return (
    <div
      ref={hostRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
}
