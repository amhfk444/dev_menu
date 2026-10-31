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

  function iosSteps() {
    const box = document.createElement('div');
    box.setAttribute('data-dm-install', '');
    box.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(15,25,18,.55);display:flex;align-items:flex-end;justify-content:center;padding:12px';
    const step = (n, html) => `<li style="display:flex;gap:12px;align-items:flex-start;margin-top:12px"><b style="flex-shrink:0;width:26px;height:26px;border-radius:9px;background:#233d2c;color:#e9c95a;display:grid;place-items:center;font-size:13px">${n}</b><span style="line-height:1.6">${html}</span></li>`;
    box.innerHTML = `<div dir="rtl" style="width:100%;max-width:420px;background:#f5f2eb;color:#1b3022;border-radius:24px;padding:20px 20px 24px;font:500 15px/1.5 inherit;box-shadow:0 30px 60px -20px rgba(0,0,0,.5)">
      <p style="font-weight:800;font-size:18px">${t('ثبّت التطبيق على جوالك')}</p>
      ${inApp() ? `<p style="margin-top:10px;padding:10px 12px;border-radius:12px;background:#fff4d6;color:#7a5a00;font-weight:700;font-size:13px">${t('افتح هذه الصفحة في Safari أولاً، فالتثبيت لا يعمل من داخل التطبيقات الأخرى.')}</p>` : ''}
      <ol style="list-style:none;padding:0;margin:4px 0 0">
        ${step(1, `${t('اضغط زر المشاركة')} <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0a7aff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg> ${t('أسفل الشاشة.')}`)}
        ${step(2, t('اختر "إضافة إلى الشاشة الرئيسية".'))}
        ${step(3, t('اضغط "إضافة"، وتجد التطبيق بين تطبيقات جوالك.'))}
      </ol>
      <button type="button" style="margin-top:18px;width:100%;padding:13px;border-radius:14px;background:#233d2c;color:#f5f2eb;font-weight:800;font-size:15px">${t('تم')}</button>
    </div>`;
    box.addEventListener('click', (e) => { if (e.target === box || e.target.closest('button')) box.remove(); });
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
