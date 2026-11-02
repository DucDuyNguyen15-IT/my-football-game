import { useEffect, useRef, useState } from 'react';
import { loadGoogleIdentity } from './googleIdentity';

interface Props {
  clientId: string;
  /** Nhận ID token (JWT) sau khi người chơi chọn tài khoản Google. */
  onCredential: (idToken: string) => void;
  /** Đang chờ server: khoá nút (GIS vẽ nút trong iframe nên chỉ chặn được bằng lớp phủ). */
  busy?: boolean;
}

/** Độ rộng tối đa GIS cho phép. */
const GSI_MAX_WIDTH = 400;

/** Nút "Tiếp tục với Google" do GIS vẽ (ADR-0010); tải script lỗi thì báo nhẹ, không chặn form. */
export function GoogleButton({ clientId, onCredential, busy = false }: Props) {
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
        gsi.initialize({
          client_id: clientId,
          callback: (res) => callback.current(res.credential),
          ux_mode: 'popup',
          auto_select: false,
          context: 'signin',
        });
        gsi.renderButton(el, {
          type: 'standard',
          theme: 'filled_black',
          size: 'large',
          text: 'continue_with',
          shape: 'rectangular',
          logo_alignment: 'center',
          width: Math.min(GSI_MAX_WIDTH, Math.max(200, Math.floor(el.clientWidth))),
          locale: 'vi',
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
  }, [clientId]);

  return (
    <div className={`gbtn${busy ? ' is-busy' : ''}`} aria-busy={busy || state === 'loading'}>
      <div ref={slot} className="gbtn__slot" hidden={state === 'error'} />
      {state === 'loading' && <div className="gbtn__placeholder" aria-hidden="true" />}
      {state === 'error' && (
        <p className="gbtn__error">Không tải được nút Google. Kiểm tra mạng hoặc tải lại trang.</p>
      )}
      {busy && (
        <span className="gbtn__busy">
          <span className="spinner" aria-hidden="true" />
          <span className="sr-only">Đang đăng nhập Google…</span>
        </span>
      )}
    </div>
  );
}
