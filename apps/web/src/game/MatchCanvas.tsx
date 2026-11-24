import { useEffect, useRef, useState } from 'react';
import type { MatchSetup } from '@pitch/sim';
import type { GraphicsSettings, MatchBridge } from './bridge';
import { DEFAULT_GRAPHICS } from './render/quality';
import { MatchRenderer } from './three/MatchRenderer';
import type { NetMatch } from '../features/pvp/useNetMatch';
import { useI18n } from '../i18n/I18nContext';

/**
 * Ranh giới React ↔ Three.js (ADR-0003, ADR-0009): tạo renderer khi mount, huỷ hẳn (canvas, WebGL
 * context, listener phím) khi unmount để vào/ra trận nhiều lần không rò tài nguyên.
 * Đổi `graphics` không tạo lại trận.
 */
export function MatchCanvas({
  setup,
  bridge,
  graphics = DEFAULT_GRAPHICS,
  avatarSeeds,
  net,
}: {
  setup: MatchSetup;
  bridge?: MatchBridge;
  graphics?: GraphicsSettings;
  avatarSeeds?: ReadonlyMap<string, string>;
  /** PvP: vẽ state từ client WS thay vì tự chạy sim. */
  net?: NetMatch;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<MatchRenderer | null>(null);
  const graphicsRef = useRef(graphics);
  const avatarSeedsRef = useRef(avatarSeeds);
  const [failed, setFailed] = useState(false);
  const { t } = useI18n();

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;
    let renderer: MatchRenderer;
    try {
      renderer = new MatchRenderer(
        parent,
        setup,
        bridge,
        graphicsRef.current,
        avatarSeedsRef.current,
        net,
      );
    } catch (err) {
      // Không có WebGL (tắt tăng tốc phần cứng, hết context): báo lỗi thay vì trắng cả app (C4 G4).
      console.error(err);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- lỗi từ hệ ngoài (WebGL), chỉ một lần
      setFailed(true);
      return;
    }
    rendererRef.current = renderer;
    return () => {
      rendererRef.current = null;
      renderer.dispose();
    };
  }, [setup, bridge, net]);

  useEffect(() => {
    graphicsRef.current = graphics;
    rendererRef.current?.setGraphics(graphics);
  }, [graphics]);

  useEffect(() => {
    avatarSeedsRef.current = avatarSeeds;
    rendererRef.current?.setAvatarSeeds(avatarSeeds);
  }, [avatarSeeds]);

  if (failed) {
    return (
      <div className="screen-msg" role="alert">
        <p>{t('match.webglError')}</p>
      </div>
    );
  }
  return (
    <div
      ref={hostRef}
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    />
  );
}
