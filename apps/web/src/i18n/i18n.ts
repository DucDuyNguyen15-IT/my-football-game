import { ApiClientError, type ClientErrorCode } from '../api/client';
import { en } from './en';
import { vi, type TranslationKey } from './vi';

export type { TranslationKey };
export type Locale = 'vi' | 'en';
export type TranslateParams = Record<string, string | number>;
export type TranslateFn = (key: TranslationKey, params?: TranslateParams) => string;

export const LOCALE_STORAGE_KEY = 'mfg.locale';
export const LOCALES: readonly Locale[] = ['vi', 'en'];

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { vi, en };

let activeLocale: Locale = 'vi';

export function isLocale(value: unknown): value is Locale {
  return value === 'vi' || value === 'en';
}

export function getActiveLocale(): Locale {
  return activeLocale;
}

export function setActiveLocale(locale: Locale): void {
  activeLocale = locale;
}

export function readLocale(storage: Pick<Storage, 'getItem'> | null | undefined): Locale {
  try {
    const raw = storage?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(raw) ? raw : 'vi';
  } catch {
    return 'vi';
  }
}

export function writeLocale(
  storage: Pick<Storage, 'setItem'> | null | undefined,
  locale: Locale,
): void {
  try {
    storage?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // localStorage bị chặn → chỉ lưu trong state phiên hiện tại.
  }
}

export function applyLocaleToDocument(
  root: Pick<HTMLElement, 'lang'> | null | undefined,
  locale: Locale,
): void {
  if (!root) return;
  root.lang = locale;
}

export function interpolate(template: string, params?: TranslateParams): string {
  if (!params) return template;
  return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (full, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : full,
  );
}

export function formatMessage(
  locale: Locale,
  key: TranslationKey,
  params?: TranslateParams,
): string {
  const dict = DICTIONARIES[locale] ?? DICTIONARIES.vi;
  const template = dict[key] ?? DICTIONARIES.vi[key];
  return interpolate(template, params);
}

/** Hàm dịch dùng ngoài React (vd: authErrors, MatchRenderer, transition). */
export function t(key: TranslationKey, params?: TranslateParams, locale = activeLocale): string {
  return formatMessage(locale, key, params);
}

export const intlLocale = (locale: Locale = activeLocale): string =>
  locale === 'en' ? 'en-US' : 'vi-VN';

export function formatNumber(
  n: number,
  locale: Locale = activeLocale,
  options?: Intl.NumberFormatOptions,
): string {
  return new Intl.NumberFormat(intlLocale(locale), options).format(n);
}

export function formatPercentValue(
  ratio: number,
  locale: Locale = activeLocale,
  minimumFractionDigits = 0,
  maximumFractionDigits = 1,
): string {
  return new Intl.NumberFormat(intlLocale(locale), {
    style: 'percent',
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(ratio);
}

function parseIsoDay(iso: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDateShort(iso: string, locale: Locale = activeLocale): string {
  const d = parseIsoDay(iso);
  if (!d) return iso;
  const parts = new Intl.DateTimeFormat(intlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).formatToParts(d);
  // Node ICU `vi-VN` trả literal `-` thay vì `/` khi chỉ có ngày/tháng.
  return parts
    .map((p) => (locale === 'vi' && p.type === 'literal' ? '/' : p.value))
    .join('');
}

export function formatDateFull(iso: string, locale: Locale = activeLocale): string {
  const d = parseIsoDay(iso);
  if (!d) return iso;
  return new Intl.DateTimeFormat(intlLocale(locale), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(d);
}

const ERROR_CODE_KEYS: Record<ClientErrorCode, TranslationKey> = {
  validation_error: 'err.validation_error',
  unauthenticated: 'err.unauthenticated',
  forbidden: 'err.forbidden',
  not_found: 'err.not_found',
  username_taken: 'err.username_taken',
  invalid_credentials: 'err.invalid_credentials',
  login_locked: 'err.login_locked',
  reauth_required: 'err.reauth_required',
  insufficient_coins: 'err.insufficient_coins',
  card_in_squad: 'err.card_in_squad',
  invalid_material: 'err.invalid_material',
  max_level: 'err.max_level',
  invalid_squad: 'err.invalid_squad',
  match_token_invalid: 'err.match_token_invalid',
  mission_incomplete: 'err.mission_incomplete',
  mission_already_claimed: 'err.mission_already_claimed',
  idempotency_conflict: 'err.idempotency_conflict',
  rate_limited: 'err.rate_limited',
  internal_error: 'err.internal_error',
  network_error: 'err.network_error',
  bad_response: 'err.bad_response',
};

/** Map `error.code` từ server sang từ điển i18n; chỉ dùng `err.message` làm dự phòng. */
export function errorMessageFor(
  err: unknown,
  locale: Locale = activeLocale,
  fallbackKey: TranslationKey = 'err.generic',
): string {
  if (!(err instanceof ApiClientError)) return formatMessage(locale, fallbackKey);
  const key = ERROR_CODE_KEYS[err.code];
  if (key) return formatMessage(locale, key);
  return err.message || formatMessage(locale, fallbackKey);
}

const MISSION_KEYS: Record<string, TranslationKey> = {
  win_match: 'mission.win_match',
  score_goals: 'mission.score_goals',
  open_pack: 'mission.open_pack',
  play_hard: 'mission.play_hard',
  play_matches: 'mission.play_matches',
  clean_sheet: 'mission.clean_sheet',
};

/** Map mã nhiệm vụ server sang nhãn theo ngôn ngữ hiện tại (dự phòng `fallbackTitle`). */
export function translateMissionTitle(
  code: string,
  fallbackTitle: string,
  locale: Locale = activeLocale,
): string {
  const key = MISSION_KEYS[code];
  return key ? formatMessage(locale, key) : fallbackTitle;
}
