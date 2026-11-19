/** Trang Tài khoản: thông tin cơ bản, link pháp lý, xoá tài khoản (checklist pháp lý GĐ9, NĐ 13). */
import { useId, useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { useDeleteAccount, useMe } from '../../api/auth';
import { ThemeSwitcher } from '../../styles/ThemeSwitcher';
import { describeAuthError } from '../auth/authErrors';
import '../legal/legal.css';

export function AccountPage() {
  const me = useMe().data;
  const remove = useDeleteAccount();
  const [confirmName, setConfirmName] = useState('');
  const [password, setPassword] = useState('');
  const nameId = useId();
  const pwId = useId();
  if (!me) return null;

  const matches = confirmName.trim().toLowerCase() === me.username.toLowerCase();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!matches || remove.isPending) return;
    remove.mutate({ username: confirmName.trim(), ...(password && { password }) });
  };
  const error = remove.error ? describeAuthError(remove.error) : null;

  return (
    <div className="legal__body">
      <h1 className="h1">Tài khoản</h1>
      <p>
        Tên đăng nhập: <b>{me.username}</b>
      </p>
      <p>
        <Link to="/privacy">Chính sách bảo mật</Link> · <Link to="/terms">Điều khoản sử dụng</Link>
      </p>

      <h2 className="h3">Tuỳ chọn hiển thị</h2>
      <div className="account__prefs">
        <div className="account__pref-row">
          <span className="field__label">Giao diện</span>
          <ThemeSwitcher />
        </div>
      </div>

      <h2 className="h3">Xoá tài khoản</h2>
      <p>
        Xoá ngay tên đăng nhập, mật khẩu, email, liên kết Google, mọi phiên đăng nhập và sự kiện
        phân tích. Thẻ, trận và sổ giao dịch xu được giữ lại nhưng không còn gắn với bạn.{' '}
        <b>Không khôi phục được.</b>
      </p>
      <form className="account__form" onSubmit={submit} noValidate>
        <div className="field">
          <label className="field__label" htmlFor={nameId}>
            Gõ lại tên đăng nhập để xác nhận
          </label>
          <input
            id={nameId}
            className="input"
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            maxLength={40}
          />
          {confirmName.trim().length > 0 && !matches && (
            <p className="field__hint">
              Gõ đúng “{me.username}” (không phân biệt hoa thường) để mở khoá nút xoá.
            </p>
          )}
        </div>
        <div className="field">
          <label className="field__label" htmlFor={pwId}>
            Mật khẩu <small>(bỏ trống nếu chỉ đăng nhập bằng Google)</small>
          </label>
          <input
            id={pwId}
            className="input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            maxLength={72}
          />
        </div>
        {error && (
          <div className="banner banner--danger" role="alert">
            <span>
              {error.title && <b>{error.title}. </b>}
              {error.text}
            </span>
          </div>
        )}
        <button
          type="submit"
          className={`btn btn--danger${remove.isPending ? ' is-loading' : ''}`}
          disabled={!matches || remove.isPending}
          aria-busy={remove.isPending || undefined}
        >
          <span className="btn__label">Xoá vĩnh viễn tài khoản</span>
        </button>
      </form>
    </div>
  );
}
