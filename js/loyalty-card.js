// =====================================================================
// DEV MENU — رسم بطاقة الولاء حسب تصميم صاحب المحل (صفحة الزبون + معاينة لوحة التحكم)
// =====================================================================
(function () {
  const ICONS = {
    coffee: 'ph-coffee', 'fork-knife': 'ph-fork-knife', hamburger: 'ph-hamburger', pizza: 'ph-pizza', 'ice-cream': 'ph-ice-cream',
    bread: 'ph-bread', cookie: 'ph-cookie', cake: 'ph-cake', 'bowl-food': 'ph-bowl-food', popcorn: 'ph-popcorn', heart: 'ph-heart', star: 'ph-star'
  };
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // لون نص واضح فوق أي لون
  function inkFor(hex) {
    const n = parseInt(String(hex || '#000000').slice(1), 16);
    const [r, g, b] = [n >> 16 & 255, n >> 8 & 255, n & 255].map(v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); });
    return .2126 * r + .7152 * g + .0722 * b > .45 ? '#1b1b1b' : '#ffffff';
  }
  function apply(el, d) {
    d = d || {};
    el.classList.remove('st-gradient', 'st-solid', 'st-paper', 'st-dark', 'st-glass');
    el.classList.add(`st-${d.style || 'gradient'}`);
    el.style.setProperty('--c', d.color || '#233d2c');
    // متدرج بلونين لو اختار لون ثاني
    el.classList.toggle('two', (d.style === 'gradient' || d.style === 'glass') && !!d.color2);
    el.style.setProperty('--c2', d.color2 || d.color || '#233d2c');
    el.style.setProperty('--stamp', d.stamp_color || '#c9a227');
    el.style.setProperty('--stamp-ink', inkFor(d.stamp_color || '#c9a227'));
    const solidInk = inkFor(d.color || '#233d2c');
    const auto = d.style === 'paper' ? (d.color || '#233d2c') : d.style === 'dark' || d.style === 'glass' ? '#ffffff' : solidInk;
    // لون الخط: اختيار صاحب المحل، وإلا تلقائي حسب لون البطاقة
    el.style.setProperty('--ink', d.text_color || auto);
    el.classList.toggle('ink-set', !!d.text_color);
    media(el, d);
    logo(el, d);
  }
  // شعار البطاقة الخاص (غير شعار المنيو) في زاوية البطاقة
  function logo(el, d) {
    let img = el.querySelector(':scope > .lcard-logo');
    if (!d.logo) { if (img) img.remove(); return; }
    if (!img) { img = document.createElement('img'); img.className = 'lcard-logo'; img.alt = ''; const m = el.querySelector(':scope > .lcard-media'); m ? m.after(img) : el.prepend(img); }
    if (img.getAttribute('src') !== d.logo) img.src = d.logo;
  }
  // خلفية صورة تغطي البطاقة كلها، وفوقها طبقة غامقة عشان الكلام والأختام تبان
  function media(el, d) {
    const kind = d.bg === 'image' && d.bg_image ? 'image' : '';
    const key = kind && d.bg_image;
    let box = el.querySelector(':scope > .lcard-media');
    el.classList.toggle('has-media', !!kind);
    if (!kind) { if (box) box.remove(); return; }
    if (box && box.dataset.key === key) return;
    if (box) box.remove();
    box = document.createElement('div');
    box.className = 'lcard-media'; box.dataset.key = key;
    box.style.backgroundImage = `url("${String(d.bg_image).replace(/"/g, '%22')}")`;
    el.prepend(box);
  }
  function stamps(count, needed, d, fresh = -1) {
    d = d || {};
    const icon = ICONS[d.icon] || ICONS.coffee;
    const img = d.stamp_image ? `<img src="${esc(d.stamp_image)}" alt="" loading="lazy">` : '';
    let h = '';
    for (let i = 0; i < needed; i++) {
      const on = i < count, last = i === needed - 1;
      const gift = d.reward_image ? `<img class="reward" src="${esc(d.reward_image)}" alt="" loading="lazy">` : '<i class="ph-bold ph-gift"></i>';
      const inner = last && !on ? gift : img || `<i class="ph-bold ${icon}"></i>`;
      h += `<span class="stamp ${on ? 'on' : last ? 'gift' : ''} ${i === fresh ? 'new' : ''}">${inner}</span>`;
    }
    return h;
  }
  window.DMLoyaltyCard = { ICONS, apply, stamps, inkFor };
})();
