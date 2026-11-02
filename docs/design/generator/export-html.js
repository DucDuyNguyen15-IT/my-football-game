// Xuất mỗi artboard thành một file HTML độc lập (mở thẳng bằng trình duyệt) vào docs/design/screens/.
// Logic DCLogic được chạy một lần để lấy trạng thái mặc định; sự kiện bị bỏ, link giữa các màn giữ nguyên (.dc.html → .html).
const fs = require('fs');
const path = require('path');
const B = { ...require('./screens1').B, ...require('./screens2').B };
const OUT = path.join(__dirname, '..', 'screens');
fs.mkdirSync(OUT, { recursive: true });
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Be+Vietnam+Pro:wght@400;500;600&display=swap" rel="stylesheet">';

class DCLogic { constructor(props) { this.props = props || {}; this.state = {}; } setState() {} }
function vals(logic) {
  if (!logic) return {};
  const Component = new Function('DCLogic', `return class Component extends DCLogic {\n${logic}\n}`)(DCLogic);
  return new Component({}).renderVals();
}
const name = (f) => (f === 'Main.dc.html' ? 'intro.html' : f.replace('.dc.html', '.html').toLowerCase());

const index = [];
for (const [f, b] of Object.entries(B)) {
  const v = vals(b.logic);
  let body = b.body;
  // sc-if: giữ nhánh có giá trị đúng
  body = body.replace(/<sc-if value="\{\{\s*([\w.]+)\s*\}\}"[^>]*>([\s\S]*?)<\/sc-if>/g, (_, k, inner) => (v[k] ? inner : ''));
  // bỏ handler, thay hole còn lại
  body = body.replace(/\s(on[A-Z]\w*)="\{\{\s*[\w.]+\s*\}\}"/g, '');
  body = body.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => (v[k] === undefined ? '' : String(v[k])));
  body = body.replace(/href="([\w-]+)\.dc\.html"/g, (_, s) => `href="${name(s + '.dc.html')}"`);
  const html = `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${b.w}">
<title>${b.title} — MFG</title>
${FONTS}
<link rel="stylesheet" href="../generator/mfg.css">
<style>
body{margin:0;background:#0a1310;display:grid;place-items:start center}
a{color:#edf2ec}a:hover{color:#ffffff}
${b.style || ''}
</style>
</head>
<body>
<div class="mfg" style="position: relative; width: ${b.w}px; height: ${b.h}px; overflow: hidden">
${body}
</div>
</body>
</html>
`;
  fs.writeFileSync(path.join(OUT, name(f)), html);
  index.push(`<li><a href="${name(f)}">${b.title}</a> <span class="muted">${b.w}×${b.h}</span></li>`);
}
fs.writeFileSync(path.join(OUT, 'index.html'), `<!doctype html><html lang="vi"><head><meta charset="utf-8"><title>MFG — các màn</title>${FONTS}<link rel="stylesheet" href="../generator/mfg.css"></head><body class="mfg" style="margin:0;padding:32px"><h1 class="h1">MFG — các màn thiết kế</h1><p class="muted">Sinh bởi <code>node docs/design/generator/export-html.js</code>. Canvas gốc: claude.ai artifact "MFG — Thiết kế giao diện".</p><ol style="line-height:2">${index.join('')}</ol></body></html>`);
console.log(index.length, 'screens →', OUT);
