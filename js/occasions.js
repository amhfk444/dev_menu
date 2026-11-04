// =====================================================================
// DEV MENU — زينة المناسبات (المنيو، صفحة الروابط، ومعاينة لوحة التحكم)
// كل الرسومات SVG و CSS داخل الملف: خفيفة على الجوال وبدون صور خارجية.
// الزينة ما تستقبل لمس (pointer-events: none) فما تغطي أي زر،
// وإذا الجوال مفعّل فيه "تقليل الحركة" تظهر ثابتة بدون حركة.
// =====================================================================
(function () {
  // ─── المناسبات الأساسية ───
  // decor: الزينة أعلى الصفحة حول الشعار، fx: المؤثرات (نجوم، قصاصات، ثلج)
  const PRESETS = {
    ramadan:        { name: 'رمضان',              icon: '🌙', greet: ['رمضان كريم', 'Ramadan Kareem'],               decor: 'lanterns', fx: 'stars' },
    eid_fitr:       { name: 'عيد الفطر',           icon: '🎉', greet: ['عيدكم مبارك', 'Eid Mubarak'],                  decor: 'bunting',  fx: 'confetti' },
    eid_adha:       { name: 'عيد الأضحى',          icon: '🐑', greet: ['عيد أضحى مبارك', 'Eid al-Adha Mubarak'],       decor: 'bunting',  fx: 'confetti' },
    national_day:   { name: 'اليوم الوطني',        icon: '💚', greet: ['كل عام والوطن بخير', 'Happy Saudi National Day'], decor: 'green',    fx: 'confetti-green' },
    founding_day:   { name: 'يوم التأسيس',         icon: '🏛️', greet: ['ذكرى يوم التأسيس', 'Happy Founding Day'],       decor: 'sadu',     fx: 'none' },
    hijri_new_year: { name: 'رأس السنة الهجرية',   icon: '🌒', greet: ['كل عام وأنتم بخير', 'Happy Hijri New Year'],   decor: 'crescent', fx: 'stars' },
    winter:         { name: 'الشتاء',              icon: '❄️', greet: ['أجواء الشتاء', 'Winter vibes'],                decor: 'none',     fx: 'snow' },
    custom:         { name: 'مناسبة خاصة',         icon: '✨', greet: ['', ''],                                         decor: 'balloons', fx: 'confetti' }
  };
  const POSITIONS = { 'logo-right': 'يمين الشعار', 'logo-left': 'يسار الشعار', float: 'عائم في زاوية الشاشة' };
  const SIZES = { s: 'صغير', m: 'وسط', l: 'كبير' };
  const ANIMS = { float: 'طفو', swing: 'تمايل', bounce: 'قفز', pulse: 'نبض', none: 'ثابت' };

  // ─── التواريخ المقترحة (تقويم أم القرى) ───
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
  let hijriFmt = null;
  function hijriOf(d) {
    if (!hijriFmt) hijriFmt = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura-nu-latn', { day: 'numeric', month: 'numeric', year: 'numeric' });
    const p = Object.fromEntries(hijriFmt.formatToParts(d).map(x => [x.type, x.value]));
    return { d: +p.day, m: +p.month, y: parseInt(p.year, 10) };
  }
  // أول يوم قادم (من اليوم) يوافق شهر ويوم هجري معيّن
  function nextHijri(month, day, from = new Date()) {
    let d = new Date(from.getFullYear(), from.getMonth(), from.getDate(), 12);
    for (let i = 0; i < 400; i++, d = addDays(d, 1)) { const h = hijriOf(d); if (h.m === month && h.d === day) return d; }
    return null;
  }
  function nextGregorian(month, day, spanDays) {
    const now = new Date(); const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12);
    let d = new Date(today.getFullYear(), month - 1, day, 12);
    if (addDays(d, spanDays) < today) d = new Date(today.getFullYear() + 1, month - 1, day, 12);
    return d;
  }
  // يرجّع {start, end} بصيغة YYYY-MM-DD. المناسبات الهجرية تقريبية حسب أم القرى وتقبل التعديل
  function suggestDates(preset) {
    const now = new Date();
    try {
      if (preset === 'ramadan') {
        // لو رمضان جاري الحين نبدأ من اليوم
        const h = hijriOf(now);
        const start = h.m === 9 ? now : nextHijri(9, 1);
        const shawwal = nextHijri(10, 1, start);
        return { start: ymd(start), end: ymd(addDays(shawwal, -1)) };
      }
      if (preset === 'eid_fitr') { const s = nextHijri(10, 1, addDays(now, -3)); return { start: ymd(s), end: ymd(addDays(s, 3)) }; }
      if (preset === 'eid_adha') { const s = nextHijri(12, 9, addDays(now, -4)); return { start: ymd(s), end: ymd(addDays(s, 4)) }; }
      if (preset === 'hijri_new_year') { const s = nextHijri(1, 1, addDays(now, -2)); return { start: ymd(addDays(s, -1)), end: ymd(addDays(s, 2)) }; }
    } catch {}
    if (preset === 'national_day') { const s = nextGregorian(9, 20, 4); return { start: ymd(s), end: ymd(addDays(s, 4)) }; }
    if (preset === 'founding_day') { const s = nextGregorian(2, 20, 3); return { start: ymd(s), end: ymd(addDays(s, 3)) }; }
    if (preset === 'winter') { const s = nextGregorian(12, 1, 89); return { start: ymd(s), end: ymd(addDays(s, 89)) }; }
    return { start: ymd(now), end: ymd(addDays(now, 7)) };
  }

  // ─── الرسومات ───
  const lantern = (c1 = '#d9a93f', c2 = '#f4a261', id = 'a') => `
    <svg viewBox="0 0 40 72" aria-hidden="true"><defs><radialGradient id="dmg${id}" cx="50%" cy="55%" r="55%"><stop offset="0" stop-color="#fff8d6"/><stop offset=".55" stop-color="#ffd27a"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
      <circle cx="20" cy="4" r="3" fill="none" stroke="${c1}" stroke-width="2"/>
      <path d="M11 16 L20 7 L29 16 Z" fill="${c1}"/><rect x="9" y="16" width="22" height="4" rx="1.5" fill="${c1}"/>
      <path d="M11 20 Q8 36 13 52 H27 Q32 36 29 20 Z" fill="url(#dmg${id})" stroke="${c1}" stroke-width="2"/>
      <path d="M20 21 V51 M13.5 28 Q20 31 26.5 28 M12.5 42 Q20 45 27.5 42" stroke="${c1}" stroke-width="1.4" fill="none" opacity=".75"/>
      <rect x="10" y="52" width="20" height="4" rx="1.5" fill="${c1}"/><path d="M15 56 L20 66 L25 56 Z" fill="${c1}"/></svg>`;
  const crescent = (c = '#f1d27a') => `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M27 4 A16 16 0 1 0 36 30 A13 13 0 1 1 27 4 Z" fill="${c}"/></svg>`;
  const star = (c = '#fff3b0') => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0 L12.4 7.6 L20 10 L12.4 12.4 L10 20 L7.6 12.4 L0 10 L7.6 7.6 Z" fill="${c}"/></svg>`;
  const flake = (c) => `<svg viewBox="0 0 24 24" aria-hidden="true"><g stroke="${c}" stroke-width="1.8" stroke-linecap="round" fill="none">
      <path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10"/><path d="M12 5l-2.2-2M12 5l2.2-2M12 19l-2.2 2M12 19l2.2 2M5.6 8.3l-.6-2.9M5.6 8.3l-2.8.9M18.4 15.7l.6 2.9M18.4 15.7l2.8-.9M5.6 15.7l-2.8-.9M5.6 15.7l-.6 2.9M18.4 8.3l2.8.9M18.4 8.3l.6-2.9"/></g></svg>`;
  const palm = (c = '#2f7d4f') => `
    <svg viewBox="0 0 60 80" aria-hidden="true"><path d="M30 34 Q27 58 31 80" stroke="#8a6a3b" stroke-width="4" fill="none" stroke-linecap="round"/>
      <g fill="${c}"><path d="M30 34 Q14 18 0 24 Q16 22 30 34Z"/><path d="M30 34 Q46 18 60 24 Q44 22 30 34Z"/><path d="M30 34 Q18 8 6 6 Q20 12 30 34Z"/>
      <path d="M30 34 Q42 8 54 6 Q40 12 30 34Z"/><path d="M30 34 Q30 12 30 2 Q33 16 30 34Z"/><path d="M30 34 Q10 34 4 44 Q16 36 30 34Z"/><path d="M30 34 Q50 34 56 44 Q44 36 30 34Z"/></g>
      <g fill="#b5762c"><circle cx="27" cy="37" r="2.4"/><circle cx="32" cy="38" r="2.4"/><circle cx="29.5" cy="41" r="2.4"/></g></svg>`;
  const balloon = (c) => `
    <svg viewBox="0 0 30 64" aria-hidden="true"><path d="M15 38 Q12 50 16 64" stroke="rgba(150,150,150,.8)" stroke-width="1" fill="none"/>
      <ellipse cx="15" cy="17" rx="13" ry="16" fill="${c}"/><path d="M12.5 33 L17.5 33 L15 37 Z" fill="${c}"/><ellipse cx="10" cy="11" rx="3" ry="5" fill="#fff" opacity=".35"/></svg>`;
  // حبل أعلام صغيرة بخيط ذهبي، ممتد بعرض الترويسة
  function bunting(colors, pattern = false) {
    const n = 17, w = 400;
    const y = (x) => 3 + 16 * Math.sin(Math.PI * x / w);
    let flags = '';
    for (let i = 0; i < n; i++) {
      const x = 6 + i * ((w - 12) / (n - 1)), top = y(x), c = colors[i % colors.length];
      flags += `<path d="M${x - 8} ${top} L${x + 8} ${top} L${x} ${top + 19} Z" fill="${c}"/><path d="M${x} ${top} L${x + 8} ${top} L${x} ${top + 19} Z" fill="#000" opacity=".1"/>`;
      if (pattern) flags += `<path d="M${x} ${top + 3} L${x + 3} ${top + 7} L${x} ${top + 11} L${x - 3} ${top + 7} Z" fill="#f6e7c8" opacity=".9"/>`;
    }
    return `<svg viewBox="0 0 ${w} 44" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 3 Q${w / 2} 35 ${w} 3" stroke="#c9a227" stroke-width="1.6" fill="none"/>${flags}</svg>`;
  }
  // حبل إضاءة (للعيد): أسلاك ولمبات تلمع
  function lights(colors) {
    const n = 13, w = 400, y = (x) => 4 + 22 * Math.sin(Math.PI * x / w);
    let bulbs = '';
    for (let i = 0; i < n; i++) {
      const x = 10 + i * ((w - 20) / (n - 1)), t = y(x), c = colors[i % colors.length];
      bulbs += `<g class="dmo-bulb" style="animation-delay:-${(i % 3) * .5}s"><rect x="${x - 2.2}" y="${t}" width="4.4" height="5" rx="1" fill="#8a7a55"/><ellipse cx="${x}" cy="${t + 11}" rx="5.6" ry="7.6" fill="${c}"/><ellipse cx="${x - 1.8}" cy="${t + 9}" rx="1.6" ry="2.6" fill="#fff" opacity=".6"/></g>`;
    }
    return `<svg viewBox="0 0 ${w} 44" preserveAspectRatio="none" aria-hidden="true" style="overflow:visible">
      <path d="M0 4 Q${w / 2} 48 ${w} 4" stroke="#7d6a45" stroke-width="1.3" fill="none"/>${bulbs}</svg>`;
  }
  // شريط السدو (يوم التأسيس): مثلثات ومعينات بألوان النسيج
  function sadu() {
    const w = 400, u = 20; let g = '';
    for (let x = 0; x < w; x += u) {
      g += `<path d="M${x} 0 L${x + u / 2} 9 L${x + u} 0 Z" fill="#7a3e1d"/><path d="M${x} 22 L${x + u / 2} 13 L${x + u} 22 Z" fill="#1f2a24"/>`;
      g += `<path d="M${x + u / 2} 5 L${x + u * .8} 11 L${x + u / 2} 17 L${x + u * .2} 11 Z" fill="#c9a227"/><circle cx="${x + u / 2}" cy="11" r="1.6" fill="#f6e7c8"/>`;
    }
    return `<svg viewBox="0 0 ${w} 22" preserveAspectRatio="none" aria-hidden="true"><rect width="${w}" height="22" fill="#a4532c"/>${g}</svg>`;
  }
  const PALETTES = {
    eid: ['#e9c46a', '#f7f0dc', '#2a9d8f', '#e9c46a', '#e07a8f'],
    lights: ['#ffd36b', '#ffefb3', '#ffb86b'],
    green: ['#1b7f4b', '#f5f5f0', '#2fa36b', '#f5f5f0'],
    sadu: ['#7a3e1d', '#c9a227', '#1f5a3a', '#a4532c'],
    confetti: ['#e9c46a', '#e07a8f', '#2a9d8f', '#f7f0dc', '#b08bd6'],
    'confetti-green': ['#1b7f4b', '#2fa36b', '#f5f5f0', '#c9a227']
  };
  // أيقونات التهنئة (بدل الإيموجي): رسم بخط واحد يتلوّن مع البطاقة
  const ICONS = {
    ramadan: `<svg viewBox="0 0 24 24"><path d="M15 3a8 8 0 1 0 6 13 6.5 6.5 0 1 1-6-13z" fill="currentColor"/><path d="M18 3.5l.6 1.6 1.6.6-1.6.6-.6 1.6-.6-1.6-1.6-.6 1.6-.6z" fill="currentColor"/></svg>`,
    eid: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.2 6.3L21 9l-5.3 4 1.9 6.6L12 15.8 6.4 19.6 8.3 13 3 9l6.8-.7z"/></svg>`,
    flag: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 21V4"/><path d="M5 4h12l-2 4 2 4H5" fill="currentColor"/></svg>`,
    palm: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 10c-1-3-4-5-8-4 3 0 5 2 6 4-3-1-6 0-7 3 2-2 5-2 7-1-1 3-1 6 0 10h2c-1-4-1-7 0-10 2-1 5-1 7 1-1-3-4-4-7-3 1-2 3-4 6-4-4-1-7 1-8 4-1-2-1-5 1-7-2 0-4 3-4 7z"/></svg>`,
    snow: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 2v20M3.3 7l17.4 10M3.3 17l17.4-10"/></svg>`,
    spark: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.8 6.2L20 10l-6.2 1.8L12 18l-1.8-6.2L4 10l6.2-1.8z"/><circle cx="19" cy="18" r="1.6"/><circle cx="5" cy="19" r="1.2"/></svg>`
  };
  // شكل بطاقة التهنئة لكل مناسبة: الخلفية، ولون النص، والأيقونة
  const CARD = {
    ramadan:        { bg: 'linear-gradient(135deg,#1d2a4d,#3b2a5c)', fg: '#f6e3a4', icon: 'ramadan' },
    eid_fitr:       { bg: 'linear-gradient(135deg,#f6e7b8,#e9c46a)', fg: '#3d2f0f', icon: 'eid' },
    eid_adha:       { bg: 'linear-gradient(135deg,#f6e7b8,#e0b25a)', fg: '#3d2f0f', icon: 'eid' },
    national_day:   { bg: 'linear-gradient(135deg,#1b7f4b,#0f5c35)', fg: '#ffffff', icon: 'flag' },
    founding_day:   { bg: 'linear-gradient(135deg,#7a3e1d,#a4532c)', fg: '#f6e7c8', icon: 'palm' },
    hijri_new_year: { bg: 'linear-gradient(135deg,#1d2a4d,#2b4a6b)', fg: '#e8eef7', icon: 'ramadan' },
    winter:         { bg: 'linear-gradient(135deg,#e8f2fb,#c9def2)', fg: '#1f3b57', icon: 'snow' },
    custom:         { bg: 'var(--accent,#384f3d)', fg: 'var(--accent-fg,#fff)', icon: 'spark' }
  };

  // ─── CSS (يُحقن مرة وحدة) ───
  const CSS = `
    .dmo-top{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:visible}
    .dmo-fx{pointer-events:none;overflow:hidden;inset:0}
    .dmo-fx.back{z-index:0}.dmo-fx.front{z-index:45}
    .dmo-el{position:absolute;pointer-events:none}.dmo-el svg,.dmo-el img{display:block;width:100%;height:auto}
    .dmo-glow{filter:drop-shadow(0 0 6px rgba(255,200,90,.75)) drop-shadow(0 4px 6px rgba(0,0,0,.25))}
    .dmo-shadow{filter:drop-shadow(0 3px 5px rgba(0,0,0,.28))}
    .dmo-string{position:absolute;top:0;width:1.5px;background:linear-gradient(#a8842c,#e9c46a)}
    .dmo-swing{transform-origin:50% 0;animation:dmo-swing 3.2s ease-in-out infinite alternate}
    .dmo-float{animation:dmo-float 3s ease-in-out infinite alternate}
    .dmo-bounce{animation:dmo-bounce 1.6s cubic-bezier(.3,0,.3,1) infinite}
    .dmo-pulse{animation:dmo-pulse 2.2s ease-in-out infinite}
    .dmo-twinkle{animation:dmo-twinkle 2.4s ease-in-out infinite}
    .dmo-rise{animation:dmo-rise 4s ease-in-out infinite alternate}
    .dmo-bulb{animation:dmo-bulb 1.5s ease-in-out infinite alternate}
    .dmo-fall{top:-8%;animation:dmo-fall linear forwards}
    .dmo-snow{top:-6%;animation:dmo-fall linear infinite}
    @keyframes dmo-swing{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}
    @keyframes dmo-float{from{transform:translateY(-5px)}to{transform:translateY(5px)}}
    @keyframes dmo-bounce{0%,100%{transform:translateY(0)}45%{transform:translateY(-12px)}}
    @keyframes dmo-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
    @keyframes dmo-twinkle{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}
    @keyframes dmo-rise{from{transform:translateY(4px) rotate(-3deg)}to{transform:translateY(-8px) rotate(3deg)}}
    @keyframes dmo-bulb{from{opacity:.55}to{opacity:1}}
    @keyframes dmo-fall{to{top:108%;transform:translateX(var(--dx,0)) rotate(var(--rot,360deg))}}
    .dmo-card{position:relative;display:inline-flex;align-items:center;gap:10px;padding:9px 18px 9px 14px;border-radius:16px;overflow:hidden;
      box-shadow:0 10px 24px -10px rgba(0,0,0,.45),inset 0 0 0 1px rgba(255,255,255,.18);animation:dmo-in .6s cubic-bezier(.2,1.3,.4,1) both}
    .dmo-card .ic{width:22px;height:22px;flex-shrink:0}.dmo-card .ic svg{width:100%;height:100%;display:block}
    .dmo-card b{font-size:15px;font-weight:800;line-height:1.3;white-space:nowrap}
    .dmo-card::after{content:"";position:absolute;inset:0;background:linear-gradient(105deg,transparent 35%,rgba(255,255,255,.45) 50%,transparent 65%);transform:translateX(-120%);animation:dmo-shine 3.6s ease-in-out 1s infinite}
    @keyframes dmo-in{from{opacity:0;transform:translateY(8px) scale(.92)}to{opacity:1;transform:none}}
    @keyframes dmo-shine{0%{transform:translateX(-120%)}35%,100%{transform:translateX(120%)}}
    @media (prefers-reduced-motion:reduce){.dmo-swing,.dmo-float,.dmo-bounce,.dmo-pulse,.dmo-twinkle,.dmo-rise,.dmo-snow,.dmo-bulb,.dmo-card,.dmo-card::after{animation:none}}`;
  function injectCss() {
    const old = document.getElementById('dmo-css'); if (old) old.remove();
    const st = document.createElement('style'); st.id = 'dmo-css'; st.textContent = CSS; document.head.appendChild(st);
  }

  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  function safeUrl(u) { try { const x = new URL(u); return x.protocol === 'https:' || x.protocol === 'http:' ? x.href : ''; } catch { return ''; } }
  const reduced = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rnd = (a, b) => a + Math.random() * (b - a);
  function el(parent, html, style, cls = '') {
    const d = document.createElement('div');
    d.className = `dmo-el ${cls}`; d.style.cssText = style; d.innerHTML = html;
    parent.appendChild(d); return d;
  }

  // الزينة الجانبية (يمين ويسار الشعار) إذا ما فيه ملصق للمطعم بنفس المكان
  function sideDecor(top, kind, taken) {
    const sides = [['right', 'logo-right'], ['left', 'logo-left']].filter(([, pos]) => !taken.has(pos));
    sides.forEach(([side], i) => {
      if (kind === 'lanterns') {
        // ثلاث فوانيس بأطوال مختلفة لكل جهة، تتمايل وتضوي
        [[3, 74, 34, 0, '#d9a93f', '#f4a261'], [13, 40, 26, .7, '#c9a227', '#e9c46a'], [22, 92, 22, 1.3, '#d9a93f', '#f4a261']].forEach(([off, drop, w, delay, c1, c2], j) => {
          const x = `${side}:${off}%`;
          top.insertAdjacentHTML('beforeend', `<div class="dmo-string" style="${x};height:${drop}px;margin-${side}:${w / 2}px"></div>`);
          el(top, lantern(c1, c2, `${side}${j}`), `${x};top:${drop - 4}px;width:${w}px;animation-delay:-${delay + i}s`, 'dmo-swing dmo-glow');
        });
      } else if (kind === 'crescent' && side === 'right') {
        el(top, crescent('#f1d27a'), `right:5%;top:4px;width:52px`, 'dmo-float dmo-glow');
      } else if (kind === 'green' || kind === 'sadu') {
        el(top, palm(kind === 'sadu' ? '#3d6b3f' : '#1f8a52'), `${side}:2%;bottom:-6px;width:64px;animation-delay:-${i}s`, 'dmo-float dmo-shadow');
      } else if (kind === 'balloons') {
        ['#e07a8f', '#e9c46a', '#2a9d8f'].forEach((c, j) =>
          el(top, balloon(c), `${side}:${2 + j * 7}%;top:${16 + (j % 2) * 22}px;width:${32 - j * 3}px;animation-delay:-${j * 1.3 + i}s`, 'dmo-rise dmo-shadow'));
      }
    });
    if (kind === 'crescent' || kind === 'lanterns') {
      // قوس نجوم صغيرة فوق الشعار
      for (let i = 0; i < 7; i++) { const a = Math.PI * (i + .5) / 7; el(top, star('#ffe9a3'), `left:${50 + 34 * Math.cos(a)}%;top:${4 + 26 * (1 - Math.sin(a))}px;width:${rnd(7, 11)}px;animation-delay:-${rnd(0, 2.4)}s`, 'dmo-twinkle dmo-glow'); }
    }
  }

  function effects(back, front, fx) {
    if (reduced() || fx === 'none') return;
    if (fx === 'stars') {
      for (let i = 0; i < 14; i++) el(back, star('#ffe9a3'), `left:${rnd(2, 96)}%;top:${rnd(2, 55)}%;width:${rnd(6, 12)}px;animation-delay:-${rnd(0, 2.4)}s;opacity:.8`, 'dmo-twinkle dmo-glow');
    } else if (fx === 'snow') {
      // ندف ثلج بلون أزرق فاتح وظل: تبين على الثيم الفاتح والداكن
      for (let i = 0; i < 18; i++) {
        el(back, flake(i % 3 ? '#cfe3f5' : '#ffffff'),
          `left:${rnd(0, 100)}%;width:${rnd(9, 18)}px;animation-duration:${rnd(10, 18)}s;animation-delay:-${rnd(0, 18)}s;--dx:${rnd(-30, 30)}px;--rot:${rnd(-180, 180)}deg;filter:drop-shadow(0 1px 2px rgba(31,59,87,.45))`, 'dmo-snow');
      }
    } else if (fx.startsWith('confetti')) {
      // قصاصات تنزل مرة وحدة عند الفتح ثم تختفي
      const colors = PALETTES[fx] || PALETTES.confetti;
      for (let i = 0; i < 40; i++) {
        const w = rnd(6, 10), h = w * rnd(0.4, 1), round = i % 4 === 0;
        el(front, `<svg viewBox="0 0 10 10" preserveAspectRatio="none">${round ? `<circle cx="5" cy="5" r="5" fill="${colors[i % colors.length]}"/>` : `<rect width="10" height="10" rx="2" fill="${colors[i % colors.length]}"/>`}</svg>`,
          `left:${rnd(0, 100)}%;width:${w}px;height:${round ? w : h}px;animation-duration:${rnd(2.8, 4.8)}s;animation-delay:${rnd(0, 1.2)}s;--dx:${rnd(-60, 60)}px;--rot:${rnd(240, 720)}deg;filter:drop-shadow(0 1px 1px rgba(0,0,0,.2))`, 'dmo-fall');
      }
      setTimeout(() => { front.innerHTML = ''; }, 6500);
    }
  }

  const STICKER_PX = { s: 56, m: 80, l: 110 };
  function stickers(top, front, list) {
    (list || []).forEach((s, i) => {
      const url = safeUrl(s.url); if (!url) return;
      const px = STICKER_PX[s.size] || STICKER_PX.m;
      const anim = ANIMS[s.animation] && s.animation !== 'none' ? `dmo-${s.animation}` : '';
      const img = `<img src="${esc(url)}" alt="" loading="lazy" decoding="async">`;
      if (s.position === 'float') {
        el(front, img, `left:12px;bottom:${96 + i * 8}px;width:${px}px;z-index:1;filter:drop-shadow(0 6px 12px rgba(0,0,0,.25))`, anim);
      } else {
        const side = s.position === 'logo-left' ? 'left' : 'right';
        el(top, img, `${side}:3%;top:${px > 90 ? 6 : 22}px;width:${px}px;animation-delay:-${i * .7}s;filter:drop-shadow(0 6px 12px rgba(0,0,0,.25))`, anim);
      }
    });
  }

  // يعرض مناسبة: header = ترويسة المنيو (لازم position:relative)، greet = مكان التهنئة
  // contained = true للمعاينة داخل صندوق (بدل ما تغطي الشاشة كاملة)
  function render(occ, { header, greet, host = document.body, contained = false, lang = 'ar' } = {}) {
    clear(header, greet, host);
    if (!occ || !PRESETS[occ.preset]) return;
    injectCss();
    const p = PRESETS[occ.preset];
    const top = document.createElement('div'); top.className = 'dmo-top'; top.dataset.dmo = '1';
    header.prepend(top);
    const layer = (cls) => {
      const d = document.createElement('div'); d.className = `dmo-fx ${cls}`; d.dataset.dmo = '1';
      d.style.position = contained ? 'absolute' : 'fixed';
      host.appendChild(d); return d;
    };
    const back = layer('back'), front = layer('front');

    if (p.decor === 'bunting') el(top, lights(PALETTES.lights), 'left:-2%;right:-2%;top:-4px;height:50px', 'dmo-glow');
    if (p.decor === 'green') el(top, bunting(PALETTES.green), 'left:-2%;right:-2%;top:-4px;height:44px', 'dmo-shadow');
    if (p.decor === 'sadu') el(top, sadu(), 'left:0;right:0;top:-8px;height:22px;border-radius:4px;overflow:hidden', 'dmo-shadow');
    const taken = new Set((occ.stickers || []).map(s => s.position));
    sideDecor(top, p.decor, taken);
    effects(back, front, p.fx);
    stickers(top, front, occ.stickers);

    setGreeting(occ, greet, lang);
  }
  // بطاقة التهنئة: النص اللي كتبه المطعم، وإلا تهنئة المناسبة الجاهزة، وإلا اسم المناسبة
  function setGreeting(occ, greet, lang = 'ar') {
    if (!greet) return;
    const p = occ && PRESETS[occ.preset];
    const text = p ? ((occ.greeting || '').trim() || p.greet[lang === 'en' ? 1 : 0] || (occ.title || '').trim()) : '';
    if (text) injectCss();
    const c = (p && CARD[occ.preset]) || CARD.custom;
    greet.innerHTML = text ? `<span class="dmo-card" style="background:${c.bg};color:${c.fg}"><span class="ic" aria-hidden="true">${ICONS[c.icon]}</span><b>${esc(text)}</b></span>` : '';
    greet.classList.toggle('hidden', !text);
  }
  function clear(header, greet, host = document.body) {
    [header, host].forEach(n => n && n.querySelectorAll(':scope > [data-dmo]').forEach(x => x.remove()));
    if (greet) { greet.innerHTML = ''; greet.classList.add('hidden'); }
  }

  window.DMOccasions = { PRESETS, POSITIONS, SIZES, ANIMS, suggestDates, render, clear, setGreeting };
})();
