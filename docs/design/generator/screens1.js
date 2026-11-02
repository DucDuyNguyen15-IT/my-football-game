const { stateCell, statesBoard, missions, L } = require('./boardlib');
const { card, cardBack, coin, rarityChip, pos, topbar, by, ICON, pitchSvg, pips, RARITY } = L;

// ---------- Đội hình của người chơi (dữ liệu hư cấu từ seed) ----------
const XI = {
  GK: by('silver', 'GK', 1), DF1: by('silver', 'DF', 0), DF2: by('bronze', 'DF', 0),
  MF1: by('silver', 'MF', 0), MF2: by('gold', 'MF', 0), MF3: by('bronze', 'MF', 0), FW: by('gold', 'FW', 0),
};
const XI_LIST = [XI.GK, XI.DF1, XI.DF2, XI.MF1, XI.MF2, XI.MF3, XI.FW];
const TEAM_OVR = Math.round(XI_LIST.reduce((s, c) => s + c.ovr, 0) / 7);

/** Sân góc camera truyền hình. Trả {svg, pt(u,v)}. */
function tvPitch(w, h, o = {}) {
  const y0 = o.y0 ?? h * 0.22, y1 = o.y1 ?? h * 1.02;
  const xf0 = o.xf0 ?? w * 0.17, xf1 = o.xf1 ?? w * 0.83, xn0 = o.xn0 ?? -w * 0.12, xn1 = o.xn1 ?? w * 1.12;
  const pt = (u, v) => { const vv = Math.pow(v, 0.9); const a = xf0 + (xn0 - xf0) * vv, b = xf1 + (xn1 - xf1) * vv; return [a + (b - a) * u, y0 + (y1 - y0) * vv]; };
  const poly = (ps) => ps.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ');
  const quad = (u0, u1, v0, v1) => poly([pt(u0, v0), pt(u1, v0), pt(u1, v1), pt(u0, v1)]);
  let s = `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" style="position: absolute; inset: 0">`;
  s += `<rect width="${w}" height="${h}" fill="${o.sky || '#06100c'}"></rect>`;
  s += `<polygon points="${poly([pt(-0.08, -0.12), pt(1.08, -0.12), pt(1.08, 1.1), pt(-0.08, 1.1)])}" fill="#164f2b"></polygon>`;
  for (let i = 0; i < 12; i++) s += `<polygon points="${quad(i / 12, (i + 1) / 12, 0, 1)}" fill="${i % 2 ? '#226f3c' : '#1d6436'}"></polygon>`;
  const line = 'fill="none" stroke="rgb(232 240 230 / 0.8)" stroke-width="2"';
  s += `<polygon points="${quad(0, 1, 0, 1)}" ${line}></polygon>`;
  s += `<polyline points="${poly([pt(0.5, 0), pt(0.5, 1)])}" ${line}></polyline>`;
  const circ = []; for (let i = 0; i <= 40; i++) { const t = (i / 40) * Math.PI * 2; circ.push(pt(0.5 + Math.cos(t) * 0.085, 0.5 + Math.sin(t) * 0.15)); }
  s += `<polyline points="${poly(circ)}" ${line}></polyline>`;
  s += `<polygon points="${quad(0, 0.15, 0.24, 0.76)}" ${line}></polygon><polygon points="${quad(0.85, 1, 0.24, 0.76)}" ${line}></polygon>`;
  s += `<polygon points="${quad(0, 0.05, 0.38, 0.62)}" ${line}></polygon><polygon points="${quad(0.95, 1, 0.38, 0.62)}" ${line}></polygon>`;
  const [cx, cy] = pt(0.5, 0.5); s += `<circle cx="${cx}" cy="${cy}" r="3" fill="rgb(232 240 230 / 0.85)"></circle>`;
  // khung thành
  const g = (u) => { const a = pt(u, 0.43), b = pt(u, 0.57); return `<polyline points="${a[0]},${a[1]} ${a[0]},${a[1] - 34} ${b[0]},${b[1] - 40} ${b[0]},${b[1]}" fill="none" stroke="#e8f0e6" stroke-width="3"></polyline>`; };
  s += g(0) + g(1);
  if (o.lights !== false) s += `<rect width="${w}" height="${h}" fill="url(#vign${w})"></rect><defs><radialGradient id="vign${w}" cx="50%" cy="45%" r="75%"><stop offset="60%" stop-color="#000" stop-opacity="0"></stop><stop offset="100%" stop-color="#000" stop-opacity="0.55"></stop></radialGradient></defs>`;
  for (const p of o.players || []) {
    const [x, y] = pt(p.u, p.v); const sc = 0.55 + p.v * 0.75; const col = p.team === 'h' ? '#3fa9f5' : p.team === 'a' ? '#ff7a45' : '#ffc23d';
    s += `<ellipse cx="${x}" cy="${y}" rx="${9 * sc}" ry="${3.5 * sc}" fill="rgb(0 0 0 / 0.35)"></ellipse><rect x="${x - 5 * sc}" y="${y - 30 * sc}" width="${10 * sc}" height="${22 * sc}" rx="${3 * sc}" fill="${col}"></rect><circle cx="${x}" cy="${y - 34 * sc}" r="${4.5 * sc}" fill="#c98e64"></circle><rect x="${x - 4 * sc}" y="${y - 9 * sc}" width="${3 * sc}" height="${9 * sc}" fill="#0a1310"></rect><rect x="${x + 1 * sc}" y="${y - 9 * sc}" width="${3 * sc}" height="${9 * sc}" fill="#0a1310"></rect>`;
    if (p.ctrl) s += `<polygon points="${x - 7},${y - 50 * sc} ${x + 7},${y - 50 * sc} ${x},${y - 41 * sc}" fill="#c8f031"></polygon>`;
  }
  if (o.ball) { const [x, y] = pt(o.ball.u, o.ball.v); s += `<circle cx="${x}" cy="${y - 4}" r="5" fill="#ffffff" stroke="#0a1310" stroke-width="1"></circle>`; }
  s += '</svg>';
  return { svg: s, pt };
}

const MATCH_PLAYERS = [
  { u: 0.04, v: 0.5, team: 'g' }, { u: 0.2, v: 0.32, team: 'h' }, { u: 0.22, v: 0.7, team: 'h' }, { u: 0.4, v: 0.25, team: 'h' }, { u: 0.43, v: 0.55, team: 'h' }, { u: 0.47, v: 0.82, team: 'h' }, { u: 0.62, v: 0.6, team: 'h', ctrl: true },
  { u: 0.96, v: 0.5, team: 'g' }, { u: 0.78, v: 0.38, team: 'a' }, { u: 0.8, v: 0.66, team: 'a' }, { u: 0.66, v: 0.3, team: 'a' }, { u: 0.6, v: 0.45, team: 'a' }, { u: 0.55, v: 0.75, team: 'a' }, { u: 0.35, v: 0.45, team: 'a' },
];

// =====================================================================
const B = {};

// 1. Intro
{
  const { svg } = tvPitch(1280, 720, { players: [], lights: true });
  const tower = (x, d) => `<g><rect x="${x - 3}" y="40" width="6" height="140" fill="#1b2a24"></rect><rect x="${x - 34}" y="20" width="68" height="26" fill="#22362e"></rect>${[0, 1, 2, 3].map((i) => `<circle cx="${x - 24 + i * 16}" cy="33" r="5" fill="#f4f8e8"></circle>`).join('')}<polygon points="${x - 34},44 ${x + 34},44 ${x + d * 420 + 260},720 ${x + d * 420 - 260},720" fill="rgb(244 248 232 / 0.06)"></polygon></g>`;
  B['Main.dc.html'] = { title: 'Intro / màn chờ', w: 1280, h: 720, interactive: true, body: `${svg}<svg width="1280" height="720" aria-hidden="true" style="position: absolute; inset: 0">${tower(120, 1)}${tower(1160, -1)}${tower(420, 0.6)}${tower(860, -0.6)}</svg>
<div style="position: absolute; inset: 0; background: radial-gradient(60% 50% at 50% 46%, rgb(10 19 16 / 0.2), rgb(10 19 16 / 0.82))"></div>
<a href="Auth.dc.html" style="position: absolute; inset: 0; display: grid; place-items: center; text-decoration: none" aria-label="Vào game">
<div style="display: flex; flex-direction: column; align-items: center; gap: 18px">
<div style="display: flex; align-items: center; gap: 28px"><span style="width: 104px; height: 104px; border: 6px solid var(--c-accent); border-radius: 50%; position: relative; display: block"><span style="position: absolute; left: 50%; top: -6px; bottom: -6px; width: 6px; margin-left: -3px; background: var(--c-accent)"></span><span style="position: absolute; left: 50%; top: 50%; width: 16px; height: 16px; margin: -8px; border-radius: 50%; background: var(--c-accent)"></span></span><span class="display" style="font-size: 168px; letter-spacing: 0.14em; line-height: 0.9; color: var(--c-text); text-shadow: 0 0 40px rgb(200 240 49 / 0.35)">MFG</span></div>
<span class="caps" style="font-size: 20px; letter-spacing: 0.42em; color: var(--c-accent)">Bóng đá thẻ · 7 người</span>
</div></a>
<p style="position: absolute; left: 0; right: 0; bottom: 40px; margin: 0; text-align: center; font-size: 14px; color: var(--c-text-muted)">Nhấn phím bất kỳ hoặc bấm để vào sân <span class="kbd" style="margin-left: 6px">Esc</span> bỏ qua</p>
<div class="motion-note" style="position: absolute; right: 24px; top: 24px; width: 300px; background: rgb(10 19 16 / 0.85)"><b>Chuyển động · 2,4s</b><br>1. Màn đen → 4 cột đèn pha bật lần lượt (opacity 0→1, 400ms, stagger 180ms) kèm tiếng "tách".<br>2. Vạch phấn hiện dần từ vòng giữa sân ra ngoài (mask quét 900ms).<br>3. Logo fade + scale .96→1 (900ms, ease-out), dòng phụ trễ 200ms.<br>Giảm chuyển động: fade 200ms. Bấm/phím bất kỳ: bỏ qua ngay.</div>` };
}

// 2. Auth
{
  const gift = `<div style="display: flex; align-items: flex-end; gap: 0">${[by('bronze', 'FW', 0), by('bronze', 'MF', 1), by('bronze', 'DF', 1)].map((c, i) => card(c, { size: 'sm', style: `transform: rotate(${(i - 1) * 7}deg) translateY(${i === 1 ? -8 : 0}px); margin-left: ${i ? -22 : 0}px` })).join('')}<div class="pack" style="width: 110px; margin-left: 18px"><div class="pack__count" style="font-size: 48px">5<small style="font-size: 11px">THẺ</small></div><div class="pack__stripes" style="height: 8px"><i style="background: var(--r-bronze-base)"></i><i style="background: var(--r-silver-base)"></i><i style="background: var(--r-gold-base)"></i><i style="background: var(--r-legend-base)"></i></div></div></div>`;
  const { svg } = tvPitch(760, 720, { y0: 300, players: [] });
  B['Auth.dc.html'] = {
    title: 'Đăng nhập / Đăng ký', w: 1280, h: 720, interactive: true,
    body: `<div style="position: absolute; left: 0; top: 0; width: 760px; height: 720px; overflow: hidden">${svg}<div style="position: absolute; inset: 0; background: linear-gradient(180deg, rgb(10 19 16 / 0.2), rgb(10 19 16 / 0.92) 85%)"></div>
<div style="position: absolute; left: 56px; top: 48px"><span class="logo" style="font-size: 32px"><span class="logo__mark"></span>MFG</span></div>
<div style="position: absolute; left: 56px; bottom: 56px; right: 56px; display: flex; flex-direction: column; gap: 20px">
<h1 class="display" style="margin: 0; font-size: 64px; text-transform: uppercase; line-height: .95">Mở gói. Xếp đội.<br><span style="color: var(--c-accent)">Ra sân.</span></h1>
<div style="display: flex; align-items: center; gap: 28px">${gift}<div style="display: flex; flex-direction: column; gap: 6px; max-width: 260px"><span class="label" style="color: var(--c-accent)">Quà tân thủ</span><span style="font-size: 20px; font-weight: 600; line-height: 1.3">11 thẻ Đồng + 1 gói 5 thẻ miễn phí</span><span class="muted" style="font-size: 14px">Nhận ngay khi tạo tài khoản. Đội hình được xếp sẵn.</span></div></div>
</div></div>
<div style="position: absolute; left: 760px; top: 0; right: 0; bottom: 0; display: grid; place-items: center; background: var(--c-surface-1); border-left: 1px solid var(--c-line)">
<div style="width: 380px; display: flex; flex-direction: column; gap: 22px">
<div class="tabs" role="tablist"><button class="{{loginCls}}" role="tab" onClick="{{toLogin}}">Đăng nhập</button><button class="{{regCls}}" role="tab" onClick="{{toReg}}">Đăng ký</button></div>
<sc-if value="{{isLogin}}" hint-placeholder-val="{{ true }}">
<form style="display: flex; flex-direction: column; gap: 16px">
<label class="field"><span class="field__label">Tên đăng nhập</span><input class="input" value="duyfc" autocomplete="username"></label>
<label class="field"><span class="field__label">Mật khẩu</span><span class="field__box"><input class="input" type="password" value="sanbong123" autocomplete="current-password"><button class="field__btn" type="button" aria-pressed="false">${ICON.eye}</button></span></label>
<a class="btn btn--primary btn--lg btn--block" href="Home.dc.html">Đăng nhập</a>
</form>
</sc-if>
<sc-if value="{{isReg}}" hint-placeholder-val="{{ false }}">
<form style="display: flex; flex-direction: column; gap: 16px">
<label class="field"><span class="field__label">Tên đăng nhập</span><input class="input" placeholder="3–20 ký tự, chữ, số, dấu chấm"><span class="field__hint">Đây cũng là tên người chơi hiện trong trận.</span></label>
<label class="field"><span class="field__label">Mật khẩu</span><span class="field__box"><input class="input" type="password" placeholder="Ít nhất 8 ký tự"><button class="field__btn" type="button" aria-pressed="false">${ICON.eye}</button></span></label>
<label class="field"><span class="field__label">Email <small>(không bắt buộc — để lấy lại mật khẩu)</small></span><input class="input" type="email" placeholder="ban@vidu.vn"></label>
<a class="btn btn--primary btn--lg btn--block" href="Onboarding.dc.html">Tạo tài khoản &amp; nhận quà</a>
</form>
</sc-if>
<div style="display: flex; align-items: center; gap: 12px; color: var(--c-text-muted); font-size: 12px"><span style="flex: 1; border-top: 1px solid var(--c-line)"></span>HOẶC<span style="flex: 1; border-top: 1px solid var(--c-line)"></span></div>
<a class="btn btn--secondary btn--lg btn--block" href="Auth-States.dc.html" style="text-transform: none; font-family: var(--font-body); font-weight: 600; font-size: 16px; letter-spacing: 0">${ICON.google}Đăng nhập bằng Google</a>
<p class="muted" style="margin: 0; font-size: 12px; text-align: center">Không có giao dịch tiền thật. Xu chỉ kiếm được khi chơi.</p>
</div></div>`,
    logic: `constructor(props) {
    super(props);
    this.state = { tab: 'login' };
  }
  renderVals() {
    const t = this.state.tab;
    return {
      isLogin: t === 'login', isReg: t === 'reg',
      loginCls: t === 'login' ? 'tab is-on' : 'tab', regCls: t === 'reg' ? 'tab is-on' : 'tab',
      toLogin: () => this.setState({ tab: 'login' }), toReg: () => this.setState({ tab: 'reg' }),
    };
  }`,
  };

  B['Auth-States.dc.html'] = statesBoard('Đăng nhập — các trạng thái', 3, [
    stateCell('Đăng ký · lỗi theo ô', `<div class="tabs"><span class="tab">Đăng nhập</span><span class="tab is-on">Đăng ký</span></div>
<label class="field"><span class="field__label">Tên đăng nhập</span><input class="input is-error" value="duyfc" aria-invalid="true"><span class="field__error">${ICON.warn} Tên đã có người dùng. Thử "duyfc.07"?</span></label>
<label class="field"><span class="field__label">Mật khẩu</span><span class="field__box"><input class="input is-error" type="text" value="abc123" aria-invalid="true"><button class="field__btn" type="button" aria-pressed="true">Ẩn</button></span><span class="field__error">${ICON.warn} Cần ít nhất 8 ký tự.</span></label>
<label class="field"><span class="field__label">Email <small>(không bắt buộc)</small></span><input class="input is-error" value="duy@gmail" aria-invalid="true"><span class="field__error">${ICON.warn} Email chưa đúng định dạng.</span></label>
<button class="btn btn--primary btn--block">Tạo tài khoản &amp; nhận quà</button>`),
    stateCell('Sai mật khẩu · khoá 15 phút · quá nhanh', `<div class="tabs"><span class="tab is-on">Đăng nhập</span><span class="tab">Đăng ký</span></div>
<p class="field__error" style="padding: 10px 12px; background: rgb(255 90 78 / 0.08); border-radius: 4px">${ICON.warn} Sai tên đăng nhập hoặc mật khẩu. Còn 2 lần thử.</p>
<div class="banner banner--danger">${ICON.lock}<span><b>Tạm khoá đăng nhập 15 phút</b> sau 5 lần sai. Thử lại sau <b class="num">14:32</b>.</span></div>
<label class="field"><span class="field__label">Mật khẩu</span><input class="input" type="password" value="••••••••" disabled style="opacity: .5"></label>
<button class="btn btn--primary btn--block" disabled>Đăng nhập</button>
<div class="toast toast--error" role="alert" style="width: auto"><span class="toast__icon">!</span><div><b>Thao tác quá nhanh</b><span>Đợi vài giây rồi thử lại.</span></div></div>`),
    stateCell('Google lần đầu · chọn tên người chơi', `<span class="label" style="color: var(--c-accent)">Bước 2/2</span><h3 class="h2">Chọn tên người chơi</h3><p class="muted" style="margin: 0; font-size: 14px">Đã liên kết tài khoản Google. Tên này hiện trên bảng tỉ số và đổi được 1 lần.</p>
<label class="field"><span class="field__label">Tên người chơi</span><input class="input is-focus" value="SanDem.07"><span class="field__hint" style="color: var(--c-success); display: flex; gap: 6px">${ICON.check} Tên dùng được</span></label>
<div style="display: flex; flex-wrap: wrap; gap: 8px"><span class="label" style="width: 100%">Gợi ý</span><button class="chip is-on">SanDem.07</button><button class="chip">TienDao99</button><button class="chip">duy.fc</button><button class="chip">Bóng Đêm</button></div>
<div style="margin-top: auto; display: flex; flex-direction: column; gap: 8px"><a class="btn btn--primary btn--lg btn--block" href="Onboarding.dc.html">Vào sân &amp; nhận quà</a><span class="muted" style="font-size: 12px; text-align: center">11 thẻ Đồng + gói 5 thẻ miễn phí đang chờ</span></div>`),
  ]);
}

// 3. Home
const formationDots = (w, h) => {
  const P = [[0.5, 0.9, 'GK', XI.GK], [0.3, 0.7, 'DF', XI.DF1], [0.7, 0.7, 'DF', XI.DF2], [0.2, 0.46, 'MF', XI.MF1], [0.5, 0.5, 'MF', XI.MF2], [0.8, 0.46, 'MF', XI.MF3], [0.5, 0.2, 'FW', XI.FW]];
  return P.map(([x, y, p, c]) => `<div style="position: absolute; left: ${x * w - 22}px; top: ${y * h - 22}px; width: 44px; display: flex; flex-direction: column; align-items: center; gap: 2px"><span class="num" style="width: 34px; height: 34px; border-radius: 50%; display: grid; place-items: center; background: var(--c-team-home); color: #04121c; font-family: var(--font-display); font-weight: 700; font-size: 16px; box-shadow: 0 0 0 3px rgb(10 19 16 / 0.6)">${c.ovr}</span><span style="font-family: var(--font-display); font-weight: 700; font-size: 11px; letter-spacing: .1em; background: rgb(10 19 16 / .75); padding: 0 4px">${p}</span></div>`).join('');
};
function homeBody(o = {}) {
  const narrow = o.narrow;
  const hero = `<div class="panel--notch" style="${narrow ? '' : 'flex: 1; min-height: 0'}"><div class="panel__in night-bg" style="display: flex; gap: 24px; padding: 32px; position: relative; overflow: hidden">
<div style="flex: 1; display: flex; flex-direction: column; gap: 16px; justify-content: center; min-width: 0">
<span class="label">Trận tiếp theo · 7 đấu 7</span>
<h1 class="display" style="margin: 0; font-size: 64px; text-transform: uppercase; line-height: .92">Đá với máy</h1>
<p class="muted" style="margin: 0; font-size: 16px; max-width: 380px">2 hiệp × 3 phút. Chọn <b style="color: var(--c-text)">Dễ</b> hoặc <b style="color: var(--c-text)">Khó</b> ở bước sau — thắng Khó được gấp đôi xu.</p>
<div style="display: flex; flex-direction: column; gap: 8px; max-width: 360px"><div style="display: flex; justify-content: space-between; font-size: 14px"><span>${o.noReward ? '<span style="color: var(--c-warning)">Không còn trận có thưởng hôm nay</span>' : 'Trận có thưởng hôm nay'}</span><span class="num display" style="font-size: 20px">${o.noReward ? '15' : '3'}<span class="muted">/15</span></span></div><div class="bar bar--segmented" style="height: 8px">${Array.from({ length: 15 }, (_, i) => `<i class="${i < (o.noReward ? 15 : 3) ? 'on' : ''}"${o.noReward ? ' style="background: var(--c-warning)"' : ''}></i>`).join('')}</div></div>
<div style="display: flex; align-items: center; gap: 20px; margin-top: 8px"><a class="btn btn--primary btn--xl" href="PreMatch.dc.html">${ICON.play}Đá ngay</a><span class="muted" style="font-size: 14px; line-height: 1.4">Thắng: ${coin('60', 'coin--sm')} Dễ<br>${coin('120', 'coin--sm')} Khó</span></div>
</div>
${narrow ? '' : `<div style="position: relative; width: 236px; height: 330px; flex: none; align-self: center">${pitchSvg(236, 330, { grassOpacity: 0.55 })}${formationDots(236, 330)}</div>`}
</div></div>`;
  const team = `<section class="panel" style="padding: 20px 24px"><h3 class="panel__title">Đội của bạn <span class="meta">2-3-1 · OVR TB <b class="num" style="color: var(--c-text)">${TEAM_OVR}</b></span><a class="btn btn--ghost btn--sm" href="Squad.dc.html" style="order: 3">Sửa đội hình</a></h3><div style="display: flex; gap: 10px; ${narrow ? 'flex-wrap: wrap' : ''}">${XI_LIST.map((c) => card(c, { size: 'xs' })).join('')}</div></section>`;
  const mission = `<section class="panel" style="padding: 20px 24px; display: flex; flex-direction: column"><h3 class="panel__title" style="margin-bottom: 4px">Nhiệm vụ ngày <span class="meta num">Làm mới sau 06:12:40</span></h3>${missions()}<p class="muted" style="margin: 12px 0 0; font-size: 12px">3 nhiệm vụ mỗi ngày · reset lúc 00:00</p></section>`;
  const tile = (label, big, sub, href, accent) => `<a href="${href}" class="panel" style="display: flex; flex-direction: column; gap: 4px; text-decoration: none; padding: 16px 20px; ${accent ? 'border-color: var(--c-accent); background: linear-gradient(90deg, rgb(200 240 49 / 0.08), transparent)' : ''}"><span class="label" style="${accent ? 'color: var(--c-accent)' : ''}">${label}</span><span class="display" style="font-size: 22px; text-transform: uppercase">${big}</span><span class="muted" style="font-size: 14px">${sub}</span></a>`;
  const tiles = [tile('Quà tân thủ', '1 gói 5 thẻ miễn phí', 'Mở ngay ở Cửa hàng →', 'Shop.dc.html', true), tile('Hộp thẻ của bạn', '95/100 phiếu', 'Còn 2 Huyền thoại · 9 Vàng', 'Shop.dc.html'), tile('Kho thẻ', '23 thẻ · 2 mới', 'Xem thẻ vừa nhận →', 'Collection.dc.html')];
  if (narrow) return `${topbar('home', { compact: true })}<div style="padding: 20px; display: flex; flex-direction: column; gap: 20px">${hero}${team}${mission}<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px">${tiles.join('')}</div></div>`;
  return `${topbar('home')}<div style="height: 664px; padding: 20px 24px 24px; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 20px">
<div style="display: flex; flex-direction: column; gap: 20px; min-height: 0">${hero}${team}</div>
<div style="display: flex; flex-direction: column; gap: 14px; min-height: 0">${mission}${tiles[0]}${tiles[1]}</div></div>`;
}
B['Home.dc.html'] = { title: 'Trang chủ', w: 1280, h: 720, interactive: true, body: homeBody() };
B['Home-768.dc.html'] = { title: 'Trang chủ · 768px', w: 768, h: 1260, interactive: true, body: homeBody({ narrow: true }) };
B['Home-States.dc.html'] = statesBoard('Trang chủ — các trạng thái', 3, [
  stateCell('Đang tải', `<div class="skel skel--line" style="width: 40%"></div><div class="skel" style="height: 56px; width: 70%"></div><div class="skel skel--line" style="width: 85%"></div><div class="skel" style="height: 64px; width: 220px"></div><div style="display: flex; gap: 8px; margin-top: auto">${Array.from({ length: 5 }, () => '<div class="skel skel--card" style="--card-w: 56px"></div>').join('')}</div><span class="sr-only" role="status">Đang tải trang chủ</span>`),
  stateCell('Hết 15 trận có thưởng', `<span class="label">Trận tiếp theo</span><h3 class="display" style="margin: 0; font-size: 44px; text-transform: uppercase">Đá với máy</h3><div class="banner"><span>${ICON.warn}</span><span><b>Không còn thưởng hôm nay.</b> Vẫn đá được để luyện tập; nhiệm vụ vẫn tính. Làm mới lúc 00:00.</span></div><div class="bar bar--segmented" style="height: 8px">${Array.from({ length: 15 }, () => '<i class="on" style="background: var(--c-warning)"></i>').join('')}</div><a class="btn btn--primary btn--lg" href="PreMatch.dc.html" style="align-self: flex-start">${ICON.play}Đá luyện tập</a>`),
  stateCell('Lỗi tải / nhiệm vụ đã nhận', `<div class="empty" style="padding: 12px 0"><svg class="empty__art" viewBox="0 0 120 72" fill="none" stroke="#ff5a4e" stroke-width="1.6" aria-hidden="true"><rect x="2" y="2" width="116" height="68"></rect><line x1="60" y1="2" x2="60" y2="70"></line><circle cx="60" cy="36" r="13"></circle></svg><h3 class="empty__title" style="font-size: 22px">Không tải được nhiệm vụ</h3><p class="empty__body">Mất kết nối tới máy chủ. Tiến độ vẫn được lưu.</p><button class="btn btn--secondary">Thử lại</button></div><div style="border-top: 1px solid var(--c-line); padding-top: 6px">${missions({ claimed: true })}</div>`),
], 720);

// 4. Shop
const meterRows = (rows) => rows.map(([r, n, t, p]) => `<div class="meter r-${r}${n === 0 ? ' is-empty' : ''}"><span class="meter__name"><span class="rarity__pips" aria-hidden="true">${pips(r)}</span>${RARITY[r][0]}</span><div class="bar bar--rarity" style="--v: ${(n / t) * 100}%"><div class="bar__fill"></div></div><span class="meter__count">${n}</span><span class="meter__pct">${p}%</span></div>`).join('');
const BOX = [['legend', 2, 2, '2,1'], ['gold', 9, 10, '9,5'], ['silver', 28, 30, '29,5'], ['bronze', 56, 58, '58,9']];
const packArt = (n, sub = 'THẺ', wpx = 150, hot) => `<div class="pack" style="width: ${wpx}px; flex: none${hot ? '; outline: 2px solid var(--c-accent); outline-offset: 4px' : ''}"><div class="pack__count" style="font-size: ${wpx * 0.42}px">${n}<small style="font-size: ${Math.max(10, wpx * 0.08)}px">${sub}</small></div><div class="pack__stripes" style="height: ${wpx * 0.07}px"><i style="background: var(--r-bronze-base)"></i><i style="background: var(--r-silver-base)"></i><i style="background: var(--r-gold-base)"></i><i style="background: var(--r-legend-base)"></i></div></div>`;
const offer = (o) => `<section class="panel" style="display: flex; gap: 20px; align-items: center; padding: 20px">${packArt(o.n, 'THẺ', 132)}<div style="flex: 1; display: flex; flex-direction: column; gap: 8px; min-width: 0"><div style="display: flex; gap: 8px; align-items: center"><h3 class="h2">Gói ${o.n} thẻ</h3>${o.tag || ''}</div><p class="muted" style="margin: 0; font-size: 14px">${o.desc}</p>${o.warn || ''}<div style="display: flex; align-items: center; gap: 12px; margin-top: 6px">${o.btn}</div></div></section>`;
function shopBody(o = {}) {
  const coins = o.coins ?? '1.240';
  const b1 = o.poor ? `<button class="btn btn--coin" disabled>${coin('100', 'coin--sm').replace('class="coin coin--sm"', 'class="coin coin--sm" style="color: inherit"')}</button><span class="field__error">Thiếu 20 xu</span>` : `<a class="btn btn--coin" href="PackOpening.dc.html">Mua · 100 xu</a>`;
  const b5 = o.poor ? `<button class="btn btn--coin" disabled>Mua · 450 xu</button><span class="field__error">Thiếu 370 xu</span>` : o.buying ? `<button class="btn btn--coin is-loading" aria-busy="true"><span class="btn__label">Mua · 450 xu</span></button><span class="muted" style="font-size: 14px">Đang bốc phiếu…</span>` : `<a class="btn btn--coin" href="PackOpening.dc.html">Mua · 450 xu</a>`;
  return `${topbar('shop', { coins })}<div style="height: 664px; padding: 20px 24px 24px; box-sizing: border-box; display: flex; flex-direction: column; gap: 18px">
<div style="display: flex; align-items: baseline; gap: 16px"><h1 class="h1">Cửa hàng</h1><span class="muted" style="font-size: 14px">Mua bằng xu kiếm trong trận và nhiệm vụ. Không có nạp tiền thật.</span></div>
<div style="flex: 1; min-height: 0; display: grid; grid-template-columns: 440px minmax(0, 1fr); gap: 24px">
<section class="panel" style="display: flex; flex-direction: column; gap: 14px"><h3 class="panel__title" style="margin: 0">Hộp thẻ của bạn <span class="meta num">còn ${o.box ? o.boxLeft : '95'}/100 phiếu</span></h3>
<p class="muted" style="margin: 0; font-size: 14px">Hộp riêng 100 phiếu: <b style="color: var(--c-text)">2 Huyền thoại · 10 Vàng · 30 Bạc · 58 Đồng</b>. Bốc phiếu nào, phiếu đó ra khỏi hộp — tỉ lệ đổi sau mỗi lần mở.</p>
${o.bronzeOnly ? `<div class="banner">${ICON.warn}<span><b>Hộp chỉ còn thẻ Đồng.</b> Gói 5 không còn bảo đảm Bạc.</span></div>` : ''}
<div style="display: flex; justify-content: space-between" class="label"><span>Độ hiếm</span><span>Còn · Tỉ lệ lần bốc kế tiếp</span></div>
<div>${meterRows(o.box || BOX)}</div>
<div style="margin-top: auto; display: flex; flex-direction: column; gap: 10px; padding-top: 14px; border-top: 1px solid var(--c-line)"><span class="label">5 lần bốc gần nhất</span><div style="display: flex; gap: 6px">${['bronze', 'silver', 'bronze', 'bronze', 'gold'].map(rarityChip).join('')}</div><button class="btn btn--secondary btn--sm" disabled style="align-self: flex-start">Làm mới hộp · khi hết phiếu</button></div>
</section>
<div style="display: flex; flex-direction: column; gap: 16px; min-width: 0">
${o.poor ? '' : `<section class="panel--notch"><div class="panel__in" style="display: flex; align-items: center; gap: 24px; background: linear-gradient(90deg, rgb(200 240 49 / 0.1), var(--c-surface-1) 60%)">${packArt('5', 'MIỄN PHÍ', 104, true)}<div style="flex: 1; display: flex; flex-direction: column; gap: 6px"><span class="label" style="color: var(--c-accent)">Quà tân thủ · còn 1 gói</span><h3 class="h2">Gói 5 thẻ miễn phí</h3><p class="muted" style="margin: 0; font-size: 14px">Bốc từ chính hộp của bạn, vẫn bảo đảm ≥ 1 thẻ Bạc.</p></div><a class="btn btn--primary btn--lg" href="PackOpening.dc.html">Mở miễn phí</a></div></section>`}
${offer({ n: 5, tag: '<span class="tag tag--accent">Rẻ 10%</span>', desc: 'Bốc 5 phiếu. <b style="color: var(--c-text)">Bảo đảm ít nhất 1 thẻ Bạc trở lên</b> nếu hộp còn phiếu Bạc+.', btn: b5, warn: o.bronzeOnly ? `<span class="tag tag--warn" style="align-self: flex-start">${ICON.warn} Lần này không bảo đảm Bạc</span>` : '' })}
${offer({ n: 1, desc: 'Bốc 1 phiếu từ hộp. Hợp khi cần thêm một thẻ để ép.', btn: b1 })}
</div></div></div>`;
}
B['Shop.dc.html'] = { title: 'Cửa hàng', w: 1280, h: 720, interactive: true, body: shopBody() };
B['Shop-States.dc.html'] = { title: 'Cửa hàng — không đủ xu + hộp chỉ còn Đồng', w: 1280, h: 720, body: shopBody({ coins: '80', poor: true, bronzeOnly: true, boxLeft: 5, box: [['legend', 0, 2, '0,0'], ['gold', 0, 10, '0,0'], ['silver', 0, 30, '0,0'], ['bronze', 5, 58, '100']] }) };
B['Shop-States2.dc.html'] = statesBoard('Cửa hàng — tải, đang mua, hộp hết', 3, [
  stateCell('Đang tải', `<div class="skel skel--line" style="width: 50%"></div>${Array.from({ length: 4 }, () => '<div style="display: grid; grid-template-columns: 80px 1fr 40px; gap: 10px"><div class="skel skel--line"></div><div class="skel skel--line"></div><div class="skel skel--line"></div></div>').join('')}<div style="display: flex; gap: 14px; margin-top: 12px"><div class="skel" style="width: 110px; height: 146px"></div><div style="flex: 1; display: grid; gap: 8px; align-content: start"><div class="skel skel--line" style="width: 60%"></div><div class="skel skel--line"></div><div class="skel" style="height: 40px; width: 140px"></div></div></div>`),
  stateCell('Đang mua (chờ server)', `${offer({ n: 5, tag: '<span class="tag tag--accent">Rẻ 10%</span>', desc: 'Bảo đảm ≥ 1 thẻ Bạc trở lên.', btn: '<button class="btn btn--coin is-loading" aria-busy="true"><span class="btn__label">Mua · 450 xu</span></button>' }).replace('class="panel"', 'class="panel panel--raised"')}<p class="muted" style="margin: 0; font-size: 14px">Nút khoá + spinner, không đổi kích thước. Gửi lại dùng cùng Idempotency-Key, nên bấm 2 lần không bị trừ xu 2 lần. Có kết quả → sang màn mở gói.</p><div class="toast toast--error" role="alert" style="width: auto"><span class="toast__icon">!</span><div><b>Chưa mua được</b><span>Mất kết nối. Xu chưa bị trừ — thử lại.</span></div></div>`),
  stateCell('Hộp hết phiếu', `${meterRows([['legend', 0, 2, '0,0'], ['gold', 0, 10, '0,0'], ['silver', 0, 30, '0,0'], ['bronze', 0, 58, '0,0']])}<div class="empty" style="padding: 8px 0"><h3 class="empty__title" style="font-size: 22px">Đã bốc hết 100 phiếu</h3><p class="empty__body">Làm mới để có hộp mới: 2 Huyền thoại · 10 Vàng · 30 Bạc · 58 Đồng.</p><button class="btn btn--primary">Làm mới hộp</button></div>`),
]);

// 5. Pack opening (interactive)
const PACK = [
  { c: by('bronze', 'DF', 2), flag: 'MỚI' },
  { c: by('silver', 'MF', 1), flag: 'MỚI' },
  { c: by('bronze', 'FW', 0), flag: 'TRÙNG' },
  { c: by('gold', 'FW', 1), flag: 'MỚI', hot: 'gold' },
  { c: by('bronze', 'GK', 2), flag: 'TRÙNG' },
];
{
  const slots = PACK.map((p, i) => `<div class="po-slot${p.hot ? ' po-slot--gold' : ''}" style="position: relative; display: flex; flex-direction: column; align-items: center; gap: 10px">
<sc-if value="{{f${i}}}" hint-placeholder-val="{{ ${i < 2} }}"><div class="po-front${p.hot ? ' po-front--gold' : ''}">${card(p.c, { size: 'lg', flag: p.flag, style: '--card-w: 196px' })}</div>${p.flag === 'TRÙNG' ? `<span class="tag">Trùng · bán nhanh ${coin('10', 'coin--sm')}</span>` : `<span class="tag tag--accent">Mới</span>`}</sc-if>
<sc-if value="{{b${i}}}" hint-placeholder-val="{{ ${i >= 2} }}"><button class="po-back" onClick="{{flip${i}}}" aria-label="Lật thẻ ${i + 1}" style="padding: 0; border: 0; background: none; cursor: pointer">${cardBack({ size: 'lg', hot: p.hot }).replace('class="card card--lg', 'style="--card-w: 196px" class="card card--lg')}</button><span class="label">${p.hot ? '<span style="color: var(--r-gold-hi)">Sáng vàng…</span>' : 'Thẻ ' + (i + 1)}</span></sc-if>
</div>`).join('');
  const style = `.po-front{animation: po-flip 440ms cubic-bezier(.34,1.56,.64,1) both}
.po-front--gold{animation-duration: 560ms; animation-delay: 0ms; position: relative}
.po-front--gold::before{content:'';position:absolute;left:50%;top:50%;width:300px;height:300px;margin:-150px;border-radius:50%;background:radial-gradient(circle, rgb(255 205 70 / .55), transparent 65%);animation: po-burst 900ms ease-out both;pointer-events:none}
.po-back .card{transition: transform 160ms cubic-bezier(.22,1,.36,1)}
.po-back:hover .card{transform: translateY(-6px)}
.po-slot--gold .po-back .card{animation: po-tremble 1.2s ease-in-out infinite}
@keyframes po-flip{from{transform: perspective(900px) rotateY(90deg) scale(.96);opacity:.3}to{transform:none;opacity:1}}
@keyframes po-burst{from{transform: scale(.3);opacity:1}to{transform: scale(1.4);opacity:0}}
@keyframes po-tremble{0%,100%{transform:translateY(-4px) rotate(0)}25%{transform:translateY(-6px) rotate(-.6deg)}75%{transform:translateY(-6px) rotate(.6deg)}}
@media (prefers-reduced-motion: reduce){.po-front,.po-front--gold::before,.po-slot--gold .po-back .card{animation: po-fade 200ms linear both}@keyframes po-fade{from{opacity:0}to{opacity:1}}}`;
  B['PackOpening.dc.html'] = {
    title: 'Mở gói thẻ', w: 1280, h: 720, interactive: true, style,
    body: `<header class="topbar"><a class="btn btn--ghost btn--sm" href="Shop.dc.html">${ICON.back}Cửa hàng</a><span class="h3" style="position: absolute; left: 50%; transform: translateX(-50%)">Gói 5 thẻ <span class="muted" style="font-family: var(--font-body); font-weight: 500; font-size: 14px; text-transform: none; letter-spacing: 0">· quà tân thủ</span></span><div class="topbar__right"><span class="wallet">${coin('1.240', 'coin--sm')}</span></div></header>
<div style="position: absolute; left: 0; right: 0; top: 56px; bottom: 0; background: radial-gradient(70% 60% at 50% 45%, #10241b, var(--c-bg) 75%)">
<svg width="1280" height="664" aria-hidden="true" style="position: absolute; inset: 0"><line x1="0" y1="290" x2="1280" y2="290" stroke="rgb(232 240 230 / .14)" stroke-width="2"></line><ellipse cx="640" cy="290" rx="560" ry="250" fill="none" stroke="rgb(232 240 230 / .2)" stroke-width="2"></ellipse><circle cx="640" cy="290" r="5" fill="rgb(232 240 230 / .3)"></circle></svg>
<div style="position: absolute; left: 0; right: 0; top: 70px; display: flex; justify-content: center; gap: 22px">${slots}</div>
<div style="position: absolute; left: 0; right: 0; top: 452px; display: flex; flex-direction: column; align-items: center; gap: 12px">
<p aria-live="polite" class="sr-only">{{live}}</p>
<sc-if value="{{notDone}}" hint-placeholder-val="{{ true }}"><div style="display: flex; align-items: center; gap: 20px"><span class="muted" style="font-size: 14px">Bấm thẻ hoặc <span class="kbd">Space</span> để lật · <span class="kbd">Esc</span> bỏ qua hiệu ứng</span><button class="btn btn--secondary" onClick="{{flipAll}}">Lật tất cả</button></div></sc-if>
<sc-if value="{{done}}" hint-placeholder-val="{{ false }}"><div style="display: flex; flex-direction: column; align-items: center; gap: 12px"><span class="h3">Đã nhận 5 thẻ <span class="muted" style="font-family: var(--font-body); font-size: 14px; font-weight: 500; text-transform: none; letter-spacing: 0">· 3 mới · 2 trùng (bán nhanh tất cả: ${coin('20', 'coin--sm')})</span></span><div style="display: flex; gap: 12px"><a class="btn btn--primary btn--lg" href="Squad.dc.html">Xếp đội</a><button class="btn btn--coin btn--lg" onClick="{{reset}}">Mở tiếp · 450 xu</button><a class="btn btn--secondary btn--lg" href="Collection.dc.html">Về kho</a></div></div></sc-if>
</div>
<div style="position: absolute; left: 24px; right: 24px; bottom: 18px; display: flex; align-items: center; gap: 28px; padding: 12px 18px; border-top: 1px solid var(--c-line)"><span class="label">Hộp còn 90/100</span>${[['legend', 2, '2,2'], ['gold', 8, '8,9'], ['silver', 27, '30,0'], ['bronze', 53, '58,9']].map(([r, n, p]) => `<span class="r-${r}" style="display: inline-flex; gap: 8px; align-items: baseline; font-size: 14px"><b style="color: var(--hi)">${pips(r)} ${RARITY[r][0]}</b><span class="display num" style="font-size: 20px">${n}</span><span class="muted num">${p}%</span></span>`).join('')}<a href="Shop.dc.html" class="muted" style="margin-left: auto; font-size: 14px">Chi tiết hộp</a></div>
</div>`,
    logic: `constructor(props) {
    super(props);
    this.state = { f: [true, true, false, false, false] };
  }
  renderVals() {
    const f = this.state.f;
    const names = ${JSON.stringify(PACK.map((p) => `${RARITY[p.c.rarity][0]}, ${p.c.name}, ${p.c.position}, OVR ${p.c.ovr}`))};
    const flip = (i) => () => { const n = f.slice(); n[i] = true; this.setState({ f: n }); };
    const last = f.lastIndexOf(true);
    const v = { done: f.every(Boolean), notDone: !f.every(Boolean), live: last >= 0 ? 'Thẻ ' + (last + 1) + ': ' + names[last] : '' };
    for (let i = 0; i < 5; i++) { v['f' + i] = f[i]; v['b' + i] = !f[i]; v['flip' + i] = flip(i); }
    v.flipAll = () => this.setState({ f: [true, true, true, true, true] });
    v.reset = () => this.setState({ f: [false, false, false, false, false] });
    return v;
  }`,
  };
}

// 5b. Legend reveal moment
{
  const lg = by('legend', 'FW', 2);
  const parts = Array.from({ length: 28 }, (_, i) => { const a = (i / 28) * Math.PI * 2; const r = 210 + (i % 4) * 34; const cols = ['#9b6bff', '#46e0d0', '#ff6bd5', '#ffe48a']; return `<circle cx="${640 + Math.cos(a) * r}" cy="${330 + Math.sin(a) * r * 0.8}" r="${2 + (i % 3)}" fill="${cols[i % 4]}"></circle>`; }).join('');
  const rays = Array.from({ length: 16 }, (_, i) => { const a = (i / 16) * Math.PI * 2; const a2 = a + 0.08; return `<polygon points="640,330 ${640 + Math.cos(a) * 700},${330 + Math.sin(a) * 700} ${640 + Math.cos(a2) * 700},${330 + Math.sin(a2) * 700}" fill="rgb(155 107 255 / ${i % 2 ? 0.1 : 0.18})"></polygon>`; }).join('');
  const frames = [['0ms', 'Màn tối dần, thẻ nhấc lên giữa sân'], ['400ms', 'Tia tím xoay sau thẻ, rung tăng dần'], ['1300ms', 'Lật 760ms, foil quét ngang'], ['2060ms', 'Bùng nổ: 28 hạt, hào quang 900ms'], ['2960ms', 'Phóng to giữa màn → về chỗ']];
  B['PackOpening-Legend.dc.html'] = {
    title: 'Mở gói — khoảnh khắc Huyền thoại', w: 1280, h: 720,
    body: `<div style="position: absolute; inset: 0; background: #05080a"></div><svg width="1280" height="720" aria-hidden="true" style="position: absolute; inset: 0">${rays}<circle cx="640" cy="330" r="230" fill="rgb(155 107 255 / 0.18)"></circle><ellipse cx="640" cy="330" rx="420" ry="190" fill="none" stroke="rgb(232 240 230 / .12)" stroke-width="2"></ellipse>${parts}</svg>
<div style="position: absolute; left: 50%; top: 52px; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 14px"><div style="filter: drop-shadow(0 0 28px rgb(155 107 255 / 0.8))">${card(lg, { size: 'lg', flag: 'MỚI', style: '--card-w: 260px' })}</div>
<span class="caps r-legend" style="font-size: 28px; letter-spacing: .3em; color: var(--r-legend-hi)">◆◆◆◆ Huyền thoại</span></div>
<div style="position: absolute; left: 24px; right: 24px; bottom: 20px; display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 12px">${frames.map(([t, d], i) => `<div class="motion-note" style="background: rgb(10 19 16 / .85)"><b class="num">${i + 1} · ${t}</b><br>${d}</div>`).join('')}</div>
<div class="motion-note" style="position: absolute; right: 24px; top: 24px; width: 280px; background: rgb(10 19 16 / .85)"><b>Giảm chuyển động</b><br>Không tia xoay, không rung, không hạt: mặt sau fade sang mặt trước 200ms + nhãn "Huyền thoại". <span class="kbd">Esc</span> hoặc "Lật tất cả" bỏ qua ngay. Foil dừng khi tab ẩn.</div>`,
  };
}

module.exports = { B, XI, XI_LIST, TEAM_OVR, tvPitch, MATCH_PLAYERS, packArt, meterRows };
