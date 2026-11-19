/**
 * Trước trận (docs/design/screens/prematch*.html, versus.html): chọn độ khó (bước 1/2) → màn đối đầu
 * (bước 2/2) sau khi server dựng trận. Thưởng xu đọc từ GET /config/economy, số trận có thưởng từ /me.
 */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  computeOvr,
  STARTER_SLOTS,
  type Difficulty,
  type MatchRewardTable,
  type MatchTeamSetup,
  type StartedMatch,
} from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { useEconomy } from '../../api/player-cards';
import { useSquad } from '../../api/squad';
import { Topbar } from '../../app/AppLayout';
import { CardView } from '../../components/card/CardView';
import { formatNumber, type TranslationKey } from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';
import './prematch.css';

const BackIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    aria-hidden="true"
  >
    <path d="M10 3L5 8l5 5" />
  </svg>
);
const WarnIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    <path d="M8 2l6.5 12h-13z" />
    <path d="M8 7v3M8 12v.5" />
  </svg>
);
const PlayIcon = () => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
    <path d="M4 2.5v11l9-5.5z" />
  </svg>
);

function Coin({ value, sm }: { value: number; sm?: boolean }) {
  const { locale, t } = useI18n();
  return (
    <span className={`coin${sm ? ' coin--sm' : ''}`}>
      <span className="coin__icon" aria-hidden="true" />
      <span className="num">{formatNumber(value, locale)}</span>
      <span className="sr-only"> {t('common.coin')}</span>
    </span>
  );
}

const LEVELS: ReadonlyArray<{
  value: Difficulty;
  labelKey: TranslationKey;
  descKey: TranslationKey;
}> = [
  { value: 'easy', labelKey: 'pm.diff.easy', descKey: 'pm.diffDesc.easy' },
  { value: 'hard', labelKey: 'pm.diff.hard', descKey: 'pm.diffDesc.hard' },
];
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { easy: 'Dễ', hard: 'Khó' };

/** Bước 1/2 — chọn độ khó. */
/** Máy chỉ có cảm ứng (điện thoại/máy tính bảng): trận 3D điều khiển bằng bàn phím nên không đá được (PRD: MVP chỉ bàn phím PC). */
export function isTouchOnly(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(pointer: coarse) and (hover: none)').matches
  );
}

/** Thay màn chọn độ khó trên máy chỉ có cảm ứng. */
export function NeedKeyboard() {
  const { t } = useI18n();
  return (
    <div className="pm-shell">
      <Topbar />
      <main className="pm" aria-labelledby="pm-title">
        <div className="panel empty" role="status">
          <h1 id="pm-title" className="h2 empty__title">
            {t('play.needKeyboardTitle')}
          </h1>
          <p className="empty__body">{t('play.needKeyboardBody')}</p>
          <div className="pm__crumbs">
            <Link to="/shop" className="btn btn--primary">
              {t('play.openPacksBtn')}
            </Link>
            <Link to="/squad" className="btn btn--secondary">
              {t('shop.toSquad')}
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}

export function PreMatch({
  initialDifficulty = 'easy',
  onContinue,
}: {
  initialDifficulty?: Difficulty;
  onContinue: (d: Difficulty) => void;
}) {
  const { t } = useI18n();
  const me = useMe().data;
  const economy = useEconomy();
  const squad = useSquad().data;
  const [pick, setPick] = useState<Difficulty>(initialDifficulty);
  const capReached = !!me && me.rewardedMatchesToday >= me.rewardedMatchesLimit;
  const left = me ? Math.max(0, me.rewardedMatchesLimit - me.rewardedMatchesToday) : null;

  return (
    <div className="pm-shell">
      <Topbar />
      <main className="pm" aria-labelledby="pm-title">
        <div className="pm__crumbs">
          <Link to="/" className="btn btn--ghost btn--sm">
            <BackIcon />
            {t('common.home')}
          </Link>
          <span className="label">{t('pm.step')}</span>
        </div>
        <h1 id="pm-title" className="h1 pm__title">
          {t('pm.title')}
        </h1>
        {capReached && (
          <div className="banner" role="alert">
            <WarnIcon />
            <span>
              <b>{t('pm.capBannerBold')}</b>{' '}
              {t('pm.capBannerText', { limit: me.rewardedMatchesLimit })}
            </span>
          </div>
        )}
        <div className="pm__options" role="group" aria-label={t('pm.diffGroupAria')}>
          {LEVELS.map((lv) => (
            <LevelOption
              key={lv.value}
              label={t(lv.labelKey)}
              desc={t(lv.descKey)}
              on={pick === lv.value}
              reward={economy.data?.matchReward[lv.value]}
              noReward={capReached}
              onPick={() => setPick(lv.value)}
            />
          ))}
        </div>
        <div className="pm__foot">
          {left !== null && me && (
            <span className={capReached ? 'pm__cap' : undefined}>
              {capReached ? (
                <>
                  {t('pm.rewardedUsed', {
                    today: me.rewardedMatchesToday,
                    limit: me.rewardedMatchesLimit,
                  })}
                </>
              ) : (
                <>
                  {t('pm.rewardedLeftBefore')} <b className="num">{left}</b>
                  {t('pm.rewardedLeftAfter', { limit: me.rewardedMatchesLimit })}
                </>
              )}
            </span>
          )}
          <span className="pm__spacer" />
          {squad && (
            <span className="muted pm__team">
              {t('pm.teamMeta', { formation: squad.formation, rating: squad.teamRating })}
            </span>
          )}
          <button
            type="button"
            className="btn btn--primary btn--lg"
            autoFocus
            onClick={() => onContinue(pick)}
          >
            {t('pm.continue')}
          </button>
        </div>
      </main>
    </div>
  );
}

function LevelOption({
  label,
  desc,
  on,
  reward,
  noReward,
  onPick,
}: {
  label: string;
  desc: string;
  on: boolean;
  reward: MatchRewardTable | undefined;
  noReward: boolean;
  onPick: () => void;
}) {
  const { t } = useI18n();
  const v = (n: number) => (noReward ? 0 : n);
  return (
    <button
      type="button"
      aria-pressed={on}
      className={`panel pm-opt${on ? ' is-on' : ''}`}
      onClick={onPick}
    >
      <span className="display pm-opt__title">{label}</span>
      <span className="muted pm-opt__desc">{desc}</span>
      {reward && (
        <>
          <span className="pm-opt__rewards">
            {(
              [
                [t('pm.win'), reward.win],
                [t('pm.draw'), reward.draw],
                [t('pm.loss'), reward.loss],
              ] as const
            ).map(([labelText, n]) => (
              <span key={labelText} className="pm-opt__reward">
                <span className="label">{labelText}</span>
                <Coin value={v(n)} />
              </span>
            ))}
          </span>
          <span className="muted pm-opt__shootout">
            {t('pm.shootoutBefore')} <Coin value={v(reward.shootout_win)} sm /> {t('pm.shootoutMid')}{' '}
            <Coin value={v(reward.shootout_loss)} sm />
          </span>
        </>
      )}
    </button>
  );
}

/** OVR trung bình 7 người đá chính (chỉ số đã hiệu lực server gửi). */
function teamOvr(team: MatchTeamSetup): number {
  const starters = team.players.filter((p) =>
    (STARTER_SLOTS as readonly string[]).includes(p.slot),
  );
  if (starters.length === 0) return 0;
  return Math.round(
    starters.reduce((s, p) => s + computeOvr(p.position, p.stats), 0) / starters.length,
  );
}

/** Bước 2/2 — màn đối đầu sau khi server dựng trận. */
export function Versus({
  match,
  difficulty,
  onPlay,
  onBack,
}: {
  match: StartedMatch;
  difficulty: Difficulty;
  onPlay: () => void;
  onBack: () => void;
}) {
  const { t } = useI18n();
  const me = useMe().data;
  const economy = useEconomy().data;
  const playRef = useRef<HTMLButtonElement>(null);
  useEffect(() => playRef.current?.focus(), []);
  const win = economy?.matchReward[difficulty].win;
  const diffLabel = t(difficulty === 'hard' ? 'pm.diff.hard' : 'pm.diff.easy');
  const homeName = me?.username ?? t('vs.you');
  return (
    <section className="vs" aria-labelledby="vs-title">
      <h1 id="vs-title" className="sr-only">
        {t('vs.titleAria', { home: homeName, diff: diffLabel })}
      </h1>
      <div className="vs__sides">
        <TeamSide side="home" name={homeName} sub={t('vs.homeSub')} team={match.home} />
        <TeamSide
          side="away"
          name={t('vs.awayName')}
          sub={t('vs.awaySub', { diff: diffLabel })}
          team={match.away}
        />
      </div>
      <svg className="vs__line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        <line x1="50" y1="0" x2="50" y2="100" vectorEffect="non-scaling-stroke" />
      </svg>
      <span className="vs__ring" aria-hidden="true" />
      <span className="display vs__mark" aria-hidden="true">
        VS
      </span>
      <div className="vs__back">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onBack}>
          <BackIcon />
          {t('common.back')}
        </button>
      </div>
      <div className="vs__foot">
        {!match.rewardEligible && (
          <div className="banner" role="alert">
            <WarnIcon />
            <span>
              <b>{t('pm.capBannerBold')}</b>{' '}
              {t('vs.capBannerText', { limit: me?.rewardedMatchesLimit ?? '' })}
            </span>
          </div>
        )}
        <button ref={playRef} type="button" className="btn btn--primary btn--xl" onClick={onPlay}>
          <PlayIcon />
          {t('vs.playBtn')}
        </button>
        <span className="muted vs__meta">
          {match.rewardEligible && win !== undefined && (
            <>
              {t('vs.winPrefix')} <Coin value={win} sm />
              {me && (
                <>
                  {' '}
                  {t('vs.rewardedNum', {
                    next: me.rewardedMatchesToday + 1,
                    limit: me.rewardedMatchesLimit,
                  })}
                </>
              )}{' '}
              ·{' '}
            </>
          )}
          <button type="button" className="vs__link" onClick={onBack}>
            {t('vs.changeDiff')}
          </button>
        </span>
      </div>
    </section>
  );
}

function TeamSide({
  side,
  name,
  sub,
  team,
}: {
  side: 'home' | 'away';
  name: string;
  sub: string;
  team: MatchTeamSetup;
}) {
  const { t } = useI18n();
  const catalog = useCardCatalog().data;
  const starters = STARTER_SLOTS.map((s) => team.players.find((p) => p.slot === s)).filter(
    (p) => p !== undefined,
  );
  return (
    <div className={`vs-side vs-side--${side}`}>
      <span className="label vs-side__sub">{sub}</span>
      <h2 className="display vs-side__name">
        <span className="vs-side__sw" aria-hidden="true" />
        {name}
      </h2>
      <div className="vs-side__ovr">
        <span className="label">{t('home.avgOvr')}</span>
        <span className="display num vs-side__num">{teamOvr(team)}</span>
        <span className="muted">{team.formation}</span>
      </div>
      <ul className="vs-side__cards" aria-label={t('vs.lineupAria', { name })}>
        {starters.map((p) => {
          const card = p.cardId ? catalog?.get(p.cardId) : undefined;
          return (
            <li key={p.slot}>
              {card ? (
                <CardView card={card} size="xs" level={p.level ?? 0} stats={p.stats} />
              ) : (
                <span className="vs-side__blank">{p.position}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
