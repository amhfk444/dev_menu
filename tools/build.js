// يبني ملف CSS لكل صفحة: node tools/build.js
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const pages = require('./pages');
const base = require('./base.config');

const root = path.join(__dirname, '..');
const tmp = path.join(__dirname, '.tmp');
fs.mkdirSync(tmp, { recursive: true });
fs.mkdirSync(path.join(root, 'css/tw'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'in.css'), '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n');

for (const [page, extend] of Object.entries(pages)) {
  const cfg = path.join(tmp, `${page}.config.js`);
  fs.writeFileSync(cfg, `module.exports = ${JSON.stringify(base(page, extend))};`);
  execFileSync(path.join(root, 'node_modules/.bin/tailwindcss'),
    ['-c', cfg, '-i', path.join(tmp, 'in.css'), '-o', path.join(root, `css/tw/${page}.css`), '--minify'],
    { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
  console.log(`css/tw/${page}.css`, (fs.statSync(path.join(root, `css/tw/${page}.css`)).size / 1024).toFixed(1) + 'KB');
}
fs.rmSync(tmp, { recursive: true, force: true });
