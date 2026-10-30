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
// متدرج بلونين: اللون الثاني في النص ويذوب للون البطاقة على الأطراف، عشان يندمج مع خلفية المحفظة (لون واحد) بدون حواف
function background(d) {
  const two = (d.style === 'gradient' || d.style === 'glass') && d.color2;
  return {
    fill: d.color, ink: inkFor(two ? d.color2 : d.color),
    glow: two
      ? `<radialGradient id="g" cx="50%" cy="50%" r="75%"><stop offset="0" stop-color="${d.color2}"/><stop offset="1" stop-color="${d.color2}" stop-opacity="0"/></radialGradient>`
      : `<radialGradient id="g" cx="50%" cy="50%" r="60%"><stop offset="0" stop-color="${d.stamp_color}" stop-opacity=".16"/><stop offset="1" stop-color="${d.stamp_color}" stop-opacity="0"/></radialGradient>`
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
    const glass = !photo && d.style === 'glass';
    if (glass) bg.ink = '#ffffff';
    let shapes = '';
    const pos = [];
    for (let i = 0; i < n; i++) {
      const r = Math.floor(i / cols), c = i % cols;
      const x = x0 + (cols - 1 - c) * (D + gap), y = y0 + r * (D + gap);   // من اليمين
      pos.push([x, y]);
      const on = i < done, last = i === n - 1;
      const cx = x + D / 2, cy = y + D / 2;
      if (on) shapes += `<circle cx="${cx}" cy="${cy}" r="${D / 2}" fill="${d.stamp_color}"/><circle cx="${cx}" cy="${cy + 4}" r="${D / 2}" fill="none"/>`;
      // زجاجي: الخانة الفاضية دائرة زجاج شفافة بحافة لامعة بدل الخط المنقط
      else if (glass) shapes += `<circle cx="${cx}" cy="${cy}" r="${D / 2 - 2}" fill="#fff" fill-opacity=".13" stroke="${last ? d.stamp_color : '#fff'}" stroke-opacity="${last ? .9 : .5}" stroke-width="3"/><path d="M${cx - D * .3} ${cy - D * .18} A${D * .36} ${D * .36} 0 0 1 ${cx + D * .12} ${cy - D * .36}" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="4" stroke-linecap="round"/>`;
      else shapes += `<circle cx="${cx}" cy="${cy}" r="${D / 2 - 3}" fill="none" stroke="${last ? d.stamp_color : bg.ink}" stroke-opacity="${last ? .85 : .35}" stroke-width="5" stroke-dasharray="14 11"/>`;
      const s = D * .46;
      if (last && !on) { if (!d.reward_image) shapes += icon('gift', cx - s / 2, cy - s / 2, s, d.stamp_color, .95); }
      else if (!d.stamp_image) shapes += icon(d.icon, cx - s / 2, cy - s / 2, s, on ? stampInk : bg.ink, on ? 1 : .35);
    }
    const svg = photo
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="#000" fill-opacity=".5"/>${shapes}</svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs>${bg.glow}${glass ? `<radialGradient id="gl" cx="20%" cy="85%" r="45%"><stop offset="0" stop-color="${d.stamp_color}" stop-opacity=".35"/><stop offset="1" stop-color="${d.stamp_color}" stop-opacity="0"/></radialGradient>` : ''}</defs><rect width="${W}" height="${H}" fill="${bg.fill}"/><rect width="${W}" height="${H}" fill="url(#g)"/>${glass ? `<rect width="${W}" height="${H}" fill="url(#gl)"/><rect x="24" y="18" width="${W - 48}" height="${H - 36}" rx="34" fill="#fff" fill-opacity=".09" stroke="#fff" stroke-opacity=".3" stroke-width="2"/>` : ''}${shapes}</svg>`;
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
    // صورة المكافأة في الخانة الأخيرة (بدل الهدية)
    if (d.reward_image && done < n) {
      const res = await fetch(d.reward_image, { signal: AbortSignal.timeout(8000) }).catch(() => null);
      if (res && res.ok) {
        const inner = Math.round(D * .86), off = Math.round((D - inner) / 2);
        const img = await circleImage(Buffer.from(await res.arrayBuffer()), inner, 1, false);
        const [x, y] = pos[n - 1];
        base = sharp(await base.toBuffer()).composite([{ input: img, left: Math.round(x + off), top: Math.round(y + off) }]).png();
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

// ─── بطاقة تنبيه البيجر: بلون المحل، ثلاث خطوات (استلمنا ← قيد التجهيز ← جاهز) بدون أختام ولا كتابة ───
// الكتابة (الرقم والحالة) في حقول البطاقة نفسها، عشان الخطوط العربية مو موجودة في الخادم
// لون المحل: لونه المختار، أو اللون الغالب في شعاره (مغمّق عشان الكتابة البيضاء تبان)، أو أخضر DEV MENU
async function brandColor(store) {
  if (/^#[0-9a-f]{6}$/i.test(store.accent_color || '')) return store.accent_color;
  try {
    const res = await fetch(store.logo_url, { signal: AbortSignal.timeout(6000) });
    const { dominant: { r, g, b } } = await sharp(Buffer.from(await res.arrayBuffer())).flatten({ background: '#000' }).stats();
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max - min < 40 || max > 235) throw 0;   // رمادي أو أبيض: ما يصلح لون للبطاقة
    let rgb = [r, g, b];
    const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    if (lum > .32) rgb = rgb.map(v => v * (.32 / lum));
    return '#' + rgb.map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
  } catch { return '#233d2c'; }
}

async function pagerStrip(color, step) {
  try {
    const ink = inkFor(color), gold = '#e9c95a';
    // الخطوة الحالية: 1 قيد التجهيز، 2 جاهز، 3 استلم (كلها منجزة، والبطاقة تنتظر الزيارة الجاية)
    const ready = step === 'ready', cur = ready ? 2 : step === 'idle' ? 3 : 1;
    const cy = H / 2, xs = [W - 250, W / 2, 250];   // من اليمين: استلمنا، قيد التجهيز، جاهز
    const icons = ['check', 'cooking-pot', 'bell-ringing'];
    let g = '';
    // الخط بين الخطوات: المنجز ممتلئ، والباقي منقط باهت
    for (let i = 0; i < 2; i++) {
      const done = i < cur;
      g += `<line x1="${xs[i] - 70}" y1="${cy}" x2="${xs[i + 1] + 70}" y2="${cy}" stroke="${done ? gold : ink}" stroke-opacity="${done ? .9 : .3}" stroke-width="8" stroke-linecap="round"${done ? '' : ' stroke-dasharray="4 22"'}/>`;
    }
    xs.forEach((x, i) => {
      const done = i < cur, now = i === cur, R = now ? 104 : 62, s = now ? 104 : 56;
      if (now) {
        // الخطوة الحالية: هالة، وموجات حول الجرس لما يجهز
        g += `<circle cx="${x}" cy="${cy}" r="${R + 34}" fill="${gold}" fill-opacity=".14"/>`;
        if (ready) g += `<circle cx="${x}" cy="${cy}" r="${R + 62}" fill="none" stroke="${gold}" stroke-opacity=".35" stroke-width="5"/><circle cx="${x}" cy="${cy}" r="${R + 92}" fill="none" stroke="${gold}" stroke-opacity=".15" stroke-width="4"/>`;
        g += `<circle cx="${x}" cy="${cy}" r="${R}" fill="${gold}"/>`;
      } else if (done) g += `<circle cx="${x}" cy="${cy}" r="${R}" fill="${ink}" fill-opacity=".9"/>`;
      else g += `<circle cx="${x}" cy="${cy}" r="${R - 3}" fill="none" stroke="${ink}" stroke-opacity=".35" stroke-width="6"/>`;
      g += icon(done && !now ? 'check' : icons[i], x - s / 2, cy - s / 2, s, now ? '#1b1b1b' : done ? color : ink, now || done ? 1 : .4);
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><defs><radialGradient id="g" cx="${ready ? 25 : 50}%" cy="50%" r="65%"><stop offset="0" stop-color="${gold}" stop-opacity=".18"/><stop offset="1" stop-color="${gold}" stop-opacity="0"/></radialGradient></defs><rect width="${W}" height="${H}" fill="${color}"/><rect width="${W}" height="${H}" fill="url(#g)"/>${g}</svg>`;
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9, palette: true }).toBuffer();
    return `data:image/png;base64,${png.toString('base64')}`;
  } catch (e) { console.error('PAGER_STRIP', e.message); return null; }
}

module.exports = { stampStrip, pagerStrip, brandColor };
