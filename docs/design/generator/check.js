const fs = require('fs'); const dir = process.argv[2]; let bad = 0;
for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.html'))) {
  const html = fs.readFileSync(dir + '/' + f, 'utf8').replace(/<script[\s\S]*?<\/script>/g, '');
  for (const tag of ['div', 'span', 'section', 'a', 'button', 'svg', 'sc-if', 'table', 'label', 'form', 'p', 'header', 'aside', 'g', 'h1', 'h2', 'h3', 'select', 'tr', 'td']) {
    const o = (html.match(new RegExp('<' + tag + '(?=[ >\n])', 'g')) || []).length, c = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    if (o !== c) { bad++; console.log('UNBALANCED', f, tag, o, c); }
  }
  const holes = html.match(/\{\{[^}]*\}\}/g) || []; if (holes.some((h) => /[+!(]/.test(h))) console.log('BAD HOLE', f);
}
console.log('done, issues:', bad);
