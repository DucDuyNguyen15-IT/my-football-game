/**
 * Logic thuần cho onboarding (7.6 / F9 luồng, F14 hướng dẫn trận đầu):
 * - Luồng tân thủ 4 bước (onboarding-flow.html): Đăng ký → Mở gói miễn phí → Xem đội hình → Đá với máy – Dễ.
 * - Lớp hướng dẫn phím 5 bước trong trận đầu (onboarding.html), lưu trạng thái đã xem vào `localStorage`.
 */

export const TUTORIAL_SEEN_KEY = 'pitch.tutorialSeen';

export type TutorialKeyStore = Pick<Storage, 'getItem' | 'setItem'> & {
  removeItem?: (key: string) => void;
};

/** `localStorage` có thể bị chặn (duyệt riêng tư / sandbox) → coi như chưa xem, không ném lỗi. */
export function readTutorialSeen(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): boolean {
  try {
    return storage?.getItem(TUTORIAL_SEEN_KEY) === '1';
  } catch {
    return false;
  }
}

export function markTutorialSeen(
  storage: Pick<Storage, 'setItem'> | null | undefined,
): void {
  try {
    storage?.setItem(TUTORIAL_SEEN_KEY, '1');
  } catch {
    // Chế độ chặn storage: vẫn cho bỏ qua trong phiên hiện tại.
  }
}

export function resetTutorialSeen(storage: Partial<TutorialKeyStore> | null | undefined): void {
  try {
    if (storage?.removeItem) storage.removeItem(TUTORIAL_SEEN_KEY);
    else storage?.setItem?.(TUTORIAL_SEEN_KEY, '0');
  } catch {
    // Bỏ qua nếu trình duyệt chặn storage.
  }
}

export interface OnboardingFlowStep {
  readonly step: 1 | 2 | 3 | 4;
  readonly time: string;
  readonly title: string;
  readonly subtitle: string;
  readonly href: string;
}

/** 4 bước tân thủ (docs/design/screens/onboarding-flow.html, mục tiêu ≤ 2 phút tới trận đầu). */
export const ONBOARDING_FLOW_STEPS: readonly OnboardingFlowStep[] = [
  {
    step: 1,
    time: 'Bước 1 · ~20s',
    title: 'Đăng ký',
    subtitle: 'Tên + mật khẩu, hoặc Google',
    href: '/login?mode=register',
  },
  {
    step: 2,
    time: 'Bước 2 · ~30s',
    title: 'Mở gói miễn phí',
    subtitle: '5 thẻ, bảo đảm ≥ 1 Bạc',
    href: '/shop?onboarding=1',
  },
  {
    step: 3,
    time: 'Bước 3 · ~15s',
    title: 'Xem đội hình xếp sẵn',
    subtitle: '11 thẻ Đồng + thẻ mới tự xếp',
    href: '/squad?onboarding=1',
  },
  {
    step: 4,
    time: 'Bước 4 · ~45s',
    title: 'Đá với máy – Dễ',
    subtitle: 'Hướng dẫn phím ngay trong trận',
    href: '/play?difficulty=easy&onboarding=1',
  },
];

export interface TutorialStep {
  readonly id: 'move' | 'pass' | 'shoot' | 'defend' | 'pause';
  readonly shortLabel: string;
  readonly stepLabel: string;
  readonly keys: readonly string[];
  readonly title: string;
  readonly description: string;
  readonly actionHint: string;
  readonly matchCodes: readonly string[];
  readonly powerSample?: {
    readonly pct: number;
    readonly tone: string;
  };
}

/** 5 bước hướng dẫn phím ở trận đầu (docs/design/screens/onboarding.html). */
export const TUTORIAL_STEPS: readonly TutorialStep[] = [
  {
    id: 'move',
    shortLabel: 'Di chuyển',
    stepLabel: 'Bước 1/5 · Di chuyển',
    keys: ['←', '↑', '→', '↓'],
    title: 'Di chuyển & chạy nước rút (giữ E)',
    description: 'Dùng 4 phím mũi tên để dẫn bóng theo 8 hướng.',
    actionHint: 'Giữ thêm phím E để bứt tốc, hoặc nhấn mũi tên bất kỳ để qua bước.',
    matchCodes: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE'],
  },
  {
    id: 'pass',
    shortLabel: 'Chuyền',
    stepLabel: 'Bước 2/5 · Chuyền',
    keys: ['S', 'A'],
    title: 'Giữ để nạp lực, nhả để chuyền (W chọc khe)',
    description: 'Nhấn S để chuyền sệt cho đồng đội gần, A chuyền bổng hoặc W chọc khe.',
    actionHint: 'Thử nhấn S, A hoặc W để tiếp tục.',
    powerSample: { pct: 45, tone: 'var(--c-power-pass)' },
    matchCodes: ['KeyS', 'KeyA', 'KeyW'],
  },
  {
    id: 'shoot',
    shortLabel: 'Sút',
    stepLabel: 'Bước 3/5 · Sút',
    keys: ['D'],
    title: 'Giữ để nạp lực, nhả để sút',
    description: 'Thanh chanh đầy trong 1 giây. Đầy quá → bóng bay cao.',
    actionHint: 'Thử nhấn D để sút vào khung thành và tiếp tục.',
    powerSample: { pct: 55, tone: 'var(--c-power-shot)' },
    matchCodes: ['KeyD'],
  },
  {
    id: 'defend',
    shortLabel: 'Áp sát & tắc',
    stepLabel: 'Bước 4/5 · Áp sát & tắc',
    keys: ['D', 'A'],
    title: 'Không bóng: giữ D áp sát · A xoạc · S đổi người',
    description: 'Khi mất bóng, nhấn S chuyển cầu thủ gần bóng nhất, giữ D để áp sát.',
    actionHint: 'Thử nhấn S, A hoặc D để tiếp tục.',
    matchCodes: ['KeyD', 'KeyA', 'KeyS'],
  },
  {
    id: 'pause',
    shortLabel: 'Tạm dừng',
    stepLabel: 'Bước 5/5 · Tạm dừng',
    keys: ['Esc'],
    title: 'Tạm dừng, thay người & chỉnh đồ hoạ',
    description: 'Mở bảng tạm dừng bất cứ lúc nào để thay cầu thủ dự bị khi bóng chết.',
    actionHint: 'Nhấn Space / Enter hoặc bấm Hoàn tất để bắt đầu chơi tự do.',
    matchCodes: ['Enter', 'Space'],
  },
];

/** Kiểm tra phím người chơi vừa nhấn có hợp lệ để sang bước kế tiếp trong hướng dẫn không. */
export function shouldAdvanceTutorialStep(stepIndex: number, code: string): boolean {
  const step = TUTORIAL_STEPS[stepIndex];
  if (!step) return false;
  return step.matchCodes.includes(code);
}
