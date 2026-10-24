// =====================================================================
// DEV MENU — صورة الأختام لبطاقة المحفظة (نفس شكل بطاقة DEV MENU)
// صورة عريضة 1125×432 (مقاس "strip" في آبل) فيها دوائر الأختام بلون المحل وصورة الختم
// المختومة ملوّنة، والباقية باهتة، وآخر خانة هدية. الترتيب من اليمين لليسار.
// =====================================================================
const sharp = require('sharp');
const ICONS = require('./stamp-icons');

const W = 1125, H = 432;

const hexRgb = (h) => { const n = parseInt(String(h).slice(1), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
function inkFor(hex) {
  const [r, g, b] = hexRgb(hex).map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
  return .2126 * r + .7152 * g + .0722 * b > .45 ? '#1b1b1b' : '#ffffff';
}
const icon = (name, x, y, size, color, opacity = 1) =>
  `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 256 256" fill="${color}" fill-opacity="${opacity}">${ICONS[name] || ICONS.coffee}</svg>`;

// الخلفية بنفس لون بطاقة المحفظة عشان الصورة تندمج معها، مع وهج خفيف بلون الختم
function background(d) {
  return {
    fill: d.color, ink: inkFor(d.color),
    glow: `<radialGradient id="g" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${d.stamp_color}" stop-opacity=".16"/><stop offset="1" stop-color="${d.stamp_color}" stop-opacity="0"/></radialGradient>`
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
    const pad = 40, gap = 30;
    const D = Math.floor(Math.min((W - 2 * pad - (cols - 1) * gap) / cols, (H - 2 * pad - (rows - 1) * gap) / rows));
    const gridW = cols * D + (cols - 1) * gap, gridH = rows * D + (rows - 1) * gap;
    const x0 = (W - gridW) / 2, y0 = (H - gridH) / 2;
    // صورة خلفية المحل (أو أول لقطة من الفيديو): تنحط ورا الأختام بطبقة غامقة عشان تبان
    let photo = null;
    if (d.bg !== 'color' && d.bg_image) {
      const res = await fetch(d.bg_image, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (res && res.ok) photo = await sharp(Buffer.from(await res.arrayBuffer())).resize(W, H, { fit: 'cover' }).png().toBuffer().catch(() => null);
    }
    const bg = photo ? { fill: 'none', ink: '#ffffff', glow: '' } : background(d);
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
    const svg = photo
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000" fill-opacity=".5"/>${shapes}</svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${bg.glow}</defs><rect width="${W}" height="${H}" fill="${bg.fill}"/><rect width="${W}" height="${H}" fill="url(#g)"/>${shapes}</svg>`;
    let base = photo ? sharp(photo).composite([{ input: Buffer.from(svg) }]).png() : sharp(Buffer.from(svg)).png();

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
    const png = await base.png({ compressionLevel: 9, palette: true, quality: photo ? 95 : 90, dither: photo ? 1 : 0 }).toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) {
    console.error('STAMP_STRIP', e.message);
    stampStrip.lastError = String(e.message || e).slice(0, 120);
    return null;
  }
}

module.exports = { stampStrip };
