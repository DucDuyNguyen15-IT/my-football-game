/**
 * Đồng hồ nghiệp vụ (ARCHITECTURE §3.4 "Thời gian nghiệp vụ"): mọi logic theo thời gian lấy giờ từ
 * `app.clock.now()` để test thay bằng `FakeClock`.
 */
export interface Clock {
  now(): Date;
}

export const systemClock: Clock = { now: () => new Date() };
