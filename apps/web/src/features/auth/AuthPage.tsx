/**
 * Đăng nhập / đăng ký (docs/design/screens/auth.html, auth-states.html) + Google (ADR-0010). Đã đăng
 * nhập thì chuyển về trang định vào (hoặc trang chủ).
 */
import { useCallback, useId, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { LoginRequest, RegisterRequest } from '@pitch/shared';
import { useAuthConfig, useGoogleSignIn, useLogin, useMe, useRegister } from '../../api/auth';
import { useEconomy } from '../../api/player-cards';
import {
  describeAuthError,
  fieldErrorOf,
  parseAuthForm,
  parseGoogleUsername,
  type AuthNotice,
  type FieldErrors,
} from './authErrors';
import { GoogleButton } from './GoogleButton';
import { evaluatePasswordStrength, isPasswordAcceptable } from './passwordStrength';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { ThemeSwitcher } from '../../styles/ThemeSwitcher';
import './auth.css';
import '../legal/legal.css';

type Mode = 'login' | 'register';

/** Quà tân thủ đọc từ server (`/config/economy`, B4-11); đang tải thì chỉ ghi chung. */
function useGiftText(): string {
  const gift = useEconomy().data?.starterGift;
  return gift
    ? `${gift.bronzeCards} thẻ Đồng + ${gift.freePack5} gói 5 thẻ miễn phí`
    : 'Quà tân thủ';
}
export const ONBOARDING_SHOP_HREF = '/shop?onboarding=1';

export interface AuthRedirectParams {
  from: string;
  justRegistered: boolean;
  registerSuccess: boolean;
  googleSuccess: boolean;
  hasGoogleStep: boolean;
}

/** Xác định trang đích sau khi có `me.data`: ưu tiên luồng tân thủ nếu vừa tạo tài khoản mới. */
export function resolveAuthRedirect({
  from,
  justRegistered,
  registerSuccess,
  googleSuccess,
  hasGoogleStep,
}: AuthRedirectParams): string {
  const isNewAccount = justRegistered || registerSuccess || (googleSuccess && hasGoogleStep);
  return isNewAccount ? ONBOARDING_SHOP_HREF : from;
}

export function AuthPage() {
  const me = useMe();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const config = useAuthConfig();
  const googleClientId = config.data?.googleClientId ?? null;

  const [mode, setMode] = useState<Mode>(() =>
    searchParams.get('mode') === 'register' ? 'register' : 'login',
  );
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [email, setEmail] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);
  const strengthId = useId();
  /** Đồng ý Điều khoản + Chính sách khi đăng ký (NĐ 13/2023). */
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [localErrors, setLocalErrors] = useState<FieldErrors>({});
  /** Lần đầu đăng nhập Google: giữ ID token để gửi lại kèm tên đăng nhập. */
  const [googleStep, setGoogleStep] = useState<{ idToken: string; suggested: string } | null>(null);

  const login = useLogin();
  const register = useRegister();
  const google = useGoogleSignIn();
  const [justRegistered, setJustRegistered] = useState(false);
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
      setJustRegistered(false);
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

  const redirectTo = resolveAuthRedirect({
    from,
    justRegistered,
    registerSuccess: register.isSuccess,
    googleSuccess: google.isSuccess,
    hasGoogleStep: googleStep !== null,
  });
  if (me.data) return <Navigate to={redirectTo} replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const res = parseAuthForm({
      mode,
      username,
      password,
      ...(mode === 'register' ? { confirmPassword } : {}),
      email,
      agreed,
    });
    if (res.trimmedUsername !== username) setUsername(res.trimmedUsername);
    if (res.trimmedEmail !== email) setEmail(res.trimmedEmail);
    if (!res.ok) {
      setLocalErrors(res.errors);
      if (res.consentError) setConsentError(true);
      return;
    }
    setLocalErrors({});
    if (mode === 'register' && !agreed) {
      setConsentError(true);
      return;
    }
    google.reset();
    setJustRegistered(mode === 'register');
    const onError = () => setJustRegistered(false);
    // Đăng ký có thêm `acceptTerms` nên hai mutation khác kiểu body.
    // shortcut: ép kiểu vì `res.data` gộp hai safeParse; nhánh register luôn qua RegisterRequest ở trên.
    if (mode === 'register') register.mutate(res.data as RegisterRequest, { onError });
    else login.mutate(res.data as LoginRequest, { onError });
  };

  const switchMode = (m: Mode) => {
    setMode(m);
    setLocalErrors({});
    setConfirmPassword('');
    setConfirmTouched(false);
    setJustRegistered(false);
    login.reset();
    register.reset();
    google.reset();
  };

  const serverError = active.error ?? (googleStep ? null : google.error);
  const serverField = fieldErrorOf(serverError);
  const isRegister = mode === 'register';
  const strength = evaluatePasswordStrength(password, username);
  const passwordTooWeak = isRegister && password.length > 0 && !isPasswordAcceptable(strength);
  const liveMismatchError =
    isRegister &&
    confirmPassword !== password &&
    (confirmPassword.length > 0 || (confirmTouched && password.length > 0))
      ? confirmPassword.length === 0
        ? 'Nhập lại mật khẩu để xác nhận.'
        : 'Mật khẩu nhập lại chưa khớp.'
      : undefined;
  const registerBlocked =
    isRegister &&
    ((password.length > 0 && (passwordTooWeak || confirmPassword !== password)) ||
      (confirmPassword.length > 0 && confirmPassword !== password));

  const fieldErrors: FieldErrors = {
    ...(serverField ? { [serverField.field]: serverField.text } : {}),
    ...localErrors,
    ...(liveMismatchError ? { confirmPassword: liveMismatchError } : {}),
  };
  const notice = serverError && !serverField ? describeAuthError(serverError) : null;

  return (
    <main className="auth">
      <AuthStage />
      <section className="auth__panel" aria-labelledby="auth-title">
        <div className="auth__box">
          <div className="auth__prefs">
            <ThemeSwitcher compact />
          </div>
          {googleStep ? (
            <GoogleUsernameStep
              key={googleStep.idToken}
              suggested={googleStep.suggested}
              pending={google.isPending}
              error={google.error}
              onSubmit={(name) => {
                setJustRegistered(true);
                google.mutate(
                  // Bước này chỉ gửi được khi đã tick ô đồng ý Điều khoản + Chính sách.
                  { idToken: googleStep.idToken, username: name, acceptTerms: true },
                  {
                    onError: () => {
                      setJustRegistered(false);
                    },
                  },
                );
              }}
              onCancel={() => {
                setJustRegistered(false);
                setGoogleStep(null);
                google.reset();
              }}
            />
          ) : (
            <>
              <h1 id="auth-title" className="sr-only">
                {isRegister ? 'Đăng ký tài khoản' : 'Đăng nhập'}
              </h1>
              <div className="tabs" role="tablist" aria-label="Chọn cách vào">
                {(['login', 'register'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="tab"
                    aria-selected={mode === m}
                    aria-controls="auth-form"
                    className={`tab${mode === m ? ' is-on' : ''}`}
                    onClick={() => switchMode(m)}
                  >
                    {m === 'login' ? 'Đăng nhập' : 'Đăng ký'}
                  </button>
                ))}
              </div>

              {googleClientId && (
                <>
                  <GoogleButton
                    clientId={googleClientId}
                    onCredential={onGoogleCredential}
                    busy={google.isPending}
                  />
                  <p className="auth__or">
                    <span>Hoặc</span>
                  </p>
                </>
              )}

              <form id="auth-form" className="auth__form" onSubmit={onSubmit} noValidate>
                <Field
                  label="Tên đăng nhập"
                  error={fieldErrors.username}
                  hint={isRegister ? 'Đây cũng là tên người chơi hiện trong trận.' : undefined}
                >
                  {(props) => (
                    <input
                      {...props}
                      className="input"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder={isRegister ? '3–20 ký tự: chữ, số, dấu gạch dưới' : undefined}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      onBlur={() => setUsername((v) => v.trim())}
                      maxLength={32}
                      required
                      autoFocus
                    />
                  )}
                </Field>
                <Field
                  label="Mật khẩu"
                  error={fieldErrors.password}
                  extraDescribedBy={isRegister ? strengthId : undefined}
                >
                  {(props) => (
                    <span className="field__box">
                      <input
                        {...props}
                        className="input auth__password"
                        type={showPassword ? 'text' : 'password'}
                        autoComplete={isRegister ? 'new-password' : 'current-password'}
                        placeholder={isRegister ? 'Ít nhất 8 ký tự' : undefined}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        maxLength={72}
                        required
                      />
                      <button
                        type="button"
                        className="field__btn"
                        aria-pressed={showPassword}
                        aria-controls={props.id}
                        aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        <EyeIcon off={showPassword} />
                      </button>
                    </span>
                  )}
                </Field>
                {isRegister && <PasswordStrengthMeter id={strengthId} strength={strength} />}
                {isRegister && (
                  <Field label="Nhập lại mật khẩu" error={fieldErrors.confirmPassword}>
                    {(props) => (
                      <span className="field__box">
                        <input
                          {...props}
                          className="input auth__password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder="Nhập giống mật khẩu ở trên"
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          onBlur={() => setConfirmTouched(true)}
                          maxLength={72}
                          required
                        />
                        <button
                          type="button"
                          className="field__btn"
                          aria-pressed={showConfirmPassword}
                          aria-controls={props.id}
                          aria-label={
                            showConfirmPassword
                              ? 'Ẩn mật khẩu nhập lại'
                              : 'Hiện mật khẩu nhập lại'
                          }
                          onClick={() => setShowConfirmPassword((v) => !v)}
                        >
                          <EyeIcon off={showConfirmPassword} />
                        </button>
                      </span>
                    )}
                  </Field>
                )}
                {isRegister && (
                  <Field label="Email" optional error={fieldErrors.email}>
                    {(props) => (
                      <input
                        {...props}
                        className="input"
                        type="email"
                        autoComplete="email"
                        placeholder="ban@vidu.vn"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        onBlur={() => setEmail((v) => v.trim())}
                        maxLength={254}
                      />
                    )}
                  </Field>
                )}

                {isRegister && (
                  <label className="consent">
                    <input
                      type="checkbox"
                      checked={agreed}
                      aria-invalid={consentError && !agreed}
                      onChange={(e) => {
                        setAgreed(e.target.checked);
                        setConsentError(false);
                      }}
                    />
                    <span>
                      Tôi đồng ý <Link to="/terms">Điều khoản sử dụng</Link> và{' '}
                      <Link to="/privacy">Chính sách bảo mật</Link> (dữ liệu tài khoản và dữ liệu
                      chơi chỉ dùng để chạy game).
                    </span>
                  </label>
                )}
                {isRegister && consentError && !agreed && (
                  <p className="field__error" role="alert">
                    <WarnIcon />
                    Cần đồng ý Điều khoản và Chính sách để tạo tài khoản.
                  </p>
                )}

                {notice && <Notice notice={notice} />}

                <button
                  type="submit"
                  className={`btn btn--primary btn--lg btn--block${active.isPending ? ' is-loading' : ''}`}
                  aria-busy={active.isPending || undefined}
                  disabled={busy || registerBlocked}
                >
                  <span className="btn__label">
                    {isRegister ? 'Tạo tài khoản & nhận quà' : 'Đăng nhập'}
                  </span>
                </button>
              </form>
              <p className="muted auth__foot">
                Không có giao dịch tiền thật. Xu chỉ kiếm được khi chơi.
              </p>
              <LegalLinks />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

const LegalLinks = () => (
  <nav className="legal-links" aria-label="Pháp lý">
    <Link to="/privacy">Chính sách bảo mật</Link>
    <Link to="/terms">Điều khoản sử dụng</Link>
  </nav>
);

const WarnIcon = () => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.6"
    aria-hidden="true"
  >
    <path d="M8 2l6.5 12h-13z" />
    <path d="M8 7v3M8 12v.5" />
  </svg>
);

/** Ô nhập có nhãn, gợi ý và lỗi riêng (nối bằng `aria-describedby`). */
function Field({
  label,
  optional,
  hint,
  error,
  extraDescribedBy,
  children,
}: {
  label: string;
  optional?: boolean;
  hint?: string | undefined;
  error?: string | undefined;
  extraDescribedBy?: string | undefined;
  children: (props: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
}) {
  const id = useId();
  const baseDescribed = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  const describedBy = [baseDescribed, extraDescribedBy].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {optional && <small> (không bắt buộc)</small>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': describedBy })}
      {error ? (
        <p id={`${id}-err`} className="field__error">
          <WarnIcon />
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
    <div className={`banner${notice.tone === 'danger' ? ' banner--danger' : ''}`} role="alert">
      <WarnIcon />
      <span>
        {notice.title && <b>{notice.title}. </b>}
        {notice.text}
      </span>
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
  const giftText = useGiftText();
  const [name, setName] = useState(suggested);
  const [localError, setLocalError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const serverField = fieldErrorOf(error);
  const notice = error && !serverField ? describeAuthError(error) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = parseGoogleUsername(name);
    if (!res.ok) {
      setName(res.trimmed);
      setLocalError(res.error);
      return;
    }
    setName(res.value);
    setLocalError(null);
    if (!agreed) {
      setConsentError(true);
      return;
    }
    onSubmit(res.value);
  };

  return (
    <form className="auth__form" onSubmit={submit} noValidate>
      <span className="label auth__step">Bước 2/2</span>
      <h1 id="auth-title" className="h2">
        Chọn tên người chơi
      </h1>
      <p className="muted auth__lead">
        Đã liên kết tài khoản Google. Tên này hiện trên bảng tỉ số và không đổi được sau này.
      </p>
      <Field
        label="Tên người chơi"
        hint="3–20 ký tự: chữ, số, dấu gạch dưới."
        error={localError ?? serverField?.text}
      >
        {(props) => (
          <input
            {...props}
            className="input"
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => setName((v) => v.trim())}
            maxLength={32}
            required
            autoFocus
          />
        )}
      </Field>
      {/* Ô đồng ý như đăng ký thường (review setpiece F2). */}
      <label className="consent">
        <input
          type="checkbox"
          checked={agreed}
          aria-invalid={consentError && !agreed}
          onChange={(e) => {
            setAgreed(e.target.checked);
            setConsentError(false);
          }}
        />
        <span>
          Tôi đồng ý <Link to="/terms">Điều khoản sử dụng</Link> và{' '}
          <Link to="/privacy">Chính sách bảo mật</Link> (dữ liệu tài khoản và dữ liệu chơi chỉ dùng
          để chạy game).
        </span>
      </label>
      {consentError && !agreed && (
        <p className="field__error" role="alert">
          <WarnIcon />
          Cần đồng ý Điều khoản và Chính sách để tạo tài khoản.
        </p>
      )}
      {notice && <Notice notice={notice} />}
      <div className="auth__actions">
        <button
          type="submit"
          className={`btn btn--primary btn--lg btn--block${pending ? ' is-loading' : ''}`}
          aria-busy={pending || undefined}
          disabled={pending}
        >
          <span className="btn__label">Vào sân &amp; nhận quà</span>
        </button>
        <span className="muted auth__foot">{giftText} đang chờ</span>
        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={onCancel}
          disabled={pending}
        >
          Quay lại
        </button>
      </div>
    </form>
  );
}

function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
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

/** Bề ngang mép xa / mép gần của sân phối cảnh (viewBox 760×720, đường chân trời y = 300). */
const FAR = [110, 650] as const;
const NEAR = [-420, 1180] as const;
const STRIPES = 12;
const at = (edge: readonly [number, number], t: number) => edge[0] + (edge[1] - edge[0]) * t;

/** Sân nhìn nghiêng kiểu camera truyền hình (chỉ trang trí). */
function TvPitch() {
  return (
    <svg
      className="auth__pitch"
      viewBox="0 0 760 720"
      preserveAspectRatio="xMidYMax slice"
      aria-hidden="true"
    >
      {Array.from({ length: STRIPES }, (_, i) => {
        const a = i / STRIPES;
        const b = (i + 1) / STRIPES;
        return (
          <polygon
            key={i}
            points={`${at(FAR, a)},300 ${at(FAR, b)},300 ${at(NEAR, b)},900 ${at(NEAR, a)},900`}
            fill={i % 2 ? 'var(--c-pitch-b)' : 'var(--c-pitch-a)'}
          />
        );
      })}
      <g fill="none" stroke="var(--c-chalk)" strokeOpacity={0.6} strokeWidth={2}>
        <polygon points={`${FAR[0]},300 ${FAR[1]},300 ${NEAR[1]},900 ${NEAR[0]},900`} />
        <line x1={380} y1={300} x2={380} y2={900} />
        <ellipse cx={380} cy={470} rx={170} ry={62} />
      </g>
    </svg>
  );
}

/**
 * Nửa trái (chỉ trang trí): sân nhìn nghiêng kiểu camera truyền hình, logo, khẩu hiệu và quà tân
 * thủ (3 thẻ Đồng úp + gói 5 thẻ). Ẩn ở màn hẹp.
 */
function AuthStage() {
  const giftText = useGiftText();
  return (
    <section className="auth__stage" aria-label="Giới thiệu">
      <TvPitch />
      <span className="logo auth__logo">
        <span className="logo__mark" aria-hidden="true" />
        MFG
      </span>
      <div className="auth__pitch-copy">
        <p className="display auth__headline">
          Mở gói. Xếp đội.
          <br />
          <span>Ra sân.</span>
        </p>
        <div className="auth-gift">
          <div className="auth-gift__art" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`auth-gift__card r-bronze auth-gift__card--${i}`} />
            ))}
            <div className="pack-art auth-gift__pack">
              <div className="pack-art__count">
                5<small>Thẻ</small>
              </div>
              <div className="pack-art__stripes">
                <i />
                <i />
                <i />
                <i />
              </div>
            </div>
          </div>
          <div className="auth-gift__text">
            <span className="label auth-gift__kicker">Quà tân thủ</span>
            <span className="auth-gift__title">{giftText}</span>
            <span className="muted">Nhận ngay khi tạo tài khoản. Đội hình được xếp sẵn.</span>
          </div>
        </div>
      </div>
    </section>
  );
}
