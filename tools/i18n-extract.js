// يطلع كل النصوص العربية من صفحة (نصوص HTML + نصوص داخل الجافاسكربت) عشان نترجمها
// node tools/i18n-extract.js loyalty.html  → قائمة نصوص (كل سطر نص)
const fs = require('fs');
const file = process.argv[2];
const src = fs.readFileSync(file, 'utf8');
const AR = /[؀-ۿ]/;
const out = new Set();
const norm = (s) => s.replace(/\s+/g, ' ').trim();
// 1) HTML بدون السكربتات والستايل
const html = src.replace(/<script[\s\S]*?<\/script>/g, ' ').replace(/<style[\s\S]*?<\/style>/g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
for (const m of html.matchAll(/>([^<>]+)</g)) { const t = norm(m[1]); if (AR.test(t)) out.add(t); }
for (const m of html.matchAll(/\b(?:placeholder|title|aria-label|alt|content|value)="([^"]*)"/g)) { const t = norm(m[1]); if (AR.test(t)) out.add(t); }
// 2) الجافاسكربت: نصوص بين علامات تنصيص، والأجزاء الثابتة من القوالب
const js = [...src.matchAll(/<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]).join('\n') + (process.argv[3] === '--js' ? '' : '');
const strip = js.replace(/\/\/[^\n]*/g, '');
for (const m of strip.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
  let t = m[1] ?? m[2] ?? m[3] ?? '';
  if (!AR.test(t)) continue;
  if (m[3] != null) {
    // القوالب: نشيل الوسوم ونقسم على ${...} والوسوم
    t.replace(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g, '\u0001').split(/<[^>]+>|\u0001/).forEach(p => { p = norm(p); if (AR.test(p)) out.add(p); });
  } else {
    t.split(/<[^>]+>/).forEach(p => { p = norm(p); if (AR.test(p)) out.add(p); });
  }
}
console.log([...out].join('\n'));
