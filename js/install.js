// =====================================================================
// DEV MENU — "ثبّت التطبيق": الصفحة تنزل على الشاشة الرئيسية وتنفتح كتطبيق (PWA)
//   أندرويد والكمبيوتر: نافذة التثبيت من المتصفح نفسه
//   الآيفون: ما فيه نافذة، فنعرض خطوات "إضافة إلى الشاشة الرئيسية" من Safari
//   DMInstall.banner(el, { key, title, text }) يعرض بطاقة التثبيت لين يثبّت أو يخفيها
// =====================================================================
(function () {
  let deferred = null;
  const ready = [];
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; ready.splice(0).forEach(f => f()); });
  addEventListener('appinstalled', () => { deferred = null; document.querySelectorAll('[data-dm-install]').forEach(el => el.remove()); });

  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  // متصفح داخل تطبيق (انستقرام، واتساب، سناب...): ما يقدر يثبّت، لازم Safari
  const inApp = () => /FBAN|FBAV|Instagram|Snapchat|Line\/|WhatsApp|TikTok|musical_ly|GSA\//i.test(navigator.userAgent) || (ios() && !/Safari/i.test(navigator.userAgent));
  const available = () => !standalone() && (!!deferred || ios());
  const t = (s) => (window.DMi18n ? DMi18n.t(s) : s);

  async function install() {
    if (deferred) {
      deferred.prompt();
      const r = await deferred.userChoice.catch(() => null);
      deferred = null;
      return !!(r && r.outcome === 'accepted');
    }
    if (ios()) iosSteps();
    return false;
  }

  // الآيفون: سهم يتحرك ويأشّر على زر المشاركة في شريط Safari (تحت في الجوال، وفوق في الآيباد)
  const SHARE = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0a7aff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-4px"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';
  function iosSteps() {
    const ipad = /ipad/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    if (!document.getElementById('dm-install-css')) {
      const st = document.createElement('style'); st.id = 'dm-install-css';
      st.textContent = '@keyframes dmNudgeDown{0%,100%{transform:translateY(0)}50%{transform:translateY(12px)}}@keyframes dmNudgeUp{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}@media (prefers-reduced-motion:reduce){.dm-nudge{animation:none!important}}';
      document.head.appendChild(st);
    }
    const box = document.createElement('div');
    box.setAttribute('data-dm-install', '');
    box.style.cssText = `position:fixed;inset:0;z-index:9999;background:rgba(15,25,18,.45);display:flex;flex-direction:column;align-items:${ipad ? 'flex-end' : 'center'};justify-content:${ipad ? 'flex-start' : 'flex-end'};padding:${ipad ? '8px 18px' : '12px 12px 6px'}`;
    const arrow = `<svg class="dm-nudge" width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#e9c95a" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="animation:${ipad ? 'dmNudgeUp' : 'dmNudgeDown'} 1s ease-in-out infinite;filter:drop-shadow(0 4px 10px rgba(0,0,0,.4))"><path d="${ipad ? 'M12 20V4M5 11l7-7 7 7' : 'M12 4v16M5 13l7 7 7-7'}"/></svg>`;
    const card = inApp()
      ? `<p style="font-weight:800;font-size:16px">${t('افتح هذه الصفحة في Safari أولاً')}</p><p style="margin-top:6px;font-size:13.5px;opacity:.8">${t('التثبيت لا يعمل من داخل التطبيقات الأخرى. اضغط ••• ثم "فتح في Safari".')}</p>`
      : `<p style="font-weight:800;font-size:16px;display:flex;align-items:center;gap:6px;flex-wrap:nowrap;white-space:nowrap"><span>${t('اضغط زر المشاركة')}</span>${SHARE.replace('vertical-align:-4px', 'flex-shrink:0')}<span>${ipad ? t('في الأعلى') : t('في الأسفل')}</span></p>
         <p style="margin-top:6px;font-size:13.5px;opacity:.85">${t('ثم اختر "إضافة إلى الشاشة الرئيسية" واضغط "إضافة".')}</p>
         <p style="margin-top:6px;font-size:12px;opacity:.6">${t('إذا لم يظهر زر المشاركة، اضغط ••• في شريط Safari ثم "مشاركة".')}</p>`;
    const bubble = `<div dir="rtl" style="max-width:360px;background:#f5f2eb;color:#1b3022;border-radius:20px;padding:16px 18px;font:500 15px/1.55 inherit;box-shadow:0 24px 50px -16px rgba(0,0,0,.55);text-align:right">${card}</div>`;
    box.innerHTML = ipad ? `<div style="margin-left:34px">${arrow}</div>${bubble}` : `${bubble}${inApp() ? '' : `<div style="margin-top:6px">${arrow}</div>`}`;
    box.addEventListener('click', () => box.remove());
    document.body.appendChild(box);
  }

  // بطاقة التثبيت: تطلع لين يثبّت التطبيق، أو يضغط "لاحقاً" (ترجع بعد يوم)
  function banner(el, { key, title, text }) {
    if (!el) return;
    const name = `dm_install_later_${key}`;
    const later = () => { try { return Date.now() - Number(localStorage.getItem(name) || 0) < 864e5; } catch { return false; } };
    const render = () => {
      el.innerHTML = '';
      if (!available() || later()) return;
      const card = document.createElement('div');
      card.setAttribute('data-dm-install', '');
      card.dir = 'rtl';
      card.style.cssText = 'display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 16px;border-radius:18px;background:#233d2c;color:#f5f2eb';
      card.innerHTML = `<span style="flex-shrink:0;width:44px;height:44px;border-radius:12px;overflow:hidden;background:#fff"><img src="/images/icon-192.png" alt="" style="width:100%;height:100%;object-fit:cover"></span>
        <span style="flex:1;min-width:180px"><b style="display:block;font-size:15px">${t(title)}</b><span style="display:block;font-size:12.5px;opacity:.75;margin-top:2px">${t(text)}</span></span>
        <span style="display:flex;gap:8px;align-items:center">
          <button type="button" data-act="later" style="padding:9px 12px;border-radius:12px;font-weight:700;font-size:13px;color:#f5f2eb;opacity:.7">${t('لاحقاً')}</button>
          <button type="button" data-act="install" style="padding:10px 16px;border-radius:12px;background:#e9c95a;color:#15271b;font-weight:800;font-size:14px"><i class="ph-bold ph-download-simple"></i> ${t('ثبّت التطبيق')}</button>
        </span>`;
      card.querySelector('[data-act="later"]').onclick = () => { try { localStorage.setItem(name, String(Date.now())); } catch {} el.innerHTML = ''; };
      card.querySelector('[data-act="install"]').onclick = async () => { if (await install()) el.innerHTML = ''; };
      el.appendChild(card);
    };
    render();
    if (!deferred) ready.push(render);   // أندرويد: نافذة التثبيت تجهز بعد ثواني من فتح الصفحة
  }

  window.DMInstall = { available, install, banner, standalone, onReady: (f) => (deferred ? f() : ready.push(f)) };
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
