import { LOCALES } from './i18n';
import { useI18n } from './I18nContext';

/** Nút chọn ngôn ngữ Tiếng Việt / English theo nhóm nút `.seg`. */
export function LanguageSwitcher({ compact = false }: { compact?: boolean }) {
  const { locale, setLocale, t } = useI18n();
  return (
    <div
      className={`seg${compact ? ' seg--compact' : ''}`}
      role="group"
      aria-label={t('lang.label')}
    >
      {LOCALES.map((loc) => {
        const active = locale === loc;
        return (
          <button
            key={loc}
            type="button"
            className={`seg__opt${active ? ' is-on' : ''}`}
            aria-pressed={active}
            onClick={() => setLocale(loc)}
          >
            {loc === 'vi' ? t('lang.vi') : t('lang.en')}
          </button>
        );
      })}
    </div>
  );
}
