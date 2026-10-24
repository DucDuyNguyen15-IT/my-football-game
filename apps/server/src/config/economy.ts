// Mọi con số kinh tế nằm ở đây (PRD §7.4, ARCHITECTURE §3.3). Client đọc qua API, không import.

/** Trần số trận được thưởng mỗi ngày GMT+7 (PRD §7.1). */
export const MATCH_REWARD_DAILY_CAP = 15;

/** Thành phần hộp 100 phiếu của mỗi người chơi (PRD §6.3). */
export const BOX_COMPOSITION = { bronze: 58, silver: 30, gold: 10, legend: 2 } as const;

/** Số gói 5 miễn phí của quà tân thủ (PRD §7.1, F9). */
export const STARTER_FREE_PACK5 = 1;

/**
 * Quà tân thủ: 11 thẻ Đồng cố định (1 TM, 3 HV, 4 TV, 3 TĐ) xếp sẵn sơ đồ 2-3-1, 7 chính + 4 dự bị
 * (PRD §7.1). Số là `cards.id` trong `src/db/seed/cards.json`; test kiểm độ hiếm/vị trí khớp ô.
 */
export const STARTER_SQUAD = {
  formation: '2-3-1',
  slots: [
    ['GK', 1],
    ['P1', 8],
    ['P2', 13],
    ['P3', 29],
    ['P4', 32],
    ['P5', 42],
    ['P6', 50],
    ['B1', 19],
    ['B2', 30],
    ['B3', 57],
    ['B4', 51],
  ],
} as const;

/**
 * Gói thẻ (PRD §6.3). `guarantee`: gói 5 bảo đảm ≥ 1 Bạc+ khi hộp còn. `freeCredit`: mở được bằng
 * lượt miễn phí `users.free_pack5_credits` (quà tân thủ).
 */
export const PACKS = {
  pack1: { size: 1, price: 100, guarantee: false, freeCredit: false },
  pack5: { size: 5, price: 450, guarantee: true, freeCredit: true },
} as const;
export type PackCode = keyof typeof PACKS;
