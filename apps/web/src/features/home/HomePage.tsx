import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { STARTER_SLOTS, type Card, type PlayerCard } from '@pitch/shared';
import { useMe } from '../../api/auth';
import { useCardCatalog } from '../../api/cards';
import { usePacks } from '../../api/packs';
import { usePlayerCards } from '../../api/player-cards';
import { useSquad } from '../../api/squad';
import { CardView } from '../../components/card/CardView';
import { ChalkPitch } from '../../components/ChalkPitch';
import { slotLayout } from '../squad/squad';
import './home.css';

const RARITY_SHORT = {
  legend: 'Huyền thoại',
  gold: 'Vàng',
  silver: 'Bạc',
  bronze: 'Đồng',
} as const;

/** Menu chính (docs/design/screens/home.html). Việc chính là "Đá ngay"; cột phải là lối tắt có trạng thái. */
export function HomePage() {
  const me = useMe().data;
  const squad = useSquad();
  const catalog = useCardCatalog();
  const list = usePlayerCards();
  const packs = usePacks();
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

  return (
    <div className="home">
      <div className="home__main">
        <section className="panel--notch home__hero" aria-labelledby="play-title">
          <div className="panel__in night-bg home__hero-in">
            <div className="home__hero-text">
              <span className="label">Trận tiếp theo · 7 đấu 7</span>
              <h1 id="play-title" className="display home__title">
                Đá với máy
              </h1>
              <p className="muted home__lead">
                Chọn <b>Dễ</b> hoặc <b>Khó</b> ở bước sau — thắng mức Khó được gấp đôi xu.
              </p>
              <div className="home__reward">
                <div className="home__reward-row">
                  <span className={rewardLeft ? undefined : 'home__reward-out'}>
                    {rewardLeft ? 'Trận có thưởng hôm nay' : 'Không còn trận có thưởng hôm nay'}
                  </span>
                  <span className="display num home__reward-count">
                    {used}
                    <span className="muted">/{limit}</span>
                  </span>
                </div>
                <div
                  className={`bar bar--segmented home__reward-bar${rewardLeft ? '' : ' is-out'}`}
                  role="img"
                  aria-label={`Đã dùng ${used}/${limit} trận có thưởng`}
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
                  {rewardLeft ? 'Đá ngay' : 'Đá luyện tập'}
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
                    <span className="num">{pc && card ? card.ovr : '–'}</span>
                    <small>{card?.position ?? slot}</small>
                  </span>
                ))}
            </div>
          </div>
        </section>

        <section className="panel home__team" aria-labelledby="team-title">
          <h2 id="team-title" className="panel__title">
            Đội của bạn
            <span className="meta">
              {squad.data && (
                <>
                  {squad.data.formation} · OVR TB <b className="num">{squad.data.teamRating}</b>
                </>
              )}
            </span>
            <Link to="/squad" className="btn btn--ghost btn--sm home__edit">
              Sửa đội hình
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
                    <CardView key={slot} card={card as Card} size="xs" level={pc.level} />
                  ) : (
                    <Link
                      key={slot}
                      to="/squad"
                      className="home__empty-slot"
                      aria-label={`Ô ${slot} còn trống`}
                    >
                      +
                    </Link>
                  ),
                )}
          </div>
          {squad.data && squad.data.warnings.length > 0 && (
            <p className="home__warn">⚠ {squad.data.warnings[0]!.message}</p>
          )}
        </section>
      </div>

      <aside className="home__side" aria-label="Lối tắt">
        {me.freePack5Credits > 0 && (
          <Link to="/shop" className="panel home__tile is-accent">
            <span className="label">Quà tân thủ</span>
            <span className="display home__tile-big">{me.freePack5Credits} gói 5 thẻ miễn phí</span>
            <span className="muted">Mở ngay ở Cửa hàng →</span>
          </Link>
        )}
        <Link to="/shop" className="panel home__tile">
          <span className="label">Hộp thẻ của bạn</span>
          <span className="display home__tile-big">
            {box ? `${box.total}/100 phiếu` : 'Đang tải…'}
          </span>
          <span className="muted">
            {box
              ? `Còn ${box.left.legend} ${RARITY_SHORT.legend} · ${box.left.gold} ${RARITY_SHORT.gold}`
              : ' '}
          </span>
        </Link>
        <Link to="/collection" className="panel home__tile">
          <span className="label">Kho thẻ</span>
          <span className="display home__tile-big">
            {list.data ? `${list.data.length} thẻ` : 'Đang tải…'}
          </span>
          <span className="muted">Xem, bán, ép thẻ →</span>
        </Link>
        <Link to="/upgrade" className="panel home__tile">
          <span className="label">Ép thẻ</span>
          <span className="display home__tile-big">+1 → +5</span>
          <span className="muted">Biết trước tỉ lệ thành công →</span>
        </Link>
      </aside>
    </div>
  );
}

/** Màn chưa làm (6.7, 6.8, 6.10). */
export function ComingSoon({ title }: { title: string }) {
  return (
    <section className="panel">
      <h2 className="panel__title">{title}</h2>
      <p className="muted">Màn này đang được xây dựng.</p>
    </section>
  );
}
