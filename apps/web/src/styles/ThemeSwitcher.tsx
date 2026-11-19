import { useI18n } from '../i18n/I18nContext';
import { THEME_OPTIONS, type ThemePreference } from './theme';
import { useTheme } from './ThemeContext';

const THEME_KEYS: Record<ThemePreference, 'theme.light' | 'theme.dark' | 'theme.system'> = {
  light: 'theme.light',
  dark: 'theme.dark',
  system: 'theme.system',
};

export interface ThemeSwitcherProps {
  compact?: boolean;
}

/** Bộ chuyển giao diện 3 chế độ (Sáng / Tối / Theo hệ thống) theo nhóm nút `.seg`. */
export function ThemeSwitcher({ compact = false }: ThemeSwitcherProps) {
  const { preference, setPreference } = useTheme();
  const { t } = useI18n();
  return (
    <div
      className={`seg${compact ? ' seg--compact' : ''}`}
      role="group"
      aria-label={t('theme.label')}
    >
      {THEME_OPTIONS.map((opt) => {
        const active = preference === opt;
        return (
          <button
            key={opt}
            type="button"
            className={`seg__opt${active ? ' is-on' : ''}`}
            aria-pressed={active}
            onClick={() => setPreference(opt)}
          >
            {t(THEME_KEYS[opt])}
          </button>
        );
      })}
    </div>
  );
}
