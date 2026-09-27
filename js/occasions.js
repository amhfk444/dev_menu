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
  const lantern = (c1 = '#e9c46a', c2 = '#f4a261') => `
    <svg viewBox="0 0 40 72" aria-hidden="true"><defs><radialGradient id="dmg" cx="50%" cy="55%" r="50%"><stop offset="0" stop-color="#fff6c9"/><stop offset="1" stop-color="${c2}"/></radialGradient></defs>
      <circle cx="20" cy="4" r="3" fill="none" stroke="${c1}" stroke-width="2"/>
      <path d="M11 16 L20 7 L29 16 Z" fill="${c1}"/><rect x="9" y="16" width="22" height="4" rx="1.5" fill="${c1}"/>
      <path d="M11 20 Q8 36 13 52 H27 Q32 36 29 20 Z" fill="url(#dmg)" stroke="${c1}" stroke-width="2"/>
      <path d="M20 21 V51 M13.5 28 Q20 31 26.5 28 M12.5 42 Q20 45 27.5 42" stroke="${c1}" stroke-width="1.4" fill="none" opacity=".8"/>
      <rect x="10" y="52" width="20" height="4" rx="1.5" fill="${c1}"/><path d="M15 56 L20 66 L25 56 Z" fill="${c1}"/></svg>`;
  const crescent = (c = '#f1d27a') => `<svg viewBox="0 0 40 40" aria-hidden="true"><path d="M27 4 A16 16 0 1 0 36 30 A13 13 0 1 1 27 4 Z" fill="${c}"/></svg>`;
  const star = (c = '#fff3b0') => `<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M10 0 L12.4 7.6 L20 10 L12.4 12.4 L10 20 L7.6 12.4 L0 10 L7.6 7.6 Z" fill="${c}"/></svg>`;
  const palm = (c = '#2f7d4f') => `
    <svg viewBox="0 0 60 80" aria-hidden="true"><path d="M30 34 Q27 58 31 80" stroke="#8a6a3b" stroke-width="4" fill="none" stroke-linecap="round"/>
      <g fill="${c}"><path d="M30 34 Q14 18 0 24 Q16 22 30 34Z"/><path d="M30 34 Q46 18 60 24 Q44 22 30 34Z"/><path d="M30 34 Q18 8 6 6 Q20 12 30 34Z"/>
      <path d="M30 34 Q42 8 54 6 Q40 12 30 34Z"/><path d="M30 34 Q30 12 30 2 Q33 16 30 34Z"/><path d="M30 34 Q10 34 4 44 Q16 36 30 34Z"/><path d="M30 34 Q50 34 56 44 Q44 36 30 34Z"/></g>
      <g fill="#b5762c"><circle cx="27" cy="37" r="2.4"/><circle cx="32" cy="38" r="2.4"/><circle cx="29.5" cy="41" r="2.4"/></g></svg>`;
  const balloon = (c) => `
    <svg viewBox="0 0 30 64" aria-hidden="true"><path d="M15 38 Q12 50 16 64" stroke="rgba(150,150,150,.8)" stroke-width="1" fill="none"/>
      <ellipse cx="15" cy="17" rx="13" ry="16" fill="${c}"/><path d="M12.5 33 L17.5 33 L15 37 Z" fill="${c}"/><ellipse cx="10" cy="11" rx="3" ry="5" fill="#fff" opacity=".35"/></svg>`;
  // حبل أعلام مثلثة يمتد بعرض الترويسة
  function bunting(colors, pattern = false) {
    const n = 13, w = 400;
    const y = (x) => 4 + 20 * Math.sin(Math.PI * x / w);
    let flags = '';
    for (let i = 0; i < n; i++) {
      const x = 8 + i * ((w - 16) / (n - 1)), top = y(x), c = colors[i % colors.length];
      flags += `<path d="M${x - 11} ${top} L${x + 11} ${top} L${x} ${top + 24} Z" fill="${c}"/>`;
      if (pattern) flags += `<path d="M${x} ${top + 4} L${x + 4} ${top + 9} L${x} ${top + 14} L${x - 4} ${top + 9} Z" fill="#f6e7c8" opacity=".9"/>`;
    }
    return `<svg viewBox="0 0 ${w} 52" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 4 Q${w / 2} 44 ${w} 4" stroke="rgba(200,200,200,.7)" stroke-width="1.5" fill="none"/>${flags}</svg>`;
  }
  const PALETTES = {
    eid: ['#e76f51', '#f4a261', '#e9c46a', '#2a9d8f', '#8e7dbe', '#ef476f'],
    green: ['#1b7f4b', '#f5f5f0', '#2fa36b', '#f5f5f0'],
    sadu: ['#7a3e1d', '#c9a227', '#1f5a3a', '#a4532c'],
    confetti: ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#f4a261', '#8e7dbe'],
    'confetti-green': ['#1b7f4b', '#2fa36b', '#f5f5f0', '#c9a227']
  };

  // ─── CSS (يُحقن مرة وحدة) ───
  const CSS = `
    .dmo-top{position:absolute;inset:0;pointer-events:none;z-index:0;overflow:visible}
    .dmo-fx{pointer-events:none;overflow:hidden;inset:0}
    .dmo-fx.back{z-index:0}.dmo-fx.front{z-index:45}
    .dmo-el{position:absolute;pointer-events:none}.dmo-el svg,.dmo-el img{display:block;width:100%;height:auto}
    .dmo-string{position:absolute;top:0;width:1.5px;background:linear-gradient(#c9a227,#e9c46a)}
    .dmo-swing{transform-origin:50% 0;animation:dmo-swing 3.2s ease-in-out infinite alternate}
    .dmo-float{animation:dmo-float 3s ease-in-out infinite alternate}
    .dmo-bounce{animation:dmo-bounce 1.6s cubic-bezier(.3,0,.3,1) infinite}
    .dmo-pulse{animation:dmo-pulse 2.2s ease-in-out infinite}
    .dmo-twinkle{animation:dmo-twinkle 2.4s ease-in-out infinite}
    .dmo-rise{animation:dmo-rise 4s ease-in-out infinite alternate}
    .dmo-fall{top:-8%;animation:dmo-fall linear forwards}
    .dmo-snow{top:-6%;animation:dmo-fall linear infinite}
    @keyframes dmo-swing{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}
    @keyframes dmo-float{from{transform:translateY(-5px)}to{transform:translateY(5px)}}
    @keyframes dmo-bounce{0%,100%{transform:translateY(0)}45%{transform:translateY(-12px)}}
    @keyframes dmo-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.07)}}
    @keyframes dmo-twinkle{0%,100%{opacity:.25;transform:scale(.7)}50%{opacity:1;transform:scale(1)}}
    @keyframes dmo-rise{from{transform:translateY(4px) rotate(-3deg)}to{transform:translateY(-8px) rotate(3deg)}}
    @keyframes dmo-fall{to{top:108%;transform:translateX(var(--dx,0)) rotate(var(--rot,360deg))}}
    .dmo-greet{display:inline-flex;align-items:center;gap:6px;padding:5px 14px;border-radius:999px;font-size:12px;font-weight:800;
      background:var(--chip,rgba(255,255,255,.1));color:var(--fg,#fff);border:1px solid var(--line,rgba(255,255,255,.2));backdrop-filter:blur(8px)}
    @media (prefers-reduced-motion:reduce){.dmo-swing,.dmo-float,.dmo-bounce,.dmo-pulse,.dmo-twinkle,.dmo-rise,.dmo-snow{animation:none}}`;
  function injectCss() {
    if (document.getElementById('dmo-css')) return;
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

  // مكان الزينة الجانبية (يمين/يسار الشعار) إذا ما فيه ملصق للمطعم بنفس المكان
  function sideDecor(top, kind, taken) {
    const sides = [['right', 'logo-right'], ['left', 'logo-left']].filter(([, pos]) => !taken.has(pos));
    sides.forEach(([side], i) => {
      if (kind === 'lanterns') {
        [[4, 70, 34, 0], [17, 34, 26, .6]].forEach(([off, drop, w, delay]) => {
          const x = `${side}:${off}%`;
          top.insertAdjacentHTML('beforeend', `<div class="dmo-string" style="${x};height:${drop}px;margin-${side}:${w / 2}px"></div>`);
          el(top, lantern(), `${x};top:${drop - 4}px;width:${w}px;animation-delay:-${delay + i}s`, 'dmo-swing');
        });
      } else if (kind === 'crescent' && side === 'right') {
        el(top, crescent(), `right:6%;top:8px;width:40px`, 'dmo-float');
      } else if (kind === 'green' || kind === 'sadu') {
        el(top, palm(kind === 'sadu' ? '#3d6b3f' : '#1f8a52'), `${side}:3%;bottom:-6px;width:58px;animation-delay:-${i}s`, 'dmo-float');
      } else if (kind === 'balloons') {
        ['#ef476f', '#ffd166', '#118ab2'].forEach((c, j) =>
          el(top, balloon(c), `${side}:${2 + j * 7}%;top:${16 + (j % 2) * 22}px;width:${30 - j * 3}px;animation-delay:-${j * 1.3 + i}s`, 'dmo-rise'));
      }
    });
    if (kind === 'crescent' || kind === 'lanterns') {
      for (let i = 0; i < 5; i++) el(top, star(), `left:${rnd(22, 78)}%;top:${rnd(0, 30)}px;width:${rnd(7, 12)}px;animation-delay:-${rnd(0, 2.4)}s`, 'dmo-twinkle');
    }
  }

  function effects(back, front, fx) {
    if (reduced() || fx === 'none') return;
    if (fx === 'stars') {
      for (let i = 0; i < 12; i++) el(back, star(), `left:${rnd(2, 96)}%;top:${rnd(2, 55)}%;width:${rnd(6, 12)}px;animation-delay:-${rnd(0, 2.4)}s;opacity:.7`, 'dmo-twinkle');
    } else if (fx === 'snow') {
      for (let i = 0; i < 16; i++) {
        el(back, `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="#fff" opacity=".85"/></svg>`,
          `left:${rnd(0, 100)}%;width:${rnd(4, 9)}px;animation-duration:${rnd(9, 16)}s;animation-delay:-${rnd(0, 16)}s;--dx:${rnd(-30, 30)}px;--rot:0deg`, 'dmo-snow');
      }
    } else if (fx.startsWith('confetti')) {
      // قصاصات تنزل مرة وحدة عند الفتح ثم تختفي
      const colors = PALETTES[fx] || PALETTES.confetti;
      for (let i = 0; i < 36; i++) {
        const w = rnd(6, 10), h = w * rnd(0.4, 1);
        el(front, `<svg viewBox="0 0 10 10" preserveAspectRatio="none"><rect width="10" height="10" rx="2" fill="${colors[i % colors.length]}"/></svg>`,
          `left:${rnd(0, 100)}%;width:${w}px;height:${h}px;animation-duration:${rnd(2.8, 4.8)}s;animation-delay:${rnd(0, 1.2)}s;--dx:${rnd(-60, 60)}px;--rot:${rnd(240, 720)}deg`, 'dmo-fall');
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

    if (p.decor === 'bunting' || p.decor === 'green' || p.decor === 'sadu') {
      const colors = p.decor === 'bunting' ? PALETTES.eid : PALETTES[p.decor];
      el(top, bunting(colors, p.decor === 'sadu'), 'left:-2%;right:-2%;top:-6px;height:52px');
    }
    const taken = new Set((occ.stickers || []).map(s => s.position));
    sideDecor(top, p.decor, taken);
    effects(back, front, p.fx);
    stickers(top, front, occ.stickers);

    setGreeting(occ, greet, lang);
  }
  // نص التهنئة: اللي كتبه المطعم، وإلا تهنئة المناسبة الجاهزة، وإلا اسم المناسبة
  function setGreeting(occ, greet, lang = 'ar') {
    if (!greet) return;
    const p = occ && PRESETS[occ.preset];
    const text = p ? ((occ.greeting || '').trim() || p.greet[lang === 'en' ? 1 : 0] || (occ.title || '').trim()) : '';
    greet.innerHTML = text ? `<span class="dmo-greet"><span aria-hidden="true">${p.icon}</span>${esc(text)}</span>` : '';
    greet.classList.toggle('hidden', !text);
  }
  function clear(header, greet, host = document.body) {
    [header, host].forEach(n => n && n.querySelectorAll(':scope > [data-dmo]').forEach(x => x.remove()));
    if (greet) { greet.innerHTML = ''; greet.classList.add('hidden'); }
  }

  window.DMOccasions = { PRESETS, POSITIONS, SIZES, ANIMS, suggestDates, render, clear, setGreeting };
})();
