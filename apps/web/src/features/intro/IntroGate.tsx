import { useCallback, useEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router';
import {
  introMode,
  LOGO_AT_SEC,
  markIntroSeen,
  readIntroSeen,
  STATIC_INTRO_MS,
  type IntroMode,
} from './intro';

const storage = (): Storage | null => {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
};

/**
 * Route gốc: hiện màn bên dưới ngay (đăng nhập/menu tải song song), intro phủ lên trên cho tới khi
 * xong hoặc người chơi bấm/gõ phím bất kỳ. Three.js chỉ tải khi intro thật sự chạy.
 */
export function IntroGate() {
  const { pathname } = useLocation();
  const [mode, setMode] = useState<IntroMode>(() =>
    introMode({
      seen: readIntroSeen(storage()),
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      path: pathname,
    }),
  );
  const finish = useCallback(() => {
    markIntroSeen(storage());
    setMode('none');
  }, []);
  const fallback = useCallback(() => setMode('static'), []);

  return (
    <>
      <Outlet />
      {mode !== 'none' && <IntroOverlay mode={mode} onDone={finish} onFallback={fallback} />}
    </>
  );
}

function IntroOverlay({
  mode,
  onDone,
  onFallback,
}: {
  mode: 'full' | 'static';
  onDone: () => void;
  onFallback: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const [leaving, setLeaving] = useState(false);
  const leave = useCallback(() => setLeaving(true), []);

  // Mờ dần (--dur-base) rồi mới gỡ overlay.
  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(onDone, 240);
    return () => window.clearTimeout(id);
  }, [leaving, onDone]);

  useEffect(() => {
    const skip = () => leave();
    window.addEventListener('keydown', skip);
    window.addEventListener('pointerdown', skip);
    return () => {
      window.removeEventListener('keydown', skip);
      window.removeEventListener('pointerdown', skip);
    };
  }, [leave]);

  useEffect(() => {
    if (mode === 'static') {
      const id = window.setTimeout(leave, STATIC_INTRO_MS);
      return () => window.clearTimeout(id);
    }
    let disposed = false;
    let renderer: { dispose(): void } | null = null;
    import('../../game/three/IntroRenderer')
      .then(({ IntroRenderer }) => {
        if (disposed || !host.current) return;
        renderer = new IntroRenderer(host.current, leave);
      })
      .catch(() => {
        if (!disposed) onFallback(); // không tải được chunk hoặc không có WebGL
      });
    return () => {
      disposed = true;
      renderer?.dispose();
    };
  }, [mode, leave, onFallback]);

  return (
    <div
      className={`intro${leaving ? ' intro--leaving' : ''}${mode === 'static' ? ' intro--static' : ''}`}
      role="presentation"
    >
      <div ref={host} className="intro__canvas" aria-hidden="true" />
      <h1
        className="intro__logo"
        style={{ animationDelay: mode === 'full' ? `${LOGO_AT_SEC}s` : '0s' }}
      >
        MFG
        <span className="intro__tag">My Football Game</span>
      </h1>
      <p className="intro__skip">Bấm phím bất kỳ để bỏ qua</p>
    </div>
  );
}
