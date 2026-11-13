import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { MissionProgress } from '@pitch/shared';
import { DailyMissionsPanel } from './DailyMissionsPanel';

const SAMPLE: MissionProgress[] = [
  { code: 'win_match', title: 'Thắng 1 trận', progress: 1, target: 1, reward: 50, claimed: false },
  { code: 'score_goals', title: 'Ghi 3 bàn', progress: 2, target: 3, reward: 50, claimed: false },
  { code: 'open_pack', title: 'Mở 1 gói', progress: 1, target: 1, reward: 50, claimed: true },
];

describe('<DailyMissionsPanel>', () => {
  it('hiển thị đủ 3 trạng thái: đủ điều kiện nhận, đang làm, đã nhận', () => {
    const html = renderToStaticMarkup(<DailyMissionsPanel missions={SAMPLE} onClaim={() => {}} />);
    expect(html).toContain('Nhiệm vụ ngày');
    expect(html).toContain('Thắng 1 trận');
    expect(html).toContain('1/1');
    expect(html).toContain('Nhận ');
    expect(html).toContain('+50');
    expect(html).toContain('Ghi 3 bàn');
    expect(html).toContain('2/3');
    expect(html).toContain('Mở 1 gói');
    expect(html).toContain('Đã nhận');
  });

  it('hiển thị skeleton khi đang tải và lỗi khi claim thất bại', () => {
    const loading = renderToStaticMarkup(<DailyMissionsPanel missions={undefined} isLoading />);
    expect(loading).toContain('aria-busy="true"');

    const withErr = renderToStaticMarkup(
      <DailyMissionsPanel missions={SAMPLE} errorMessage="Không nhận được thưởng" />,
    );
    expect(withErr).toContain('role="alert"');
    expect(withErr).toContain('Không nhận được thưởng');
  });
});
