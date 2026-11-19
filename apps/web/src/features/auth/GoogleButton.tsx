import { useEffect, useRef, useState } from 'react';
import { useI18n } from '../../i18n/I18nContext';
import { loadGoogleIdentity } from './googleIdentity';

interface Props {
  clientId: string;
  /** Nhận ID token (JWT) sau khi người chơi chọn tài khoản Google. */
  onCredential: (idToken: string) => void;
  /** Đang chờ server: khoá nút (GIS vẽ nút trong iframe nên chỉ chặn được bằng lớp phủ). */
  busy?: boolean;
  /** Chữ GIS: "Đăng nhập bằng Google" / "Đăng ký bằng Google" (ngắn hơn continue_with). */
  text?: 'signin_with' | 'signup_with';
}

/** Độ rộng tối đa GIS cho phép. */
const GSI_MAX_WIDTH = 400;

/** Nút "Tiếp tục với Google" do GIS vẽ (ADR-0010); tải script lỗi thì báo nhẹ, không chặn form. */
export function GoogleButton({ clientId, onCredential, busy = false, text = 'signin_with' }: Props) {
  const { locale, t } = useI18n();
  const slot = useRef<HTMLDivElement>(null);
  const callback = useRef(onCredential);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    callback.current = onCredential;
  }, [onCredential]);

  useEffect(() => {
    let alive = true;
    loadGoogleIdentity().then(
      (gsi) => {
        const el = slot.current;
        if (!alive || !el) return;
        el.innerHTML = '';
        gsi.initialize({
          client_id: clientId,
          callback: (res) => callback.current(res.credential),
          ux_mode: 'popup',
          auto_select: false,
          context: 'signin',
        });
        gsi.renderButton(el, {
          type: 'standard',
          // outline: logo G không bị nhốt trong ô trắng sát mép như filled_black (trông bí).
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.min(GSI_MAX_WIDTH, Math.max(200, Math.floor(el.clientWidth))),
          locale,
        });
        setState('ready');
      },
      () => {
        if (alive) setState('error');
      },
    );
    return () => {
      alive = false;
    };
  }, [clientId, locale, text]);

  return (
    <div className={`gbtn${busy ? ' is-busy' : ''}`} aria-busy={busy || state === 'loading'}>
      <div ref={slot} className="gbtn__slot" hidden={state === 'error'} />
      {state === 'loading' && <div className="gbtn__placeholder" aria-hidden="true" />}
      {state === 'error' && <p className="gbtn__error">{t('auth.googleLoadError')}</p>}
      {busy && (
        <span className="gbtn__busy">
          <span className="spinner" aria-hidden="true" />
          <span className="sr-only">{t('auth.googleSigningIn')}</span>
        </span>
      )}
    </div>
  );
}
