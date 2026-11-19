import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { evaluatePasswordStrength } from './passwordStrength';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

describe('<PasswordStrengthMeter>', () => {
  it('hiển thị aria-live="polite", 4 bậc theo độ hiếm thẻ và gợi ý chữ', () => {
    const emptyHtml = renderToStaticMarkup(
      <PasswordStrengthMeter id="pw-s" strength={evaluatePasswordStrength('')} />,
    );
    expect(emptyHtml).toContain('id="pw-s"');
    expect(emptyHtml).toContain('aria-live="polite"');
    expect(emptyHtml).toContain('Chưa nhập mật khẩu');

    const bronzeHtml = renderToStaticMarkup(
      <PasswordStrengthMeter id="pw-s" strength={evaluatePasswordStrength('12345678')} />,
    );
    expect(bronzeHtml).toContain('r-bronze');
    expect(bronzeHtml).toContain('Đồng · Dự bị (quá yếu)');
    expect(bronzeHtml).toContain('Mật khẩu quá phổ biến');

    const legendHtml = renderToStaticMarkup(
      <PasswordStrengthMeter id="pw-s" strength={evaluatePasswordStrength('Saigon@2026!')} />,
    );
    expect(legendHtml).toContain('r-legend');
    expect(legendHtml).toContain('Huyền thoại (4/4)');
    expect(legendHtml).toContain('Thể lực tối đa');
  });
});
