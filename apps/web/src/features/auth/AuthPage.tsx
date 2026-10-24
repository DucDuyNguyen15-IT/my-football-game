import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router';
import { LoginRequest, RegisterRequest } from '@pitch/shared';
import { useLogin, useMe, useRegister } from '../../api/auth';
import { ApiClientError } from '../../api/client';

type Mode = 'login' | 'register';

function errorText(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.code === 'network_error') return 'Không kết nối được máy chủ. Thử lại sau.';
    return err.details?.[0]?.message ?? err.message;
  }
  return 'Có lỗi xảy ra. Thử lại sau.';
}

/** Đăng nhập / đăng ký. Đã đăng nhập thì chuyển về trang định vào (hoặc menu). */
export function AuthPage() {
  const me = useMe();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const login = useLogin();
  const register = useRegister();
  const active = mode === 'login' ? login : register;

  if (me.data) return <Navigate to={from} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const schema = mode === 'login' ? LoginRequest : RegisterRequest;
    const parsed = schema.safeParse({ username, password });
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ');
      return;
    }
    setLocalError(null);
    active.mutate(parsed.data);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setLocalError(null);
    login.reset();
    register.reset();
  };

  const error = localError ?? (active.isError ? errorText(active.error) : null);

  return (
    <main className="auth">
      <div className="panel auth__box">
        <p className="auth__logo">MFG</p>
        <div className="auth__tabs" role="tablist">
          {(['login', 'register'] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={mode === m}
              className={`auth__tab${mode === m ? ' is-active' : ''}`}
              onClick={() => switchMode(m)}
            >
              {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
            </button>
          ))}
        </div>
        <form className="auth__form" onSubmit={onSubmit} noValidate>
          <label className="field">
            <span className="field__label">Tên đăng nhập</span>
            <input
              className="field__input"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              maxLength={20}
              required
            />
          </label>
          <label className="field">
            <span className="field__label">Mật khẩu</span>
            <input
              className="field__input"
              type="password"
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              maxLength={72}
              required
            />
          </label>
          {mode === 'register' && (
            <p className="field__hint">
              Tên 3–20 ký tự (chữ, số, _), mật khẩu ít nhất 8 ký tự. Tài khoản mới nhận 11 thẻ và 1
              gói 5 miễn phí.
            </p>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" className="btn btn--primary btn--lg" disabled={active.isPending}>
            {active.isPending ? 'Đang gửi…' : mode === 'login' ? 'Vào sân' : 'Tạo tài khoản'}
          </button>
        </form>
      </div>
    </main>
  );
}
