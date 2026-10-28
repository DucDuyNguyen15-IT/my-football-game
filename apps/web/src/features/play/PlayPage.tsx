import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Difficulty, StartedMatch } from '@pitch/shared';
import type { MatchSetup, MatchState } from '@pitch/sim';
import { ApiClientError } from '../../api/client';
import { useStartMatch } from '../../api/matches';
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
  | { kind: 'starting'; difficulty: Difficulty; error?: unknown }
  /** `match.token` giữ lại để nộp kết quả (task 7.2). */
  | { kind: 'match'; difficulty: Difficulty; match: StartedMatch }
  | { kind: 'result'; difficulty: Difficulty; hud: HudSnapshot };

/**
 * `/play` — luồng một trận vs máy: chọn độ khó → server dựng trận (`POST /matches`: đội của mình từ
 * đội hình đã lưu, đội máy, seed, token) → trận → kết quả. Dev/test: `?half=<giây>`, `?autopilot=1`
 * (bỏ qua màn chọn độ khó; `?difficulty=hard`).
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
      ? { kind: 'starting', difficulty: params.get('difficulty') === 'hard' ? 'hard' : 'easy' }
      : { kind: 'select' },
  );
  const { mutate } = useStartMatch();
  const start = useCallback(
    (difficulty: Difficulty) => {
      setStage({ kind: 'starting', difficulty });
      mutate(difficulty, {
        onSuccess: (match) => setStage({ kind: 'match', difficulty, match }),
        onError: (error) => setStage({ kind: 'starting', difficulty, error }),
      });
    },
    [mutate],
  );
  // Autopilot vào thẳng trận: gọi API một lần khi mở trang (không autopilot thì đã chọn bằng tay).
  const autoStarted = useRef(!dev.autopilot);
  useEffect(() => {
    if (stage.kind !== 'starting' || autoStarted.current) return;
    autoStarted.current = true;
    start(stage.difficulty);
  }, [stage, start]);

  return (
    <div className="play-root">
      {stage.kind === 'select' && <DifficultySelect onPick={start} />}
      {stage.kind === 'starting' && (
        <MatchStarting
          error={stage.error}
          onRetry={() => start(stage.difficulty)}
          onBack={() => setStage({ kind: 'select' })}
        />
      )}
      {stage.kind === 'match' && (
        <MatchView
          key={stage.match.matchId}
          difficulty={stage.difficulty}
          match={stage.match}
          halfLengthSec={dev.halfLengthSec}
          autopilot={dev.autopilot ?? false}
          onEnd={(hud) => setStage({ kind: 'result', difficulty: stage.difficulty, hud })}
          onQuit={() => void navigate('/')}
        />
      )}
      {stage.kind === 'result' && (
        <ResultScreen hud={stage.hud} onRematch={() => start(stage.difficulty)} />
      )}
    </div>
  );
}

interface MatchStartingProps {
  error: unknown;
  onRetry: () => void;
  onBack: () => void;
}

/** Chờ server dựng trận; lỗi đội hình (`invalid_squad`) → dẫn sang màn đội hình. */
function MatchStarting({ error, onRetry, onBack }: MatchStartingProps) {
  if (!error) {
    return (
      <section className="screen" aria-busy="true">
        <p className="screen-title" role="status">
          Đang chuẩn bị trận…
        </p>
      </section>
    );
  }
  const squadIssue = error instanceof ApiClientError && error.code === 'invalid_squad';
  const message =
    error instanceof ApiClientError ? error.message : 'Không bắt đầu được trận. Thử lại sau.';
  return (
    <section className="screen" aria-labelledby="start-error-title">
      <h1 id="start-error-title" className="screen-title">
        {squadIssue ? 'Đội hình chưa đủ' : 'Không vào được trận'}
      </h1>
      <p role="alert">{message}</p>
      <div className="difficulty-list">
        {squadIssue ? (
          <Link to="/squad" className="btn btn--big" autoFocus>
            Sửa đội hình
          </Link>
        ) : (
          <button type="button" className="btn btn--big" autoFocus onClick={onRetry}>
            Thử lại
          </button>
        )}
        <button type="button" className="btn btn--ghost" onClick={onBack}>
          Chọn lại độ khó
        </button>
      </div>
    </section>
  );
}

interface MatchViewProps {
  difficulty: Difficulty;
  match: StartedMatch;
  halfLengthSec: number | undefined;
  autopilot: boolean;
  onEnd: (hud: HudSnapshot) => void;
  onQuit: () => void;
}

function MatchView({ difficulty, match, halfLengthSec, autopilot, onEnd, onQuit }: MatchViewProps) {
  const setup = useMemo<MatchSetup>(
    () => ({
      home: match.home,
      away: match.away,
      difficulty,
      seed: match.seed,
      ...(halfLengthSec !== undefined && { halfLengthSec }),
      ...(autopilot && { autopilot }),
    }),
    [difficulty, match, halfLengthSec, autopilot],
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
