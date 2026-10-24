import { Link } from 'react-router';
import { useMe } from '../../api/auth';

/** Menu chính (DESIGN.md §6.1). Việc chính là "Đá ngay"; ba ô dưới là lối tắt. */
export function HomePage() {
  const me = useMe().data;
  if (!me) return null;
  const rewardLeft = me.rewardedMatchesToday < me.rewardedMatchesLimit;
  return (
    <div className="home">
      <section className="panel home__play" aria-labelledby="play-title">
        <h2 id="play-title" className="panel__title">
          Đá với máy
        </h2>
        <div className="home__pitch" aria-hidden="true" />
        <div className="home__play-row">
          <p className="muted">
            {rewardLeft
              ? `Trận có thưởng hôm nay: ${me.rewardedMatchesToday}/${me.rewardedMatchesLimit}`
              : 'Không còn thưởng hôm nay'}
          </p>
          <Link to="/play" className="btn btn--primary btn--lg">
            Đá ngay ▶
          </Link>
        </div>
      </section>
      <div className="home__tiles">
        <Link to="/shop" className="panel tile">
          <span className="panel__title">Cửa hàng</span>
          <span className="muted">
            {me.freePack5Credits > 0
              ? `★ ${me.freePack5Credits} gói 5 miễn phí`
              : 'Mở gói thẻ bằng xu'}
          </span>
        </Link>
        <Link to="/collection" className="panel tile">
          <span className="panel__title">Kho thẻ</span>
          <span className="muted">Xem và bán thẻ</span>
        </Link>
        <Link to="/squad" className="panel tile">
          <span className="panel__title">Đội hình</span>
          <span className="muted">Xếp 7 người đá chính</span>
        </Link>
      </div>
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
