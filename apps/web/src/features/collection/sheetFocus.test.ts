import { describe, expect, it, vi } from 'vitest';
import { enterSheet } from './sheetFocus';

function setup(overflow = '') {
  const body = { style: { overflow } };
  const doc = { activeElement: null as unknown, body };
  const card = { focus: vi.fn(() => (doc.activeElement = card)), isConnected: true };
  doc.activeElement = card;
  const inside = {};
  const panel = {
    focus: vi.fn(() => (doc.activeElement = panel)),
    contains: (n: unknown) => n === panel || n === inside,
  };
  return { doc, body, card, panel, inside };
}

describe('enterSheet (bảng trượt chi tiết thẻ)', () => {
  it('khi mở: focus vào bảng và khoá cuộn nền', () => {
    const { doc, body, panel } = setup();
    enterSheet(doc, panel);
    expect(panel.focus).toHaveBeenCalledOnce();
    expect(doc.activeElement).toBe(panel);
    expect(body.style.overflow).toBe('hidden');
  });

  it('khi đóng (Esc / nút đóng): gỡ khoá về giá trị cũ và trả focus về thẻ đã mở', () => {
    const { doc, body, card, panel } = setup('auto');
    const leave = enterSheet(doc, panel);
    doc.activeElement = doc.body; // nút đóng bị gỡ khỏi DOM → focus rơi về body
    leave();
    expect(body.style.overflow).toBe('auto');
    expect(card.focus).toHaveBeenCalledOnce();
    expect(doc.activeElement).toBe(card);
  });

  it('đóng khi focus còn trong bảng cũng trả focus về thẻ', () => {
    const { doc, card, panel, inside } = setup();
    const leave = enterSheet(doc, panel);
    doc.activeElement = inside;
    leave();
    expect(card.focus).toHaveBeenCalledOnce();
  });

  it('không giành focus nếu người dùng đã sang chỗ khác (vd nút "Chọn để bán") hoặc thẻ đã bị bán', () => {
    const a = setup();
    const leaveA = enterSheet(a.doc, a.panel);
    a.doc.activeElement = {};
    leaveA();
    expect(a.card.focus).not.toHaveBeenCalled();

    const b = setup();
    const leaveB = enterSheet(b.doc, b.panel);
    b.card.isConnected = false;
    b.doc.activeElement = b.doc.body;
    leaveB();
    expect(b.card.focus).not.toHaveBeenCalled();
    expect(b.body.style.overflow).toBe('');
  });
});
