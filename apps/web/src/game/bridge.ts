import type { SquadSlot } from '@pitch/shared';
import type { MatchState } from '@pitch/sim';

/** Lệnh React gửi vào trận (renderer áp bằng hàm của sim, kể cả lúc tạm dừng). */
export type MatchCommand = { type: 'substitute'; outId: string; benchSlot: SquadSlot };

/** Kênh renderer ↔ React (HUD): React đọc state để hiển thị, renderer hỏi có đang tạm dừng không. */
export interface MatchBridge {
  isPaused(): boolean;
  /** Gọi sau mỗi khung hình có tick mới (và sau khi áp lệnh). */
  onState(state: MatchState): void;
  /** Lấy (và xoá) các lệnh đang chờ; renderer gọi mỗi khung hình. */
  takeCommands?(): MatchCommand[];
}

/** Mức đồ hoạ (ADR-0009): Thấp tắt bóng đổ thật, giảm độ phân giải cho máy yếu. */
export type GraphicsQuality = 'high' | 'low';

/** Chi tiết đồ hoạ người chơi bật/tắt riêng (task 5.21). */
export type GraphicsToggle =
  'shadows' | 'postFx' | 'ssao' | 'floodSpots' | 'skyAndRoof' | 'grass3d' | 'crowd' | 'replay';

export type TimeOfDay = 'night' | 'dusk' | 'day';

/** Cài đặt đồ hoạ: preset + phần bật/tắt đè lên preset + thời điểm trận. */
export interface GraphicsSettings {
  preset: GraphicsQuality;
  overrides: Partial<Record<GraphicsToggle, boolean>>;
  timeOfDay: TimeOfDay;
}
