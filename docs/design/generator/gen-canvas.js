const fs = require('fs'); const path = require('path');
const { doc } = require('./boardlib');
const B = { ...require('./screens1').B, ...require('./screens2').B };
const OUT = path.join(__dirname, '..', 'build', 'canvas', 'project');
fs.mkdirSync(OUT, { recursive: true });
const ROWS = [
  ['Vào game', ['Main.dc.html', 'Auth.dc.html', 'Auth-States.dc.html', 'Onboarding-Flow.dc.html']],
  ['Trang chủ', ['Home.dc.html', 'Home-States.dc.html', 'Home-768.dc.html']],
  ['Cửa hàng & mở gói', ['Shop.dc.html', 'Shop-States.dc.html', 'Shop-States2.dc.html', 'PackOpening.dc.html', 'PackOpening-Legend.dc.html']],
  ['Kho thẻ & ép thẻ', ['Collection.dc.html', 'Collection-Sell.dc.html', 'Collection-States.dc.html', 'Collection-768.dc.html', 'Upgrade.dc.html', 'Upgrade-Warn.dc.html', 'Upgrade-Result.dc.html']],
  ['Đội hình & trước trận', ['Squad.dc.html', 'Squad-States.dc.html', 'PreMatch.dc.html', 'PreMatch-NoReward.dc.html', 'Versus.dc.html']],
  ['Trong trận', ['Match.dc.html', 'Match-Events.dc.html', 'Match-Shootout.dc.html', 'Pause.dc.html', 'Onboarding.dc.html']],
  ['Sau trận, quản trị, chuyển động', ['Result.dc.html', 'Result-States.dc.html', 'Admin.dc.html', 'Motion.dc.html']],
];
const listed = ROWS.flatMap((r) => r[1]);
const missing = Object.keys(B).filter((k) => !listed.includes(k)); if (missing.length) throw new Error('unlisted ' + missing);
const boards = {}, notes = {}, order = [];
let y = 0;
ROWS.forEach(([title, files], ri) => {
  let x = 0, maxH = 0;
  for (const f of files) { const b = B[f]; boards[f] = { x, y, w: b.w, h: b.h, title: b.title, ...(b.interactive ? { is_interactive: true } : {}) }; order.push(f); x += b.w + 80; maxH = Math.max(maxH, b.h); }
  notes['row' + ri] = { x: 0, y: y - 240, text: `${ri + 1}. ${title}`, kind: 'title1', maxW: x - 80 };
  y += maxH + 120 + 240;
});
notes.readme = { x: -760, y: -240, w: 640, text: 'MFG — Sân đêm. Mọi màn dùng design system "MFG — Sân đêm" (token + bundle.css). 1280×720 cho màn trận, menu thêm bản 768px. Bấm Play trên artboard có dấu xanh để bấm qua lại giữa các màn (thanh trên, nút chính đều là link). Mở gói, tab đăng nhập, chọn độ khó có trạng thái thật. Dữ liệu cầu thủ hư cấu, lấy từ seed của game; xu là tiền ảo.', fill: 'green', size: 'm' };
const now = new Date().toISOString();
const canvas = { v: 3, createdOnFiles: { v: 1, at: now }, title: 'MFG — Thiết kế giao diện', launch: { view: 'canvas' }, pages: [], boards, order, notes,
  designSystems: [{ title: 'MFG — Sân đêm', namespace: 'mfg', artifact: 'https://claude.ai/artifact/Wb1rJxYrW1aRA9cDWktjtq', version: '1793644224-ac1f', copiedAt: now }] };
fs.writeFileSync(path.join(OUT, 'canvas.json'), JSON.stringify(canvas, null, 1));
for (const [f, b] of Object.entries(B)) {
  const html = doc(b);
  // kiểm tra nhanh: thẻ mở/đóng cân bằng cho các thẻ chính
  for (const tag of ['div', 'span', 'section', 'a', 'button', 'svg', 'sc-if', 'table', 'label', 'form']) {
    const o = (html.match(new RegExp('<' + tag + '[\s>]', 'g')) || []).length, c = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    if (o !== c) console.log('UNBALANCED', f, tag, o, c);
  }
  fs.writeFileSync(path.join(OUT, f), html);
}
console.log(order.length, 'boards');
