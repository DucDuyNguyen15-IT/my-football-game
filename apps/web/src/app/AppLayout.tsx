import { useState } from 'react';
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { useLogout, useMe } from '../api/auth';
import { useExpiredMissionClaims } from '../api/missions';
import { CountUp } from '../components/CountUp';
import { ExpiredMissionsNotice } from '../features/missions/ExpiredMissionsNotice';
import { formatNumber } from '../i18n/i18n';
import { useI18n } from '../i18n/I18nContext';

function AuthSkeleton() {
  const { t } = useI18n();
  return (
    <div className="shell" aria-busy="true">
      <span className="sr-only" role="status">
        {t('common.loading')}
      </span>
      <header className="topbar">
        <div className="skel" style={{ width: 92, height: 26 }} />
        <div className="skel" style={{ width: 260, height: 20 }} />
        <div className="topbar__right">
          <div className="skel" style={{ width: 96, height: 34 }} />
        </div>
      </header>
      <main className="page">
        <div className="panel" style={{ display: 'grid', gap: 16 }}>
          <div className="skel skel--line" style={{ width: '35%', height: 24 }} />
          <div className="skel skel--line" style={{ width: '65%' }} />
          <div className="skel skel--line" style={{ width: '50%' }} />
        </div>
      </main>
    </div>
  );
}

/** Chặn route khi chưa đăng nhập: chuyển về /login, nhớ trang định vào để quay lại sau. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  const { t } = useI18n();
  if (me.isPending) return <AuthSkeleton />;
  if (me.isError) {
    return (
      <div className="screen-msg" role="alert">
        <p>{t('common.serverConnectError')}</p>
        <button type="button" className="btn btn--secondary" onClick={() => void me.refetch()}>
          {t('common.retry')}
        </button>
      </div>
    );
  }
  // Giữ cả query (?card=12…) để quay lại đúng chỗ sau khi đăng nhập (B4-18).
  if (!me.data) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  return <Outlet />;
}

const NAV = [
  { to: '/', labelKey: 'nav.home', end: true },
  { to: '/shop', labelKey: 'nav.shop', end: false },
  { to: '/collection', labelKey: 'nav.collection', end: false },
  { to: '/squad', labelKey: 'nav.squad', end: false },
] as const;

/** Thanh trên 56px — logo · menu · ví xu · người chơi · đăng xuất (dùng cả ở màn trước trận). */
export function Topbar() {
  const me = useMe().data;
  const logout = useLogout();
  const { locale, t } = useI18n();
  return (
    <header className="topbar">
      <Link to="/" className="logo" aria-label={t('nav.logoAria')}>
        <span className="logo__mark" aria-hidden="true" />
        MFG
      </Link>
      <nav className="nav" aria-label={t('nav.aria')}>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => `nav__link${isActive ? ' is-on' : ''}`}
          >
            {t(n.labelKey)}
          </NavLink>
        ))}
      </nav>
      {me && (
        <div className="topbar__right">
          <span className="wallet">
            <span
              className="coin coin--sm"
              aria-label={t('common.coinsLabel', { count: me.coins })}
            >
              <span className="coin__icon" aria-hidden="true" />
              <CountUp value={me.coins} format={(v) => formatNumber(v, locale)} />
            </span>
          </span>
          <Link
            to="/account"
            className="user"
            aria-label={t('nav.accountAria', { username: me.username })}
          >
            <span className="user__dot" aria-hidden="true">
              {me.username.slice(0, 1).toUpperCase()}
            </span>
            <span className="user__name">{me.username}</span>
          </Link>
          <button
            type="button"
            className={`btn btn--ghost btn--sm${logout.isPending ? ' is-loading' : ''}`}
            disabled={logout.isPending}
            aria-busy={logout.isPending || undefined}
            onClick={() => logout.mutate()}
          >
            <span className="btn__label">{t('nav.logout')}</span>
          </button>
        </div>
      )}
    </header>
  );
}

/** Khung các màn ngoài trận (docs/design/screens/home.html): thanh trên + nội dung. */
export function AppLayout() {
  const me = useMe().data;
  const expired = useExpiredMissionClaims(me?.id);
  // Nhớ đã đóng thông báo nào, để lượt tự nhận của ngày/tài khoản khác vẫn hiện.
  const [closedData, setClosedData] = useState<unknown>(null);
  const items = expired.data?.items ?? [];
  return (
    <div className="shell">
      <Topbar />
      {items.length > 0 && closedData !== expired.data && (
        <ExpiredMissionsNotice items={items} onClose={() => setClosedData(expired.data)} />
      )}
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
