// Helpers sinh markup tĩnh dùng chung cho preview design system và artboard canvas.
// Lấy mẫu thẻ hư cấu từ seed của server: 3 thẻ mỗi (độ hiếm × vị trí).
const SEED = require('../../../apps/server/src/db/seed/cards.json');
const CARDS = [];
for (const r of ['bronze', 'silver', 'gold', 'legend']) for (const p of ['GK', 'DF', 'MF', 'FW']) CARDS.push(...SEED.filter((x) => x.rarity === r && x.position === p).slice(0, 3));

const SKINS = ['#f3d2b5', '#e5b48f', '#c98e64', '#a46a43', '#7a4a2c', '#553220'];
const HAIRS = ['#1b1410', '#3b2414', '#6b4423', '#a8743a', '#d9b26a', '#8c8c8c'];
const FW = [19, 20.5, 22];
function hashSeed(s) { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; }
function mulberry32(a) { return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function spec(seed) {
  const r = mulberry32(hashSeed(seed)); const pick = (a) => a[Math.floor(r() * a.length)];
  return { skin: pick(SKINS), hair: pick(HAIRS), fw: pick(FW), hairStyle: Math.floor(r() * 7), beard: Math.floor(r() * 4), browY: Math.round((41 + r() * 1.5) * 10) / 10, eyeGap: Math.round((7 + r() * 1.5) * 10) / 10 };
}
function avatar(seed) {
  const { skin, hair, fw, hairStyle, beard, browY, eyeGap } = spec(seed);
  const hairEl = [
    '',
    `<path d="M${50 - fw} 40 Q50 14 ${50 + fw} 40 Q${50 + fw} 30 50 25 Q${50 - fw} 30 ${50 - fw} 40Z" fill="${hair}"></path>`,
    `<path d="M${50 - fw - 1} 44 Q${47 - fw} 18 50 18 Q${53 + fw} 18 ${51 + fw} 44 L${48 + fw} 34 Q50 28 ${52 - fw} 34Z" fill="${hair}"></path>`,
    `<rect x="${50 - fw}" y="21" width="${fw * 2}" height="10" rx="4" fill="${hair}"></rect>`,
    `<path d="M44 26 Q50 12 56 26 L54 31 Q50 27 46 31Z" fill="${hair}"></path>`,
    `<g fill="${hair}">${Array.from({ length: 9 }, (_, i) => `<circle cx="${(50 - fw + 2 + (i * (fw * 2 - 4)) / 8).toFixed(2)}" cy="${26 + (i % 2) * 2}" r="5"></circle>`).join('')}</g>`,
    `<path d="M${50 - fw - 2} 52 Q${46 - fw} 16 50 17 Q${54 + fw} 16 ${52 + fw} 52 L${48 + fw} 50 L${48 + fw} 36 Q50 30 ${52 - fw} 36 L${52 - fw} 50Z" fill="${hair}"></path>`,
  ][hairStyle];
  const beardEl = [
    '',
    `<path d="M${52 - fw} 50 Q50 70 ${48 + fw} 50 Q${46 + fw} 62 50 63 Q${54 - fw} 62 ${52 - fw} 50Z" fill="${hair}" opacity="0.85"></path>`,
    `<path d="M44 57 Q50 54 56 57 L55 59 Q50 57 45 59Z" fill="${hair}"></path>`,
    `<path d="M46 60 Q50 66 54 60 L53 64 Q50 67 47 64Z" fill="${hair}"></path>`,
  ][beard];
  return `<svg viewBox="0 0 100 100" aria-hidden="true"><path d="M14 100 Q16 74 38 70 L62 70 Q84 74 86 100Z" style="fill: var(--base)"></path><path d="M38 70 L50 82 L62 70" fill="none" stroke="rgb(0 0 0 / .35)" stroke-width="2.5"></path><rect x="43" y="58" width="14" height="14" fill="${skin}"></rect><ellipse cx="50" cy="44" rx="${fw}" ry="${fw + 3}" fill="${skin}"></ellipse><ellipse cx="${50 - fw}" cy="46" rx="2.5" ry="4" fill="${skin}"></ellipse><ellipse cx="${50 + fw}" cy="46" rx="2.5" ry="4" fill="${skin}"></ellipse>${hairEl}<rect x="${50 - eyeGap - 4}" y="${browY}" width="7" height="1.8" rx="0.9" fill="${hair}"></rect><rect x="${50 + eyeGap - 3}" y="${browY}" width="7" height="1.8" rx="0.9" fill="${hair}"></rect><circle cx="${50 - eyeGap}" cy="47" r="1.8" fill="#1a1a1a"></circle><circle cx="${50 + eyeGap}" cy="47" r="1.8" fill="#1a1a1a"></circle><path d="M48 52 Q50 54 52 52" fill="none" stroke="rgb(0 0 0 / .3)" stroke-width="1.2"></path><path d="M45.5 58 Q50 60.5 54.5 58" fill="none" stroke="rgb(0 0 0 / .45)" stroke-width="1.5" stroke-linecap="round"></path>${beardEl}</svg>`;
}

const RARITY = { bronze: ['Đồng', 1], silver: ['Bạc', 2], gold: ['Vàng', 3], legend: ['Huyền thoại', 4] };
const POS_NAME = { GK: 'Thủ môn', DF: 'Hậu vệ', MF: 'Tiền vệ', FW: 'Tiền đạo' };
const pips = (r) => '◆'.repeat(RARITY[r][1]);
function statList(c, bonus = 0) {
  return c.position === 'GK'
    ? [['REF', c.reflexes], ['HAN', c.handling], ['POS', c.positioning], ['KIC', c.kicking], ['PAC', c.pace], ['STA', c.stamina]]
    : [['PAC', c.pace], ['SHO', c.shooting], ['PAS', c.passing], ['DRI', c.dribbling], ['DEF', c.defending], ['STA', c.stamina]];
}
function split(name) { const i = name.lastIndexOf(' '); return i < 0 ? [name, ''] : [name.slice(i + 1), name.slice(0, i)]; }

/** Thẻ cầu thủ. opts: size lg|md|sm|xs, level, flag ('MỚI'|'TRÙNG'), squad, selected, dim, cls, ovr */
function card(c, o = {}) {
  const size = o.size || 'md';
  const [last, first] = split(c.name);
  const ovr = o.ovr ?? c.ovr;
  const label = `${RARITY[c.rarity][0]}, ${c.name}, ${POS_NAME[c.position]}, OVR ${ovr}${o.level ? `, cấp +${o.level}` : ''}`;
  const stats = size === 'lg' || size === 'md'
    ? `<div class="card__stats">${statList(c).map(([k, v]) => `<div class="card__stat"><b>${v + (o.bonus || 0)}</b><span>${k}</span></div>`).join('')}</div>` : '';
  const cls = ['card', `card--${size}`, `r-${c.rarity}`, o.selected && 'is-selected', o.dim && 'is-dim', o.cls].filter(Boolean).join(' ');
  return `<div class="${cls}" role="img" aria-label="${label}"${o.style ? ` style="${o.style}"` : ''}><div class="card__body"><div class="card__ovr">${ovr}</div><div class="card__pos">${c.position}</div><div class="card__pips" aria-hidden="true">${pips(c.rarity)}</div>${o.flag ? `<div class="card__flag${o.flag === 'TRÙNG' ? ' card__flag--dup' : ''}">${o.flag}</div>` : ''}${o.squad ? '<div class="card__squad" title="Đang trong đội hình"></div>' : ''}<div class="card__avatar">${avatar(c.avatarSeed)}</div><div class="card__name">${last}</div><div class="card__sub">${first ? first + ' · ' : ''}“${c.nickname}”</div>${stats}<div class="card__tier">${RARITY[c.rarity][0]}</div>${o.level ? `<div class="card__level">+${o.level}</div>` : ''}<div class="card__sheen"></div></div></div>`;
}
function cardBack(o = {}) {
  const size = o.size || 'lg';
  const hot = o.hot ? ` is-hot r-${o.hot}` : '';
  const frame = o.hot === 'gold' ? ' style="--frame: linear-gradient(150deg, #ffe48a, #e0ae2e 45%, #9a7412)"' : o.hot === 'legend' ? '' : '';
  return `<div class="card card--${size} card--back${hot}"${frame}><div class="card__body"><div class="card__back-mark"></div></div></div>`;
}
const coin = (n, cls = '') => `<span class="coin ${cls}"><span class="coin__icon" aria-hidden="true"></span><span>${n}</span><span class="sr-only"> xu</span></span>`;
const rarityChip = (r) => `<span class="rarity r-${r}"><span class="rarity__pips" aria-hidden="true">${pips(r)}</span>${RARITY[r][0]}</span>`;
const pos = (p) => `<span class="pos pos--${p}" title="${POS_NAME[p]}">${p}</span>`;

function topbar(active, o = {}) {
  const items = [['home', 'Trang chủ', 'Home.dc.html'], ['shop', 'Cửa hàng', 'Shop.dc.html'], ['coll', 'Kho thẻ', 'Collection.dc.html'], ['squad', 'Đội hình', 'Squad.dc.html']];
  const nav = items.map(([k, t, h]) => `<a class="nav__link${k === active ? ' is-on' : ''}" href="${h}"${k === active ? ' aria-current="page"' : ''}>${t}</a>`).join('');
  return `<header class="topbar"><a class="logo" href="Home.dc.html"><span class="logo__mark" aria-hidden="true"></span>MFG</a><nav class="nav" aria-label="Điều hướng chính" style="${o.compact ? 'gap: 0' : ''}">${nav}</nav><div class="topbar__right"><span class="wallet">${coin(o.coins ?? '1.240', 'coin--sm')}</span><span class="user"><span class="user__dot" aria-hidden="true">D</span>${o.compact ? '' : 'duyfc'}</span><a class="btn btn--ghost btn--sm" href="Auth.dc.html">Đăng xuất</a></div></header>`;
}

const find = (name) => { const c = CARDS.find((x) => x.name === name); if (!c) throw new Error('no card ' + name); return c; };
const by = (r, p, i = 0) => CARDS.filter((x) => x.rarity === r && x.position === p)[i];

const ICON = {
  search: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="#9db0a6" stroke-width="1.6" aria-hidden="true"><circle cx="7" cy="7" r="5"></circle><path d="M11 11l3.5 3.5"></path></svg>',
  warn: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M8 2l6.5 12h-13z"></path><path d="M8 7v3M8 12v.5"></path></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M3 8.5l3 3 7-7"></path></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M10 3L5 8l5 5"></path></svg>',
  play: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M5 3l10 6-10 6z" fill="currentColor"></path></svg>',
  lock: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><rect x="3" y="7" width="10" height="7" rx="1"></rect><path d="M5 7V5a3 3 0 016 0v2"></path></svg>',
  eye: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M1 8s2.5-5 7-5 7 5 7 5-2.5 5-7 5-7-5-7-5z"></path><circle cx="8" cy="8" r="2"></circle></svg>',
  google: '<svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M17.6 9.2c0-.6-.1-1.2-.2-1.7H9v3.3h4.8a4 4 0 01-1.8 2.7v2.2h2.9c1.7-1.6 2.7-3.9 2.7-6.5z" fill="#4285F4"></path><path d="M9 18c2.4 0 4.5-.8 5.9-2.2L12 13.6c-.8.5-1.8.9-3 .9-2.3 0-4.3-1.6-5-3.7H1v2.3A9 9 0 009 18z" fill="#34A853"></path><path d="M4 10.8a5.4 5.4 0 010-3.5V5H1a9 9 0 000 8.1l3-2.3z" fill="#FBBC05"></path><path d="M9 3.6c1.3 0 2.5.5 3.4 1.3l2.6-2.6A9 9 0 001 5l3 2.3c.7-2.1 2.7-3.7 5-3.7z" fill="#EA4335"></path></svg>',
};

/** Sân nhìn từ trên (dọc), vạch phấn. w×h px. */
function pitchSvg(w, h, o = {}) {
  const s = o.stroke || 'rgb(232 240 230 / 0.55)';
  const m = 10, bw = w - 2 * m, bh = h - 2 * m, cx = w / 2, cy = h / 2;
  const boxW = bw * 0.56, boxH = bh * 0.15, sixW = bw * 0.28, sixH = bh * 0.06;
  return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true" style="position: absolute; inset: 0">${o.grass === false ? '' : `<defs><pattern id="g${w}" width="${w}" height="${bh / 7}" patternUnits="userSpaceOnUse"><rect width="${w}" height="${bh / 14}" fill="#1d6436"></rect><rect y="${bh / 14}" width="${w}" height="${bh / 14}" fill="#226f3c"></rect></pattern></defs><rect x="0" y="0" width="${w}" height="${h}" fill="url(#g${w})" opacity="${o.grassOpacity ?? 0.9}"></rect>`}<g fill="none" stroke="${s}" stroke-width="1.6"><rect x="${m}" y="${m}" width="${bw}" height="${bh}"></rect><line x1="${m}" y1="${cy}" x2="${w - m}" y2="${cy}"></line><circle cx="${cx}" cy="${cy}" r="${Math.min(bw, bh) * 0.13}"></circle><rect x="${cx - boxW / 2}" y="${m}" width="${boxW}" height="${boxH}"></rect><rect x="${cx - sixW / 2}" y="${m}" width="${sixW}" height="${sixH}"></rect><rect x="${cx - boxW / 2}" y="${h - m - boxH}" width="${boxW}" height="${boxH}"></rect><rect x="${cx - sixW / 2}" y="${h - m - sixH}" width="${sixW}" height="${sixH}"></rect></g><circle cx="${cx}" cy="${cy}" r="2.5" fill="${s}"></circle><circle cx="${cx}" cy="${m + boxH * 0.7}" r="2" fill="${s}"></circle><circle cx="${cx}" cy="${h - m - boxH * 0.7}" r="2" fill="${s}"></circle></svg>`;
}

module.exports = { CARDS, avatar, card, cardBack, coin, rarityChip, pos, topbar, find, by, ICON, RARITY, POS_NAME, statList, pitchSvg, pips };
