const fs = require('fs');
const path = require('path');
const L = require('./lib');
const OUT = path.join(__dirname, '..', 'build', 'ds', 'project');
const w = (p, s) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };

// ---------- tokens.json ----------
const C = (name, value, usage) => ({ name, value: { dark: value }, usage });
const tokens = {
  name: 'MFG — Sân đêm', version: 2,
  meta: { source: 'github', repo: 'DucDuyNguyen15-IT/my-football-game', ref: 'main@6e3fde2', package: 'apps/web', paths: { tokens: ['apps/web/src/styles/tokens.css', 'docs/design/design-tokens.json'], docs: ['docs/DESIGN.md', 'docs/design/claude-design-prompt.md'] }, components: { CardView: 'apps/web/src/components/card/CardView.tsx', HoldButton: 'apps/web/src/components/HoldButton.tsx', BoxMeter: 'apps/web/src/features/shop/BoxMeter.tsx' }, synced: '2026-11-03' },
  color: {
    themes: [{ id: 'dark', name: 'Sân đêm' }],
    tokens: [
      C('c-bg', '#0a1310', 'Nền trang — sân lúc tối.'),
      C('c-surface-1', '#111d18', 'Panel thường.'),
      C('c-surface-2', '#182822', 'Hover, hộp thoại, panel nổi.'),
      C('c-surface-3', '#213530', 'Toast, rãnh thanh tiến độ, badge vị trí.'),
      C('c-line', '#2a3d35', 'Vạch phấn mờ: viền panel, đường phân cách.'),
      C('c-line-strong', '#3d5a4e', 'Vạch phấn rõ: đường trang trí, khung sân. Không dùng làm viền control (2.5:1).'),
      C('c-line-control', '#557a6a', 'Viền control: ô nhập, nút phụ, chip, công tắc. 3.9:1 trên c-bg, 3.2:1 trên c-surface-2 (WCAG 1.4.11).'),
      C('c-chalk', '#e8f0e6', 'Vạch phấn trên mặt cỏ (sân đội hình, sân khấu mở thẻ).'),
      C('c-text', '#edf2ec', 'Chữ chính, trắng phấn. 16.6:1 trên c-bg.'),
      C('c-text-muted', '#9db0a6', 'Chữ phụ. 8.3:1 trên c-bg, 6.7:1 trên c-surface-2.'),
      C('c-text-faint', '#71857c', 'Placeholder/gợi ý, CHỈ trên c-bg (4.8:1). Trên c-surface-1 chỉ 4.4:1 — không dùng cho chữ ở đó.'),
      C('c-accent', '#c8f031', 'Màu chanh: nút chính, mục đang bật, thanh lực sút. Chữ trên nền chanh dùng c-accent-ink (14.3:1).'),
      C('c-accent-hover', '#d8ff4a', 'Hover của nút chính.'),
      C('c-accent-ink', '#0a1310', 'Chữ/biểu tượng trên nền chanh, nền xu, nền tag sáng.'),
      C('c-accent-soft', 'rgb(200 240 49 / 0.12)', 'Nền chip lọc đang bật.'),
      C('c-coin', '#f2b33d', 'Icon và số xu. Nút mua bằng xu.'),
      C('c-danger', '#ff5a4e', 'Lỗi, thẻ đỏ, sai vị trí, hành động phá huỷ. 6.1:1 trên c-bg.'),
      C('c-warning', '#ffc23d', 'Thẻ vàng, cảnh báo (hộp chỉ còn Đồng, hết trận có thưởng).'),
      C('c-success', '#3dd68c', 'Thành công, cú sút trúng trong luân lưu.'),
      C('c-info', '#5cc8ff', 'Thông tin; chấm "đang trong đội hình".'),
      C('c-focus', '#5cc8ff', 'Viền focus bàn phím: 2px, cách 2px.'),
      C('c-scrim', 'rgb(4 8 6 / 0.78)', 'Lớp phủ dưới hộp thoại/menu tạm dừng.'),
      C('c-pitch-a', '#1d6436', 'Sọc cỏ A.'),
      C('c-pitch-b', '#226f3c', 'Sọc cỏ B.'),
      C('c-pitch-line', '#e8f0e6', 'Vạch sân trong trận 3D.'),
      C('c-team-home', '#3fa9f5', 'Đội nhà (xanh dương). Cặp xanh/cam phân biệt được với mù màu đỏ-lục. Luôn kèm ký hiệu ■ và chữ NHÀ.'),
      C('c-team-away', '#ff7a45', 'Đội khách (cam). Luôn kèm chữ KHÁCH.'),
      C('c-power-pass', '#3fa9f5', 'Thanh lực chuyền (S/A).'),
      C('c-power-through', '#9b6bff', 'Thanh lực chọc khe (W, Q+W) — ngoại lệ duy nhất của màu tím ngoài thẻ Huyền thoại, chỉ trong HUD.'),
      C('c-power-shot', '#c8f031', 'Thanh lực sút (D).'),
      C('r-bronze-base', '#b87040', 'Đồng — khung thẻ, thanh hộp phiếu.'),
      C('r-bronze-hi', '#ebaa78', 'Đồng — OVR, chữ độ hiếm.'),
      C('r-bronze-lo', '#3a1f10', 'Đồng — mặt thẻ (luôn tối).'),
      C('r-silver-base', '#aeb7c2', 'Bạc — khung (sọc chéo mảnh).'),
      C('r-silver-hi', '#eef2f6', 'Bạc — OVR.'),
      C('r-silver-lo', '#262c33', 'Bạc — mặt thẻ.'),
      C('r-gold-base', '#e0ae2e', 'Vàng — khung đôi.'),
      C('r-gold-hi', '#ffe48a', 'Vàng — OVR, vệt sáng.'),
      C('r-gold-lo', '#3a2a06', 'Vàng — mặt thẻ.'),
      C('r-legend-base', '#9b6bff', 'Huyền thoại — tím CHỈ dành cho độ hiếm này. Khung foil conic xoay chậm.'),
      C('r-legend-hi', '#d9c2ff', 'Huyền thoại — OVR.'),
      C('r-legend-lo', '#120a20', 'Huyền thoại — mặt thẻ.'),
      C('r-legend-foil-2', '#46e0d0', 'Foil Huyền thoại, điểm dừng 2 (ngọc).'),
      C('r-legend-foil-3', '#ff6bd5', 'Foil Huyền thoại, điểm dừng 3 (hồng).'),
      C('r-bronze-glow', 'rgb(235 150 90 / 0.45)', 'Hào quang Đồng.'),
      C('r-silver-glow', 'rgb(220 230 245 / 0.5)', 'Hào quang Bạc.'),
      C('r-gold-glow', 'rgb(255 205 70 / 0.6)', 'Hào quang Vàng; viền sáng mặt sau trước khi lật.'),
      C('r-legend-glow', 'rgb(155 107 255 / 0.7)', 'Hào quang Huyền thoại.'),
    ],
  },
  type: {
    fonts: [],
    families: { display: '"Barlow Condensed", "Arial Narrow", sans-serif', body: '"Be Vietnam Pro", system-ui, sans-serif' },
    groups: [
      { name: 'Hiển thị (Barlow Condensed)', family: 'display', styles: [
        { name: 'display-3xl', fontSize: '64px', lineHeight: 1.0, fontWeight: 700, sample: '2 – 1', usage: 'Tỉ số màn kết quả, xu nhận được, BÀN THẮNG.' },
        { name: 'display-2xl', fontSize: '40px', lineHeight: 1.05, fontWeight: 700, sample: 'ĐÁ VỚI MÁY', usage: 'Tiêu đề màn (h1), tỉ số HUD.' },
        { name: 'display-xl', fontSize: '28px', lineHeight: 1.05, fontWeight: 700, sample: 'KHO THẺ 23/300', usage: 'Tiêu đề khối (h2), tiêu đề hộp thoại.' },
        { name: 'display-lg', fontSize: '20px', lineHeight: 1.1, fontWeight: 700, sample: 'NHIỆM VỤ NGÀY', usage: 'Tiêu đề panel (h3), số xu ở thanh trên, nút lớn.' },
        { name: 'display-md', fontSize: '16px', lineHeight: 1.2, fontWeight: 600, letterSpacing: '0.06em', sample: 'MỞ GÓI 450', usage: 'Chữ nút (in hoa), tab.' },
        { name: 'label', fontSize: '12px', lineHeight: 1.3, fontWeight: 600, letterSpacing: '0.12em', sample: 'TỈ LỆ LẦN BỐC KẾ TIẾP', usage: 'Nhãn phụ in hoa có giãn chữ. 12px CHỈ dùng cho chữ in hoa.' },
      ] },
      { name: 'Nội dung (Be Vietnam Pro)', family: 'body', styles: [
        { name: 'body-lg', fontSize: '20px', lineHeight: 1.45, fontWeight: 500, sample: 'Quà tân thủ: 11 thẻ Đồng + 1 gói 5 thẻ', usage: 'Dòng dẫn ngắn.' },
        { name: 'body-md', fontSize: '16px', lineHeight: 1.5, fontWeight: 400, sample: 'Nguyên liệu sẽ mất dù ép thành công hay thất bại.', usage: 'Văn bản mặc định, ô nhập.' },
        { name: 'body-md-strong', fontSize: '16px', lineHeight: 1.5, fontWeight: 600, sample: 'Rafinho Duarte', usage: 'Tên cầu thủ, tên người chơi.' },
        { name: 'body-sm', fontSize: '14px', lineHeight: 1.5, fontWeight: 400, sample: 'Trận có thưởng hôm nay: 3/15', usage: 'Chữ phụ, mô tả, lỗi theo ô. Cỡ văn bản tối thiểu.' },
        { name: 'caption', fontSize: '12px', lineHeight: 1.4, fontWeight: 500, sample: 'Làm mới lúc 00:00', usage: 'Chú thích ngắn cạnh số; không dùng cho đoạn văn.' },
      ] },
    ],
  },
  spacing: { tokens: [
    { name: 'sp-1', value: '4px', usage: 'Khe icon–chữ.' }, { name: 'sp-2', value: '8px', usage: 'Khe trong nút, giữa chip.' },
    { name: 'sp-3', value: '12px', usage: 'Đệm ô nhập, khe giữa thẻ trong lưới.' }, { name: 'sp-4', value: '16px', usage: 'Khe giữa các dòng trong panel.' },
    { name: 'sp-5', value: '24px', usage: 'Đệm panel, lề trang.' }, { name: 'sp-6', value: '32px', usage: 'Khe giữa các khối lớn.' },
    { name: 'sp-7', value: '48px', usage: 'Khoảng thở quanh sân khấu mở thẻ.' }, { name: 'sp-8', value: '64px', usage: 'Lề trên màn kết quả/intro.' },
  ] },
  radius: { tokens: [
    { name: 'radius-sm', value: '2px', usage: 'Badge vị trí, phím, tag.' }, { name: 'radius-md', value: '4px', usage: 'Nút, ô nhập, toast.' },
    { name: 'radius-lg', value: '8px', usage: 'Panel, hộp thoại.' }, { name: 'card-notch', value: '14px', usage: 'Góc vát thẻ md (trên-phải, dưới-trái) bằng clip-path; lg 18px, sm 9px.' },
    { name: 'panel-notch', value: '10px', usage: 'Góc vát panel nhấn (Đá với máy, gói thẻ).' },
  ] },
  shadow: { tokens: [
    { name: 'shadow-1', value: { dark: '0 1px 0 rgb(255 255 255 / 0.04) inset, 0 2px 6px rgb(0 0 0 / 0.35)' }, usage: 'Nút nổi, thẻ trong lưới.' },
    { name: 'shadow-2', value: { dark: '0 8px 24px rgb(0 0 0 / 0.45)' }, usage: 'Hộp thoại, toast, HUD.' },
  ] },
  size: { tokens: [
    { name: 'card-w-lg', value: '220px', usage: 'Thẻ lớn: mở gói, chi tiết.' }, { name: 'card-w-md', value: '150px', usage: 'Thẻ vừa: lưới kho.' },
    { name: 'card-w-sm', value: '96px', usage: 'Thẻ mini: ô đội hình.' }, { name: 'topbar-h', value: '56px', usage: 'Thanh trên các màn menu.' },
    { name: 'layout-max', value: '1280px', usage: 'Bề rộng nội dung tối đa.' },
  ] },
  zIndex: { tokens: [
    { name: 'z-hud', value: '10', usage: 'HUD trận, thanh trên.' }, { name: 'z-overlay', value: '100', usage: 'Lớp phủ, intro.' },
    { name: 'z-modal', value: '200', usage: 'Hộp thoại.' }, { name: 'z-toast', value: '300', usage: 'Toast.' },
  ] },
  duration: { tokens: [
    { name: 'dur-instant', value: '80ms', usage: 'Phản hồi nhấn nút (scale .97).' }, { name: 'dur-fast', value: '160ms', usage: 'Hover, chip, tooltip.' },
    { name: 'dur-base', value: '240ms', usage: 'Chuyển màn, mở panel, OVR đội đếm lại.' }, { name: 'dur-slow', value: '400ms', usage: 'Modal, đếm xu.' },
    { name: 'stagger', value: '80ms', usage: 'Phần tử lưới/thẻ xuất hiện lần lượt (50–100ms).' },
  ] },
  easing: { tokens: [
    { name: 'ease-out', value: 'cubic-bezier(0.22, 1, 0.36, 1)', usage: 'Mặc định khi phần tử xuất hiện.' },
    { name: 'ease-in-out', value: 'cubic-bezier(0.65, 0, 0.35, 1)', usage: 'Chuyển giữa hai trạng thái.' },
    { name: 'ease-snap', value: 'cubic-bezier(0.34, 1.56, 0.64, 1)', usage: 'Thẻ đáp xuống, nảy nhẹ; ép thành công.' },
  ] },
};
w('tokens.json', JSON.stringify(tokens, null, 2));

// ---------- bundle.css (không lặp :root — token đến từ tokens.css) ----------
const css = fs.readFileSync(path.join(__dirname, 'mfg.css'), 'utf8').replace(/:root \{[\s\S]*?\n\}\n/, '');
w('components/bundle.css', css);

// ---------- previews ----------
const FONTS = '<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@600;700&family=Be+Vietnam+Pro:wght@400;500;600&display=swap&subset=vietnamese" rel="stylesheet">';
const prev = (group, height, body, sub = '') => `<!-- @dsCard group="${group}" height=${height}${sub ? ` subtitle="${sub}"` : ''} -->\n<!doctype html><html lang="vi"><head><meta charset="utf-8">${FONTS}<style>html,body{margin:0;background:var(--c-bg)}</style></head><body class="mfg"><div style="padding:20px;display:flex;flex-wrap:wrap;gap:16px;align-items:center">${body}</div></body></html>\n`;
const comp = (name, group, height, readme, body, sub) => { w(`components/${name}/README.md`, readme); w(`components/${name}/preview.html`, prev(group, height, body, sub)); };

const gold = L.by('gold', 'FW'), legend = L.by('legend', 'MF'), silver = L.by('silver', 'DF'), bronze = L.by('bronze', 'GK');

comp('Button', 'Hành động', 200, `# Button
Nút bấm in hoa Barlow Condensed 600, 4 biến thể: chính (chanh), phụ (viền phấn), ma (chữ mờ), nguy hiểm (viền đỏ); thêm nút xu cho mua bằng xu.

- **Mỗi màn chỉ một nút chính** — đó là bước tiếp theo của người chơi ("Đá ngay", "Mở gói", "Lưu").
- Cỡ: \`btn--sm\` 32px · mặc định 40px · \`btn--lg\` 48px · \`btn--xl\` 64px (CTA "Đá với máy" ở trang chủ).
- **Đang chờ server:** thêm \`is-loading\` — chữ ẩn, spinner hiện, **không đổi kích thước**, nút bị khoá (\`aria-busy="true"\`).
- **Khoá:** \`disabled\` + lý do hiện ngay cạnh nút ("Thiếu 210 xu", "Thẻ đang trong đội hình"). Không ẩn nút.
- **Giữ để xác nhận** (\`btn--hold\`): dùng cho thao tác khó hoàn tác (bán thẻ Vàng/Huyền thoại, ép bằng nguyên liệu quý). Giữ chuột/Space/Enter 1s, thanh đỏ chạy từ trái; thả sớm thì huỷ. Nguồn: \`apps/web/src/components/HoldButton.tsx\`.
- Focus: \`:focus-visible\` viền 2px \`--c-focus\` cách 2px. Nhấn: scale .97 trong \`--dur-instant\`.

Consumer cung cấp: nhãn tiếng Việt (động từ + đối tượng, VD "Mở gói 5 thẻ"), \`aria-busy\` khi tải.`,
`<button class="btn btn--primary btn--lg"><span class="btn__label">Đá ngay</span></button>
<button class="btn btn--secondary"><span class="btn__label">Tự xếp đội</span></button>
<button class="btn btn--ghost"><span class="btn__label">Bỏ qua</span></button>
<button class="btn btn--danger"><span class="btn__label">Bỏ trận</span></button>
<button class="btn btn--coin"><span class="btn__label">Mua · 450 xu</span></button>
<button class="btn btn--primary is-loading" aria-busy="true"><span class="btn__label">Mở gói</span></button>
<button class="btn btn--primary" disabled><span class="btn__label">Mở gói</span></button>
<button class="btn btn--danger btn--hold" style="--hold:.6"><span class="hold__fill"></span><span class="btn__label">Giữ để bán · 80 xu</span></button>
<button class="btn btn--secondary focus-ring"><span class="btn__label">Focus</span></button>`);

comp('PlayerCard', 'Thẻ cầu thủ', 420, `# PlayerCard
Thẻ cầu thủ có góc vát trên-phải và dưới-trái như mác áo đấu (không phải hình khiên), mặt luôn tối, khung mang màu độ hiếm. Nguồn: \`apps/web/src/components/card/CardView.tsx\` + \`card.css\`.

- Cỡ: **lg 220px** (mở gói, chi tiết, ép thẻ) · **md 150px** (lưới kho) · **sm 96px** (ô đội hình, không có chỉ số) · xs 72px (mini ở trang chủ). Tỉ lệ 5:7. Chữ co theo \`cqw\`.
- Bố cục từ trên xuống: OVR (màu \`--hi\`) + vị trí ở góc trên-trái, hạt ◆ ở trên-phải, avatar vector, HỌ in hoa, tên + biệt danh, 6 chỉ số (lg/md), nhãn độ hiếm.
- Độ hiếm không chỉ bằng màu: nhãn chữ + số hạt ◆ + kiểu khung (Đồng trơn · Bạc sọc chéo · Vàng khung đôi + vệt sáng khi hover · Huyền thoại foil conic xoay 6s).
- Cờ: \`MỚI\` (chanh) cho thẻ chưa từng có; \`TRÙNG\` (xám) cho thẻ đã có. Chấm xanh = đang trong đội hình. Huy hiệu \`+N\` góc dưới-phải = cấp ép.
- Mặt sau (\`card--back\`): sọc cỏ + vòng tròn giữa sân; \`is-hot\` + độ hiếm phát sáng báo trước thẻ Vàng/Huyền thoại.
- \`role="img"\` + \`aria-label\` dạng "Vàng, Rafinho Duarte, Tiền đạo, OVR 81, cấp +2".
- Giảm chuyển động: foil đứng yên; dừng animation khi tab ẩn.

Consumer cung cấp: dữ liệu thẻ (tên hư cấu, biệt danh, vị trí, độ hiếm, chỉ số, \`avatarSeed\`), cấp ép, cờ.`,
`${L.card(legend, { size: 'lg', level: 3 })}${L.card(gold, { size: 'md', flag: 'MỚI' })}${L.card(silver, { size: 'md', squad: true })}${L.card(bronze, { size: 'md', flag: 'TRÙNG' })}<div style="display:grid;gap:12px">${L.card(gold, { size: 'sm' })}${L.cardBack({ size: 'sm', hot: 'gold' })}</div>`);

comp('RarityChip', 'Nhận diện', 80, `# RarityChip
Nhãn độ hiếm: hạt ◆ + chữ trên mặt tối, viền màu \`--base\`, góc vát nhỏ 6px.

Dùng trong bộ lọc, bảng chi tiết, tóm tắt mở gói, hộp phiếu. Màu tím chỉ cho Huyền thoại.`,
`${['bronze', 'silver', 'gold', 'legend'].map(L.rarityChip).join('')}`);

comp('PositionBadge', 'Nhận diện', 80, `# PositionBadge
Badge vị trí viết tắt tiếng Anh (GK/DF/MF/FW) với vạch màu dưới chân để quét nhanh; tên tiếng Việt ở \`title\`/\`aria-label\`.

Vạch: GK vàng cảnh báo · DF xanh info · MF xanh lá · FW đỏ. Vạch chỉ là gợi ý phụ — chữ luôn có.`,
`${['GK', 'DF', 'MF', 'FW'].map(L.pos).join('')}<span class="tag tag--accent">MỚI</span><span class="tag">TRÙNG</span><span class="tag tag--info">Trong đội</span><span class="tag tag--warn">Sai vị trí −15%</span><span class="tag tag--success">Đã nhận</span><span class="tag tag--danger">Thẻ đỏ</span>`);

comp('Coin', 'Nhận diện', 100, `# Coin
Hiển thị xu: icon đồng xu (vòng tròn + vạch) + số tabular Barlow, màu \`--c-coin\`. Luôn có "xu" cho trình đọc màn hình.

- Cỡ: sm 14 (thanh trên, nút) · mặc định 20 · lg 40 · xl 64 (màn kết quả "+60").
- Khi số xu đổi: đếm lên/xuống trong \`--dur-slow\` (400ms), số không nhảy nhờ tabular-nums.
- Thiếu xu: \`coin--short\` (đỏ) + chữ "Thiếu N xu".
- Xu là tiền ảo kiếm trong game. Không có giá tiền thật hay nút nạp ở bất kỳ đâu.`,
`${L.coin('1.240', 'coin--sm')}${L.coin('450')}${L.coin('+60', 'coin--lg')}${L.coin('+60', 'coin--xl')}<span class="muted" style="font-size:14px;display:inline-flex;gap:6px;align-items:center">Thiếu ${L.coin('210', 'coin--sm coin--short')}</span>`);

comp('ProgressBar', 'Phản hồi', 200, `# ProgressBar
Thanh tiến độ bo tròn trên rãnh \`--c-surface-3\`: tiến độ nhiệm vụ, thể lực, tỉ lệ ép thẻ.

- Biến thể màu: chanh (mặc định), xu, info, cảnh báo, nguy hiểm, theo độ hiếm (\`bar--rarity\` + \`.r-*\`).
- **Tỉ lệ ép thẻ 2 màu:** phần chanh = tỉ lệ cơ bản, phần sọc xu (\`bar__luck\`) = điểm may mắn tích luỹ; con số tổng luôn hiện bên cạnh.
- Thanh phân đoạn (\`bar--segmented\`): đếm rời rạc như 3/15 trận có thưởng.
- Luôn kèm số ("2/3", "64%") — không chỉ dựa vào độ dài.`,
`<div style="display:grid;gap:14px;width:420px"><div class="bar" style="--v:66%"><div class="bar__fill"></div></div><div class="bar bar--coin" style="--v:100%"><div class="bar__fill"></div></div><div class="bar bar--thick" style="--v:40%"><div class="bar__fill"></div><div class="bar__luck" style="--luck:12%"></div></div><div class="bar bar--warn bar--thin" style="--v:45%"><div class="bar__fill"></div></div><div class="bar bar--danger bar--thin" style="--v:25%"><div class="bar__fill"></div></div><div class="bar bar--segmented" style="height:8px">${Array.from({ length: 15 }, (_, i) => `<i class="${i < 3 ? 'on' : ''}"></i>`).join('')}</div></div>`);

comp('BoxMeter', 'Phản hồi', 200, `# BoxMeter
Thanh hộp phiếu: 4 hàng (độ hiếm · thanh còn/tổng ban đầu · số còn · tỉ lệ lần bốc kế tiếp). Nguồn: \`apps/web/src/features/shop/BoxMeter.tsx\`.

- Hộp riêng của người chơi: 100 phiếu = 2 Huyền thoại / 10 Vàng / 30 Bạc / 58 Đồng, bốc đến đâu trừ đến đó. Tỉ lệ = còn / tổng còn, 1 chữ số thập phân.
- Hàng hết phiếu: \`is-empty\` (mờ, 0,0%). Hộp chỉ còn Đồng: hiện \`Banner\` cảnh báo phía trên.
- Đặt ngang tầm mắt khi vào Cửa hàng: minh bạch là điểm khác biệt của game.`,
`<div style="width:460px">${[['legend', 2, 2, '2,1'], ['gold', 9, 10, '9,5'], ['silver', 28, 30, '29,5'], ['bronze', 56, 58, '58,9']].map(([r, n, t, p]) => `<div class="meter r-${r}"><span class="meter__name"><span class="rarity__pips">${L.pips(r)}</span>${L.RARITY[r][0]}</span><div class="bar bar--rarity" style="--v:${(n / t) * 100}%"><div class="bar__fill"></div></div><span class="meter__count">${n}</span><span class="meter__pct">${p}%</span></div>`).join('')}</div>`);

comp('Tabs', 'Điều hướng', 190, `# Tabs
Ba kiểu chọn: **Tabs** (gạch chanh dưới, chuyển màn con: Đăng nhập/Đăng ký), **Segmented** (chọn một trong ít lựa chọn: Dễ/Khó, sơ đồ 2-3-1/3-2-1/2-2-2), **Chip lọc** (bật/tắt nhiều: vị trí, độ hiếm).

Chip đang bật: nền chanh nhạt + viền chanh. Tất cả là \`<button>\` thật với \`aria-pressed\`/\`aria-selected\`.`,
`<div style="display:grid;gap:18px;width:560px"><div class="tabs" role="tablist"><button class="tab is-on" role="tab" aria-selected="true">Đăng nhập</button><button class="tab" role="tab">Đăng ký</button></div><div class="seg"><button class="seg__opt is-on">2-3-1</button><button class="seg__opt">3-2-1</button><button class="seg__opt">2-2-2</button></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="chip is-on" aria-pressed="true">Tất cả</button><button class="chip">GK</button><button class="chip">DF</button><button class="chip is-on" aria-pressed="true">MF</button><button class="chip">FW</button><button class="chip">Đang trong đội</button></div></div>`);

comp('TopBar', 'Điều hướng', 90, `# TopBar
Thanh trên 56px cho mọi màn ngoài trận: logo MFG (vòng tròn giữa sân) · Trang chủ · Cửa hàng · Kho thẻ · Đội hình · ví xu · người chơi · Đăng xuất.

Mục đang mở: chữ sáng + gạch chanh 3px. Ở 768px: ẩn tên người chơi, giữ ví xu.`,
`<div style="width:100%;border:1px solid var(--c-line)">${L.topbar('home')}</div>`);

comp('Input', 'Form', 260, `# Input
Ô nhập cao 44px trên nền \`--c-bg\`, viền \`--c-line-strong\`, nhãn trên ô, gợi ý/lỗi dưới ô.

- Lỗi theo từng ô: viền đỏ + dòng lỗi có icon, \`aria-invalid\` + \`aria-describedby\`.
- Mật khẩu: nút "Hiện/Ẩn" trong ô (\`aria-pressed\`).
- Trường không bắt buộc ghi "(không bắt buộc)" ở nhãn.
- Placeholder dùng \`--c-text-faint\` — chỉ trên nền \`--c-bg\`.`,
`<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;width:620px"><label class="field"><span class="field__label">Tên đăng nhập</span><input class="input" placeholder="3–20 ký tự, chữ và số"><span class="field__hint">Hiện cho người chơi khác.</span></label><label class="field"><span class="field__label">Mật khẩu</span><span class="field__box"><input class="input is-focus" type="password" value="sanbong123"><button class="field__btn" type="button">Hiện</button></span></label><label class="field"><span class="field__label">Tên đăng nhập</span><input class="input is-error" value="duy" aria-invalid="true"><span class="field__error">${L.ICON.warn} Tên đã có người dùng.</span></label><label class="field"><span class="field__label">Email <small>(không bắt buộc)</small></span><input class="input" placeholder="ban@vidu.vn"></label></div>`);

comp('Dialog', 'Lớp phủ', 300, `# Dialog
Hộp thoại xác nhận trên lớp phủ \`--c-scrim\`: tiêu đề in hoa, một đoạn hậu quả, hành động bên phải (huỷ trước, xác nhận sau).

- Thao tác mất dữ liệu: nút xác nhận là \`btn--danger\`; với thẻ Vàng/Huyền thoại dùng \`btn--hold\`.
- \`role="dialog"\` \`aria-modal="true"\`, focus vào nút an toàn (Huỷ), Esc đóng.
- Chỉ một hộp thoại tại một thời điểm; không lồng panel trong hộp thoại.`,
`<div style="position:relative;width:100%;height:260px;background:var(--c-surface-1)"><div class="scrim"><div class="dialog" role="dialog" aria-modal="true"><h3 class="dialog__title">Bán thẻ này?</h3><p class="dialog__body">Faberto Sarcello (Vàng, DF 83) sẽ bị xoá khỏi kho. Bạn nhận ${L.coin("80", "coin--sm")}. Không hoàn tác được.</p><div class="dialog__actions"><button class="btn btn--secondary">Huỷ</button><button class="btn btn--danger btn--hold" style="--hold:.35"><span class="hold__fill"></span><span class="btn__label">Giữ để bán</span></button></div></div></div></div>`);

comp('Toast', 'Lớp phủ', 230, `# Toast
Thông báo ngắn góc trên-phải, tự ẩn sau 4s, \`role="status"\` (lỗi: \`role="alert"\`, không tự ẩn).

Tông: info (mặc định), success, error, warn, coin. Một dòng đậm + một dòng phụ, tối đa 3 toast xếp chồng.`,
`<div style="display:grid;gap:10px"><div class="toast toast--success" role="status"><span class="toast__icon">✓</span><div><b>Đã lưu đội hình</b><span>OVR đội 71 · sơ đồ 2-3-1</span></div></div><div class="toast toast--coin" role="status"><span class="toast__icon">+</span><div><b>Nhận thưởng nhiệm vụ</b><span>+50 xu · Thắng 1 trận</span></div></div></div><div style="display:grid;gap:10px"><div class="toast toast--error" role="alert"><span class="toast__icon">!</span><div><b>Thao tác quá nhanh</b><span>Đợi vài giây rồi thử lại.</span></div></div><div class="toast toast--warn" role="status"><span class="toast__icon">!</span><div><b>2 thẻ chuyển xuống dự bị</b><span>Không hợp sơ đồ 3-2-1.</span></div></div></div>`);

comp('Banner', 'Phản hồi', 170, `# Banner
Dải cảnh báo nằm trong luồng nội dung (không phải lớp phủ): cảnh báo vàng, nguy hiểm đỏ, thông tin xanh.

Dùng cho: "Hộp chỉ còn thẻ Đồng", "Trận này không có thưởng", "Khoá đăng nhập 15 phút". Có icon + chữ đậm phần quan trọng.`,
`<div style="display:grid;gap:10px;width:560px"><div class="banner">${L.ICON.warn}<span><b>Hộp chỉ còn thẻ Đồng.</b> Gói 5 thẻ không còn bảo đảm Bạc.</span></div><div class="banner banner--danger">${L.ICON.lock}<span><b>Tạm khoá đăng nhập 15 phút</b> sau 5 lần sai mật khẩu. Thử lại lúc 21:47.</span></div><div class="banner banner--info">${L.ICON.warn}<span><b>Trận này không có thưởng.</b> Bạn đã đá đủ 15 trận có thưởng hôm nay.</span></div></div>`);

comp('Skeleton', 'Phản hồi', 260, `# Skeleton
Khung chờ tải mang đúng hình dạng nội dung (thẻ vát góc, dòng chữ), dải sáng lướt 1.4s; giảm chuyển động thì đứng yên.

Hiện ngay khi gọi API; quá 8s thì chuyển sang trạng thái lỗi có nút "Thử lại".`,
`${Array.from({ length: 4 }, () => '<div class="skel skel--card"></div>').join('')}<div style="display:grid;gap:8px;width:200px"><div class="skel skel--line" style="width:70%"></div><div class="skel skel--line"></div><div class="skel skel--line" style="width:40%"></div></div>`);

const emptyArt = `<svg class="empty__art" viewBox="0 0 120 72" fill="none" stroke="#3d5a4e" stroke-width="1.6" aria-hidden="true"><rect x="2" y="2" width="116" height="68"></rect><line x1="60" y1="2" x2="60" y2="70"></line><circle cx="60" cy="36" r="13"></circle><rect x="2" y="20" width="16" height="32"></rect><rect x="102" y="20" width="16" height="32"></rect><circle cx="60" cy="36" r="2" fill="#c8f031" stroke="none"></circle></svg>`;
comp('EmptyState', 'Phản hồi', 280, `# EmptyState
Trạng thái trống: hình sân vạch phấn rỗng, tiêu đề in hoa, một câu giải thích, đúng một hành động dẫn tới bước tiếp theo.

VD: Kho trống → "Mở gói"; lọc không khớp → "Xoá lọc"; chưa có nhiệm vụ → không có nút.`,
`<div class="empty" style="width:100%">${emptyArt}<h3 class="empty__title">Kho còn trống</h3><p class="empty__body">Mở gói miễn phí để nhận 5 thẻ đầu tiên, rồi xếp đội và ra sân.</p><a class="btn btn--primary" href="#">Mở gói miễn phí</a></div>`);

comp('FormationSlot', 'Thẻ cầu thủ', 220, `# FormationSlot
Ô xếp đội trên sân vạch phấn: ô trống viền đứt + nhãn vị trí; ô có thẻ dùng PlayerCard cỡ sm; sai vị trí thì viền đỏ + nhãn "−15%".

Hai cách xếp: kéo-thả, hoặc bấm ô → bấm thẻ (cách chính, dùng được bằng bàn phím). Ô đang chọn: viền chanh.`,
`<div class="slot"><div class="slot__empty">FW</div><span class="slot__role">FW</span></div><div class="slot">${L.card(gold, { size: 'sm' })}<span class="slot__role">FW</span></div><div class="slot is-wrong">${L.card(L.by('gold', 'MF'), { size: 'sm', ovr: 70 })}<span class="slot__penalty">${L.ICON.warn} DF −15%</span></div><div class="slot">${L.card(silver, { size: 'sm', selected: true })}<span class="slot__role">DF</span></div>`);

comp('Pack', 'Thẻ cầu thủ', 280, `# Pack
Hình gói thẻ trừu tượng: chữ nhật vát góc, vạch phấn bên trong, số thẻ to, dải 4 sọc màu độ hiếm. Không có logo.

Gói 1 thẻ / gói 5 thẻ / gói miễn phí (viền chanh). Trên sân khấu mở thẻ, gói "thở" nhẹ (scale 1 → 1.02, 2.4s).`,
`${['1', '5'].map((n) => `<div class="pack"><div class="pack__count">${n}<small>THẺ</small></div><div class="pack__stripes"><i style="background:var(--r-bronze-base)"></i><i style="background:var(--r-silver-base)"></i><i style="background:var(--r-gold-base)"></i><i style="background:var(--r-legend-base)"></i></div></div>`).join('')}<div class="pack" style="outline:2px solid var(--c-accent);outline-offset:4px"><div class="pack__count">5<small>MIỄN PHÍ</small></div><div class="pack__stripes"><i style="background:var(--r-bronze-base)"></i><i style="background:var(--r-silver-base)"></i><i style="background:var(--r-gold-base)"></i><i style="background:var(--r-legend-base)"></i></div></div>`);

comp('HudScoreboard', 'Trong trận', 230, `# HudScoreboard
Bộ phận HUD trong trận (đè lên sân 3D): bảng tỉ số, thanh lực, phím gợi ý, dải sự kiện, chấm luân lưu.

- Bảng tỉ số trên giữa: ô màu đội + ■ + NHÀ/KHÁCH, tỉ số Barlow 40, hiệp + phút (phút màu chanh).
- Thanh lực trên đầu cầu thủ khi giữ phím: chuyền \`--c-power-pass\`, chọc khe \`--c-power-through\`, sút \`--c-power-shot\`.
- Nền HUD tối 82–90% để chữ đạt AA trên mọi góc sân. Không chạy animation DOM trong trận ngoài khoảnh khắc sự kiện.`,
`<div style="display:grid;gap:14px"><div class="hud-score"><span class="hud-score__sw" style="background:var(--c-team-home)"></span><span class="hud-score__team">■ NHÀ</span><span class="hud-score__goals">2</span><span class="hud-score__goals" style="background:var(--c-surface-3)">1</span><span class="hud-score__team">KHÁCH ■</span><span class="hud-score__clock">H2 · <b>67'</b></span></div><div style="display:flex;gap:16px;align-items:center"><span class="power" style="--tone:var(--c-power-pass);--v:45%"><i></i></span><span class="power" style="--tone:var(--c-power-through);--v:70%"><i></i></span><span class="power" style="--v:90%"><i></i></span></div><div style="display:flex;gap:14px"><span class="keyhint"><span class="kbd">D</span>Sút</span><span class="keyhint"><span class="kbd">S</span>Chuyền</span><span class="keyhint"><span class="kbd">Esc</span>Tạm dừng</span></div><div style="display:flex;gap:6px"><span class="dot hit"></span><span class="dot hit"></span><span class="dot miss"></span><span class="dot"></span><span class="dot"></span></div></div>`);

// ---------- Cover ----------
w('components/Cover/preview.html', `<!-- @dsCard height=300 -->
<!doctype html><html lang="vi"><head><meta charset="utf-8">${FONTS}<style>
html,body{margin:0;background:var(--c-bg)}
.cv{position:relative;width:960px;height:300px;overflow:hidden;background:var(--c-bg)}
.cv svg{position:absolute;left:0;top:0}
.b-pitch{fill:var(--c-pitch-a)} .b-pitch2{fill:var(--c-pitch-b)} .b-lime{fill:var(--c-accent)} .b-surface{fill:var(--c-surface-2)} .b-legend{fill:var(--r-legend-base)} .b-gold{fill:var(--r-gold-base)}
.chalk{fill:none;stroke:var(--c-chalk);stroke-width:2;opacity:.7} .spot{fill:var(--c-chalk)}
.nm{position:absolute;left:40px;bottom:44px;width:420px}
.nm h1{margin:0;font-family:var(--font-display);font-weight:700;font-size:120px;line-height:.92;letter-spacing:.06em;color:var(--c-text)}
.nm p{margin:10px 0 0;font-family:var(--font-body);font-size:14px;color:var(--c-text-muted)}
</style></head><body><div class="cv">
<svg width="960" height="300" viewBox="0 0 960 300" aria-hidden="true">
<!-- blocks: c-pitch-a slab 480×300 + c-pitch-b bands (sp-8 pitch); c-accent 96×300 strip; c-surface-2 band; r-gold-base / r-legend-base small notched satellites
     arrangement: one tall pitch slab bleeding off the right edge, striped like mown grass, lime strip at its left edge
     pattern: literal motif — the chalk pitch lines (centre circle, halfway line, penalty box, spot), because "vạch phấn" is the system's signature
     scales: stripes sp-8 (64px), notch card-notch 14px, rule weight 2px -->
<rect class="b-pitch" x="480" y="0" width="480" height="300"></rect>
<rect class="b-pitch2" x="544" y="0" width="64" height="300"></rect><rect class="b-pitch2" x="672" y="0" width="64" height="300"></rect><rect class="b-pitch2" x="800" y="0" width="64" height="300"></rect><rect class="b-pitch2" x="928" y="0" width="32" height="300"></rect>
<rect class="b-lime" x="480" y="0" width="16" height="300"></rect>
<line class="chalk" x1="720" y1="0" x2="720" y2="300"></line>
<circle class="chalk" cx="720" cy="150" r="64"></circle><circle class="spot" cx="720" cy="150" r="5"></circle>
<rect class="chalk" x="880" y="70" width="96" height="160"></rect><circle class="spot" cx="904" cy="150" r="4"></circle>
<path class="b-gold" d="M560 216 H612 L626 230 V280 H574 L560 266 Z"></path>
<path class="b-legend" d="M636 236 H668 L682 250 V280 H650 L636 266 Z"></path>
<rect class="b-surface" x="480" y="0" width="480" height="24"></rect>
</svg>
<div class="nm"><h1>MFG</h1><p>Sân đêm — giao diện game bóng đá thẻ: vạch phấn, chanh, góc vát.</p></div>
</div></body></html>
`);

// ---------- README ----------
w('README.md', `# MFG — Sân đêm

Design system cho **MFG**, game bóng đá 7v7 trên trình duyệt: đá với máy + sưu tầm thẻ cầu thủ (gacha bằng **xu ảo**) + xếp đội hình. Vòng lặp 15 phút: **mở gói → xếp đội → đá trận → nhận xu → mở gói tiếp**. Mỗi màn phải chỉ rõ bước tiếp theo.

Nguồn: \`apps/web/src/styles/tokens.css\`, \`apps/web/src/components/card/*\`, \`apps/web/src/app/app.css\`, \`docs/DESIGN.md\` (repo my-football-game @ 6e3fde2). Code sẽ dựng bằng **React + Vite + CSS thuần dùng biến CSS** — không Tailwind, không thư viện UI. Tên token ở đây trùng tên biến CSS trong code (\`--c-accent\`, \`--sp-5\`…).

## Giọng điệu: "Sân đêm"

Sân bóng dưới đèn pha. Nền xanh đen như sân lúc tối, chữ trắng phấn như vạch kẻ sân, nút chính màu chanh. **Gọn và chắc, không bóng bẩy.** Cảm giác "game" thật — không giống trang quản trị — nhưng OVR, vị trí, độ hiếm, số xu phải nhìn là thấy.

**Chỉ có giao diện tối.** Màu độ hiếm và hào quang cần nền tối mới nổi.

## Nội dung & chữ

- **Tiếng Việt có dấu** cho mọi câu chữ. **Viết tắt tiếng Anh** cho vị trí và chỉ số (người chơi đã quen từ game thẻ): GK/DF/MF/FW · PAC/SHO/PAS/DRI/DEF/STA · thủ môn REF/HAN/POS/KIC. Tên đầy đủ tiếng Việt ở \`title\`, panel chi tiết, \`aria-label\`.
- Nút = động từ + đối tượng, in hoa: "MỞ GÓI 5 THẺ", "ĐÁ NGAY", "NHẬN". Không "OK", "Submit".
- Lỗi nói rõ chuyện gì + làm gì tiếp: "Tên đã có người dùng." / "Đợi vài giây rồi thử lại."
- Số: tách nghìn bằng dấu chấm (1.240), thập phân bằng dấu phẩy (9,5%), luôn \`tabular-nums\`.
- **Dữ liệu hư cấu**: tên cầu thủ nghe quen tai nhưng không phải người thật, không nhại tên (VD *Rafinho Duarte*, *Faberto Sarcello*, *Bjørvar Holmström*). Không logo CLB, không thương hiệu FIFA/EA/FC Online.
- **Xu là tiền ảo kiếm trong game.** Không có nạp tiền thật, nút mua bằng tiền thật hay giá tiền thật ở bất kỳ đâu.

## Nền tảng hình ảnh

### Màu
- Nền \`c-bg\` → panel \`c-surface-1\` → nổi \`c-surface-2\` → \`c-surface-3\`. Viền là **vạch phấn**: \`c-line\` (mờ), \`c-line-strong\` (rõ).
- Chữ \`c-text\` / \`c-text-muted\`; \`c-text-faint\` chỉ trên \`c-bg\`. Viền ô nhập, nút phụ, chip dùng \`c-line-control\` (≥ 3:1); \`c-line-strong\` chỉ để trang trí.
- **Chanh \`c-accent\` là màu hành động**: nút chính (một nút mỗi màn), mục đang bật, thanh lực sút. Chữ trên chanh luôn \`c-accent-ink\`.
- **Xu \`c-coin\`** chỉ cho xu. Trạng thái: \`c-danger\`, \`c-warning\`, \`c-success\`, \`c-info\`.
- Đội: nhà \`c-team-home\` xanh dương, khách \`c-team-away\` cam — luôn kèm ■ + chữ NHÀ/KHÁCH.
- **Tím (\`r-legend-base\`) chỉ dành cho Huyền thoại** (ngoại lệ duy nhất: thanh lực chọc khe trong HUD).

### Độ hiếm (mặt thẻ luôn tối, khung có màu)
| Độ hiếm | Khung | Ký hiệu | Kiểu khung |
|---|---|---|---|
| Đồng | \`r-bronze-base\` | ◆ | trơn |
| Bạc | \`r-silver-base\` | ◆◆ | sọc chéo mảnh |
| Vàng | \`r-gold-base\` | ◆◆◆ | khung đôi + vệt sáng lướt khi hover |
| Huyền thoại | \`r-legend-base\` | ◆◆◆◆ | foil conic (tím → \`r-legend-foil-2\` ngọc → \`r-legend-foil-3\` hồng → vàng), xoay chậm 6s |

Không bao giờ chỉ dựa vào màu: luôn có nhãn chữ + số hạt ◆ + kiểu khung.

### Vạch phấn — điểm nhận diện
Đường kẻ sân (vòng tròn giữa sân, vạch giữa, vòng cấm, chấm phạt đền) là **cấu trúc UI**: tiêu đề panel nối dài bằng vạch (\`panel__title::after\`), sân khấu mở thẻ là vòng tròn giữa sân, ô xếp đội đặt trên sân vẽ vạch, logo MFG là vòng tròn giữa sân, trạng thái trống là sân rỗng. Vạch dày 1–2px, \`c-line\`/\`c-line-strong\` trên nền, \`c-chalk\` trên cỏ.

### Hình khối
- **Góc vát** (trên-phải + dưới-trái) như mác áo đấu: thẻ cầu thủ (\`card-notch\` 14px), gói thẻ, chip độ hiếm, panel nhấn (\`panel-notch\`). **Tuyệt đối không dùng hình khiên** kiểu FUT/FIFA.
- Bo góc nhỏ, cứng: \`radius-sm\` 2 · \`radius-md\` 4 · \`radius-lg\` 8. Chip lọc và thanh tiến độ bo tròn.
- Bóng chỉ 2 mức: \`shadow-1\`, \`shadow-2\`.

### Chữ
- **Barlow Condensed 600/700** — số, OVR, tỉ số, tiêu đề, nhãn in hoa, giá xu (kiểu bảng tỉ số sân vận động).
- **Be Vietnam Pro 400/500/600** — văn bản, form, tên cầu thủ (thiết kế cho tiếng Việt, dấu không đè).
- Thang: 12 / 14 / 16 / 20 / 28 / 40 / 64. Văn bản tối thiểu 14px; 12px chỉ cho chữ in hoa giãn chữ (\`label\`) hoặc chú thích cạnh số.
- Bản chạy thật tự host qua \`@fontsource\`; prototype dùng Google Fonts.

### Khoảng cách & bố cục
Bước 4px: \`sp-1\`…\`sp-8\` = 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64. Thanh trên 56px, nội dung tối đa 1280px, lề \`sp-5\`. Màn trận tối thiểu 1280×720; màn menu dùng được từ 768px.

### Chuyển động
Chỉ để **dẫn mắt, báo trạng thái, giữ mạch không gian**. Chỉ animate \`transform\` và \`opacity\`.
| Token | Giá trị | Dùng cho |
|---|---|---|
| \`dur-instant\` | 80ms | nhấn nút |
| \`dur-fast\` | 160ms | hover, chip |
| \`dur-base\` | 240ms | chuyển màn, panel, OVR đội đếm |
| \`dur-slow\` | 400ms | modal, đếm xu |
| \`ease-out\` | cubic-bezier(.22,1,.36,1) | mặc định |
| \`ease-snap\` | cubic-bezier(.34,1.56,.64,1) | thẻ đáp xuống, ép thành công |
| \`stagger\` | 80ms | lưới/thẻ xuất hiện lần lượt |

**Khoảnh khắc chính:**
- **Lật thẻ** — Đồng 360ms nảy nhẹ · Bạc 440ms + vệt bạc 240ms · Vàng: nhấc + rung 450ms, lật 560ms, vòng sáng vàng + 12 hạt · Huyền thoại: màn tối dần, tia tím xoay sau thẻ, rung tăng 1300ms, lật 760ms, foil quét, 28 hạt, phóng to giữa màn rồi về chỗ (900ms). Thẻ Vàng+ phát sáng mặt sau **trước** khi lật.
- **Ép thành công** — thẻ nảy (\`ease-snap\`, scale 1 → 1.08 → 1, 520ms), vòng sáng chanh toả ra 600ms, chỉ số mới đếm lên.
- **Ép thất bại** — thẻ rung ngang 3 lần (±6px, 360ms), chữ "THẤT BẠI" đỏ, thanh may mắn tăng (sọc xu chạy thêm, 400ms), nguyên liệu mờ đi.
- **Bàn thắng** — chữ "VÀO!" chanh quét ngang màn 1.2s, bảng tỉ số nảy số mới.
- **Nhận xu** — "+60" đếm từ 0 trong 400ms, số xu ở thanh trên đếm theo, icon xu bay về ví (240ms, stagger 80ms).

**Giảm chuyển động** (\`prefers-reduced-motion\`): bỏ xoay, rung, hạt, foil chạy; chỉ còn fade ≤ 200ms. "Lật tất cả" và Esc luôn bỏ qua được animation. Animation lặp vô hạn dừng khi tab ẩn.

## Truy cập
- Tương phản chữ ≥ 4.5:1 (đã kiểm ở usage của từng token màu). Viền focus 2px \`c-focus\`, cách 2px, trên mọi thứ bấm được.
- Mọi thao tác dùng được bằng bàn phím (xếp đội: bấm ô → bấm thẻ). Thẻ úp là \`<button>\`; \`aria-live\` đọc kết quả lật.

## Không làm
Gradient tím-xanh làm nền, glassmorphism, blob trang trí, card lồng card, hero kiểu landing page, emoji làm icon, viền trái màu làm điểm nhấn thẻ nội dung, hình khiên thẻ.

## Iconography
Icon nét 1.6–2px, ô 16px, \`currentColor\`, góc vuông/tròn đơn giản (kính lúp, cảnh báo tam giác, ổ khoá, mũi tên, play). Không bộ icon ngoài. Avatar cầu thủ là **vector sinh từ \`avatarSeed\`** (dáng mặt, da, tóc, râu, áo theo màu độ hiếm) — không bao giờ là ảnh thật.

## Component
Xem các thẻ: Button, PlayerCard, RarityChip, PositionBadge, Coin, ProgressBar, BoxMeter, Tabs, TopBar, Input, Dialog, Toast, Banner, Skeleton, EmptyState, FormationSlot, Pack, HudScoreboard. CSS ở \`components/bundle.css\`, tên class kiểu BEM (\`card__ovr\`, \`btn--primary\`) để chép sang React.

## Not synced
- Font: tham chiếu Google Fonts (Barlow Condensed, Be Vietnam Pro), không chép file \`@fontsource\` vào đây.
- Không có \`bundle.js\`: preview là bản dựng tĩnh bằng \`bundle.css\` viết tay theo \`card.css\`/\`app.css\`/\`HoldButton.tsx\`; component React thật vẫn nằm trong repo.
- \`--r-legend-foil\` (conic-gradient) không phải màu đơn: ghi bằng 2 token điểm dừng + mô tả ở trên.
`);

const comps = fs.readdirSync(path.join(OUT, 'components')).filter((d) => fs.existsSync(path.join(OUT, 'components', d, 'preview.html')));
console.log('components:', comps.join(', '));
