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
    el.classList.remove('st-gradient', 'st-solid', 'st-paper', 'st-dark');
    el.classList.add(`st-${d.style || 'gradient'}`);
    el.style.setProperty('--c', d.color || '#233d2c');
    el.style.setProperty('--stamp', d.stamp_color || '#c9a227');
    el.style.setProperty('--stamp-ink', inkFor(d.stamp_color || '#c9a227'));
    const solidInk = inkFor(d.color || '#233d2c');
    el.style.setProperty('--ink', d.style === 'paper' ? (d.color || '#233d2c') : d.style === 'dark' ? '#f5f5f5' : solidInk);
    media(el, d);
  }
  // خلفية صورة أو فيديو تغطي البطاقة كلها، وفوقها طبقة غامقة عشان الكلام والأختام تبان
  function media(el, d) {
    const kind = d.bg === 'video' && d.bg_video ? 'video' : d.bg === 'image' && d.bg_image ? 'image' : '';
    const key = kind && `${kind}|${d.bg_video || ''}|${d.bg_image || ''}`;
    let box = el.querySelector(':scope > .lcard-media');
    el.classList.toggle('has-media', !!kind);
    if (!kind) { if (box) box.remove(); return; }
    if (box && box.dataset.key === key) return;
    if (box) box.remove();
    box = document.createElement('div');
    box.className = 'lcard-media'; box.dataset.key = key;
    if (kind === 'video') {
      const v = document.createElement('video');
      Object.assign(v, { muted: true, loop: true, autoplay: true, playsInline: true, src: d.bg_video });
      v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      if (d.bg_image) v.poster = d.bg_image;
      if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) v.autoplay = false;
      box.appendChild(v);
    } else box.style.backgroundImage = `url("${String(d.bg_image).replace(/"/g, '%22')}")`;
    el.prepend(box);
  }
  function stamps(count, needed, d, fresh = -1) {
    d = d || {};
    const icon = ICONS[d.icon] || ICONS.coffee;
    const img = d.stamp_image ? `<img src="${esc(d.stamp_image)}" alt="" loading="lazy">` : '';
    let h = '';
    for (let i = 0; i < needed; i++) {
      const on = i < count, last = i === needed - 1;
      const inner = last && !on ? '<i class="ph-bold ph-gift"></i>' : img || `<i class="ph-bold ${icon}"></i>`;
      h += `<span class="stamp ${on ? 'on' : last ? 'gift' : ''} ${i === fresh ? 'new' : ''}">${inner}</span>`;
    }
    return h;
  }
  window.DMLoyaltyCard = { ICONS, apply, stamps, inkFor };
})();
