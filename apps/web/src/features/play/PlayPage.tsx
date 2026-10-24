import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import type { Difficulty } from '@pitch/shared';
import {
  cpuEasyTeam,
  cpuHardTeam,
  starterLikeTeam,
  type MatchSetup,
  type MatchState,
} from '@pitch/sim';
import { MatchCanvas } from '../../game/MatchCanvas';
import type { GraphicsSettings, MatchBridge, MatchCommand } from '../../game/bridge';
import { DEFAULT_GRAPHICS, parseGraphicsSettings } from '../../game/render/quality';
import {
  hudEvents,
  readDevOptions,
  sameHud,
  subOptions,
  toHudSnapshot,
  type SubOptions,
  type DevOptions,
  type HudSnapshot,
} from './hud';
import { EventStrip, Minimap, PlayerPanel, Scoreboard, type ShownEvent } from './MatchHud';
import {
  DifficultySelect,
  HalfTimeOverlay,
  KeyHints,
  PauseMenu,
  ResultScreen,
  ShootoutHint,
} from './screens';
import '../../styles/tokens.css';
import './play.css';

/** Seed mới mỗi lần vào trận; trận vs máy chạy ở client nên seed không cần bí mật (ADR-0006). */
const newSeed = (): number => Math.floor(Math.random() * 2 ** 31);

const EVENT_SHOW_MS = 3000;
const GOAL_BANNER_MS = 1200;
const HINTS_SHOW_MS = 10_000;
/** Dừng lại một chút sau tiếng còi hết trận rồi mới sang màn kết quả. */
const FULL_TIME_HOLD_MS = 1500;
const QUALITY_KEY = 'pitch.gfx';

/** Cài đặt đồ hoạ nhớ theo trình duyệt (tiện ích riêng của người chơi; bị chặn storage thì dùng mặc định). */
function loadGraphics(): GraphicsSettings {
  try {
    return parseGraphicsSettings(localStorage.getItem(QUALITY_KEY));
  } catch {
    return DEFAULT_GRAPHICS;
  }
}

function saveGraphics(g: GraphicsSettings): void {
  try {
    localStorage.setItem(QUALITY_KEY, JSON.stringify(g));
  } catch {
    // Không lưu được thì chỉ áp dụng cho trận này.
  }
}

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
  const [graphics, setGraphics] = useState<GraphicsSettings>(loadGraphics);
  // Scene đọc cờ tạm dừng mỗi khung hình nên giữ thêm bản ref (không chờ React render).
  const pausedRef = useRef(false);
  const lastHud = useRef<HudSnapshot | null>(null);
  // State mới nhất cho minimap (tự vẽ ~10 Hz, không qua React state).
  const latestState = useRef<MatchState | null>(null);
  // Lệnh thay người chờ renderer áp vào sim ở khung hình kế tiếp.
  const commands = useRef<MatchCommand[]>([]);
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

  const [subs, setSubs] = useState<SubOptions>({ onPitch: [], bench: [] });
  const setPaused = useCallback((value: boolean) => {
    pausedRef.current = value;
    setPausedState(value);
    // Menu thay người đọc đội hình lúc mở (trận đứng yên khi tạm dừng).
    if (value && latestState.current) setSubs(subOptions(latestState.current));
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
      takeCommands: () => commands.current.splice(0),
      onState: (state) => {
        latestState.current = state;
        const last = lastHud.current;
        const snap = toHudSnapshot(state, last ?? undefined);
        if (last && sameHud(last, snap)) return;
        lastHud.current = snap;
        // Vừa thay người trong menu: cập nhật danh sách.
        if (pausedRef.current) setSubs(subOptions(state));
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
      <MatchCanvas setup={setup} bridge={bridge} graphics={graphics} />
      {hud && (
        <div className="hud">
          <div className="hud-top">
            <Scoreboard hud={hud} />
            <EventStrip events={events} />
          </div>
          <Minimap stateRef={latestState} />
          <PlayerPanel controlled={autopilot ? null : hud.controlled} />
          <p className="hud-pause-hint">
            <kbd>Esc</kbd> Tạm dừng
          </p>
          {hud.shootout?.turn === 'home' && !autopilot ? (
            <ShootoutHint />
          ) : (
            hints && !autopilot && <KeyHints />
          )}
        </div>
      )}
      {goalBanner > 0 && (
        <div className="goal-banner" aria-hidden="true">
          VÀO!
        </div>
      )}
      {hud?.phase === 'half_time' && !autopilot && !paused && <HalfTimeOverlay hud={hud} />}
      {paused && (
        <PauseMenu
          graphics={graphics}
          onGraphics={(g) => {
            setGraphics(g);
            saveGraphics(g);
          }}
          onResume={() => setPaused(false)}
          onQuit={onQuit}
          subs={{
            allowed: hud?.ballDead === true && hud.phase !== 'full_time' && hud.shootout === null,
            left: hud?.subsLeft ?? 0,
            options: subs,
            onSubstitute: (outId, benchSlot) =>
              commands.current.push({ type: 'substitute', outId, benchSlot }),
          }}
        />
      )}
    </>
  );
}
