import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import type { Difficulty, StartedMatch } from '@pitch/shared';
import { buildMatchSetup, InputRecorder, type MatchSetup } from '@pitch/sim';
import { ApiClientError } from '../../api/client';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { isTransientError, useStartMatch, useSubmitMatchResult } from '../../api/matches';
import { useClaimMission, useTodayMissions } from '../../api/missions';
import { MatchCanvas } from '../../game/MatchCanvas';
import type { GraphicsSettings, MatchBridge, MatchCommand } from '../../game/bridge';
import { avatarSeedsForMatch } from '../../game/render/kit';
import { MatchTutorialOverlay } from '../onboarding/MatchTutorialOverlay';
import { markTutorialSeen, readTutorialSeen, resetTutorialSeen } from '../onboarding/onboarding';
import { errorMessageFor } from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';
import {
  loadSavedDifficulty,
  readDevOptions,
  resultBody,
  saveDifficulty,
  subOptions,
  type SubOptions,
  type DevOptions,
  type HudSnapshot,
} from './hud';
import {
  EventStrip,
  Minimap,
  PlayerPanel,
  PowerLegend,
  Scoreboard,
  StoppageBoard,
  ShootoutPanel,
} from './MatchHud';
import {
  FULL_TIME_HOLD_MS,
  HINTS_SHOW_MS,
  loadGraphics,
  saveGraphics,
  useLeaveGuard,
  useMatchHud,
} from './matchShared';
import { isTouchOnly, NeedKeyboard, PreMatch, Versus } from './PreMatch';
import {
  HalfTimeStrip,
  KeyHints,
  PauseMenu,
  ResultScreen,
  ShootoutHint,
  isUnsavedResult,
  type RewardStatus,
} from './screens';
import '../../styles/tokens.css';
import './play.css';

type Stage =
  | { kind: 'select' }
  | { kind: 'starting'; difficulty: Difficulty; error?: unknown }
  /** Server đã dựng trận → màn đối đầu (báo luôn nếu trận không có thưởng). */
  | { kind: 'versus'; difficulty: Difficulty; match: StartedMatch }
  /** `match.token` giữ lại để nộp kết quả. */
  | { kind: 'match'; difficulty: Difficulty; match: StartedMatch }
  | {
      kind: 'result';
      difficulty: Difficulty;
      match: StartedMatch;
      hud: HudSnapshot;
      inputLog: string;
    };

/**
 * `/play` — luồng một trận vs máy: chọn độ khó → server dựng trận (`POST /matches`: đội của mình từ
 * đội hình đã lưu, đội máy, seed, token) → (cảnh báo nếu không có thưởng) → trận → kết quả, nộp tỉ
 * số lên server (`POST /matches/:id/result`) và hiện xu nhận. Dev/test: `?half=<giây>`,
 * `?autopilot=1` (bỏ qua màn chọn độ khó; `?difficulty=hard`).
 */
export function PlayPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  // Điều kiện tĩnh để build production loại bỏ hẳn đoạn đọc tham số.
  const dev: DevOptions =
    import.meta.env.DEV || import.meta.env.MODE === 'test'
      ? readDevOptions(params.toString(), import.meta.env)
      : {};
  const isOnboarding = params.get('onboarding') === '1';
  const paramDiff = params.get('difficulty');
  const requestedDifficulty: Difficulty =
    paramDiff === 'hard' || paramDiff === 'easy'
      ? paramDiff
      : loadSavedDifficulty(typeof window !== 'undefined' ? window.localStorage : null);
  // Tính một lần khi mở trang; autopilot (E2E) vẫn chạy được trên mọi máy.
  const [needKeyboard] = useState(() => !dev.autopilot && isTouchOnly());
  const autoStart = !needKeyboard && (Boolean(dev.autopilot) || isOnboarding);
  const [stage, setStage] = useState<Stage>(() =>
    autoStart ? { kind: 'starting', difficulty: requestedDifficulty } : { kind: 'select' },
  );
  const { mutate } = useStartMatch();
  const autopilot = dev.autopilot ?? false;
  const start = useCallback(
    (difficulty: Difficulty) => {
      saveDifficulty(typeof window !== 'undefined' ? window.localStorage : null, difficulty);
      setStage({ kind: 'starting', difficulty });
      mutate(difficulty, {
        onSuccess: (match) =>
          setStage({
            kind: autopilot ? 'match' : 'versus',
            difficulty,
            match,
          }),
        onError: (error) => setStage({ kind: 'starting', difficulty, error }),
      });
    },
    [mutate, autopilot],
  );
  // Autopilot hoặc luồng tân thủ (`?onboarding=1`): gọi API một lần khi mở trang.
  const autoStarted = useRef(!autoStart);
  useEffect(() => {
    if (stage.kind !== 'starting' || autoStarted.current) return;
    autoStarted.current = true;
    start(stage.difficulty);
  }, [stage, start]);

  if (needKeyboard) return <NeedKeyboard />;

  return (
    <div className="play-root">
      {stage.kind === 'select' && (
        <PreMatch initialDifficulty={requestedDifficulty} onContinue={start} />
      )}
      {stage.kind === 'versus' && (
        <Versus
          match={stage.match}
          difficulty={stage.difficulty}
          onPlay={() => setStage({ ...stage, kind: 'match' })}
          onBack={() => setStage({ kind: 'select' })}
        />
      )}
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
          onEnd={(hud, inputLog) =>
            setStage({
              kind: 'result',
              difficulty: stage.difficulty,
              match: stage.match,
              hud,
              inputLog,
            })
          }
          onQuit={() => void navigate('/')}
        />
      )}
      {stage.kind === 'result' && (
        <MatchResultView
          key={stage.match.matchId}
          difficulty={stage.difficulty}
          match={stage.match}
          hud={stage.hud}
          inputLog={stage.inputLog}
          onRematch={() => start(stage.difficulty)}
        />
      )}
    </div>
  );
}

interface MatchResultViewProps {
  difficulty: Difficulty;
  match: StartedMatch;
  hud: HudSnapshot;
  inputLog: string;
  onRematch: () => void;
}

/**
 * Màn kết quả + nộp tỉ số lên server một lần khi mở. Lỗi mạng/5xx: hook tự thử lại, rồi cho bấm
 * "Gửi lại" — luôn cùng token nên server không cộng xu hai lần.
 */
function MatchResultView({ difficulty, match, hud, inputLog, onRematch }: MatchResultViewProps) {
  const { locale, t } = useI18n();
  const { mutate, data, error, isError, isPending } = useSubmitMatchResult();
  const me = useMe().data;
  const missionsQuery = useTodayMissions(Boolean(data));
  const claimMission = useClaimMission();
  // Đã bấm "Gửi lại" (chỉ có với lỗi mạng/5xx) — khi chờ thì giữ khối lỗi, nút quay chờ.
  const [retried, setRetried] = useState(false);
  const vars = useMemo(
    () => ({ matchId: match.matchId, body: resultBody(match.token, hud, inputLog) }),
    [match, hud, inputLog],
  );
  const submitted = useRef(false);
  useEffect(() => {
    if (submitted.current) return;
    submitted.current = true;
    mutate(vars);
  }, [mutate, vars]);

  let reward: RewardStatus = { kind: 'pending' };
  if (data) reward = { kind: 'done', reward: data.reward, balance: data.balance };
  else if (isError) {
    reward = {
      kind: 'error',
      message:
        error instanceof ApiClientError && !isTransientError(error)
          ? t('play.submitRejected', { msg: errorMessageFor(error, locale) })
          : t('play.submitFailed'),
      retryable: isTransientError(error),
    };
  } else if (isPending && retried) {
    reward = { kind: 'error', message: t('play.submitFailed'), retryable: true, retrying: true };
  }
  useLeaveGuard(isUnsavedResult(reward), t('play.unsavedLeave'));
  return (
    <ResultScreen
      hud={hud}
      difficulty={difficulty}
      matches={
        data && me ? { today: me.rewardedMatchesToday, limit: me.rewardedMatchesLimit } : null
      }
      reward={reward}
      missions={data ? (missionsQuery.data ?? data.missions) : undefined}
      claimingMissionCode={claimMission.isPending ? (claimMission.variables ?? null) : null}
      missionError={
        claimMission.error
          ? claimMission.error instanceof ApiClientError
            ? errorMessageFor(claimMission.error, locale)
            : t('home.claimMissionError')
          : null
      }
      onClaimMission={(code) => claimMission.mutate(code)}
      onRetryReward={() => {
        setRetried(true);
        mutate(vars);
      }}
      onRematch={onRematch}
    />
  );
}

interface MatchStartingProps {
  error: unknown;
  onRetry: () => void;
  onBack: () => void;
}

/** Chờ server dựng trận; lỗi đội hình (`invalid_squad`) → dẫn sang màn đội hình. */
function MatchStarting({ error, onRetry, onBack }: MatchStartingProps) {
  const { locale, t } = useI18n();
  if (!error) {
    return (
      <section className="play-screen" aria-busy="true">
        <span className="spinner" aria-hidden="true" />
        <p className="h1 play-screen__title" role="status">
          {t('play.preparing')}
        </p>
      </section>
    );
  }
  const squadIssue = error instanceof ApiClientError && error.code === 'invalid_squad';
  const message =
    error instanceof ApiClientError
      ? errorMessageFor(error, locale, 'play.startErrorFallback')
      : t('play.startErrorFallback');
  return (
    <section className="play-screen" aria-labelledby="start-error-title">
      <h1 id="start-error-title" className="h1 play-screen__title">
        {squadIssue ? t('play.squadErrorTitle') : t('play.startErrorTitle')}
      </h1>
      <p role="alert">{message}</p>
      <div className="play-screen__actions">
        {squadIssue ? (
          <Link to="/squad" className="btn btn--primary btn--lg" autoFocus>
            {t('home.editSquad')}
          </Link>
        ) : (
          <button type="button" className="btn btn--primary btn--lg" autoFocus onClick={onRetry}>
            {t('common.retry')}
          </button>
        )}
        <button type="button" className="btn btn--secondary btn--lg" onClick={onBack}>
          {t('play.reselectDiff')}
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
  onEnd: (hud: HudSnapshot, inputLog: string) => void;
  onQuit: () => void;
}

function MatchView({ difficulty, match, halfLengthSec, autopilot, onEnd, onQuit }: MatchViewProps) {
  const { t } = useI18n();
  const setup = useMemo<MatchSetup>(
    () => buildMatchSetup({ ...match, difficulty }, { halfLengthSec, autopilot }),
    [difficulty, match, halfLengthSec, autopilot],
  );

  const { hud, events, goalBanner, stoppageBoard, lastHud, latestState, later, updateHud } =
    useMatchHud('home');
  const [hints, setHints] = useState(true);
  const [paused, setPausedState] = useState(false);
  const [showTutorial, setShowTutorial] = useState(
    () =>
      !autopilot && !readTutorialSeen(typeof window !== 'undefined' ? window.localStorage : null),
  );
  const [tutorialKey, setTutorialKey] = useState(0);
  const [graphics, setGraphics] = useState<GraphicsSettings>(loadGraphics);
  // Scene đọc cờ tạm dừng mỗi khung hình nên giữ thêm bản ref (không chờ React render).
  const pausedRef = useRef(false);
  // Lệnh thay người chờ renderer áp vào sim ở khung hình kế tiếp.
  const commands = useRef<MatchCommand[]>([]);
  const onEndRef = useRef(onEnd);
  useEffect(() => {
    onEndRef.current = onEnd;
  });

  // Đếm giờ gợi ý phím từ lúc trận hiện lên (tải cảnh 3D có thể mất vài giây).
  const started = hud !== null;
  useEffect(() => {
    if (started) later(HINTS_SHOW_MS, () => setHints(false));
  }, [started, later]);

  const catalog = useCardCatalog().data;
  const avatarSeeds = useMemo(() => avatarSeedsForMatch(match, catalog), [match, catalog]);
  const catalogRef = useRef(catalog);
  const homePlayersRef = useRef(match.home.players);
  const [subs, setSubs] = useState<SubOptions>({
    onPitch: [],
    bench: [],
  });
  useEffect(() => {
    catalogRef.current = catalog;
    homePlayersRef.current = match.home.players;
    if (pausedRef.current && latestState.current) {
      setSubs(subOptions(latestState.current, match.home.players, catalog));
    }
  }, [catalog, match.home.players, latestState]);
  const setPaused = useCallback(
    (value: boolean) => {
      pausedRef.current = value;
      setPausedState(value);
      // Menu thay người đọc đội hình lúc mở (trận đứng yên khi tạm dừng).
      if (value && latestState.current) {
        setSubs(subOptions(latestState.current, homePlayersRef.current, catalogRef.current));
      }
    },
    [latestState],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.repeat || lastHud.current?.phase === 'full_time') return;
      e.preventDefault();
      setPaused(!pausedRef.current);
    };
    // Alt+Tab sang cửa sổ khác: trận tự tạm dừng thay vì chạy tiếp khi người chơi không nhìn.
    // Autopilot (đo FPS `?perf=1`, e2e) không ai điều khiển: chạy tiếp để số đo không hỏng.
    const onBlur = () => {
      if (!autopilot && lastHud.current?.phase !== 'full_time') setPaused(true);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('blur', onBlur);
    };
  }, [setPaused, autopilot, lastHud]);

  const bridge = useMemo<MatchBridge>(() => {
    const recorder = new InputRecorder();
    return {
      recorder,
      isPaused: () => pausedRef.current,
      takeCommands: () => commands.current.splice(0),
      onState: (state) => {
        updateHud(state, (snap) => {
          // Vừa thay người trong menu: cập nhật danh sách.
          if (pausedRef.current) {
            setSubs(subOptions(state, homePlayersRef.current, catalogRef.current));
          }
          if (snap.phase === 'full_time') {
            later(FULL_TIME_HOLD_MS, () => onEndRef.current(snap, recorder.encode()));
          }
        });
      },
    };
  }, [later, updateHud]);

  return (
    <>
      <MatchCanvas setup={setup} bridge={bridge} graphics={graphics} avatarSeeds={avatarSeeds} />
      {hud && (
        <div className="hud">
          <div className="hud-top">
            <Scoreboard hud={hud} />
            {hud.phase === 'half_time' && !autopilot && !paused && <HalfTimeStrip />}
            <StoppageBoard minutes={hud.stoppage} show={stoppageBoard} />
            <EventStrip events={events} />
            {hud.shootout && <ShootoutPanel shootout={hud.shootout} />}
          </div>
          <Minimap stateRef={latestState} />
          <div className="hud-tl">
            {hints && !autopilot && !hud.shootout && <PowerLegend />}
            <button
              type="button"
              className="btn btn--secondary btn--sm hud-pause"
              onClick={() => setPaused(true)}
            >
              {t('play.pauseBtn')}
            </button>
          </div>
          <PlayerPanel controlled={autopilot ? null : hud.controlled} />
          {hud.shootout?.turn === 'home' && !autopilot ? (
            <ShootoutHint />
          ) : (
            hints && !autopilot && !(showTutorial && !paused) && <KeyHints />
          )}
        </div>
      )}
      {hud && showTutorial && (
        <MatchTutorialOverlay
          key={tutorialKey}
          paused={paused}
          onComplete={() => {
            markTutorialSeen(typeof window !== 'undefined' ? window.localStorage : null);
            setShowTutorial(false);
          }}
          onSkip={() => {
            markTutorialSeen(typeof window !== 'undefined' ? window.localStorage : null);
            setShowTutorial(false);
          }}
        />
      )}
      {goalBanner > 0 && (
        <div className="goal-banner" aria-hidden="true">
          <span className="display goal-banner__text">{t('play.goalBanner')}</span>
        </div>
      )}
      {paused && (
        <PauseMenu
          hud={hud}
          graphics={graphics}
          onGraphics={(g) => {
            setGraphics(g);
            saveGraphics(g);
          }}
          onResume={() => setPaused(false)}
          onQuit={onQuit}
          onReplayTutorial={() => {
            resetTutorialSeen(typeof window !== 'undefined' ? window.localStorage : null);
            setTutorialKey((k) => k + 1);
            setShowTutorial(true);
            setPaused(false);
          }}
          subs={{
            allowed: hud !== null && hud.subWindow !== 'closed',
            penaltyPending:
              hud !== null && (hud.foulRestart?.type === 'penalty' || hud.shootout !== null),
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
