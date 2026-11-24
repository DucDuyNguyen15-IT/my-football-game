import { useCallback, useEffect, useRef, useState } from 'react';
import { useBlocker } from 'react-router';
import type { MatchState, TeamSide } from '@pitch/sim';
import type { GraphicsSettings } from '../../game/bridge';
import { DEFAULT_GRAPHICS, parseGraphicsSettings } from '../../game/render/quality';
import { useI18n } from '../../i18n/I18nContext';
import { hudEvents, sameHud, toHudSnapshot, type HudSnapshot } from './hud';
import type { ShownEvent } from './MatchHud';

export const EVENT_SHOW_MS = 3000;
export const GOAL_BANNER_MS = 1200;
/** Bảng bù giờ hiện nổi bật chừng này ms lúc hiệp bước vào bù giờ. */
export const STOPPAGE_BOARD_MS = 4000;
export const HINTS_SHOW_MS = 10_000;
/** Dừng lại một chút sau tiếng còi hết trận rồi mới sang màn kết quả. */
export const FULL_TIME_HOLD_MS = 1500;
const QUALITY_KEY = 'pitch.gfx';

/** Cài đặt đồ hoạ nhớ theo trình duyệt (tiện ích riêng của người chơi; bị chặn storage thì dùng mặc định). */
export function loadGraphics(): GraphicsSettings {
  try {
    return parseGraphicsSettings(localStorage.getItem(QUALITY_KEY));
  } catch {
    return DEFAULT_GRAPHICS;
  }
}

export function saveGraphics(g: GraphicsSettings): void {
  try {
    localStorage.setItem(QUALITY_KEY, JSON.stringify(g));
  } catch {
    // Không lưu được thì chỉ áp dụng cho trận này.
  }
}

/**
 * Hỏi trước khi rời màn lúc `active`: link/Back trong ứng dụng (`useBlocker`) và đóng tab, tải lại,
 * Back ra ngoài trang (`beforeunload` — trình duyệt hiện câu hỏi mặc định của nó).
 */
export function useLeaveGuard(active: boolean, message: string): void {
  const blocker = useBlocker(active);
  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, message]);
  useEffect(() => {
    if (!active) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [active]);
}

/** Trạng thái HUD dùng chung cho cả đá với máy (`/play`) và PvP (`/pvp`). */
export function useMatchHud(side: TeamSide = 'home') {
  const { locale } = useI18n();
  const localeRef = useRef(locale);
  useEffect(() => {
    localeRef.current = locale;
  }, [locale]);

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [events, setEvents] = useState<ShownEvent[]>([]);
  const [goalBanner, setGoalBanner] = useState(0);
  const [stoppageBoard, setStoppageBoard] = useState(false);
  const lastHud = useRef<HudSnapshot | null>(null);
  const latestState = useRef<MatchState | null>(null);
  const nextEventId = useRef(1);

  const timers = useRef(new Set<number>());
  const later = useCallback((ms: number, fn: () => void) => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  }, []);
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const id of pending) window.clearTimeout(id);
      pending.clear();
    };
  }, []);

  const updateHud = useCallback(
    (state: MatchState, onChanged?: (snap: HudSnapshot, prev: HudSnapshot | null) => void) => {
      latestState.current = state;
      const last = lastHud.current;
      const snap = toHudSnapshot(state, last ?? undefined, side);
      if (last && sameHud(last, snap)) return;
      lastHud.current = snap;
      setHud(snap);
      if (snap.stoppage !== null && last && last.stoppage === null) {
        setStoppageBoard(true);
        later(STOPPAGE_BOARD_MS, () => setStoppageBoard(false));
      }
      for (const e of last ? hudEvents(last, snap, localeRef.current) : []) {
        const shown = { ...e, id: nextEventId.current++ };
        setEvents((list) => [...list, shown]);
        later(EVENT_SHOW_MS, () => setEvents((list) => list.filter((x) => x.id !== shown.id)));
        if (e.kind === 'goal') {
          setGoalBanner(shown.id);
          later(GOAL_BANNER_MS, () => setGoalBanner((b) => (b === shown.id ? 0 : b)));
        }
      }
      onChanged?.(snap, last);
    },
    [later, side],
  );

  return {
    hud,
    events,
    goalBanner,
    stoppageBoard,
    lastHud,
    latestState,
    later,
    updateHud,
  };
}
