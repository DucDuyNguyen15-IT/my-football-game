import type { PlayerStats, Position, Rarity } from '@pitch/shared';

/** Nhãn + số hạt ◆ theo độ hiếm (DESIGN.md §3.2 — không chỉ dựa vào màu). */
export const RARITY_INFO: Record<Rarity, { label: string; pips: number }> = {
  bronze: { label: 'Đồng', pips: 1 },
  silver: { label: 'Bạc', pips: 2 },
  gold: { label: 'Vàng', pips: 3 },
  legend: { label: 'Huyền thoại', pips: 4 },
};

/** Thứ tự hiển thị: hiếm nhất trước. */
export const RARITY_ORDER: readonly Rarity[] = ['legend', 'gold', 'silver', 'bronze'];

export const POSITION_NAME: Record<Position, string> = {
  GK: 'Thủ môn',
  DF: 'Hậu vệ',
  MF: 'Tiền vệ',
  FW: 'Tiền đạo',
};

type StatKey = keyof PlayerStats;
export interface StatLabel {
  key: StatKey;
  abbr: string;
  name: string;
}

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
