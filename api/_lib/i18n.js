// =====================================================================
// DEV MENU — ترجمة اللي يرسله الخادم للزبون (بطاقة المحفظة، الإشعارات، البريد)
// نفس قواميس الصفحات (js/i18n/*.json) ونفس طريقة الترجمة: النص العربي ← الإنجليزي، و{n} للمتغيرات
//   tr('en', 'صار عندك 3 ختم')  →  'You now have 3 stamps'
// =====================================================================
const AR = /[؀-ۿ]/;
const norm = (s) => String(s).replace(/\s+/g, ' ').trim();
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const exact = new Map(), patterns = [];
for (const dict of [require('../../js/i18n/common.json'), require('../../js/i18n/server.json')]) {
  for (const [ar, en] of Object.entries(dict)) {
    const k = norm(ar);
    if (!k.includes('{')) { exact.set(k, en); continue; }
    const strict = k.startsWith('~'), body = strict ? k.slice(1) : k, names = [];
    const re = new RegExp('^' + escRe(body).replace(/\\\{(\w+)\\\}/g, (_, n) => { names.push(n); return '([\\s\\S]+?)'; }) + '$');
    patterns.push({ re, names, en, strict, lit: body.replace(/\{\w+\}/g, '').length });
  }
}
patterns.sort((a, b) => b.lit - a.lit);

function translate(s) {
  if (!s || !AR.test(s)) return s;
  const k = norm(s);
  if (exact.has(k)) return exact.get(k);
  for (const p of patterns) {
    const m = k.match(p.re);
    if (!m) continue;
    let miss = false;
    const out = p.en.replace(/\{(\w+)\}/g, (_, n) => { const v = m[p.names.indexOf(n) + 1]; if (v == null) return ''; const o = translate(v); if (o === v && AR.test(v)) miss = true; return o; });
    if (!(p.strict && miss)) return out;
  }
  return s;
}

/** النص بلغة الزبون: 'en' يترجم، وغيره يرجّع العربي كما هو */
const tr = (lang, s) => (lang === 'en' ? translate(s) : s);

module.exports = { tr };
