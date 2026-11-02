import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { effectiveStats, type Card, type PlayerCard, type UpgradeCardResult } from '@pitch/shared';
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
import '../collection/collection.css'; // lưới thẻ + chip dùng chung với Kho thẻ
import './upgrade.css';

const fmt = (n: number) => n.toLocaleString('vi-VN');
const Coin = () => (
  <>
    <span className="coin__icon" aria-hidden />
    <span className="sr-only"> xu</span>
  </>
);

type Tab = 'target' | 'material';

interface Outcome {
  res: UpgradeCardResult;
  card: Card;
  fromLevel: number;
}

/**
 * Màn ép thẻ (PRD §6.5, F10): chọn thẻ được ép + nguyên liệu (thẻ chọn lưu trên URL `?card=&mat=`),
 * xem tỉ lệ = cơ bản + may mắn, phí, chỉ số sau ép, cảnh báo mất nguyên liệu; kết quả do server quay.
 */
export function UpgradePage() {
  const [params, setParams] = useSearchParams();
  const list = usePlayerCards({ sort: '-ovr' });
  const catalog = useCardCatalog();
  const economy = useEconomy();
  const me = useMe();
  const upgrader = useUpgradeCard();
  const [tab, setTab] = useState<Tab | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (list.isPending || catalog.isPending || economy.isPending) {
    return <p className="screen-msg">Đang tải…</p>;
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
  const { valid: materials, inSquad: lockedMaterials } = target
    ? materialCandidates(target.pc, list.data, catalog.data)
    : { valid: [], inSquad: 0 };
  const material = materials.find((it) => it.pc.id === params.get('mat')) ?? null;
  const preview = target ? upgradePreview(target.card, target.pc, cfg) : null;
  const coins = me.data?.coins ?? 0;
  const short = preview ? Math.max(0, preview.fee - coins) : 0;
  const activeTab: Tab = tab ?? (target && preview ? 'material' : 'target');

  const select = (card: string | null, mat: string | null) => {
    const next = new URLSearchParams();
    if (card) next.set('card', card);
    if (mat) next.set('mat', mat);
    setParams(next, { replace: true });
    upgrader.reset();
  };
  const pickTarget = (pc: PlayerCard) => {
    select(pc.id, null);
    setTab('material');
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

  return (
    <div className="upg">
      <header className="upg__head">
        <h1 className="panel__title upg__title">Ép thẻ</h1>
        <Link to="/collection" className="btn btn--secondary btn--sm">
          ← Kho thẻ
        </Link>
      </header>

      <section className="panel upg__stage" aria-label="Bàn ép thẻ">
        <div className="upg__slot">
          <span className="upg__label">Thẻ được ép</span>
          {target ? (
            <CardView
              card={target.card}
              size="lg"
              level={target.pc.level}
              stats={effectiveStats(target.card, target.pc.level)}
            />
          ) : (
            <EmptySlot text="Chọn thẻ muốn ép ở danh sách bên dưới" />
          )}
        </div>

        <div className="upg__center">
          {!target ? (
            <p className="muted">Chọn một thẻ để xem tỉ lệ, phí và chỉ số sau khi ép.</p>
          ) : !preview ? (
            <p className="upg__maxed">Thẻ đã đạt +{cfg.maxLevel} — không ép thêm được.</p>
          ) : (
            <>
              <div
                className="upg__levels"
                aria-label={`Từ +${target.pc.level} lên +${preview.toLevel}`}
              >
                <span>+{target.pc.level}</span>
                <span className="upg__arrow" aria-hidden="true">
                  ➜
                </span>
                <span className="upg__to">+{preview.toLevel}</span>
              </div>
              <dl className="upg__facts">
                <dt>Tỉ lệ thành công</dt>
                <dd className="upg__rate">{preview.rate}%</dd>
                <dd className="upg__rate-note">
                  {preview.baseRate}% cơ bản
                  {preview.luck > 0 && <> + {preview.luck}% may mắn</>}
                </dd>
                <dt>Phí</dt>
                <dd className="upg__fee">
                  {fmt(preview.fee)} <Coin />
                </dd>
              </dl>
              <div className="upg__meter" aria-hidden="true">
                <span
                  className="upg__meter-base"
                  style={{ width: `${Math.min(preview.baseRate, preview.rate)}%` }}
                />
                <span
                  className="upg__meter-luck"
                  style={{ width: `${preview.rate - Math.min(preview.baseRate, preview.rate)}%` }}
                />
              </div>
              <p className="upg__hint muted">
                Thất bại: giữ cấp, mất nguyên liệu và phí, thẻ được +{cfg.luckPerFail}% may mắn cho
                lần sau.
              </p>
            </>
          )}
        </div>

        <div className="upg__slot">
          <span className="upg__label">Nguyên liệu</span>
          {material ? (
            <CardView
              card={material.card}
              size="lg"
              level={material.pc.level}
              stats={material.pc.effectiveStats}
            />
          ) : (
            <EmptySlot
              text={
                target && preview
                  ? `Chọn 1 thẻ ${RARITY_INFO[target.card.rarity].label} trở lên làm nguyên liệu`
                  : 'Chọn thẻ được ép trước'
              }
            />
          )}
        </div>
      </section>

      {target && preview && (
        <section className="upg__confirm">
          <div className="panel upg__stats-panel">
            <h2 className="upg__subtitle">Chỉ số sau khi ép</h2>
            <UpgradeStats card={target.card} preview={preview} />
          </div>
          <div className="panel upg__action">
            {material ? (
              <ul className="upg__warn" aria-label="Cảnh báo">
                {materialWarnings(target.card, material.card, material.pc).map((w) => (
                  <li key={w}>⚠ {w}</li>
                ))}
              </ul>
            ) : (
              <p className="muted">Chọn nguyên liệu để ép.</p>
            )}
            {upgrader.error && (
              <p className="form-error" role="alert">
                {upgradeErrorMessage(upgrader.error)}
              </p>
            )}
            {hold ? (
              <HoldButton
                className="btn btn--primary btn--lg"
                onHold={() => void run()}
                disabled={!canRun}
              >
                {upgrader.isPending && <span className="spinner" aria-hidden="true" />}
                Giữ để ép · {fmt(preview.fee)} <Coin />
              </HoldButton>
            ) : (
              <button
                type="button"
                className="btn btn--primary btn--lg"
                disabled={!canRun}
                aria-busy={upgrader.isPending}
                onClick={() => void run()}
              >
                {upgrader.isPending && <span className="spinner" aria-hidden="true" />}
                Ép thẻ · {fmt(preview.fee)} <Coin />
              </button>
            )}
            {short > 0 && (
              <span className="upg__short">
                Thiếu {fmt(short)} <Coin />
              </span>
            )}
          </div>
        </section>
      )}

      <section className="upg__picker" aria-label="Chọn thẻ">
        <div className="chips upg__tabs" role="group" aria-label="Danh sách đang chọn">
          <button
            type="button"
            className="chip"
            aria-pressed={activeTab === 'target'}
            onClick={() => setTab('target')}
          >
            Thẻ được ép
          </button>
          <button
            type="button"
            className="chip"
            aria-pressed={activeTab === 'material'}
            disabled={!target || !preview}
            onClick={() => setTab('material')}
          >
            Nguyên liệu ({materials.length} hợp lệ)
          </button>
        </div>

        {activeTab === 'target' ? (
          <CardGrid
            items={items}
            activeId={target?.pc.id}
            empty="Kho đang trống."
            note={(it) =>
              it.pc.level >= cfg.maxLevel
                ? 'Đã tối đa'
                : it.pc.luck > 0
                  ? `May mắn ${it.pc.luck}%`
                  : null
            }
            onPick={(it) => pickTarget(it.pc)}
          />
        ) : (
          <>
            <p className="muted upg__filter-note">
              Chỉ hiện thẻ {target ? RARITY_INFO[target.card.rarity].label : ''} trở lên, không nằm
              trong đội hình. Thẻ ít giá trị xếp trước.
              {lockedMaterials > 0 &&
                ` ${lockedMaterials} thẻ hợp lệ đang trong đội hình nên bị ẩn.`}
            </p>
            <CardGrid
              items={materials}
              activeId={material?.pc.id}
              empty="Không có nguyên liệu hợp lệ. Mở thêm gói ở Cửa hàng."
              note={(it) => (it.pc.level > 0 ? `⚠ Đang +${it.pc.level}` : null)}
              onPick={(it) => select(target!.pc.id, it.pc.id)}
            />
          </>
        )}
      </section>

      {outcome && <ResultDialog outcome={outcome} onClose={() => setOutcome(null)} />}
    </div>
  );
}

function EmptySlot({ text }: { text: string }) {
  return (
    <div className="upg__empty">
      <span>{text}</span>
    </div>
  );
}

interface CardGridProps {
  items: CardItem[];
  activeId: string | undefined;
  empty: string;
  note: (it: CardItem) => string | null;
  onPick: (it: CardItem) => void;
}

function CardGrid({ items, activeId, empty, note, onPick }: CardGridProps) {
  if (items.length === 0) return <p className="panel muted">{empty}</p>;
  return (
    <ul className="coll__grid">
      {items.map((it) => {
        const n = note(it);
        return (
          <li key={it.pc.id} className={`coll-item${it.pc.id === activeId ? ' is-active' : ''}`}>
            <button
              type="button"
              className="coll-item__card"
              aria-pressed={it.pc.id === activeId}
              onClick={() => onPick(it)}
            >
              <CardView card={it.card} size="md" level={it.pc.level} stats={it.pc.effectiveStats} />
            </button>
            <div className="coll-item__foot">
              {it.pc.inSquad && <span className="coll-item__squad">● Trong đội </span>}
              {n && <span className="upg__note">{n}</span>}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** Hiệu ứng kết quả: thành công → vòng sáng toả + thẻ nảy; thất bại → thẻ rung, chữ đỏ. */
function ResultDialog({ outcome, onClose }: { outcome: Outcome; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const { res, card, fromLevel } = outcome;
  const win = res.success;
  return (
    <dialog
      ref={ref}
      className={`panel upg-result ${win ? 'upg-result--win' : 'upg-result--lose'}`}
      aria-labelledby="upg-result-title"
      onClose={onClose}
    >
      <div className="upg-result__stage">
        {win && <span className="upg-result__burst" aria-hidden="true" />}
        <div className="upg-result__card">
          <CardView
            card={card}
            size="lg"
            level={res.level}
            stats={effectiveStats(card, res.level)}
          />
        </div>
      </div>
      <h2 id="upg-result-title" className="upg-result__title" role="status">
        {win ? `Thành công · +${res.level}` : 'Thất bại'}
      </h2>
      <p className="upg-result__text">
        {win
          ? `${card.name} lên +${res.level} (từ +${fromLevel}). May mắn về 0.`
          : `${card.name} giữ +${res.level}. May mắn tăng lên ${res.luck}% cho lần ép sau.`}
      </p>
      <p className="muted">
        Tỉ lệ đã áp {res.rate}% · phí {fmt(res.fee)} <Coin /> · còn {fmt(res.balance)} <Coin />
      </p>
      <button type="button" className="btn btn--primary" autoFocus onClick={onClose}>
        Tiếp tục
      </button>
    </dialog>
  );
}
