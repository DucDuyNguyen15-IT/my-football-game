import type { MatchState } from '@pitch/sim';

/** Kênh renderer ↔ React (HUD): React đọc state để hiển thị, renderer hỏi có đang tạm dừng không. */
export interface MatchBridge {
  isPaused(): boolean;
  /** Gọi sau mỗi khung hình có tick mới. */
  onState(state: MatchState): void;
}

/** Mức đồ hoạ (ADR-0009): Thấp tắt bóng đổ thật, giảm độ phân giải cho máy yếu. */
export type GraphicsQuality = 'high' | 'low';
