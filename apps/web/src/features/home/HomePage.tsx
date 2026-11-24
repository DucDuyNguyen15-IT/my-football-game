import type { CSSProperties } from 'react';
import { useRef } from 'react';
import { Link } from 'react-router';
import { computeOvr, STARTER_SLOTS, type Card, type PlayerCard, type SquadWarning } from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { useClaimMission, useTodayMissions } from '../../api/missions';
import { usePacks } from '../../api/packs';
import { useEconomy, usePlayerCards } from '../../api/player-cards';
import { useSquad } from '../../api/squad';
import { CardView } from '../../components/card/CardView';
import { rarityLabel } from '../../components/card/rarity';
import { ChalkPitch } from '../../components/ChalkPitch';
import { errorMessageFor } from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';
import { flyCoinsArc } from '../missions/coinArc';
import { DailyMissionsPanel } from '../missions/DailyMissionsPanel';
import { OnboardingFlowBanner } from '../onboarding/OnboardingFlowBanner';
import { slotLayout } from '../squad/squad';
import './home.css';

function translateSquadWarning(
  w: SquadWarning,
  starters: number,
  t: ReturnType<typeof useI18n>['t'],
): string {
  switch (w.code) {
    case 'missing_starters':
      return t('squad.warn.missing_starters', { count: starters, total: STARTER_SLOTS.length });
    case 'misposition':
      return t('squad.warn.misposition_short', { slot: w.slot ?? '' });
    case 'missing_gk':
      return t('squad.warn.missing_gk');
    case 'gk_not_keeper':
      return t('squad.warn.gk_not_keeper');
    default:
      return w.message;
  }
}

/** Menu chính (docs/design/screens/home.html). Việc chính là "Đá ngay"; cột phải là lối tắt có trạng thái. */
export function HomePage() {
  const { locale, t } = useI18n();
  const me = useMe().data;
  const squad = useSquad();
  const catalog = useCardCatalog();
  const list = usePlayerCards();
  const packs = usePacks();
  const missions = useTodayMissions();
  const claim = useClaimMission();
  const claimSourceRef = useRef<HTMLElement | null>(null);
  const maxLevel = useEconomy().data?.upgrade.maxLevel;
  if (!me) return null;

  const used = me.rewardedMatchesToday;
  const limit = me.rewardedMatchesLimit;
  const rewardLeft = used < limit;
  const byId = new Map<string, PlayerCard>((list.data ?? []).map((p) => [p.id, p]));
  const starters = STARTER_SLOTS.map((slot) => {
    const id = squad.data?.slots[slot];
    const pc = id ? byId.get(id) : undefined;
    const card = pc ? catalog.data?.get(pc.cardId) : undefined;
    return { slot, pc, card };
  });
  const layout = squad.data ? slotLayout(squad.data.formation) : null;
  const box = packs.data?.box;
  const teamLoading = squad.isPending || catalog.isPending || list.isPending;
  const showOnboardingBanner = me.freePack5Credits > 0 && me.rewardedMatchesToday === 0;

  return (
    <>
      {showOnboardingBanner && <OnboardingFlowBanner currentStep={2} />}
      <div className="home">
        <div className="home__main">
          <section className="panel--notch home__hero" aria-labelledby="play-title">
            <div className="panel__in night-bg home__hero-in">
              <div className="home__hero-text">
                <span className="label">{t('home.kicker')}</span>
                <h1 id="play-title" className="display home__title">
                  {t('home.title')}
                </h1>
                <p className="muted home__lead">
                  {t('home.leadBefore')} <b>{t('home.leadEasy')}</b> {t('home.leadOr')}{' '}
                  <b>{t('home.leadHard')}</b> {t('home.leadAfter')}
                </p>
                <div className="home__reward">
                  <div className="home__reward-row">
                    <span className={rewardLeft ? undefined : 'home__reward-out'}>
                      {rewardLeft ? t('home.rewardedToday') : t('home.rewardedOut')}
                    </span>
                    <span className="display num home__reward-count">
                      {used}
                      <span className="muted">/{limit}</span>
                    </span>
                  </div>
                  <div
                    className={`bar bar--segmented home__reward-bar${rewardLeft ? '' : ' is-out'}`}
                    role="img"
                    aria-label={t('home.rewardedAria', { used, limit })}
                  >
                    {Array.from({ length: limit }, (_, i) => (
                      <i key={i} className={i < used ? 'on' : undefined} />
                    ))}
                  </div>
                </div>
                <div className="home__cta">
                  <Link to="/play" className="btn btn--primary btn--xl">
                    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
                      <path d="M5 3l10 6-10 6z" fill="currentColor" />
                    </svg>
                    {rewardLeft ? t('home.playNow') : t('home.playPractice')}
                  </Link>
                </div>
              </div>
              <div className="home__pitch" aria-hidden="true">
                <ChalkPitch />
                {layout &&
                  starters.map(({ slot, card, pc }) => (
                    <span
                      key={slot}
                      className="home__dot"
                      style={{ left: `${layout[slot].x}%`, top: `${layout[slot].y}%` }}
                    >
                      <span className="num">
                        {pc && card ? computeOvr(card.position, pc.effectiveStats) : '–'}
                      </span>
                      <small>{card?.position ?? slot}</small>
                    </span>
                  ))}
              </div>
            </div>
          </section>

          <section className="panel home__team" aria-labelledby="team-title">
            <h2 id="team-title" className="panel__title">
              {t('home.yourTeam')}
              <span className="meta">
                {squad.data && (
                  <>
                    {squad.data.formation} · {t('home.avgOvr')}{' '}
                    <b className="num">{squad.data.teamRating}</b>
                  </>
                )}
              </span>
              <Link to="/squad" className="btn btn--ghost btn--sm home__edit">
                {t('home.editSquad')}
              </Link>
            </h2>
            <div className="home__xi">
              {teamLoading
                ? Array.from({ length: 7 }, (_, i) => (
                    <div
                      key={i}
                      className="skel skel--card"
                      style={{ '--card-w': '72px' } as CSSProperties}
                    />
                  ))
                : starters.map(({ slot, pc, card }) =>
                    pc && card ? (
                      <CardView
                        key={slot}
                        card={card as Card}
                        size="xs"
                        level={pc.level}
                        stats={pc.effectiveStats}
                      />
                    ) : (
                      <Link
                        key={slot}
                        to="/squad"
                        className="home__empty-slot"
                        aria-label={t('home.emptySlotAria', { slot })}
                      >
                        +
                      </Link>
                    ),
                  )}
            </div>
            {squad.data && squad.data.warnings.length > 0 && (
              <p className="home__warn">⚠ {translateSquadWarning(
                  squad.data.warnings[0]!,
                  STARTER_SLOTS.filter((s) => squad.data.slots[s]).length,
                  t,
                )}</p>
            )}
          </section>
        </div>

        <aside className="home__side" aria-label={t('home.shortcutsAria')}>
          <DailyMissionsPanel
            missions={missions.data}
            isLoading={missions.isPending}
            onRetry={missions.isError ? () => void missions.refetch() : undefined}
            claimingCode={claim.isPending ? (claim.variables ?? null) : null}
            errorMessage={
              claim.error ? errorMessageFor(claim.error, locale, 'home.claimMissionError') : null
            }
            onClaim={(code, sourceEl) => {
              claimSourceRef.current = sourceEl ?? null;
              claim.mutate(code, {
                onSuccess: () => {
                  flyCoinsArc(claimSourceRef.current);
                  claimSourceRef.current = null;
                },
                onError: () => {
                  claimSourceRef.current = null;
                },
              });
            }}
          />
          {me.freePack5Credits > 0 && (
            <Link
              to={showOnboardingBanner ? '/shop?onboarding=1' : '/shop'}
              className="panel home__tile is-accent"
            >
              <span className="label">{t('auth.giftKicker')}</span>
              <span className="display home__tile-big">
                {t('home.starterPackTitle', { count: me.freePack5Credits })}
              </span>
              <span className="muted">{t('home.starterPackAction')}</span>
            </Link>
          )}
          <Link to="/shop" className="panel home__tile">
            <span className="label">{t('home.yourBox')}</span>
            <span className="display home__tile-big">
              {box ? (
                t('home.boxTickets', { total: box.total, size: box.size })
              ) : (
                <>
                  <span className="skel skel--line home__tile-skel" aria-hidden="true" />
                  <span className="sr-only">{t('common.loading')}</span>
                </>
              )}
            </span>
            <span className="muted">
              {box
                ? t('home.boxLeft', {
                    legendCount: box.left.legend,
                    legendLabel: rarityLabel('legend', locale),
                    goldCount: box.left.gold,
                    goldLabel: rarityLabel('gold', locale),
                  })
                : ' '}
            </span>
          </Link>
          <Link to="/collection" className="panel home__tile">
            <span className="label">{t('nav.collection')}</span>
            <span className="display home__tile-big">
              {list.data ? (
                t('common.cardsCount', { count: list.data.length })
              ) : (
                <>
                  <span className="skel skel--line home__tile-skel" aria-hidden="true" />
                  <span className="sr-only">{t('common.loading')}</span>
                </>
              )}
            </span>
            <span className="muted">{t('home.collectionSub')}</span>
          </Link>
          <Link to="/upgrade" className="panel home__tile">
            <span className="label">{t('home.upgradeTitle')}</span>
            <span className="display home__tile-big">
              {maxLevel ? (
                `+1 → +${maxLevel}`
              ) : (
                <>
                  <span className="skel skel--line home__tile-skel" aria-hidden="true" />
                  <span className="sr-only">{t('common.loading')}</span>
                </>
              )}
            </span>
            <span className="muted">{t('home.upgradeSub')}</span>
          </Link>
        </aside>
      </div>
    </>
  );
}
