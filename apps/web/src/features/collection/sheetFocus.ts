/** Hai phần tử tối thiểu của DOM mà bảng trượt cần, để test không phụ thuộc trình duyệt. */
interface SheetPanel {
  focus(): void;
  contains(node: unknown): boolean;
}
interface SheetDoc {
  activeElement: unknown;
  body: { style: { overflow: string } };
}
interface Opener {
  focus(): void;
  isConnected: boolean;
}

/** Chi tiết thẻ thành bảng trượt từ đáy khi màn hình ≤ 720px (khớp collection.css). */
export const SHEET_QUERY = '(max-width: 720px)';

/**
 * Mở bảng trượt: khoá cuộn nền, chuyển focus vào bảng. Hàm trả về gỡ khoá và trả focus
 * về phần tử đã mở bảng (thẻ vừa bấm), trừ khi người dùng đã chuyển focus sang chỗ khác.
 */
export function enterSheet(doc: SheetDoc, panel: SheetPanel): () => void {
  const opener = doc.activeElement as Opener | null;
  const prevOverflow = doc.body.style.overflow;
  doc.body.style.overflow = 'hidden';
  panel.focus();
  return () => {
    doc.body.style.overflow = prevOverflow;
    const now = doc.activeElement;
    if (opener?.isConnected && (!now || now === doc.body || panel.contains(now))) opener.focus();
  };
}
