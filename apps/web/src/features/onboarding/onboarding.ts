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
  readonly href: string;
}

/** 4 bước tân thủ (docs/design/screens/onboarding-flow.html, mục tiêu ≤ 2 phút tới trận đầu). */
export const ONBOARDING_FLOW_STEPS: readonly OnboardingFlowStep[] = [
  {
    step: 1,
    href: '/login?mode=register',
  },
  {
    step: 2,
    href: '/shop?onboarding=1',
  },
  {
    step: 3,
    href: '/squad?onboarding=1',
  },
  {
    step: 4,
    href: '/play?difficulty=easy&onboarding=1',
  },
];

export interface TutorialStep {
  readonly id: 'move' | 'pass' | 'shoot' | 'defend' | 'pause';
  readonly keys: readonly string[];
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
    keys: ['←', '↑', '→', '↓'],
    matchCodes: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyE'],
  },
  {
    id: 'pass',
    keys: ['S', 'A'],
    powerSample: { pct: 45, tone: 'var(--c-power-pass)' },
    matchCodes: ['KeyS', 'KeyA', 'KeyW'],
  },
  {
    id: 'shoot',
    keys: ['D'],
    powerSample: { pct: 55, tone: 'var(--c-power-shot)' },
    matchCodes: ['KeyD'],
  },
  {
    id: 'defend',
    keys: ['D', 'A'],
    matchCodes: ['KeyD', 'KeyA', 'KeyS'],
  },
  {
    id: 'pause',
    keys: ['Esc'],
    matchCodes: ['Enter', 'Space'],
  },
];

/** Kiểm tra phím người chơi vừa nhấn có hợp lệ để sang bước kế tiếp trong hướng dẫn không. */
export function shouldAdvanceTutorialStep(stepIndex: number, code: string): boolean {
  const step = TUTORIAL_STEPS[stepIndex];
  if (!step) return false;
  return step.matchCodes.includes(code);
}
