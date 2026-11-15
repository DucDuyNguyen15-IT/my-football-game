import { TICK_RATE } from '../tick';

/*
 * Giới hạn thời gian chờ người chơi (PRD §5, quyết định 2026-11-14, mở rộng 2026-11-15): hết hạn thì máy thực hiện hộ,
 * để trận không bao giờ đứng vô hạn. Chỉ áp cho đội người chơi; đội máy tự thực hiện sau
 * RESTART_DELAY_TICKS / GK_HOLD_TICKS. Hạn chót đang chạy lộ ra ở `MatchState.actionDeadline`.
 */

/** Thủ môn đội người chơi ôm bóng (bằng tay, trong vòng cấm) tối đa chừng này tick (10 s). */
export const KEEPER_HOLD_MAX_TICKS = 10 * TICK_RATE;
/**
 * Mọi tình huống cố định của người chơi (giao bóng, ném biên, phạt góc, phát bóng, đá phạt, phạt đền,
 * lượt luân lưu): chờ tối đa chừng này tick (15 s) kể từ `Restart.readyTick` — lúc người thực hiện
 * đã đứng trước bóng và chuyển cảnh đã xong (luật 3).
 */
export const SET_PIECE_MAX_TICKS = 15 * TICK_RATE;
/** Nghỉ giữa hiệp: không bấm gì thì tự đá hiệp 2 sau chừng này tick (30 s). */
export const HALF_TIME_MAX_TICKS = 30 * TICK_RATE;
/** Hết giờ khi cú sút đang bay: chờ kết quả tối đa chừng này tick (3 s) kể từ lúc sút rồi thổi còi. */
export const WHISTLE_SHOT_WAIT_TICKS = 3 * TICK_RATE;
/**
 * Hết giờ khi đang chờ phạt đền: chờ tối đa chừng này tick (20 s) kể từ lúc đặt bóng — dư cho giữ
 * hình + chuyển cảnh (~1,6 s) cộng hạn 15 s của người chơi; quá nữa (không thể xảy ra trong luồng thường) thì thổi còi, bỏ quả phạt đền.
 */
export const WHISTLE_PENALTY_WAIT_TICKS = 20 * TICK_RATE;
