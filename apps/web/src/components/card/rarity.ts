import type { PlayerStats, Position, Rarity } from '@pitch/shared';
import { formatMessage, getActiveLocale, type Locale } from '../../i18n/i18n';
import type { TranslationKey } from '../../i18n/vi';

const RARITY_KEYS: Record<Rarity, TranslationKey> = {
  bronze: 'rarity.bronze',
  silver: 'rarity.silver',
  gold: 'rarity.gold',
  legend: 'rarity.legend',
};

const RARITY_PIPS: Record<Rarity, number> = {
  bronze: 1,
  silver: 2,
  gold: 3,
  legend: 4,
};

export function rarityLabel(rarity: Rarity, locale: Locale = getActiveLocale()): string {
  return formatMessage(locale, RARITY_KEYS[rarity]);
}

export function rarityPips(rarity: Rarity): number {
  return RARITY_PIPS[rarity];
}

/** Thứ tự hiển thị: hiếm nhất trước. */
export const RARITY_ORDER: readonly Rarity[] = ['legend', 'gold', 'silver', 'bronze'];

const POSITION_KEYS: Record<Position, TranslationKey> = {
  GK: 'pos.GK',
  DF: 'pos.DF',
  MF: 'pos.MF',
  FW: 'pos.FW',
};

export function positionName(position: Position, locale: Locale = getActiveLocale()): string {
  return formatMessage(locale, POSITION_KEYS[position]);
}

type StatKey = keyof PlayerStats;
export interface StatLabel {
  key: StatKey;
  abbr: string;
  name: string;
}

const STAT_KEYS: Record<StatKey, { abbr: TranslationKey; name: TranslationKey }> = {
  pace: { abbr: 'stat.pace.abbr', name: 'stat.pace.name' },
  shooting: { abbr: 'stat.shooting.abbr', name: 'stat.shooting.name' },
  passing: { abbr: 'stat.passing.abbr', name: 'stat.passing.name' },
  dribbling: { abbr: 'stat.dribbling.abbr', name: 'stat.dribbling.name' },
  defending: { abbr: 'stat.defending.abbr', name: 'stat.defending.name' },
  stamina: { abbr: 'stat.stamina.abbr', name: 'stat.stamina.name' },
  reflexes: { abbr: 'stat.reflexes.abbr', name: 'stat.reflexes.name' },
  handling: { abbr: 'stat.handling.abbr', name: 'stat.handling.name' },
  positioning: { abbr: 'stat.positioning.abbr', name: 'stat.positioning.name' },
  kicking: { abbr: 'stat.kicking.abbr', name: 'stat.kicking.name' },
};

/** Chỉ số hiện trên thẻ (DESIGN.md §4): 6 chỉ số cầu thủ ngoài sân, 5 chỉ số thủ môn. */
const OUTFIELD_STATS: readonly StatKey[] = ['pace', 'shooting', 'passing', 'dribbling', 'defending', 'stamina'];
const GK_STATS: readonly StatKey[] = ['reflexes', 'handling', 'positioning', 'kicking', 'stamina'];

export function localizedStatsFor(
  position: Position,
  locale: Locale = getActiveLocale(),
): readonly StatLabel[] {
  return (position === 'GK' ? GK_STATS : OUTFIELD_STATS).map((key) => ({
    key,
    abbr: formatMessage(locale, STAT_KEYS[key].abbr),
    name: formatMessage(locale, STAT_KEYS[key].name),
  }));
}

/** Họ (từ cuối) in to; phần còn lại cùng biệt danh ở dòng phụ. */
export function splitName(name: string): [string, string] {
  const i = name.lastIndexOf(' ');
  return i < 0 ? [name, ''] : [name.slice(i + 1), name.slice(0, i)];
}

/** Tên ngắn hiển thị trên thẻ (từ cuối trong `card.name`). */
export const shortCardName = (name: string): string => splitName(name)[0];
