# Script sinh thiết kế "Sân đêm"

Sinh design system, các màn thiết kế (canvas claude.ai) và bản HTML độc lập từ cùng một nguồn. Dữ liệu cầu thủ lấy từ `apps/server/src/db/seed/cards.json` (hư cấu).

| File | Vai trò |
|---|---|
| `mfg.css` | Stylesheet component (nút, thẻ, chip, thanh tiến độ, HUD…). Nguồn cho `apps/web/src/styles/ui.css` |
| `lib.js` | Avatar vector theo seed, `card()`, `topbar()`, sân vạch phấn… |
| `boardlib.js` | Khung artboard `.dc.html`, bảng trạng thái |
| `screens1.js`, `screens2.js` | Nội dung 33 màn |
| `export-html.js` | Xuất HTML độc lập → `docs/design/screens/` (mở `index.html`) |
| `gen-ds.js`, `gen-canvas.js` | Sinh file cho artifact Design System / canvas → `docs/design/build/` (bị gitignore) |
| `check.js` | Kiểm tra thẻ HTML mở/đóng cân bằng |

```bash
node docs/design/generator/export-html.js
node docs/design/generator/check.js docs/design/screens
```

`mfg.css` được artboard trên canvas nạp dưới dạng asset tải lên. Sửa file này thì phải tải lên lại và đổi link trong `boardlib.js`.
