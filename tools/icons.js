// يبني css/icons.css + خطوط الأيقونات (Phosphor) بالأيقونات المستخدمة فقط
// node tools/icons.js   (يحتاج pyftsubset من fonttools لتصغير الخطوط، وإلا ينسخها كاملة)
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.join(__dirname, '..');
const src = path.join(root, 'node_modules/@phosphor-icons/web/src');
const PAGES = ['index', 'admin', 'login', 'links', 'waitlist', 'pager', 'pager-desk', 'super-admin', 'loyalty', 'kiosk'].map(p => `${p}.html`).concat('js/dialog.js', 'js/loyalty-card.js', 'js/sectors.js', 'js/plans.js');
// هذي الأيقونات تطلع ممتلئة (نجمة التقييم، النقطة)
const FILLED = ['star', 'star-half', 'circle'];

const used = new Set();
for (const f of PAGES) {
  for (const m of fs.readFileSync(path.join(root, f), 'utf8').matchAll(/(?<![\w-])ph-([a-z0-9-]+)/g)) used.add(m[1]);
}
['bold', 'fill', 'spin', 'shake'].forEach(x => used.delete(x));

const codes = {};
for (const w of ['bold', 'fill']) {
  const css = fs.readFileSync(path.join(src, w, 'style.css'), 'utf8');
  for (const m of css.matchAll(/\.ph-[a-z]+\.ph-([a-z0-9-]+):before\s*\{\s*content:\s*"\\([0-9a-f]+)"/g)) codes[m[1]] = m[2];
}
const missing = [...used].filter(n => !codes[n]);
if (missing.length) throw new Error('أيقونات غير موجودة: ' + missing.join(', '));
const names = [...used].sort();

const out = path.join(root, 'fonts');
fs.mkdirSync(out, { recursive: true });
for (const [w, file] of [['bold', 'Phosphor-Bold'], ['fill', 'Phosphor-Fill']]) {
  const from = path.join(src, w, `${file}.woff2`), to = path.join(out, `${file}.woff2`);
  try {
    execFileSync('pyftsubset', [from, `--unicodes=${names.map(n => 'U+' + codes[n]).join(',')}`, '--flavor=woff2', `--output-file=${to}`, '--no-hinting', '--layout-features=']);
  } catch { fs.copyFileSync(from, to); }
}

const css = `/* DEV MENU — أيقونات (Phosphor, MIT). مولّد بـ tools/icons.js، لا تعدّله يدوياً */
@font-face { font-family: "Phosphor-Bold"; src: url("/fonts/Phosphor-Bold.woff2") format("woff2"); font-display: block; }
@font-face { font-family: "Phosphor-Fill"; src: url("/fonts/Phosphor-Fill.woff2") format("woff2"); font-display: block; }
.ph-bold { font-family: "Phosphor-Bold" !important; font-style: normal; font-weight: normal; font-variant: normal; text-transform: none; line-height: 1; display: inline-block; vertical-align: -.125em; speak: never; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; }
${FILLED.map(n => `.ph-bold.ph-${n}`).join(', ')} { font-family: "Phosphor-Fill" !important; }
${names.map(n => `.ph-${n}:before { content: "\\${codes[n]}"; }`).join('\n')}
.ph-spin { animation: ph-spin 1s linear infinite; }
@keyframes ph-spin { to { transform: rotate(360deg); } }
.ph-shake { animation: ph-shake 1s ease-in-out infinite; transform-origin: 50% 10%; }
@keyframes ph-shake { 0%, 100% { transform: rotate(0); } 10%, 30% { transform: rotate(-14deg); } 20%, 40% { transform: rotate(14deg); } 50% { transform: rotate(0); } }
@media (prefers-reduced-motion: reduce) { .ph-spin, .ph-shake { animation: none; } }
`;
fs.writeFileSync(path.join(root, 'css/icons.css'), css);
console.log('css/icons.css', names.length, 'icons');
