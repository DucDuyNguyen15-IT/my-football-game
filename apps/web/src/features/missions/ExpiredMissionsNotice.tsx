import { useEffect, useRef } from 'react';
import type { AutoClaimedMission } from '@pitch/shared';

/** "2026-11-14" → "14/11". */
const dayLabel = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;

/**
 * Bảng thông báo khi vào game: nhiệm vụ ngày cũ đã xong mà chưa nhận, server đã tự cộng thưởng
 * (người dùng chốt 15/11/2026).
 */
export function ExpiredMissionsNotice({
  items,
  onClose,
}: {
  items: AutoClaimedMission[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    // showModal không có trong jsdom/SSR — chỉ gọi khi trình duyệt hỗ trợ.
    if (d && !d.open && typeof d.showModal === 'function') d.showModal();
  }, []);
  const total = items.reduce((s, m) => s + m.reward, 0);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="expired-missions-title" onClose={onClose}>
      <h2 id="expired-missions-title" className="dialog__title">
        Phần thưởng nhiệm vụ đã tự nhận
      </h2>
      <div className="dialog__body">
        <p>Các nhiệm vụ bạn đã hoàn thành nhưng chưa nhận trước 00:00 đã được tự động cộng vào ví:</p>
        <ul className="missions__list">
          {items.map((m) => (
            <li key={`${m.day}-${m.code}`} className="missions__row">
              <span>
                {m.title} <span className="muted">· ngày {dayLabel(m.day)}</span>
              </span>
              <b className="num">+{m.reward.toLocaleString('vi-VN')} xu</b>
            </li>
          ))}
        </ul>
        <p>
          Tổng cộng: <b className="num">+{total.toLocaleString('vi-VN')} xu</b>
        </p>
      </div>
      <div className="dialog__actions">
        <button type="button" className="btn btn--primary" autoFocus onClick={onClose}>
          Đã hiểu
        </button>
      </div>
    </dialog>
  );
}
