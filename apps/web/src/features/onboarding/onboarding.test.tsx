import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { ONBOARDING_SHOP_HREF, resolveAuthRedirect } from '../auth/AuthPage';
import {
  markTutorialSeen,
  readTutorialSeen,
  resetTutorialSeen,
  shouldAdvanceTutorialStep,
  TUTORIAL_SEEN_KEY,
  TUTORIAL_STEPS,
} from './onboarding';
import { OnboardingFlowBanner } from './OnboardingFlowBanner';
import { MatchTutorialOverlay } from './MatchTutorialOverlay';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    },
  };
}

describe('tutorial localStorage helpers', () => {
  it('chưa xem mặc định false; markTutorialSeen lưu 1; resetTutorialSeen xoá', () => {
    const store = memoryStorage();
    expect(readTutorialSeen(store)).toBe(false);
    markTutorialSeen(store);
    expect(store.getItem(TUTORIAL_SEEN_KEY)).toBe('1');
    expect(readTutorialSeen(store)).toBe(true);
    resetTutorialSeen(store);
    expect(readTutorialSeen(store)).toBe(false);
  });

  it('bị chặn storage không ném lỗi', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readTutorialSeen(broken)).toBe(false);
    expect(() => markTutorialSeen(broken)).not.toThrow();
    expect(() => resetTutorialSeen(broken)).not.toThrow();
    expect(readTutorialSeen(null)).toBe(false);
  });
});

describe('shouldAdvanceTutorialStep', () => {
  it('khớp đúng phím của từng bước trong 5 bước (bước 5 không dùng Escape để tránh bật PauseMenu)', () => {
    expect(TUTORIAL_STEPS).toHaveLength(5);
    expect(shouldAdvanceTutorialStep(0, 'ArrowRight')).toBe(true);
    expect(shouldAdvanceTutorialStep(0, 'KeyD')).toBe(false);
    expect(shouldAdvanceTutorialStep(1, 'KeyS')).toBe(true);
    expect(shouldAdvanceTutorialStep(1, 'KeyW')).toBe(true);
    expect(shouldAdvanceTutorialStep(2, 'KeyD')).toBe(true);
    expect(shouldAdvanceTutorialStep(3, 'KeyA')).toBe(true);
    expect(shouldAdvanceTutorialStep(4, 'Escape')).toBe(false);
    expect(shouldAdvanceTutorialStep(4, 'Space')).toBe(true);
    expect(shouldAdvanceTutorialStep(4, 'Enter')).toBe(true);
  });
});

describe('<MatchTutorialOverlay>', () => {
  it('render đầy đủ 5 bước, trạng thái hoàn thành ✓, thanh lực ở bước Sút và nút Bỏ qua hướng dẫn', () => {
    const html = renderToStaticMarkup(
      <MatchTutorialOverlay initialStep={2} onComplete={() => {}} onSkip={() => {}} />,
    );
    expect(html).toContain('Hướng dẫn · 5 bước');
    expect(html).toContain('Bước 3/5 · Sút');
    expect(html).toContain('Giữ để nạp lực, nhả để sút');
    expect(html).toContain('Bỏ qua hướng dẫn');
    expect(html).toContain('is-done');
    expect(html).toContain('is-current');
    expect(html).toContain('✓');
    expect(html).toContain('class="power"');
  });

  it('ẩn khi paused=true để không đè lên PauseMenu', () => {
    const html = renderToStaticMarkup(
      <MatchTutorialOverlay paused onComplete={() => {}} onSkip={() => {}} />,
    );
    expect(html).toBe('');
  });
});

describe('<OnboardingFlowBanner>', () => {
  it('render đủ 4 bước và làm nổi bật bước hiện tại', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <OnboardingFlowBanner currentStep={3} />
      </MemoryRouter>,
    );
    expect(html).toContain('Luồng tân thủ');
    expect(html).toContain('Tổng ≤ 2 phút tới cú sút đầu tiên');
    expect(html).toContain('Mở gói miễn phí');
    expect(html).toContain('Xem đội hình xếp sẵn');
    expect(html).toContain('Đá với máy – Dễ');
    expect(html).toContain('aria-current="step"');
    expect(html).toContain('is-done');
  });
});

describe('resolveAuthRedirect', () => {
  it('chuyển thẳng sang /shop?onboarding=1 ngay khi justRegistered=true dù isSuccess chưa cập nhật', () => {
    expect(
      resolveAuthRedirect({
        from: '/',
        justRegistered: true,
        registerSuccess: false,
        googleSuccess: false,
        hasGoogleStep: false,
      }),
    ).toBe(ONBOARDING_SHOP_HREF);
  });

  it('trả về trang đích from khi đăng nhập thường hoặc sau khi huỷ bước chọn tên Google', () => {
    expect(
      resolveAuthRedirect({
        from: '/squad',
        justRegistered: false,
        registerSuccess: false,
        googleSuccess: false,
        hasGoogleStep: false,
      }),
    ).toBe('/squad');
    expect(
      resolveAuthRedirect({
        from: '/',
        justRegistered: false,
        registerSuccess: false,
        googleSuccess: true,
        hasGoogleStep: false,
      }),
    ).toBe('/');
  });

  it('chuyển sang /shop?onboarding=1 khi hoàn tất GoogleUsernameStep', () => {
    expect(
      resolveAuthRedirect({
        from: '/',
        justRegistered: true,
        registerSuccess: false,
        googleSuccess: false,
        hasGoogleStep: true,
      }),
    ).toBe(ONBOARDING_SHOP_HREF);
    expect(
      resolveAuthRedirect({
        from: '/',
        justRegistered: false,
        registerSuccess: false,
        googleSuccess: true,
        hasGoogleStep: true,
      }),
    ).toBe(ONBOARDING_SHOP_HREF);
  });
});
