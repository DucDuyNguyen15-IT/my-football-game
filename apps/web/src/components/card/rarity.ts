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

/** Nhãn + số hạt ◆ theo độ hiếm (DESIGN.md §3.2 — không chỉ dựa vào màu). */
export const RARITY_INFO: Record<Rarity, { label: string; pips: number }> = {
  bronze: { label: 'Đồng', pips: 1 },
  silver: { label: 'Bạc', pips: 2 },
  gold: { label: 'Vàng', pips: 3 },
  legend: { label: 'Huyền thoại', pips: 4 },
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

export const POSITION_NAME: Record<Position, string> = {
  GK: 'Thủ môn',
  DF: 'Hậu vệ',
  MF: 'Tiền vệ',
  FW: 'Tiền đạo',
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
export const OUTFIELD_STATS: readonly StatLabel[] = [
  { key: 'pace', abbr: 'PAC', name: 'Tốc độ' },
  { key: 'shooting', abbr: 'SHO', name: 'Sút' },
  { key: 'passing', abbr: 'PAS', name: 'Chuyền' },
  { key: 'dribbling', abbr: 'DRI', name: 'Rê bóng' },
  { key: 'defending', abbr: 'DEF', name: 'Phòng ngự' },
  { key: 'stamina', abbr: 'STA', name: 'Thể lực' },
];
export const GK_STATS: readonly StatLabel[] = [
  { key: 'reflexes', abbr: 'REF', name: 'Phản xạ' },
  { key: 'handling', abbr: 'HAN', name: 'Bắt bóng' },
  { key: 'positioning', abbr: 'POS', name: 'Vị trí' },
  { key: 'kicking', abbr: 'KIC', name: 'Phát bóng' },
  { key: 'stamina', abbr: 'STA', name: 'Thể lực' },
];

export const statsFor = (position: Position) => (position === 'GK' ? GK_STATS : OUTFIELD_STATS);

export function localizedStatsFor(
  position: Position,
  locale: Locale = getActiveLocale(),
): readonly StatLabel[] {
  return statsFor(position).map((s) => ({
    key: s.key,
    abbr: formatMessage(locale, STAT_KEYS[s.key].abbr),
    name: formatMessage(locale, STAT_KEYS[s.key].name),
  }));
}

/** Họ (từ cuối) in to; phần còn lại cùng biệt danh ở dòng phụ. */
export function splitName(name: string): [string, string] {
  const i = name.lastIndexOf(' ');
  return i < 0 ? [name, ''] : [name.slice(i + 1), name.slice(0, i)];
}

/** Tên ngắn hiển thị trên thẻ (từ cuối trong `card.name`). */
export const shortCardName = (name: string): string => splitName(name)[0];
