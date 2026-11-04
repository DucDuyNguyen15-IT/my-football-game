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
import { RARITY_INFO } from '../../components/card/rarity';
import { HoldButton } from '../../components/HoldButton';
import {
  materialCandidates,
  materialWarnings,
  needsHoldConfirm,
  upgradeErrorMessage,
  upgradePreview,
  type CardItem,
} from './upgrade';
import { UpgradeStats } from './UpgradeStats';
import './upgrade.css';

const fmt = (n: number) => n.toLocaleString('vi-VN');
const Coin = () => (
  <>
    <span className="coin__icon" aria-hidden />
    <span className="sr-only"> xu</span>
  </>
);

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

/** Một ô trong lưới chọn: thẻ + nhãn trạng thái dưới thẻ. */
interface PickItem extends CardItem {
  tone: 'success' | 'warn' | 'lock' | 'plain';
  note: string;
}

/**
 * Màn ép thẻ (PRD §6.5, F10) theo docs/design/screens/upgrade*.html: thẻ cần ép | chọn nguyên liệu |
 * tỉ lệ (cơ bản + may mắn), phí, chỉ số sau ép. Thẻ chọn lưu trên URL `?card=&mat=`; kết quả do server quay.
 */
export function UpgradePage() {
  const [params, setParams] = useSearchParams();
  const list = usePlayerCards({ sort: '-ovr' });
  const catalog = useCardCatalog();
  const economy = useEconomy();
  const me = useMe();
  const upgrader = useUpgradeCard();
  const [picking, setPicking] = useState(false);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (list.isPending || catalog.isPending || economy.isPending) {
    return (
      <div className="upg upg--loading" aria-busy="true">
        <p className="sr-only">Đang tải…</p>
        <div className="skel upg-skel__head" />
        <div className="upg__layout">
          <div className="skel upg-skel__panel" />
          <div className="skel upg-skel__panel" />
          <div className="skel upg-skel__panel" />
        </div>
      </div>
    );
  }
  if (list.isError || catalog.isError || economy.isError) {
    return (
      <div className="screen-msg" role="alert">
        <p>Không tải được dữ liệu ép thẻ.</p>
        <button
          type="button"
          className="btn btn--secondary"
          onClick={() => {
            void list.refetch();
            void catalog.refetch();
            void economy.refetch();
          }}
        >
          Thử lại
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
    if (!target || !material || !preview) return;
    const fromLevel = target.pc.level;
    const res = await upgrader.upgrade(target.pc.id, material.pc.id).catch(() => null);
    if (!res) return;
    // Nguyên liệu đã mất → bỏ chọn; giữ thẻ được ép để ép tiếp.
    select(target.pc.id, null);
    setOutcome({ res, card: target.card, fromLevel });
  }

  const canRun =
    !!target && !!material && !!preview && short === 0 && !upgrader.isPending && !!me.data;
  const hold =
    target && material ? needsHoldConfirm(target.card, material.card, material.pc) : false;
  const rarityLabel = target ? RARITY_INFO[target.card.rarity].label : '';

  // Lưới nguyên liệu: hợp lệ trước (rẻ trước), rồi thẻ khoá (trong đội hình / độ hiếm thấp hơn).
  const materialGrid: PickItem[] = target
    ? [
        ...materials.map((it): PickItem => {
          if (it.pc.level > 0) return { ...it, tone: 'warn', note: `Đã ép +${it.pc.level}` };
          if (it.card.rarity !== target.card.rarity)
            return { ...it, tone: 'warn', note: 'Hiếm hơn' };
          return { ...it, tone: 'success', note: 'Hợp lệ' };
        }),
        ...items
          .filter((it) => it.pc.id !== target.pc.id && !materials.includes(it))
          .map((it): PickItem => ({
            ...it,
            tone: 'lock',
            note: it.pc.inSquad ? 'Trong đội hình' : `Thấp hơn ${rarityLabel}`,
          }))
          .sort((a, b) => Number(b.pc.inSquad) - Number(a.pc.inSquad)),
      ]
    : [];
  const targetGrid: PickItem[] = items.map((it) =>
    it.pc.level >= cfg.maxLevel
      ? { ...it, tone: 'plain', note: 'Đã tối đa' }
      : it.pc.luck > 0
        ? { ...it, tone: 'warn', note: `May mắn ${it.pc.luck}%` }
        : { ...it, tone: 'plain', note: `+${it.pc.level} → +${it.pc.level + 1}` },
  );

  return (
    <div className="upg">
      <header className="upg__head">
        <Link to="/collection" className="btn btn--ghost btn--sm">
          <BackIcon />
          Kho thẻ
        </Link>
        <h1 className="h1">Ép thẻ</h1>
        <span className="muted upg__sub">
          +1 → +{cfg.maxLevel} · mỗi lần tiêu 1 thẻ nguyên liệu cùng độ hiếm trở lên
        </span>
      </header>

      <div className="upg__layout">
        <section className="panel upg__target" aria-label="Thẻ cần ép">
          <span className="label">Thẻ cần ép</span>
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
                    aria-label={`Từ +${target.pc.level} lên +${preview.toLevel}`}
                  >
                    <span className="display num upg__from">+{target.pc.level}</span>
                    <span className="muted" aria-hidden="true">
                      →
                    </span>
                    <span className="display num upg__to">+{preview.toLevel}</span>
                  </div>
                  <span className="muted upg__small">
                    +{preview.toLevel} = cộng tổng +{preview.bonusAfter} vào mọi chỉ số (tối đa 99)
                  </span>
                </>
              ) : (
                <span className="tag tag--accent">Đã tối đa +{cfg.maxLevel}</span>
              )}
              {!picking && (
                <button
                  type="button"
                  className="btn btn--secondary btn--sm"
                  onClick={() => setPicking(true)}
                >
                  Đổi thẻ
                </button>
              )}
            </>
          ) : (
            <div className="upg__empty">Chọn thẻ cần ép ở danh sách bên cạnh</div>
          )}
        </section>

        <section className="panel upg__pick" aria-labelledby="upg-pick-title">
          <h2 className="panel__title" id="upg-pick-title">
            {choosingTarget ? 'Chọn thẻ cần ép' : 'Chọn nguyên liệu'}
            <span className="meta">
              {choosingTarget
                ? `${items.length} thẻ trong kho`
                : `${rarityLabel} trở lên · không trong đội hình`}
            </span>
          </h2>
          {choosingTarget ? (
            <PickGrid
              items={targetGrid}
              activeId={target?.pc.id}
              label="Thẻ trong kho"
              empty={
                <div className="empty">
                  <h3 className="empty__title">Kho còn trống</h3>
                  <p className="empty__body">Mở gói ở Cửa hàng để có thẻ đầu tiên.</p>
                  <Link className="btn btn--primary" to="/shop">
                    Tới cửa hàng
                  </Link>
                </div>
              }
              onPick={(it) => {
                select(it.pc.id, null);
                setPicking(false);
              }}
            />
          ) : !preview ? (
            <p className="muted">Thẻ đã đạt +{cfg.maxLevel} — không ép thêm được.</p>
          ) : (
            <PickGrid
              items={materialGrid}
              activeId={material?.pc.id}
              label="Nguyên liệu"
              empty={
                <div className="empty">
                  <h3 className="empty__title">Chưa có nguyên liệu</h3>
                  <p className="empty__body">
                    Cần 1 thẻ {rarityLabel} trở lên không nằm trong đội hình.
                  </p>
                  <Link className="btn btn--secondary" to="/shop">
                    Tới cửa hàng
                  </Link>
                </div>
              }
              onPick={(it) => select(target!.pc.id, it.pc.id)}
            />
          )}
        </section>

        <section className="panel upg__sum" aria-label="Tỉ lệ và phí">
          {!target || !preview ? (
            <p className="muted">
              {target
                ? `Thẻ đã đạt cấp tối đa +${cfg.maxLevel}.`
                : 'Chọn thẻ cần ép để xem tỉ lệ, phí và chỉ số sau khi ép.'}
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
              pending={upgrader.isPending}
              short={short}
              error={upgrader.error ? upgradeErrorMessage(upgrader.error) : null}
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
  const base = Math.min(preview.baseRate, preview.rate);
  const luck = preview.rate - base;
  const fails = cfg.luckPerFail > 0 ? Math.round(preview.luck / cfg.luckPerFail) : 0;
  const warnings = material ? materialWarnings(card, material.card, material.pc) : [];
  const label = (
    <>
      {pending && <span className="spinner" aria-hidden="true" />}
      {hold ? 'Giữ để ép' : 'Ép thẻ'} · {fmt(preview.fee)} <Coin />
    </>
  );
  return (
    <>
      <div className="upg__rate-row">
        <span className="label">Tỉ lệ thành công</span>
        <span className="display num upg__rate">
          {preview.rate}
          <span className="upg__pct">%</span>
        </span>
      </div>
      <UpgradeBar base={base} luck={luck} />
      <div className="muted upg__legend">
        <span>
          <i className="upg__key upg__key--base" aria-hidden="true" /> Cơ bản +{preview.toLevel}:{' '}
          {preview.baseRate}%
        </span>
        {preview.luck > 0 && (
          <span>
            <i className="upg__key upg__key--luck" aria-hidden="true" /> May mắn tích luỹ: +
            {preview.luck}% ({fails} lần trượt)
          </span>
        )}
      </div>
      <div className="upg__fee">
        <span>
          Phí ép{' '}
          <span className="muted">
            ({fmt(preview.fee / cfg.rarityFeeMultiplier[card.rarity])} ×{' '}
            {RARITY_INFO[card.rarity].label} ×{cfg.rarityFeeMultiplier[card.rarity]})
          </span>
        </span>
        <span className={`coin${short > 0 ? ' coin--short' : ''}`}>
          <span className="coin__icon" aria-hidden />
          <span className="num">{fmt(preview.fee)}</span>
          <span className="sr-only"> xu</span>
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
          <WarnIcon /> Chọn 1 thẻ nguyên liệu để ép. Nguyên liệu sẽ mất dù thành công hay thất bại.
        </p>
      ) : hold ? (
        <div className="banner" role="note">
          <WarnIcon />
          <span>
            <b>Nguyên liệu quý:</b> {warnings.slice(1).join(' ') || warnings[0]} Giữ nút 1 giây để
            xác nhận.
          </span>
        </div>
      ) : (
        <p className="muted upg__note">
          <WarnIcon /> {warnings[0]} Thất bại: giữ cấp +{level}, may mắn +{cfg.luckPerFail}%.
        </p>
      )}
      {short > 0 && <p className="upg__short">Thiếu {fmt(short)} xu để ép.</p>}
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
      <span className="label">{win ? 'Thành công' : 'Thất bại'}</span>
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
        {win ? `+${res.level} thành công` : 'Thất bại'}
      </h2>
      {win ? (
        <p className="muted upg-result__text">
          {card.name} lên +{res.level} (từ +{fromLevel}) · may mắn về 0%
        </p>
      ) : (
        <div className="upg-result__luck">
          <div className="upg-result__luck-row">
            <span>
              Giữ cấp <b>+{res.level}</b> · nguyên liệu đã mất
            </span>
            {next && (
              <span>
                Lần sau: <b className="num upg-result__next">{next.rate}%</b>
              </span>
            )}
          </div>
          {next && <UpgradeBar base={nextBase} luck={next.rate - nextBase} />}
          <span className="muted upg__small">
            May mắn +{cfg.luckPerFail}% → tích luỹ {res.luck}% (gắn với thẻ này)
          </span>
        </div>
      )}
      <p className="muted upg__small">
        Tỉ lệ đã áp {res.rate}% · phí {fmt(res.fee)} xu · còn {fmt(res.balance)} xu
      </p>
      <div className="upg-result__actions">
        {next ? (
          <button type="button" className="btn btn--primary" autoFocus onClick={onClose}>
            {win ? `Ép tiếp lên +${next.toLevel} (${next.rate}%)` : 'Thử lại với nguyên liệu khác'}
          </button>
        ) : (
          <button type="button" className="btn btn--primary" autoFocus onClick={onClose}>
            Xong
          </button>
        )}
        <Link className="btn btn--secondary" to="/collection">
          Về kho
        </Link>
      </div>
    </dialog>
  );
}
