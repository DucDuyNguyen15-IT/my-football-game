import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { evaluatePasswordStrength } from './passwordStrength';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

describe('<PasswordStrengthMeter>', () => {
  it('hiển thị aria-live="polite", 1 thanh liền 4 mức (màu theo độ hiếm) và gợi ý chữ', () => {
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
    expect(bronzeHtml).toContain('>Yếu<');
    expect(bronzeHtml).toContain('width:25%');
    expect(bronzeHtml).toContain('Mật khẩu quá phổ biến');

    const legendHtml = renderToStaticMarkup(
      <PasswordStrengthMeter id="pw-s" strength={evaluatePasswordStrength('Saigon@2026!')} />,
    );
    expect(legendHtml).toContain('r-legend');
    expect(legendHtml).toContain('>Rất mạnh<');
    expect(legendHtml).toContain('width:100%');
    expect(legendHtml).toContain('Mật khẩu rất mạnh.');
    expect(legendHtml).toContain('Độ mạnh mật khẩu');
  });
});
