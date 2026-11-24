import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import {
  HALF_TIME_MAX_TICKS,
  TICK_RATE,
  type MatchSetup,
  type TeamSide as SimTeamSide,
} from '@pitch/sim';
import type { PvpServerMessage } from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { MatchCanvas } from '../../game/MatchCanvas';
import type { MatchBridge } from '../../game/bridge';
import { avatarSeedsForMatch } from '../../game/render/kit';
import { useI18n } from '../../i18n/I18nContext';
import { formatNumber, type TranslationKey } from '../../i18n/i18n';
import {
  EventStrip,
  Minimap,
  PlayerPanel,
  PowerLegend,
  Scoreboard,
  ShootoutPanel,
  StoppageBoard,
} from '../play/MatchHud';
import {
  HINTS_SHOW_MS,
  loadGraphics,
  useLeaveGuard,
  useMatchHud,
} from '../play/matchShared';
import { TeamSide } from '../play/PreMatch';
import { KeyHints, ShootoutHint } from '../play/screens';
import type { NetMatch, PvpClientStatus } from './useNetMatch';
import '../play/play.css';
import '../play/prematch.css';
import './pvp.css';

export type MatchedMessage = Extract<PvpServerMessage, { t: 'matched' }>;
export type EndMessage = Extract<PvpServerMessage, { t: 'end' }>;

export interface PvpMatchPageProps {
  net: NetMatch;
  status: PvpClientStatus;
  matched: MatchedMessage;
  countdownMs: number | null;
  oppDisconnectedUntil: number | null;
  ended: EndMessage | null;
  onLeave: () => void;
  onBackLobby: () => void;
}

const OUTCOME_KEY = {
  win: 'result.outcome.win',
  draw: 'result.outcome.draw',
  loss: 'result.outcome.loss',
  shootout_win: 'result.shootout.win',
  shootout_loss: 'result.shootout.loss',
} as const satisfies Record<EndMessage['you']['outcome'], TranslationKey>;

export function PvpMatchPage({
  net,
  status,
  matched,
  countdownMs,
  oppDisconnectedUntil,
  ended,
  onLeave,
  onBackLobby,
}: PvpMatchPageProps) {
  const { locale, t } = useI18n();
  const me = useMe().data;
  const catalog = useCardCatalog().data;
  const side: SimTeamSide = matched.side;
  const setup = matched.setup as MatchSetup;
  const autopilot = Boolean(setup.autopilot);

  const { hud, events, goalBanner, stoppageBoard, latestState, later, updateHud } =
    useMatchHud(side);
  const [hints, setHints] = useState(true);
  const [graphics] = useState(loadGraphics);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [countdownLeftSec, setCountdownLeftSec] = useState<number | null>(null);
  const [nowMs, setNowMs] = useState(() => performance.now());
  const [matchStarted, setMatchStarted] = useState(false);

  useLeaveGuard(!ended, t('pvp.leaveConfirm'));

  useEffect(() => {
    net.send({ t: 'ready' });
  }, [net]);

  useEffect(() => {
    if (countdownMs === null) return;
    const deadline = performance.now() + countdownMs;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
      setCountdownLeftSec(left);
      if (left <= 0) setMatchStarted(true);
    };
    tick();
    const id = window.setInterval(tick, 100);
    return () => window.clearInterval(id);
  }, [countdownMs]);

  useEffect(() => {
    if (oppDisconnectedUntil === null) return;
    const id = window.setInterval(() => setNowMs(performance.now()), 250);
    return () => window.clearInterval(id);
  }, [oppDisconnectedUntil]);

  const oppLeftSec =
    oppDisconnectedUntil === null
      ? null
      : Math.max(0, Math.ceil((oppDisconnectedUntil - nowMs) / 1000));

  useEffect(() => {
    if (matchStarted) later(HINTS_SHOW_MS, () => setHints(false));
  }, [matchStarted, later]);

  const avatarSeeds = useMemo(() => avatarSeedsForMatch(setup, catalog), [setup, catalog]);

  const bridge = useMemo<MatchBridge>(
    () => ({
      isPaused: () => false,
      onState: (state) => {
        if (state.tick > 0) setMatchStarted(true);
        updateHud(state);
      },
    }),
    [updateHud],
  );

  const myName = me?.username ?? t('vs.you');
  const oppName = matched.opponent.username;
  const names =
    side === 'home' ? { home: myName, away: oppName } : { home: oppName, away: myName };

  if (ended) {
    const isVoid =
      ended.reason === 'void_desync' ||
      ended.reason === 'void_both_left' ||
      ended.reason === 'void_not_ready' ||
      ended.reason === 'server_restart';
    const headline = isVoid ? t('pvp.outcomeVoid') : t(OUTCOME_KEY[ended.you.outcome]);
    const outcomeTone = isVoid
      ? 'draw'
      : ended.you.outcome === 'shootout_win'
        ? 'win'
        : ended.you.outcome === 'shootout_loss'
          ? 'loss'
          : ended.you.outcome;
    const kicker =
      matched.kind === 'friendly' ? t('pvp.resultKickerFriendly') : t('pvp.resultKickerRanked');

    return (
      <div className="play-root">
        <main className="night-bg result" aria-labelledby="result-title">
          <div className="result__main">
            <span className="label">{kicker}</span>
            <p
              className="result__score"
              aria-label={t('result.scoreAria', { home: ended.home, away: ended.away })}
            >
              <span className="display result__team" aria-hidden="true">
                <span className="result__sw result__sw--home" />
                {names.home}
              </span>
              <span className="display num result__goals" aria-hidden="true">
                {ended.home} – {ended.away}
              </span>
              <span className="display result__team" aria-hidden="true">
                {names.away}
                <span className="result__sw result__sw--away" />
              </span>
            </p>
            <h1 id="result-title" className={`display result__outcome result__outcome--${outcomeTone}`}>
              {headline}
            </h1>
            {ended.reason !== 'full_time' && (
              <p className="muted">{t(`pvp.reason.${ended.reason}`)}</p>
            )}
          </div>

          <div className="result__side">
            <section className="panel--notch">
              <div className="panel__in">
                <div className="result-reward" role="status">
                  <span className="label">{t('result.rewardLabel')}</span>
                  {ended.you.reward > 0 ? (
                    <span className="coin coin--xl">
                      <span className="coin__icon" aria-hidden="true" />
                      <span className="num">+{formatNumber(ended.you.reward, locale)}</span>{' '}
                      {t('common.coin')}
                    </span>
                  ) : (
                    <>
                      <div className="banner">
                        <span>
                          {t(
                            `pvp.rewardReason.${ended.you.rewardReason ?? (matched.kind === 'friendly' ? 'friendly' : 'void')}`,
                          )}
                        </span>
                      </div>
                      <span className="coin coin--xl result-coin--none">
                        <span className="coin__icon" aria-hidden="true" />
                        <span className="num">+0</span> {t('common.coin')}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </section>
            <div className="result__actions">
              <button type="button" className="btn btn--primary btn--lg" onClick={onBackLobby}>
                {t('pvp.backLobby')}
              </button>
              <Link to="/" className="btn btn--secondary btn--lg">
                {t('result.backHome')}
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  const showOverlay = !matchStarted;

  return (
    <div className="play-root">
      <MatchCanvas
        setup={setup}
        bridge={bridge}
        graphics={graphics}
        avatarSeeds={avatarSeeds}
        net={net}
      />

      {hud && matchStarted && (
        <div className="hud">
          <div className="hud-top">
            <Scoreboard hud={hud} names={names} />
            {oppLeftSec !== null && (
              <div className="pvp-banner pvp-banner--warn" role="status">
                {t('pvp.oppDisconnected', { seconds: oppLeftSec })}
              </div>
            )}
            {(status.rebuilding || status.reconnecting || status.busyRetrying) && (
              <div className="pvp-banner" role="status">
                {status.rebuilding
                  ? t('pvp.rebuilding')
                  : status.busyRetrying
                    ? t('pvp.busyRetrying')
                    : t('pvp.reconnecting')}
              </div>
            )}
            {status.rebuildSlowMs !== null && (
              <div className="pvp-banner" role="status">
                {t('pvp.rebuildSlow', {
                  seconds: (status.rebuildSlowMs / 1000).toFixed(1),
                })}
              </div>
            )}
            {hud.phase === 'half_time' && !autopilot && (
              <div className="event-strip hud-event hud-event--half" role="status">
                <span className="event-strip__mark" aria-hidden="true">
                  ■
                </span>
                <span>{t('pvp.halfTime', { seconds: HALF_TIME_MAX_TICKS / TICK_RATE })}</span>
              </div>
            )}
            <StoppageBoard minutes={hud.stoppage} show={stoppageBoard} />
            <EventStrip events={events} />
            {hud.shootout && <ShootoutPanel shootout={hud.shootout} />}
          </div>
          <Minimap stateRef={latestState} side={side} />
          <div className="hud-tl">
            {hints && !autopilot && !hud.shootout && <PowerLegend />}
            <div className="pvp-tl-actions">
              <button
                type="button"
                className="btn btn--secondary btn--sm hud-pause"
                onClick={() => setConfirmLeave((v) => !v)}
              >
                {t('pvp.leaveBtn')}
              </button>
            </div>
            {confirmLeave && (
              <div className="panel pvp-banner pvp-banner--warn" role="alertdialog">
                <p style={{ margin: '0 0 8px' }}>{t('pvp.leaveConfirm')}</p>
                <div className="pvp-actions">
                  <button
                    type="button"
                    className="btn btn--secondary btn--sm"
                    onClick={() => setConfirmLeave(false)}
                  >
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    className="btn btn--danger btn--sm"
                    onClick={onLeave}
                  >
                    {t('pvp.leaveBtn')}
                  </button>
                </div>
              </div>
            )}
          </div>
          <PlayerPanel controlled={autopilot ? null : hud.controlled} />
          {hud.shootout?.turn === side && !autopilot ? (
            <ShootoutHint showPause={false} />
          ) : (
            hints && !autopilot && <KeyHints showPause={false} />
          )}
        </div>
      )}

      {goalBanner > 0 && (
        <div className="goal-banner" aria-hidden="true">
          <span className="display goal-banner__text">{t('play.goalBanner')}</span>
        </div>
      )}

      {showOverlay && (
        <section className="vs pvp-versus" aria-labelledby="pvp-vs-title">
          <h1 id="pvp-vs-title" className="sr-only">
            {names.home} vs {names.away}
          </h1>
          <div className="vs__sides">
            <TeamSide
              side="home"
              name={names.home}
              sub={
                side === 'home'
                  ? t('pvp.youSub', { side: t('hud.home') })
                  : t('pvp.oppSub', { side: t('hud.home') })
              }
              team={setup.home}
            />
            <TeamSide
              side="away"
              name={names.away}
              sub={
                side === 'away'
                  ? t('pvp.youSub', { side: t('hud.away') })
                  : t('pvp.oppSub', { side: t('hud.away') })
              }
              team={setup.away}
            />
          </div>
          <svg className="vs__line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <line x1="50" y1="0" x2="50" y2="100" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="vs__ring" aria-hidden="true" />
          <span className="display vs__mark" aria-hidden="true">
            VS
          </span>
          <div className="vs__foot">
            {matched.kind === 'friendly' && (
              <div className="banner" role="note">
                <span>{t('pvp.friendlyTag')}</span>
              </div>
            )}
            <div className="pvp-countdown-badge" role="status">
              {countdownLeftSec !== null
                ? t('pvp.countdown', { seconds: countdownLeftSec })
                : t('pvp.waitingReady')}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
