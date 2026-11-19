export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'mfg.theme';
export const THEME_OPTIONS: readonly ThemePreference[] = ['light', 'dark', 'system'];

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function readThemePreference(
  storage: Pick<Storage, 'getItem'> | null | undefined,
): ThemePreference {
  try {
    const raw = storage?.getItem(THEME_STORAGE_KEY);
    return isThemePreference(raw) ? raw : 'system';
  } catch {
    return 'system';
  }
}

export function writeThemePreference(
  storage: Pick<Storage, 'setItem'> & { removeItem?: (key: string) => void } | null | undefined,
  pref: ThemePreference,
): void {
  try {
    if (!storage) return;
    if (pref === 'system') {
      if (storage.removeItem) storage.removeItem(THEME_STORAGE_KEY);
      else storage.setItem(THEME_STORAGE_KEY, 'system');
    } else {
      storage.setItem(THEME_STORAGE_KEY, pref);
    }
  } catch {
    // Bị chặn storage (duyệt riêng tư / sandbox) → giữ lựa chọn trong bộ nhớ phiên.
  }
}

export function resolveEffectiveTheme(
  pref: ThemePreference,
  systemPrefersDark: boolean,
): ResolvedTheme {
  if (pref === 'light' || pref === 'dark') return pref;
  return systemPrefersDark ? 'dark' : 'light';
}

export function applyThemeToDocument(
  root: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'> | null | undefined,
  pref: ThemePreference,
): void {
  if (!root) return;
  if (pref === 'light' || pref === 'dark') {
    root.setAttribute('data-theme', pref);
  } else {
    root.removeAttribute('data-theme');
  }
}
