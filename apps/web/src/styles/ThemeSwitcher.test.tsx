import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ThemeSwitcher } from './ThemeSwitcher';

describe('<ThemeSwitcher>', () => {
  it('render đủ 3 lựa chọn Sáng / Tối / Theo hệ thống với mặc định Theo hệ thống được chọn', () => {
    const html = renderToStaticMarkup(<ThemeSwitcher />);
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-label="Giao diện"');
    expect(html).toContain('>Sáng</button>');
    expect(html).toContain('>Tối</button>');
    expect(html).toMatch(/aria-pressed="true">Theo hệ thống<\/button>/);
  });
});
