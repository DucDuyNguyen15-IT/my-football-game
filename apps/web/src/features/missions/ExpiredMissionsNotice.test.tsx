import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ExpiredMissionsNotice } from './ExpiredMissionsNotice';

describe('<ExpiredMissionsNotice>', () => {
  it('liệt kê nhiệm vụ đã tự nhận theo ngày và tổng xu', () => {
    const html = renderToStaticMarkup(
      <ExpiredMissionsNotice
        items={[
          { code: 'win_match', title: 'Thắng 1 trận', day: '2026-11-14', reward: 50 },
          { code: 'open_pack', title: 'Mở 1 gói', day: '2026-11-14', reward: 50 },
        ]}
        onClose={() => {}}
      />,
    );
    expect(html).toContain('Phần thưởng nhiệm vụ đã tự nhận');
    expect(html).toContain('Thắng 1 trận');
    expect(html).toContain('ngày 14/11');
    expect(html).toContain('+100 xu');
  });
});
