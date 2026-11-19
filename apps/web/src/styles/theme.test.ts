import { describe, expect, it } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyThemeToDocument,
  readThemePreference,
  resolveEffectiveTheme,
  writeThemePreference,
} from './theme';

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

describe('theme helpers', () => {
  it('mặc định theo hệ thống khi chưa lưu hoặc giá trị lạ', () => {
    expect(readThemePreference(memoryStorage())).toBe('system');
    expect(readThemePreference(memoryStorage({ [THEME_STORAGE_KEY]: 'neon' }))).toBe('system');
    expect(readThemePreference(null)).toBe('system');
  });

  it('lưu và đọc lựa chọn light / dark / system, bọc try/catch khi storage lỗi', () => {
    const store = memoryStorage();
    writeThemePreference(store, 'dark');
    expect(store.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(readThemePreference(store)).toBe('dark');

    writeThemePreference(store, 'light');
    expect(readThemePreference(store)).toBe('light');

    writeThemePreference(store, 'system');
    expect(store.getItem(THEME_STORAGE_KEY)).toBeNull();
    expect(readThemePreference(store)).toBe('system');

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
    expect(readThemePreference(broken)).toBe('system');
    expect(() => writeThemePreference(broken, 'dark')).not.toThrow();
  });

  it('resolveEffectiveTheme theo hệ thống khi chọn system', () => {
    expect(resolveEffectiveTheme('system', true)).toBe('dark');
    expect(resolveEffectiveTheme('system', false)).toBe('light');
    expect(resolveEffectiveTheme('light', true)).toBe('light');
    expect(resolveEffectiveTheme('dark', false)).toBe('dark');
  });

  it('applyThemeToDocument đặt data-theme cho light/dark và gỡ khi về system', () => {
    const attrs = new Map<string, string>();
    const root = {
      setAttribute: (k: string, v: string) => void attrs.set(k, v),
      removeAttribute: (k: string) => void attrs.delete(k),
    };

    applyThemeToDocument(root, 'dark');
    expect(attrs.get('data-theme')).toBe('dark');

    applyThemeToDocument(root, 'light');
    expect(attrs.get('data-theme')).toBe('light');

    applyThemeToDocument(root, 'system');
    expect(attrs.has('data-theme')).toBe(false);
  });
});
