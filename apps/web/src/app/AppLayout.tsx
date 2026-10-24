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
  { to: '/', label: 'Đá với máy', end: true },
  { to: '/shop', label: 'Cửa hàng', end: false },
  { to: '/collection', label: 'Kho thẻ', end: false },
  { to: '/squad', label: 'Đội hình', end: false },
] as const;

/** Khung các màn ngoài trận (DESIGN.md §6): thanh trên 56px — logo · menu · xu · tên · đăng xuất. */
export function AppLayout() {
  const me = useMe().data;
  const logout = useLogout();
  return (
    <div className="shell">
      <header className="topbar">
        <Link to="/" className="topbar__logo" aria-label="MFG — trang chủ">
          MFG
        </Link>
        <nav className="topbar__nav" aria-label="Menu chính">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className="topbar__link">
              {n.label}
            </NavLink>
          ))}
        </nav>
        {me && (
          <div className="topbar__user">
            <span className="coin" aria-label={`${me.coins} xu`}>
              <span className="coin__icon" aria-hidden="true" />
              {me.coins.toLocaleString('vi-VN')}
            </span>
            <span className="topbar__name">{me.username}</span>
            <button
              type="button"
              className="btn btn--secondary btn--sm"
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
