import type { Difficulty } from '@pitch/shared';

/*
 * Tham số AI theo mức độ khó (PRD §5): Dễ phản ứng chậm, sai số chuyền/sút lớn; Khó phản ứng nhanh.
 * Cân chỉnh ở task 5.13 (mục tiêu: người thắng Dễ ≥ 60%, thắng Khó ≤ 30%).
 */

export interface AiProfile {
  /** AI đội ra quyết định lại (chế độ, người áp sát, kèm người, điểm neo) mỗi chừng này tick. */
  reactionDelayTicks: number;
  /** Nhân vào độ lệch chuẩn sai số chuyền của cầu thủ AI (≥ 1; dùng từ task 5.8a). */
  passErrorMult: number;
  /** Nhân vào độ lệch chuẩn sai số sút của cầu thủ AI (≥ 1; dùng từ task 5.8a). */
  shotErrorMult: number;
  /** 0–1: dâng khối đội hình cao hơn, người áp sát chạy nước rút. */
  aggression: number;
}

/**
 * `easy`/`hard`: đội máy. `teammate`: cầu thủ AI cùng đội người chơi (không đổi theo mức độ khó,
 * để đổi mức chỉ đổi sức đối thủ). `proxy`: AI điều khiển cả đội người chơi khi chạy cân bằng
 * (task 5.13) — mô phỏng người chơi trung bình, nằm giữa Dễ và Khó.
 */
export const AI_PROFILES: Record<Difficulty | 'teammate' | 'proxy', AiProfile> = {
  easy: { reactionDelayTicks: 30, passErrorMult: 1.8, shotErrorMult: 1.6, aggression: 0.3 },
  hard: { reactionDelayTicks: 8, passErrorMult: 1, shotErrorMult: 1, aggression: 0.8 },
  teammate: { reactionDelayTicks: 10, passErrorMult: 1.2, shotErrorMult: 1.2, aggression: 0.5 },
  proxy: { reactionDelayTicks: 16, passErrorMult: 1.35, shotErrorMult: 1.3, aggression: 0.55 },
};
