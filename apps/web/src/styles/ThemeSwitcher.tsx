import { THEME_OPTIONS, type ThemePreference } from './theme';
import { useTheme } from './ThemeContext';

const THEME_LABELS: Record<ThemePreference, string> = {
  light: 'Sáng',
  dark: 'Tối',
  system: 'Theo hệ thống',
};

export interface ThemeSwitcherProps {
  compact?: boolean;
}

/** Bộ chuyển giao diện 3 chế độ (Sáng / Tối / Theo hệ thống) theo nhóm nút `.seg`. */
export function ThemeSwitcher({ compact = false }: ThemeSwitcherProps) {
  const { preference, setPreference } = useTheme();
  return (
    <div
      className={`seg${compact ? ' seg--compact' : ''}`}
      role="group"
      aria-label="Giao diện"
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
            {THEME_LABELS[opt]}
          </button>
        );
      })}
    </div>
  );
}
