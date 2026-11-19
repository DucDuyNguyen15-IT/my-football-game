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
import { useI18n } from '../../i18n/I18nContext';
import { LanguageSwitcher } from '../../i18n/LanguageSwitcher';
import { ThemeSwitcher } from '../../styles/ThemeSwitcher';
import './auth.css';
import '../legal/legal.css';

type Mode = 'login' | 'register';

/** Quà tân thủ đọc từ server (`/config/economy`, B4-11); đang tải thì chỉ ghi chung. */
function useGiftText(): string {
  const { t } = useI18n();
  const gift = useEconomy().data?.starterGift;
  return gift
    ? t('auth.giftSummary', { cards: gift.bronzeCards, packs: gift.freePack5 })
    : t('auth.giftKicker');
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
  const { locale, t } = useI18n();
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
      locale,
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
  const serverField = fieldErrorOf(serverError, locale);
  const isRegister = mode === 'register';
  const strength = evaluatePasswordStrength(password, username);
  const passwordTooWeak = isRegister && password.length > 0 && !isPasswordAcceptable(strength);
  const liveMismatchError =
    isRegister &&
    confirmPassword !== password &&
    (confirmPassword.length > 0 || (confirmTouched && password.length > 0))
      ? confirmPassword.length === 0
        ? t('auth.confirmRequired')
        : t('auth.confirmMismatch')
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
  const notice = serverError && !serverField ? describeAuthError(serverError, locale) : null;

  return (
    <main className="auth">
      <AuthStage />
      <section className="auth__panel" aria-labelledby="auth-title">
        <div className="auth__box">
          <div className="auth__prefs">
            <ThemeSwitcher compact />
            <LanguageSwitcher compact />
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
                {isRegister ? t('auth.registerTitle') : t('auth.loginTitle')}
              </h1>
              <div className="tabs" role="tablist" aria-label={t('auth.tablistAria')}>
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
                    {m === 'login' ? t('auth.tabLogin') : t('auth.tabRegister')}
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
                    <span>{t('auth.or')}</span>
                  </p>
                </>
              )}

              <form id="auth-form" className="auth__form" onSubmit={onSubmit} noValidate>
                <Field
                  label={t('auth.username')}
                  error={fieldErrors.username}
                  hint={isRegister ? t('auth.usernameHint') : undefined}
                >
                  {(props) => (
                    <input
                      {...props}
                      className="input"
                      autoComplete="username"
                      autoCapitalize="none"
                      spellCheck={false}
                      placeholder={isRegister ? t('auth.usernamePlaceholder') : undefined}
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
                  label={t('auth.password')}
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
                        placeholder={isRegister ? t('auth.passwordPlaceholder') : undefined}
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
                        aria-label={showPassword ? t('auth.passwordHide') : t('auth.passwordShow')}
                        onClick={() => setShowPassword((v) => !v)}
                      >
                        <EyeIcon off={showPassword} />
                      </button>
                    </span>
                  )}
                </Field>
                {isRegister && <PasswordStrengthMeter id={strengthId} strength={strength} />}
                {isRegister && (
                  <Field label={t('auth.confirmPassword')} error={fieldErrors.confirmPassword}>
                    {(props) => (
                      <span className="field__box">
                        <input
                          {...props}
                          className="input auth__password"
                          type={showConfirmPassword ? 'text' : 'password'}
                          autoComplete="new-password"
                          placeholder={t('auth.confirmPlaceholder')}
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
                            showConfirmPassword ? t('auth.confirmHide') : t('auth.confirmShow')
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
                  <Field label={t('auth.email')} optional error={fieldErrors.email}>
                    {(props) => (
                      <input
                        {...props}
                        className="input"
                        type="email"
                        autoComplete="email"
                        placeholder={t('auth.emailPlaceholder')}
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
                      {t('auth.consentPrefix')} <Link to="/terms">{t('auth.terms')}</Link>{' '}
                      {t('auth.consentAnd')} <Link to="/privacy">{t('auth.privacy')}</Link>{' '}
                      {t('auth.consentSuffix')}
                    </span>
                  </label>
                )}
                {isRegister && consentError && !agreed && (
                  <p className="field__error" role="alert">
                    <WarnIcon />
                    {t('auth.consentRequired')}
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
                    {isRegister ? t('auth.submitRegister') : t('auth.submitLogin')}
                  </span>
                </button>
              </form>
              <p className="muted auth__foot">{t('auth.noRealMoney')}</p>
              <LegalLinks />
            </>
          )}
        </div>
      </section>
    </main>
  );
}

function LegalLinks() {
  const { t } = useI18n();
  return (
    <nav className="legal-links" aria-label={t('auth.legalNavAria')}>
      <Link to="/privacy">{t('auth.privacy')}</Link>
      <Link to="/terms">{t('auth.terms')}</Link>
    </nav>
  );
}

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
  const { t } = useI18n();
  const id = useId();
  const baseDescribed = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  const describedBy = [baseDescribed, extraDescribedBy].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <label className="field__label" htmlFor={id}>
        {label}
        {optional && <small> {t('auth.optional')}</small>}
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
  const { locale, t } = useI18n();
  const giftText = useGiftText();
  const [name, setName] = useState(suggested);
  const [localError, setLocalError] = useState<string | null>(null);
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const serverField = fieldErrorOf(error, locale);
  const notice = error && !serverField ? describeAuthError(error, locale) : null;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const res = parseGoogleUsername(name, locale);
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
      <span className="label auth__step">{t('auth.googleStep')}</span>
      <h1 id="auth-title" className="h2">
        {t('auth.googleTitle')}
      </h1>
      <p className="muted auth__lead">{t('auth.googleLead')}</p>
      <Field
        label={t('auth.googlePlayerName')}
        hint={t('auth.googleNameHint')}
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
          {t('auth.consentPrefix')} <Link to="/terms">{t('auth.terms')}</Link>{' '}
          {t('auth.consentAnd')} <Link to="/privacy">{t('auth.privacy')}</Link>{' '}
          {t('auth.consentSuffix')}
        </span>
      </label>
      {consentError && !agreed && (
        <p className="field__error" role="alert">
          <WarnIcon />
          {t('auth.consentRequired')}
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
          <span className="btn__label">{t('auth.googleSubmit')}</span>
        </button>
        <span className="muted auth__foot">{t('auth.googleWaiting', { gift: giftText })}</span>
        <button
          type="button"
          className="btn btn--ghost btn--block"
          onClick={onCancel}
          disabled={pending}
        >
          {t('common.back')}
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
  const { t } = useI18n();
  const giftText = useGiftText();
  return (
    <section className="auth__stage" aria-label={t('auth.stageAria')}>
      <TvPitch />
      <span className="logo auth__logo">
        <span className="logo__mark" aria-hidden="true" />
        MFG
      </span>
      <div className="auth__pitch-copy">
        <p className="display auth__headline">
          {t('auth.headline1')}
          <br />
          <span>{t('auth.headline2')}</span>
        </p>
        <div className="auth-gift">
          <div className="auth-gift__art" aria-hidden="true">
            {[0, 1, 2].map((i) => (
              <span key={i} className={`auth-gift__card r-bronze auth-gift__card--${i}`} />
            ))}
            <div className="pack-art auth-gift__pack">
              <div className="pack-art__count">
                5<small>{t('auth.packCardUnit')}</small>
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
            <span className="label auth-gift__kicker">{t('auth.giftKicker')}</span>
            <span className="auth-gift__title">{giftText}</span>
            <span className="muted">{t('auth.giftSub')}</span>
          </div>
        </div>
      </div>
    </section>
  );
}
