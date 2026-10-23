// =====================================================================
// DEV MENU — صورة الأختام لبطاقة المحفظة (نفس شكل بطاقة DEV MENU)
// صورة عريضة 1125×432 (مقاس "strip" في آبل) فيها دوائر الأختام بلون المحل وصورة الختم
// المختومة ملوّنة، والباقية باهتة، وآخر خانة هدية. الترتيب من اليمين لليسار.
// =====================================================================
const sharp = require('sharp');
const ICONS = require('./stamp-icons');

const W = 1125, H = 432;

const hexRgb = (h) => { const n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
const rgbHex = (r) => '#' + r.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const mix = (a, b, t) => rgbHex(hexRgb(a).map((v, i) => v + (hexRgb(b)[i] - v) * t));
function inkFor(hex) {
  const [r, g, b] = hexRgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
  return .2126 * r + .7152 * g + .0722 * b > .45 ? '#1b1b1b' : '#ffffff';
}
const icon = (name, x, y, size, color, opacity = 1) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 256 256" fill="${color}" fill-opacity="${opacity}">${ICONS[name] || ICONS.coffee}</svg>`;

// الخلفية حسب شكل البطاقة
function background(d) {
  if (d.style === 'paper') return { fill: '#fbf8f3', ink: d.color, defs: '' };
  if (d.style === 'dark') return { fill: '#121212', ink: '#f5f5f5', defs: '' };
  if (d.style === 'solid') return { fill: d.color, ink: inkFor(d.color), defs: '' };
  return {
    fill: 'url(#g)', ink: inkFor(d.color),
    defs: `<radialGradient id="g" cx="100%" cy="0%" r="120%"><stop offset="0" stop-color="${mix(d.color, '#ffffff', .3)}"/><stop offset=".55" stop-color="${d.color}"/><stop offset="1" stop-color="${mix(d.color, '#000000', .45)}"/></radialGradient>`
  };
}

async function circleImage(buf, size, opacity, gray) {
  let img = sharp(buf).resize(size, size, { fit: 'cover' });
  if (gray) img = img.grayscale();
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}" fill="#fff" fill-opacity="${opacity}"/></svg>`);
  return img.ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
}

// يرجّع صورة PNG بصيغة data URI، أو null لو صار خطأ (البطاقة تكمل بدونها)
async function stampStrip(settings, card) {
  try {
    const d = settings.design || {};
    const n = settings.needed, done = Math.min(card.stamps || 0, n);
    const rows = n <= 6 ? 1 : 2, cols = Math.ceil(n / rows);
    const pad = 44, gap = 26;
    const D = Math.floor(Math.min((W - 2 * pad - (cols - 1) * gap) / cols, (H - 2 * pad - (rows - 1) * gap) / rows));
    const gridW = cols * D + (cols - 1) * gap, gridH = rows * D + (rows - 1) * gap;
    const x0 = (W - gridW) / 2, y0 = (H - gridH) / 2;
    const bg = background(d);
    const stampInk = inkFor(d.stamp_color || '#c9a227');
    let shapes = '';
    const pos = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = x0 + (cols - 1 - c) * (D + gap), y = y0 + r * (D + gap);   // من اليمين
      pos.push([x, y]);
      const on = i < done, last = i === n - 1;
      const cx = x + D / 2, cy = y + D / 2;
      if (on) shapes += `<circle cx="${cx}" cy="${cy}" r="${D / 2}" fill="${d.stamp_color}"/><circle cx="${cx}" cy="${cy + 4}" r="${D / 2}" fill="none"/>`;
      else shapes += `<circle cx="${cx}" cy="${cy}" r="${D / 2 - 3}" fill="none" stroke="${last ? d.stamp_color : bg.ink}" stroke-opacity="${last ? .85 : .35}" stroke-width="5" stroke-dasharray="14 11"/>`;
      const s = D * .46;
      if (last && !on) shapes += icon('gift', cx - s / 2, cy - s / 2, s, d.stamp_color, .95);
      else if (!d.stamp_image) shapes += icon(d.icon, cx - s / 2, cy - s / 2, s, on ? stampInk : bg.ink, on ? 1 : .35);
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${bg.defs}</defs><rect width="${W}" height="${H}" fill="${bg.fill}"/>${shapes}</svg>`;
    let base = sharp(Buffer.from(svg)).png();

    // صورة الختم الخاصة بالمحل
    if (d.stamp_image) {
      const res = await fetch(d.stamp_image, { signal: AbortSignal.timeout(8000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const inner = Math.round(D * .86);
        const [full, faint] = await Promise.all([circleImage(buf, inner, 1, false), circleImage(buf, inner, .25, true)]);
        const layers = [];
        for (let i = 0; i < n; i++) {
          const on = i < done, last = i === n - 1;
          if (last && !on) continue;
          const [x, y] = pos[i], off = Math.round((D - inner) / 2);
          layers.push({ input: on ? full : faint, left: Math.round(x + off), top: Math.round(y + off) });
        }
        base = sharp(await base.toBuffer()).composite(layers).png();
      }
    }
    const png = await base.png({ compressionLevel: 9, palette: true, quality: 90 }).toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) {
    console.error('STAMP_STRIP', e.message);
    return null;
  }
}

module.exports = { stampStrip };
