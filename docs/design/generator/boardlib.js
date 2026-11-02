const L = require('./lib');
const CSS = '/_blob/01a6dabb7760d4e19aa0161d57a8caed';
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&amp;family=Be+Vietnam+Pro:wght@400;500;600&amp;display=swap" rel="stylesheet">';

function doc({ title, w, h, body, style = '', logic = '' }) {
  const props = JSON.stringify({ $preview: { width: w, height: h } });
  return `<!doctype html>
<html lang="vi">
<head>
<meta charset="utf-8">
<title>${title}</title>
<script src="./support.js"></script>
<link rel="stylesheet" href="${CSS}">
</head>
<body>
<x-dc>
<helmet>
${FONTS}
<style>
body{margin:0;background:#0a1310}
a{color:#edf2ec}a:hover{color:#ffffff}
${style}
</style>
</helmet>
<div class="mfg" style="position: relative; width: ${w}px; height: ${h}px; overflow: hidden">
${body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='${props}'>
class Component extends DCLogic {
${logic || 'renderVals() {\n    return {};\n  }'}
}
</script>
</body>
</html>
`;
}

// Một ô "trạng thái" nhỏ trong bảng trạng thái
const stateCell = (label, inner, style = '') => `<section style="display: flex; flex-direction: column; gap: 12px; min-width: 0; ${style}"><div class="label" style="display: flex; gap: 8px; align-items: center"><span class="tag">${label}</span></div><div class="panel" style="flex: 1; position: relative; overflow: hidden; display: flex; flex-direction: column; gap: 14px">${inner}</div></section>`;
const statesBoard = (title, cols, cells, h = 720) => ({ title, w: 1280, h, body: `<div style="padding: 28px 32px; display: flex; flex-direction: column; gap: 20px; height: 100%; box-sizing: border-box"><div class="chalk-head"><h2 class="h2">${title}</h2></div><div style="flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(${cols}, minmax(0, 1fr)); gap: 24px">${cells.join('')}</div></div>` });

const missions = (o = {}) => {
  const rows = [
    ['Thắng 1 trận', 1, 1, true, false],
    ['Ghi 3 bàn', 2, 3, false, false],
    ['Đá 1 trận mức Khó', 0, 1, false, false],
  ];
  if (o.claimed) rows[0][4] = true;
  return rows.map(([t, v, max, done, claimed]) => `<div style="display: grid; grid-template-columns: 1fr auto; gap: 8px 12px; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--c-line)"><div style="display: flex; flex-direction: column; gap: 6px"><span style="font-weight: 600; font-size: 14px">${t}</span><div style="display: flex; align-items: center; gap: 10px"><div class="bar bar--thin" style="--v: ${(v / max) * 100}%; flex: 1"><div class="bar__fill"></div></div><span class="num muted" style="font-size: 12px; font-weight: 600">${v}/${max}</span></div></div>${claimed ? '<span class="tag tag--success">Đã nhận</span>' : done ? `<button class="btn btn--primary btn--sm">Nhận ${L.coin('50', 'coin--sm').replace('class="coin coin--sm"', 'class="coin coin--sm" style="color: var(--c-accent-ink)"')}</button>` : `<span class="coin coin--sm" style="opacity: .8"><span class="coin__icon"></span><span>50</span></span>`}</div>`).join('');
};

module.exports = { doc, stateCell, statesBoard, missions, L };
