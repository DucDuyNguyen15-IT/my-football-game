import { useEffect, useRef } from 'react';
import type { AutoClaimedMission } from '@pitch/shared';
import { formatDateShort, formatNumber, translateMissionTitle } from '../../i18n/i18n';
import { useI18n } from '../../i18n/I18nContext';

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
  const { locale, t } = useI18n();
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
        {t('missions.expiredTitle')}
      </h2>
      <div className="dialog__body">
        <p>{t('missions.expiredLead')}</p>
        <ul className="missions__list">
          {items.map((m) => (
            <li key={`${m.day}-${m.code}`} className="missions__row">
              <span>
                {translateMissionTitle(m.code, m.title, locale)}{' '}
                <span className="muted">
                  {t('missions.expiredDay', { day: formatDateShort(m.day, locale) })}
                </span>
              </span>
              <b className="num">
                +{formatNumber(m.reward, locale)} {t('common.coin')}
              </b>
            </li>
          ))}
        </ul>
        <p>
          {t('missions.expiredTotal')}{' '}
          <b className="num">
            +{formatNumber(total, locale)} {t('common.coin')}
          </b>
        </p>
      </div>
      <div className="dialog__actions">
        <button type="button" className="btn btn--primary" autoFocus onClick={onClose}>
          {t('missions.expiredAck')}
        </button>
      </div>
    </dialog>
  );
}
