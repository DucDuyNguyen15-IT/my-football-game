// Mọi con số kinh tế nằm ở đây (PRD §7.4, ARCHITECTURE §3.3). Client đọc qua API, không import.

/** Trần số trận được thưởng mỗi ngày GMT+7 (PRD §7.1). */
export const MATCH_REWARD_DAILY_CAP = 15;

/**
 * Thưởng xu một trận vs máy theo độ khó + kết quả (PRD §7.1). Thắng luân lưu = hoà + 50% chênh lệch
 * thắng–hoà; thua luân lưu = 2/3 thưởng hoà (vẫn hơn thua thường).
 */
export const MATCH_REWARD = {
  easy: { win: 60, draw: 30, loss: 15, shootout_win: 45, shootout_loss: 20 },
  hard: { win: 120, draw: 60, loss: 30, shootout_win: 90, shootout_loss: 40 },
} as const;

/** Số bàn tối đa mỗi đội được coi là hợp lý khi nộp kết quả (PRD §7 tiêu chí match token). */
export const MATCH_MAX_GOALS = 20;

/** Thời gian tối thiểu từ lúc phát match token tới lúc nộp kết quả (giây); env ghi đè cho dev/test. */
export const MATCH_MIN_DURATION_SEC = 360;

/** Thời gian tối đa một match token còn hiệu lực kể từ lúc bắt đầu trận (2 giờ, ARCHITECTURE §5.2 #4). */
export const MATCH_MAX_AGE_SEC = 2 * 60 * 60;

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

/** Giá hệ thống mua lại thẻ theo độ hiếm, không phụ thuộc cấp + (PRD §6.6, F11). */
export const CARD_SALE_PRICE = { bronze: 10, silver: 25, gold: 80, legend: 300 } as const;

/**
 * Bảng ép thẻ +1→+5 (PRD §6.5, F10). `steps[i]`: ép từ cấp `i` lên `i + 1`. Phí thật = `baseFee`
 * × hệ số độ hiếm của thẻ được ép. Trượt → thẻ +`luckPerFail` điểm may mắn (tỉ lệ tối đa 100%).
 */
export const UPGRADE = {
  maxLevel: 5,
  luckPerFail: 10,
  steps: [
    { toLevel: 1, baseRate: 100, baseFee: 50 },
    { toLevel: 2, baseRate: 80, baseFee: 100 },
    { toLevel: 3, baseRate: 60, baseFee: 200 },
    { toLevel: 4, baseRate: 40, baseFee: 400 },
    { toLevel: 5, baseRate: 25, baseFee: 800 },
  ],
  rarityFeeMultiplier: { bronze: 1, silver: 2, gold: 3, legend: 5 },
} as const;

/** Số nhiệm vụ mỗi người chơi nhận mỗi ngày GMT+7 (PRD §7.1, F12). */
export const DAILY_MISSION_COUNT = 3;

/**
 * Danh sách nhiệm vụ ngày (PRD §7.1, F12). Mỗi ngày chọn tất định 3 nhiệm vụ theo `(userId, day)`.
 * Tiến độ cập nhật trong cùng transaction với nộp kết quả trận hoặc mở gói.
 */
export const MISSIONS = [
  { code: 'win_match', title: 'Thắng 1 trận', event: 'match_win', target: 1, reward: 50 },
  { code: 'score_goals', title: 'Ghi 3 bàn', event: 'match_goals', target: 3, reward: 50 },
  { code: 'open_pack', title: 'Mở 1 gói', event: 'pack_open', target: 1, reward: 50 },
  { code: 'play_hard', title: 'Đá 1 trận mức Khó', event: 'match_hard', target: 1, reward: 50 },
  { code: 'play_matches', title: 'Đá 2 trận', event: 'match_play', target: 2, reward: 50 },
  {
    code: 'clean_sheet',
    title: 'Giữ sạch lưới 1 trận',
    event: 'match_clean_sheet',
    target: 1,
    reward: 50,
  },
] as const;

export type MissionDef = (typeof MISSIONS)[number];
export type MissionCode = MissionDef['code'];
export type MissionEventKind = MissionDef['event'];
