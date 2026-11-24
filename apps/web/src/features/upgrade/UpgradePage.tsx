import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router';
import {
  effectiveStats,
  type Card,
  type UpgradeCardResult,
  type UpgradeConfig,
} from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { useEconomy, usePlayerCards, useUpgradeCard } from '../../api/player-cards';
import { CardView } from '../../components/card/CardView';
import { rarityLabel as getRarityLabel } from '../../components/card/rarity';
import { HoldButton } from '../../components/HoldButton';
import { formatNumber } from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';
import { prefersReducedMotion } from '../shop/reveal';
import {
  materialCandidates,
  materialGrid,
  materialWarnings,
  needsHoldConfirm,
  upgradeErrorMessage,
  upgradePreview,
  type CardItem,
  type PickItem,
} from './upgrade';
import { UpgradeStats } from './UpgradeStats';
import './upgrade.css';

function Coin() {
  const { t } = useI18n();
  return (
    <>
      <span className="coin__icon" aria-hidden />
      <span className="sr-only"> {t('common.coin')}</span>
    </>
  );
}

const svg = {
  width: 16,
  height: 16,
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  'aria-hidden': true,
} as const;
const BackIcon = () => (
  <svg {...svg} strokeWidth={1.8}>
    <path d="M10 3L5 8l5 5" />
  </svg>
);
const WarnIcon = () => (
  <svg {...svg} strokeWidth={1.6}>
    <path d="M8 2l6.5 12h-13z" />
    <path d="M8 7v3M8 12v.5" />
  </svg>
);
const CheckIcon = () => (
  <svg {...svg} strokeWidth={2}>
    <path d="M3 8.5l3 3 7-7" />
  </svg>
);
const LockIcon = () => (
  <svg {...svg} strokeWidth={1.6}>
    <rect x="3" y="7" width="10" height="7" rx="1" />
    <path d="M5.5 7V5a2.5 2.5 0 015 0v2" />
  </svg>
);

interface Outcome {
  res: UpgradeCardResult;
  card: Card;
  fromLevel: number;
}

/**
 * Màn ép thẻ (PRD §6.5, F10) theo docs/design/screens/upgrade*.html: thẻ cần ép | chọn nguyên liệu |
 * tỉ lệ (cơ bản + may mắn), phí, chỉ số sau ép. Thẻ chọn lưu trên URL `?card=&mat=`; kết quả do server quay.
 */
export function UpgradePage() {
  const { locale, t } = useI18n();
  const [params, setParams] = useSearchParams();
  const list = usePlayerCards({ sort: '-ovr' });
  const catalog = useCardCatalog();
  const economy = useEconomy();
  const me = useMe();
  const upgrader = useUpgradeCard();
  const [picking, setPicking] = useState(false);
  const [forging, setForging] = useState(false);
  const [showLocked, setShowLocked] = useState(false);
  const [showMaxed, setShowMaxed] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  if (list.isPending || catalog.isPending || economy.isPending) {
    return (
      <div className="upg upg--loading" aria-busy="true">
        <p className="sr-only">{t('common.loading')}</p>
        <div className="skel upg-skel__head" />
        <div className="upg__layout">
          <div className="skel upg-skel__panel" />
          <div className="skel upg-skel__panel" />
          <div className="skel upg-skel__panel" />
        </div>
      </div>
    );
  }
  if (list.isLoadingError || catalog.isLoadingError || economy.isLoadingError) {
    return (
      <div className="screen-msg" role="alert">
        <p>{t('upg.loadError')}</p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            void list.refetch();
            void catalog.refetch();
            void economy.refetch();
          }}
        >
          {t('common.retry')}
        </button>
      </div>
    );
  }

  const cfg = economy.data.upgrade;
  const items: CardItem[] = list.data.flatMap((pc) => {
    const card = catalog.data.get(pc.cardId);
    return card ? [{ pc, card }] : [];
  });
  const target = items.find((it) => it.pc.id === params.get('card')) ?? null;
  const { valid: materials } = target
    ? materialCandidates(target.pc, list.data, catalog.data)
    : { valid: [] as CardItem[] };
  const material = materials.find((it) => it.pc.id === params.get('mat')) ?? null;
  const preview = target ? upgradePreview(target.card, target.pc, cfg) : null;
  const coins = me.data?.coins ?? 0;
  const short = preview ? Math.max(0, preview.fee - coins) : 0;
  const choosingTarget = !target || picking;

  const select = (card: string | null, mat: string | null) => {
    const next = new URLSearchParams();
    if (card) next.set('card', card);
    if (mat) next.set('mat', mat);
    setParams(next, { replace: true });
    upgrader.reset();
  };

  async function run() {
    if (!target || !material || !preview || forging) return;
    const fromLevel = target.pc.level;
    setForging(true);
    const beat = prefersReducedMotion()
      ? Promise.resolve()
      : new Promise<void>((resolve) => setTimeout(resolve, 240));
    try {
      const [res] = await Promise.all([
        upgrader.upgrade(target.pc.id, material.pc.id).catch(() => null),
        beat,
      ]);
      if (!mounted.current || !res) return;
      // Nguyên liệu đã mất → bỏ chọn; giữ thẻ được ép để ép tiếp.
      select(target.pc.id, null);
      setOutcome({ res, card: target.card, fromLevel });
    } finally {
      if (mounted.current) setForging(false);
    }
  }

  const canRun =
    !!target &&
    !!material &&
    !!preview &&
    short === 0 &&
    !upgrader.isPending &&
    !forging &&
    !!me.data;
  const hold =
    target && material ? needsHoldConfirm(target.card, material.card, material.pc) : false;
  const rarityLabel = target ? getRarityLabel(target.card.rarity, locale) : '';

  const materialPicks: PickItem[] = target
    ? materialGrid(target, materials, items, rarityLabel, locale)
    : [];
  const openMaterials = materialPicks.filter((it) => it.tone !== 'lock');
  const lockedMaterials = materialPicks.filter((it) => it.tone === 'lock');
  const shownMaterials = openMaterials.length > 0 && !showLocked ? openMaterials : materialPicks;

  const targetGrid: PickItem[] = items.map((it) =>
    it.pc.level >= cfg.maxLevel
      ? { ...it, tone: 'plain', note: t('upg.noteMaxed') }
      : it.pc.luck > 0
        ? { ...it, tone: 'warn', note: t('upg.noteLuck', { luck: it.pc.luck }) }
        : { ...it, tone: 'plain', note: `+${it.pc.level} → +${it.pc.level + 1}` },
  );
  const upgradableTargets = targetGrid.filter((it) => it.pc.level < cfg.maxLevel);
  const maxedCount = targetGrid.length - upgradableTargets.length;
  const shownTargets = upgradableTargets.length > 0 && !showMaxed ? upgradableTargets : targetGrid;

  return (
    <div
      className="upg"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && picking && target && !outcome && !forging) setPicking(false);
      }}
    >
      <header className="upg__head">
        <Link to="/collection" className="btn btn--ghost btn--sm">
          <BackIcon />
          {t('nav.collection')}
        </Link>
        <h1 className="h1">{t('upg.title')}</h1>
        <span className="muted upg__sub">{t('upg.sub', { maxLevel: cfg.maxLevel })}</span>
      </header>

      <div className="upg__layout">
        <section
          className={`panel upg__target${forging ? ' is-forging' : ''}`}
          aria-label={t('upg.targetLabel')}
        >
          <span className="label">{t('upg.targetLabel')}</span>
          {target ? (
            <>
              <CardView
                card={target.card}
                size="lg"
                level={target.pc.level}
                stats={effectiveStats(target.card, target.pc.level)}
              />
              {preview ? (
                <>
                  <div
                    className="upg__levels"
                    aria-label={t('upg.levelsAria', { from: target.pc.level, to: preview.toLevel })}
                  >
                    <span className="display num upg__from">+{target.pc.level}</span>
                    <span className="muted" aria-hidden="true">
                      →
                    </span>
                    <span className="display num upg__to">+{preview.toLevel}</span>
                  </div>
                  <span className="muted upg__small">
                    {t('upg.bonusNote', { level: preview.toLevel, bonus: preview.bonusAfter })}
                  </span>
                </>
              ) : (
                <span className="tag tag--accent">{t('upg.maxedTag', { maxLevel: cfg.maxLevel })}</span>
              )}
              {!picking && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setPicking(true)}
                >
                  {t('upg.changeCard')}
                </button>
              )}
            </>
          ) : (
            <div className="upg__empty">{t('upg.emptyTarget')}</div>
          )}
        </section>

        <section className="panel upg__pick" aria-labelledby="upg-pick-title">
          <h2 className="panel__title" id="upg-pick-title">
            {choosingTarget ? t('upg.pickTargetTitle') : t('upg.pickMaterialTitle')}
            <span className="meta">
              {choosingTarget
                ? t('upg.poolCount', { count: items.length })
                : t('upg.materialReq', { rarity: rarityLabel })}
            </span>
          </h2>
          {choosingTarget ? (
            <>
              <PickGrid
                items={shownTargets}
                activeId={target?.pc.id}
                label={t('upg.targetGridAria')}
                empty={
                  <div className="empty">
                    <h3 className="empty__title">{t('upg.emptyPoolTitle')}</h3>
                    <p className="empty__body">{t('upg.emptyPoolBody')}</p>
                    <Link className="btn btn--primary" to="/shop">
                      {t('coll.toShop')}
                    </Link>
                  </div>
                }
                onPick={(it) => {
                  select(it.pc.id, null);
                  setPicking(false);
                  setShowLocked(false);
                }}
              />
              {upgradableTargets.length > 0 && maxedCount > 0 && (
                <button
                  type="button"
                  className="chip chip--more upg__more"
                  aria-expanded={showMaxed}
                  onClick={() => setShowMaxed((v) => !v)}
                >
                  {showMaxed
                    ? t('upg.hideMaxed')
                    : t('upg.showMaxed', { count: maxedCount })}
                </button>
              )}
            </>
          ) : !preview ? (
            <p className="muted">{t('upg.maxedCardNote', { maxLevel: cfg.maxLevel })}</p>
          ) : (
            <>
              <PickGrid
                items={shownMaterials}
                activeId={material?.pc.id}
                label={t('upg.materialGridAria')}
                empty={
                  <div className="empty">
                    <h3 className="empty__title">{t('upg.emptyMatTitle')}</h3>
                    <p className="empty__body">{t('upg.emptyMatBody', { rarity: rarityLabel })}</p>
                    <Link className="btn btn--secondary" to="/shop">
                      {t('coll.toShop')}
                    </Link>
                  </div>
                }
                onPick={(it) => select(target!.pc.id, it.pc.id)}
              />
              {openMaterials.length > 0 && lockedMaterials.length > 0 && (
                <button
                  type="button"
                  className="chip chip--more upg__more"
                  aria-expanded={showLocked}
                  onClick={() => setShowLocked((v) => !v)}
                >
                  {showLocked
                    ? t('upg.hideLocked')
                    : t('upg.showLocked', { count: lockedMaterials.length })}
                </button>
              )}
            </>
          )}
        </section>

        <section className="panel upg__sum" aria-label={t('upg.sumAria')}>
          {!target || !preview ? (
            <p className="muted">
              {target ? t('upg.sumMaxed', { maxLevel: cfg.maxLevel }) : t('upg.sumIdle')}
            </p>
          ) : (
            <Summary
              cfg={cfg}
              card={target.card}
              level={target.pc.level}
              preview={preview}
              material={material}
              hold={hold}
              canRun={canRun}
              pending={upgrader.isPending || forging}
              short={short}
              error={upgrader.error ? upgradeErrorMessage(upgrader.error, locale) : null}
              onRun={() => void run()}
            />
          )}
        </section>
      </div>

      {outcome && <ResultDialog outcome={outcome} cfg={cfg} onClose={() => setOutcome(null)} />}
    </div>
  );
}

interface SummaryProps {
  cfg: UpgradeConfig;
  card: Card;
  level: number;
  preview: NonNullable<ReturnType<typeof upgradePreview>>;
  material: CardItem | null;
  hold: boolean;
  canRun: boolean;
  pending: boolean;
  short: number;
  error: string | null;
  onRun: () => void;
}

function Summary({
  cfg,
  card,
  level,
  preview,
  material,
  hold,
  canRun,
  pending,
  short,
  error,
  onRun,
}: SummaryProps) {
  const { locale, t } = useI18n();
  const base = Math.min(preview.baseRate, preview.rate);
  const luck = preview.rate - base;
  const fails = cfg.luckPerFail > 0 ? Math.round(preview.luck / cfg.luckPerFail) : 0;
  const warnings = material ? materialWarnings(card, material.card, material.pc, locale) : [];
  const label = (
    <>
      {pending && <span className="spinner" aria-hidden="true" />}
      {hold ? t('upg.holdBtn') : t('upg.runBtn')} · {formatNumber(preview.fee, locale)} <Coin />
    </>
  );
  return (
    <>
      <div className="upg__rate-row">
        <span className="label">{t('upg.rateLabel')}</span>
        <span className="display num upg__rate">
          {preview.rate}
          <span className="upg__pct">%</span>
        </span>
      </div>
      <UpgradeBar base={base} luck={luck} />
      <div className="muted upg__legend">
        <span>
          <i className="upg__key upg__key--base" aria-hidden="true" />{' '}
          {t('upg.baseLabel', { level: preview.toLevel, rate: preview.baseRate })}
        </span>
        {preview.luck > 0 && (
          <span>
            <i className="upg__key upg__key--luck" aria-hidden="true" />{' '}
            {t('upg.luckLabel', { luck: preview.luck, fails })}
          </span>
        )}
      </div>
      <div className="upg__fee">
        <span>
          {t('upg.feeLabel')}{' '}
          <span className="muted">
            ({formatNumber(preview.fee / cfg.rarityFeeMultiplier[card.rarity], locale)} ×{' '}
            {getRarityLabel(card.rarity, locale)} ×{cfg.rarityFeeMultiplier[card.rarity]})
          </span>
        </span>
        <span className={`coin${short > 0 ? ' coin--short' : ''}`}>
          <span className="coin__icon" aria-hidden />
          <span className="num">{formatNumber(preview.fee, locale)}</span>
          <span className="sr-only"> {t('common.coin')}</span>
        </span>
      </div>
      <UpgradeStats card={card} preview={preview} />

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {!material ? (
        <p className="muted upg__note">
          <WarnIcon /> {t('upg.selectMatNote')}
        </p>
      ) : hold ? (
        <div className="banner" role="note">
          <WarnIcon />
          <span>
            <b>{t('upg.valuableMatTitle')}</b> {warnings.slice(1).join(' ') || warnings[0]}{' '}
            {t('upg.valuableMatHint')}
          </span>
        </div>
      ) : (
        <p className="muted upg__note">
          <WarnIcon /> {warnings[0]}{' '}
          {t('upg.failKeepNote', { level, luckPerFail: cfg.luckPerFail })}
        </p>
      )}
      {short > 0 && (
        <p className="upg__short">
          {t('upg.shortCoins', { short: formatNumber(short, locale) })}
        </p>
      )}
      {hold ? (
        <HoldButton
          className="btn btn--primary btn--lg btn--hold"
          onHold={onRun}
          disabled={!canRun}
        >
          {label}
        </HoldButton>
      ) : (
        <button
          type="button"
          className="btn btn--primary btn--lg"
          disabled={!canRun}
          aria-busy={pending}
          onClick={onRun}
        >
          {label}
        </button>
      )}
    </>
  );
}

/** Thanh tỉ lệ 2 màu: phần cơ bản (chanh) + phần may mắn (sọc vàng). */
function UpgradeBar({ base, luck }: { base: number; luck: number }) {
  return (
    <div
      className="bar bar--thick"
      style={{ '--v': `${base}%`, '--luck': `${luck}%` } as CSSProperties}
      aria-hidden="true"
    >
      <div className="bar__fill" />
      {luck > 0 && <div className="bar__luck" />}
    </div>
  );
}

interface PickGridProps {
  items: PickItem[];
  activeId: string | undefined;
  label: string;
  empty: ReactNode;
  onPick: (it: PickItem) => void;
}

function PickGrid({ items, activeId, label, empty, onPick }: PickGridProps) {
  if (items.length === 0) return <>{empty}</>;
  return (
    <ul className="upg__grid" aria-label={label}>
      {items.map((it) => {
        const lock = it.tone === 'lock';
        const on = it.pc.id === activeId;
        return (
          <li key={it.pc.id}>
            <button
              type="button"
              className="upg-pick"
              aria-pressed={on}
              disabled={lock}
              onClick={() => onPick(it)}
            >
              <CardView
                card={it.card}
                size="sm"
                level={it.pc.level}
                stats={it.pc.effectiveStats}
                selected={on}
                dim={lock}
                inSquad={it.pc.inSquad}
              />
              <span
                className={`tag${it.tone === 'success' ? ' tag--success' : it.tone === 'warn' ? ' tag--warn' : ''}`}
              >
                {lock ? (
                  <LockIcon />
                ) : it.tone === 'warn' ? (
                  <WarnIcon />
                ) : it.tone === 'success' ? (
                  <CheckIcon />
                ) : null}
                {it.note}
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Kết quả: thành công → vòng sáng toả + thẻ nảy; thất bại → thẻ rung, chữ đỏ, thanh may mắn mới. */
function ResultDialog({
  outcome,
  cfg,
  onClose,
}: {
  outcome: Outcome;
  cfg: UpgradeConfig;
  onClose: () => void;
}) {
  const { locale, t } = useI18n();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const { res, card, fromLevel } = outcome;
  const win = res.success;
  // Lần ép kế tiếp (xem trước, chỉ để hiển thị).
  const next = upgradePreview(card, { level: res.level, luck: res.luck }, cfg);
  const nextBase = next ? Math.min(next.baseRate, next.rate) : 0;
  return (
    <dialog
      ref={ref}
      className={`upg-result ${win ? 'upg-result--win' : 'upg-result--lose'}`}
      aria-labelledby="upg-result-title"
      onClose={onClose}
    >
      <span className="label">{win ? t('upg.resultWinLabel') : t('upg.resultLoseLabel')}</span>
      <div className="upg-result__stage">
        {win && <span className="upg-result__ring" aria-hidden="true" />}
        <div className="upg-result__card">
          <CardView
            card={card}
            size="lg"
            level={res.level}
            stats={effectiveStats(card, res.level)}
          />
        </div>
      </div>
      <h2 id="upg-result-title" className="display upg-result__title" role="status">
        {win ? t('upg.resultWinTitle', { level: res.level }) : t('upg.resultLoseLabel')}
      </h2>
      {win ? (
        <p className="muted upg-result__text">
          {t('upg.resultWinDesc', { name: card.name, level: res.level, from: fromLevel })}
        </p>
      ) : (
        <div className="upg-result__luck">
          <div className="upg-result__luck-row">
            <span>
              {t('upg.resultLoseKeep')} <b>+{res.level}</b> {t('upg.resultLoseLost')}
            </span>
            {next && (
              <span>
                {t('upg.resultLoseNext')} <b className="num upg-result__next">{next.rate}%</b>
              </span>
            )}
          </div>
          {next && <UpgradeBar base={nextBase} luck={next.rate - nextBase} />}
          <span className="muted upg__small">
            {t('upg.resultLoseLuck', { perFail: cfg.luckPerFail, total: res.luck })}
          </span>
        </div>
      )}
      <p className="muted upg__small">
        {t('upg.resultSummary', {
          rate: res.rate,
          fee: formatNumber(res.fee, locale),
          balance: formatNumber(res.balance, locale),
        })}
      </p>
      <div className="upg-result__actions">
        {next ? (
          <button type="button" className="btn btn--primary" autoFocus onClick={onClose}>
            {win
              ? t('upg.resultContinue', { level: next.toLevel, rate: next.rate })
              : t('upg.resultRetry')}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" autoFocus onClick={onClose}>
            {t('common.done')}
          </button>
        )}
        <Link className="btn btn--secondary" to="/collection">
          {t('shop.toCollection')}
        </Link>
      </div>
    </dialog>
  );
}
