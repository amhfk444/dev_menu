// يفحص نصوص صفحة مقابل القاموس: كل نص عربي (أو قالب فيه ${...}) ما له ترجمة يطلع في القائمة
// node tools/i18n-check.js admin.html admin
const fs = require('fs');
const [file, dictName] = process.argv.slice(2);
const AR = /[؀-ۿ]/;
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const exact = new Map(), patterns = [];
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const d of ['common', dictName]) {
  const dict = JSON.parse(fs.readFileSync(`js/i18n/${d}.json`, 'utf8'));
  for (const [ar, en] of Object.entries(dict)) {
    const k = norm(ar);
    if (!k.includes('{')) { exact.set(k, en); continue; }
    const strict = k.startsWith('~'), body = strict ? k.slice(1) : k, names = [];
    const re = new RegExp('^' + escRe(body).replace(/\\\{(\w+)\\\}/g, (_, n) => { names.push(n); return '(.+?)'; }) + '$');
    patterns.push({ re, names, en, strict, lit: body.replace(/\{\w+\}/g, '').length });
  }
}
patterns.sort((a, b) => b.lit - a.lit);
function tr(s) {
  if (!s || !AR.test(s)) return s;
  const k = norm(s);
  if (exact.has(k)) return exact.get(k);
  for (const p of patterns) {
    const m = k.match(p.re); if (!m) continue;
    let miss = false;
    const out = p.en.replace(/\{(\w+)\}/g, (_, n) => { const v = m[p.names.indexOf(n) + 1]; if (v == null) return ''; const o = tr(v); if (o === v && AR.test(v)) miss = true; return o; });
    if (!(p.strict && miss)) return out;
  }
  return s;
}
const src = fs.readFileSync(file, 'utf8');
const js = [...src.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n').replace(/^\s*\/\/.*$/gm, '');
const missing = new Set();
for (const m of js.matchAll(/'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
  let t = m[1] ?? m[2] ?? '';
  if (!AR.test(t)) continue;
  // القوالب: ${...} يصير "7"، والوسوم تفصل النص لأجزاء
  if (m[2] != null) t = t.replace(/\$\{(?:[^{}]|\{[^{}]*\})*\}/g, '7');
  t.split(/<[^>]+>/).map(norm).filter(p => AR.test(p) && !/[;=]|=>|\(\)/.test(p)).forEach(p => {
    const out = tr(p);
    if (out === p || AR.test(out.replace(/7/g, ''))) missing.add(p);
  });
}
console.log([...missing].join('\n'));
