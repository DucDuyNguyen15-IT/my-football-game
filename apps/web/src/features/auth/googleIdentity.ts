/**
 * Nạp Google Identity Services (GIS, ADR-0010) khi cần — chỉ khi server có `GOOGLE_CLIENT_ID`. Chỉ
 * khai báo phần API đang dùng: nút "Sign in with Google" trả về ID token (`credential`).
 */
export interface GsiButtonOptions {
  type?: 'standard' | 'icon';
  theme?: 'outline' | 'filled_blue' | 'filled_black';
  size?: 'large' | 'medium' | 'small';
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin';
  shape?: 'rectangular' | 'pill' | 'circle' | 'square';
  logo_alignment?: 'left' | 'center';
  width?: number;
  locale?: string;
}

export interface GsiId {
  initialize(config: {
    client_id: string;
    callback: (response: { credential: string }) => void;
    ux_mode?: 'popup' | 'redirect';
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
    context?: 'signin' | 'signup' | 'use';
  }): void;
  renderButton(parent: HTMLElement, options: GsiButtonOptions): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GsiId } };
  }
}

const GSI_SRC = 'https://accounts.google.com/gsi/client';
let loading: Promise<GsiId> | null = null;

/** Nạp script GIS một lần cho cả trang; lỗi mạng → reject và cho phép thử lại lần sau. */
export function loadGoogleIdentity(): Promise<GsiId> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  loading ??= new Promise<GsiId>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      const id = window.google?.accounts?.id;
      if (id) resolve(id);
      else reject(new Error('GIS không khởi tạo được'));
    };
    script.onerror = () => {
      script.remove();
      loading = null;
      reject(new Error('Không tải được Google Identity Services'));
    };
    document.head.appendChild(script);
  });
  return loading;
}
