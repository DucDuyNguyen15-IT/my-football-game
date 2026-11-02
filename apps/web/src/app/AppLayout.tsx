import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router';
import { useLogout, useMe } from '../api/auth';

/** Chặn route khi chưa đăng nhập: chuyển về /login, nhớ trang định vào để quay lại sau. */
export function RequireAuth() {
  const me = useMe();
  const location = useLocation();
  if (me.isPending) return <p className="screen-msg">Đang tải…</p>;
  if (me.isError) {
    return (
      <div className="screen-msg" role="alert">
        <p>Không kết nối được máy chủ.</p>
        <button type="button" className="btn btn--secondary" onClick={() => void me.refetch()}>
          Thử lại
        </button>
      </div>
    );
  }
  if (!me.data) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  return <Outlet />;
}

const NAV = [
  { to: '/', label: 'Trang chủ', end: true },
  { to: '/shop', label: 'Cửa hàng', end: false },
  { to: '/collection', label: 'Kho thẻ', end: false },
  { to: '/squad', label: 'Đội hình', end: false },
] as const;

/** Khung các màn ngoài trận (docs/design/screens/home.html): thanh trên 56px — logo · menu · ví xu · người chơi · đăng xuất. */
export function AppLayout() {
  const me = useMe().data;
  const logout = useLogout();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="logo" aria-label="MFG — trang chủ">
          <span className="logo__mark" aria-hidden="true" />
          MFG
        </Link>
        <nav className="nav" aria-label="Menu chính">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `nav__link${isActive ? ' is-on' : ''}`}
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        {me && (
          <div className="topbar__right">
            <span className="wallet">
              <span className="coin coin--sm" aria-label={`${me.coins} xu`}>
                <span className="coin__icon" aria-hidden="true" />
                {me.coins.toLocaleString('vi-VN')}
              </span>
            </span>
            <span className="user">
              <span className="user__dot" aria-hidden="true">
                {me.username.slice(0, 1).toUpperCase()}
              </span>
              <span className="user__name">{me.username}</span>
            </span>
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={logout.isPending}
              onClick={() => logout.mutate()}
            >
              Đăng xuất
            </button>
          </div>
        )}
      </header>
      <main className="page">
        <Outlet />
      </main>
    </div>
  );
}
