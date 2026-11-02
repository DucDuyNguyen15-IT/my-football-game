import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { LoginRequest, RegisterRequest, Username } from '@pitch/shared';
import { useAuthConfig, useGoogleSignIn, useLogin, useMe, useRegister } from '../../api/auth';
import { describeAuthError, fieldErrorOf, type AuthField, type AuthNotice } from './authErrors';
import { GoogleButton } from './GoogleButton';
import './auth.css';

type Mode = 'login' | 'register';
type FieldErrors = Partial<Record<AuthField, string>>;

/** Đăng nhập / đăng ký (+ Google, ADR-0010). Đã đăng nhập thì chuyển về trang định vào (hoặc menu). */
export function AuthPage() {
  const me = useMe();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const config = useAuthConfig();
  const googleClientId = config.data?.googleClientId ?? null;

  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  /** Lần đầu đăng nhập Google: giữ ID token để gửi lại kèm tên đăng nhập. */
  const [googleStep, setGoogleStep] = useState<{ idToken: string; suggested: string } | null>(null);

  const login = useLogin();
  const register = useRegister();
  const google = useGoogleSignIn();
  const active = mode === 'login' ? login : register;
  const busy = active.isPending || google.isPending;

  // `mutate`/`reset` của TanStack Query ổn định giữa các lần render → nút Google không bị khởi tạo lại.
  const { reset: resetLogin } = login;
  const { reset: resetRegister } = register;
  const { mutate: mutateGoogle } = google;
  const onGoogleCredential = useCallback(
    (idToken: string) => {
      resetLogin();
      resetRegister();
      mutateGoogle(
        { idToken },
        {
          onSuccess: (r) => {
            if (r.status === 'needs_username') {
              setGoogleStep({ idToken, suggested: r.suggestedUsername ?? '' });
            }
          },
        },
      );
    },
    [resetLogin, resetRegister, mutateGoogle],
  );

  if (me.data) return <Navigate to={from} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const schema = mode === 'login' ? LoginRequest : RegisterRequest;
    const parsed = schema.safeParse({ username, password });
    if (!parsed.success) {
      const errs: FieldErrors = {};
      for (const issue of parsed.error.issues) {
        const f = issue.path[0];
        if ((f === 'username' || f === 'password') && !errs[f]) errs[f] = issue.message;
      }
      setLocalErrors(errs);
      return;
    }
    setLocalErrors({});
    google.reset();
    active.mutate(parsed.data);
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setLocalErrors({});
    login.reset();
    register.reset();
    google.reset();
  };

  const serverError = active.error ?? (googleStep ? null : google.error);
  const serverField = fieldErrorOf(serverError);
  const fieldErrors: FieldErrors = {
    ...(serverField ? { [serverField.field]: serverField.text } : {}),
    ...localErrors,
  };
  const notice = serverError && !serverField ? describeAuthError(serverError) : null;

  return (
    <main className="auth">
      <AuthStage />
      <section className="auth__panel" aria-labelledby="auth-title">
        <header className="auth__head">
          <p className="auth__brand">MFG</p>
          <h1 id="auth-title" className="auth__title">
            {googleStep ? 'Chọn tên đăng nhập' : mode === 'login' ? 'Vào sân' : 'Lập đội mới'}
          </h1>
          <p className="auth__sub">
            {googleStep
              ? 'Lần đầu đăng nhập bằng Google — chọn tên sẽ hiện trong game.'
              : mode === 'login'
                ? 'Đăng nhập để mở gói, xếp đội và ra sân.'
                : 'Tài khoản mới nhận 11 thẻ khởi đầu và 1 gói 5 miễn phí.'}
          </p>
        </header>

        {googleStep ? (
          <GoogleUsernameStep
            key={googleStep.idToken}
            suggested={googleStep.suggested}
            pending={google.isPending}
            error={google.error}
            onSubmit={(name) => google.mutate({ idToken: googleStep.idToken, username: name })}
            onCancel={() => {
              setGoogleStep(null);
              google.reset();
            }}
          />
        ) : (
          <>
            <div className="auth__tabs" role="tablist" aria-label="Chọn cách vào">
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
              <Field
                label="Tên đăng nhập"
                error={fieldErrors.username}
                hint={mode === 'register' ? '3–20 ký tự: chữ, số, dấu gạch dưới' : undefined}
              >
                {(props) => (
                  <input
                    {...props}
                    className="field__input"
                    autoComplete="username"
                    autoCapitalize="none"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    maxLength={20}
                    required
                    autoFocus
                  />
                )}
              </Field>
              <Field
                label="Mật khẩu"
                error={fieldErrors.password}
                hint={mode === 'register' ? 'Ít nhất 8 ký tự' : undefined}
              >
                {(props) => (
                  <div className="field__control">
                    <input
                      {...props}
                      className="field__input"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      maxLength={72}
                      required
                    />
                    <button
                      type="button"
                      className="field__reveal"
                      aria-pressed={showPassword}
                      aria-controls={props.id}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      onClick={() => setShowPassword((v) => !v)}
                    >
                      <EyeIcon off={showPassword} />
                    </button>
                  </div>
                )}
              </Field>

              {notice && <Notice notice={notice} />}

              <button type="submit" className="btn btn--primary btn--lg" disabled={busy}>
                {active.isPending && <span className="spinner" aria-hidden="true" />}
                <span>{mode === 'login' ? 'Vào sân' : 'Tạo tài khoản'}</span>
              </button>
            </form>

            {googleClientId && (
              <>
                <p className="auth__or">
                  <span>hoặc</span>
                </p>
                <GoogleButton
                  clientId={googleClientId}
                  onCredential={onGoogleCredential}
                  busy={google.isPending}
                />
              </>
            )}
          </>
        )}
      </section>
    </main>
  );
}

/** Ô nhập có nhãn, gợi ý và lỗi riêng (nối bằng `aria-describedby`). */
function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-err`} className="field__error">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="field__hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

function Notice({ notice }: { notice: AuthNotice }) {
  return (
    <div className={`auth__notice auth__notice--${notice.tone}`} role="alert">
      <span className="auth__notice-icon" aria-hidden="true">
        {notice.tone === 'warning' ? '⏱' : '!'}
      </span>
      <p>
        {notice.title && <strong>{notice.title}. </strong>}
        {notice.text}
      </p>
    </div>
  );
}

/** Bước chọn tên cho người dùng Google lần đầu; gửi lại cùng ID token để tạo tài khoản. */
function GoogleUsernameStep({
  suggested,
  pending,
  error,
  onSubmit,
  onCancel,
}: {
  suggested: string;
  pending: boolean;
  error: unknown;
  onSubmit: (username: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(suggested);
  const [localError, setLocalError] = useState<string | null>(null);
  const serverField = fieldErrorOf(error);
  const notice = error && !serverField ? describeAuthError(error) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = Username.safeParse(name);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? 'Tên không hợp lệ');
      return;
    }
    setLocalError(null);
    onSubmit(parsed.data);
  };

  return (
    <form className="auth__form" onSubmit={submit} noValidate>
      <Field
        label="Tên đăng nhập"
        hint="3–20 ký tự: chữ, số, dấu gạch dưới. Không đổi được sau này."
        error={localError ?? serverField?.text}
      >
        {(props) => (
          <input
            {...props}
            className="field__input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={20}
            required
            autoFocus
          />
        )}
      </Field>
      {notice && <Notice notice={notice} />}
      <p className="field__hint">Tài khoản mới nhận 11 thẻ khởi đầu và 1 gói 5 miễn phí.</p>
      <button type="submit" className="btn btn--primary btn--lg" disabled={pending}>
        {pending && <span className="spinner" aria-hidden="true" />}
        <span>Tạo tài khoản</span>
      </button>
      <button type="button" className="btn btn--secondary" onClick={onCancel} disabled={pending}>
        Quay lại
      </button>
    </form>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
      {off && <path d="M4 20 20 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
    </svg>
  );
}

/**
 * Minh hoạ bên trái (chỉ trang trí): nửa sân vẽ bằng "vạch phấn" + 3 thẻ úp góc vát theo độ hiếm
 * và vòng lặp chơi (DESIGN.md §1). Ẩn ở màn hẹp.
 */
function AuthStage() {
  return (
    <section className="auth__stage" aria-hidden="true">
      <svg className="auth__pitch" viewBox="0 0 400 520" preserveAspectRatio="xMidYMid slice">
        <rect x="20" y="20" width="360" height="480" />
        <line x1="20" y1="260" x2="380" y2="260" />
        <circle cx="200" cy="260" r="62" />
        <circle cx="200" cy="260" r="3" className="dot" />
        <rect x="100" y="20" width="200" height="80" />
        <rect x="150" y="20" width="100" height="32" />
        <path d="M160 100a48 48 0 0 0 80 0" />
        <rect x="100" y="420" width="200" height="80" />
        <rect x="150" y="468" width="100" height="32" />
        <path d="M160 420a48 48 0 0 1 80 0" />
      </svg>
      <div className="auth__cards">
        <span className="auth__card auth__card--bronze" />
        <span className="auth__card auth__card--silver" />
        <span className="auth__card auth__card--gold" />
      </div>
      <div className="auth__pitch-copy">
        <p className="auth__tagline">Sân đêm đã lên đèn.</p>
        <ol className="auth__loop">
          <li>
            <b>01</b> Mở gói thẻ
          </li>
          <li>
            <b>02</b> Xếp đội hình
          </li>
          <li>
            <b>03</b> Ra sân
          </li>
        </ol>
      </div>
    </section>
  );
}
