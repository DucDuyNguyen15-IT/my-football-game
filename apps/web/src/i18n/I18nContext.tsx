import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  LOCALE_STORAGE_KEY,
  applyLocaleToDocument,
  formatMessage,
  isLocale,
  readLocale,
  setActiveLocale,
  writeLocale,
  type Locale,
  type TranslateFn,
  type TranslateParams,
} from './i18n';
import type { TranslationKey } from './vi';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: TranslateFn;
}

const defaultTranslate: TranslateFn = (key: TranslationKey, params?: TranslateParams) =>
  formatMessage('vi', key, params);

const I18nContext = createContext<I18nContextValue>({
  locale: 'vi',
  setLocale: () => {},
  t: defaultTranslate,
});

const safeStorage = (): Storage | null => {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
};

export function I18nProvider({
  children,
  initialLocale,
}: {
  children: ReactNode;
  initialLocale?: Locale;
}) {
  const [locale, setLocaleState] = useState<Locale>(
    () => initialLocale ?? readLocale(safeStorage()),
  );

  // Đồng bộ đồng thời trong render để module ngoài React (t(), fmt()) đọc đúng ngôn ngữ ngay.
  setActiveLocale(locale);

  useEffect(() => {
    setActiveLocale(locale);
    applyLocaleToDocument(document.documentElement, locale);
    document.title = formatMessage(locale, 'common.appTitle');
  }, [locale]);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== LOCALE_STORAGE_KEY) return;
      setLocaleState(isLocale(e.newValue) ? e.newValue : 'vi');
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const setLocale = useCallback((next: Locale) => {
    setActiveLocale(next);
    setLocaleState(next);
    writeLocale(safeStorage(), next);
    applyLocaleToDocument(document.documentElement, next);
  }, []);

  const t = useCallback<TranslateFn>(
    (key, params) => formatMessage(locale, key, params),
    [locale],
  );

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  return useContext(I18nContext);
}
