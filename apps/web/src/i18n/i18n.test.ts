import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { en } from './en';
import { vi, type TranslationKey } from './vi';
import {
  LOCALE_STORAGE_KEY,
  applyLocaleToDocument,
  formatDateFull,
  formatDateShort,
  formatMessage,
  formatNumber,
  formatPercentValue,
  readLocale,
  writeLocale,
} from './i18n';
import { I18nProvider } from './I18nContext';
import { LanguageSwitcher } from './LanguageSwitcher';

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
  };
}

function placeholdersOf(text: string): string[] {
  return [...text.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]!).sort();
}

describe('i18n dictionaries (vi / en)', () => {
  it('vi.ts và en.ts có tập key trùng khớp 100%, không rỗng và khớp tham số {placeholder}', () => {
    const viKeys = (Object.keys(vi) as TranslationKey[]).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys).toEqual(viKeys);

    for (const key of viKeys) {
      expect(vi[key].trim().length, `vi[${key}] rỗng`).toBeGreaterThan(0);
      expect(en[key].trim().length, `en[${key}] rỗng`).toBeGreaterThan(0);
      expect(placeholdersOf(en[key]), `placeholder lệch ở key ${key}`).toEqual(
        placeholdersOf(vi[key]),
      );
    }
  });
});

describe('i18n storage, <html lang> & Intl formatting', () => {
  it('mặc định vi, đọc/ghi localStorage an toàn khi bị chặn', () => {
    const store = memoryStorage();
    expect(readLocale(store)).toBe('vi');
    expect(readLocale(memoryStorage({ [LOCALE_STORAGE_KEY]: 'fr' }))).toBe('vi');

    writeLocale(store, 'en');
    expect(store.getItem(LOCALE_STORAGE_KEY)).toBe('en');
    expect(readLocale(store)).toBe('en');

    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
    };
    expect(readLocale(broken)).toBe('vi');
    expect(() => writeLocale(broken, 'en')).not.toThrow();
  });

  it('applyLocaleToDocument đặt <html lang>', () => {
    const root = { lang: 'vi' };
    applyLocaleToDocument(root, 'en');
    expect(root.lang).toBe('en');
    applyLocaleToDocument(root, 'vi');
    expect(root.lang).toBe('vi');
  });

  it('formatMessage nội suy tham số theo đúng ngôn ngữ', () => {
    expect(formatMessage('vi', 'common.cardsCount', { count: 16 })).toBe('16 thẻ');
    expect(formatMessage('en', 'common.cardsCount', { count: 16 })).toBe('16 cards');
  });

  it('formatNumber, formatPercentValue và formatDate định dạng theo Intl của từng ngôn ngữ', () => {
    expect(formatNumber(1360, 'vi')).toBe('1.360');
    expect(formatNumber(1360, 'en')).toBe('1,360');

    expect(formatPercentValue(0.58, 'vi', 0, 1)).toBe('58%');
    expect(formatPercentValue(0.438, 'vi', 1, 1)).toBe('43,8%');
    expect(formatPercentValue(0.438, 'en', 1, 1)).toBe('43.8%');

    expect(formatDateShort('2026-11-14', 'vi')).toBe('14/11');
    expect(formatDateShort('2026-11-14', 'en')).toBe('11/14');
    expect(formatDateFull('2026-10-27', 'vi')).toBe('27/10/2026');
    expect(formatDateFull('2026-10-27', 'en')).toBe('10/27/2026');
  });
});

describe('<LanguageSwitcher>', () => {
  it('render đủ Tiếng Việt / English với trạng thái đang chọn', () => {
    const viHtml = renderToStaticMarkup(
      createElement(I18nProvider, {
        initialLocale: 'vi',
        children: createElement(LanguageSwitcher),
      }),
    );
    expect(viHtml).toContain('aria-label="Ngôn ngữ"');
    expect(viHtml).toMatch(/aria-pressed="true">Tiếng Việt<\/button>/);

    const enHtml = renderToStaticMarkup(
      createElement(I18nProvider, {
        initialLocale: 'en',
        children: createElement(LanguageSwitcher),
      }),
    );
    expect(enHtml).toContain('aria-label="Language"');
    expect(enHtml).toMatch(/aria-pressed="true">English<\/button>/);
  });
});
