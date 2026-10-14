import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Difficulty } from '@pitch/shared';
import { cpuEasyTeam, cpuHardTeam, starterLikeTeam, type MatchSetup } from '@pitch/sim';
import { MatchCanvas } from '../../game/MatchCanvas';
import type { MatchBridge } from '../../game/scenes/MatchScene';
import {
  hudEvents,
  readDevOptions,
  sameHud,
  toHudSnapshot,
  type DevOptions,
  type HudSnapshot,
} from './hud';
import { EventStrip, PlayerPanel, Scoreboard, type ShownEvent } from './MatchHud';
import { DifficultySelect, HalfTimeOverlay, KeyHints, PauseMenu, ResultScreen } from './screens';
import '../../styles/tokens.css';
import './play.css';

/** Seed mới mỗi lần vào trận; trận vs máy chạy ở client nên seed không cần bí mật (ADR-0006). */
const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

const EVENT_SHOW_MS = 3000;
const GOAL_BANNER_MS = 1200;
const HINTS_SHOW_MS = 10_000;
/** Dừng lại một chút sau tiếng còi hết trận rồi mới sang màn kết quả. */
const FULL_TIME_HOLD_MS = 1500;

type Stage =
  | { kind: 'select' }
  | { kind: 'match'; difficulty: Difficulty; seed: number }
  | { kind: 'result'; difficulty: Difficulty; hud: HudSnapshot };

/**
 * `/play` — luồng một trận vs máy: chọn độ khó → trận → kết quả. Đội demo hư cấu (tới GĐ6 mới có
 * đội từ thẻ). Dev/test: `?half=<giây>`, `?autopilot=1` (bỏ qua màn chọn độ khó; `?difficulty=hard`).
 */
export function PlayPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Điều kiện tĩnh để build production loại bỏ hẳn đoạn đọc tham số.
  const dev: DevOptions =
    import.meta.env.DEV || import.meta.env.MODE === 'test'
      ? readDevOptions(params.toString(), import.meta.env)
      : {};
  const [stage, setStage] = useState<Stage>(() =>
    dev.autopilot
      ? {
          kind: 'match',
          difficulty: params.get('difficulty') === 'hard' ? 'hard' : 'easy',
          seed: newSeed(),
        }
      : { kind: 'select' },
  );

  return (
    <div className="play-root">
      {stage.kind === 'select' && (
        <DifficultySelect
          onPick={(difficulty) => setStage({ kind: 'match', difficulty, seed: newSeed() })}
        />
      )}
      {stage.kind === 'match' && (
        <MatchView
          key={stage.seed}
          difficulty={stage.difficulty}
          seed={stage.seed}
          halfLengthSec={dev.halfLengthSec}
          autopilot={dev.autopilot ?? false}
          onEnd={(hud) => setStage({ kind: 'result', difficulty: stage.difficulty, hud })}
          onQuit={() => void navigate('/')}
        />
      )}
      {stage.kind === 'result' && (
        <ResultScreen
          hud={stage.hud}
          onRematch={() =>
            setStage({ kind: 'match', difficulty: stage.difficulty, seed: newSeed() })
          }
        />
      )}
    </div>
  );
}

interface MatchViewProps {
  difficulty: Difficulty;
  seed: number;
  halfLengthSec: number | undefined;
  autopilot: boolean;
  onEnd: (hud: HudSnapshot) => void;
  onQuit: () => void;
}

function MatchView({ difficulty, seed, halfLengthSec, autopilot, onEnd, onQuit }: MatchViewProps) {
  const setup = useMemo<MatchSetup>(
    () => ({
      home: starterLikeTeam,
      away: difficulty === 'hard' ? cpuHardTeam : cpuEasyTeam,
      difficulty,
      seed,
      ...(halfLengthSec !== undefined && { halfLengthSec }),
      ...(autopilot && { autopilot }),
    }),
    [difficulty, seed, halfLengthSec, autopilot],
  );

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [events, setEvents] = useState<ShownEvent[]>([]);
  const [goalBanner, setGoalBanner] = useState(0);
  const [hints, setHints] = useState(true);
  const [paused, setPausedState] = useState(false);
  // Scene đọc cờ tạm dừng mỗi khung hình nên giữ thêm bản ref (không chờ React render).
  const pausedRef = useRef(false);
  const lastHud = useRef<HudSnapshot | null>(null);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

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

  useEffect(() => later(HINTS_SHOW_MS, () => setHints(false)), [later]);

  const setPaused = useCallback((value: boolean) => {
    pausedRef.current = value;
    setPausedState(value);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || lastHud.current?.phase === 'full_time') return;
      e.preventDefault();
      setPaused(!pausedRef.current);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setPaused]);

  const bridge = useMemo<MatchBridge>(() => {
    let nextId = 1;
    return {
      isPaused: () => pausedRef.current,
      onState: (state) => {
        const last = lastHud.current;
        const snap = toHudSnapshot(state, last ?? undefined);
        if (last && sameHud(last, snap)) return;
        lastHud.current = snap;
        setHud(snap);
        for (const e of last ? hudEvents(last, snap) : []) {
          const shown = { ...e, id: nextId++ };
          setEvents((list) => [...list, shown]);
          later(EVENT_SHOW_MS, () => setEvents((list) => list.filter((x) => x.id !== shown.id)));
          if (e.kind === 'goal') {
            setGoalBanner(shown.id);
            later(GOAL_BANNER_MS, () => setGoalBanner((b) => (b === shown.id ? 0 : b)));
          }
        }
        if (snap.phase === 'full_time') later(FULL_TIME_HOLD_MS, () => onEndRef.current(snap));
      },
    };
  }, [later]);

  return (
    <>
      <MatchCanvas setup={setup} bridge={bridge} />
      {hud && (
        <div className="hud">
          <div className="hud-top">
            <Scoreboard hud={hud} />
            <EventStrip events={events} />
          </div>
          <PlayerPanel controlled={autopilot ? null : hud.controlled} />
          <p className="hud-pause-hint">
            <kbd>Esc</kbd> Tạm dừng
          </p>
          {hints && !autopilot && <KeyHints />}
        </div>
      )}
      {goalBanner > 0 && (
        <div className="goal-banner" aria-hidden="true">
          VÀO!
        </div>
      )}
      {hud?.phase === 'half_time' && !autopilot && !paused && <HalfTimeOverlay hud={hud} />}
      {paused && <PauseMenu onResume={() => setPaused(false)} onQuit={onQuit} />}
    </>
  );
}
