// =====================================================================
// DEV MENU — لوحة التحكم: الأساس: الإعداد، التنقل بين الصفحات، ملخص الرئيسية، الدخول وتحميل المتجر، نافذة الحذف، رفع الملفات
// (ملفات js/admin/ تتحمّل بالترتيب، وتتشارك نفس المتغيرات العامة)
// =====================================================================
  // كل البيانات عبر خادمنا /api/owner — المتصفح ما يتصل بقاعدة البيانات
  // السعر بعملة المتجر (الافتراضي الريال الجديد "⃁ 25")
  const money = (n) => DM.money(n, client && client.currency, 'ar');
  const curSign = () => DM.currencySign(client && client.currency);
  // اشتراك DEV MENU دايماً بالريال السعودي، مهما كانت عملة المتجر
  const sar = (n) => DM.money(n, 'SAR', 'ar');

  // حماية من حقن الكود: أي نص قادم من قاعدة البيانات يمر من هنا قبل عرضه
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  // يقبل روابط http/https فقط (يمنع روابط javascript:)
  function safeUrl(u) {
    if (!u) return '';
    try { const x = new URL(u); return (x.protocol === 'https:' || x.protocol === 'http:') ? x.href : ''; }
    catch { return ''; }
  }
  const params = new URLSearchParams(window.location.search);
  const requestedSlug = (params.get('client') || '').trim().toLowerCase();
  // الفرع المختار (صاحب المتجر يدير فروعه من نفس اللوحة)
  const requestedBranch = /^\d+$/.test(params.get('branch') || '') ? params.get('branch') : '';
  let branches = [];
  const MAX_IMAGE_MB = 5, MAX_VIDEO_MB = 30;

  let client = null, currentClientId = null, isSuperAdmin = false, userEmail = '';
  let loadedProducts = [], loadedCategories = [], editingProductId = null;
  let lastUploadError = '', lastApiError = '';

  // طلبات الخادم: المدير العام يمرر ?client= لإدارة متجر معيّن (الخادم يتجاهلها لغيره)
  const O = (action) => `/api/owner?action=${action}${requestedSlug ? `&client=${encodeURIComponent(requestedSlug)}` : ''}${requestedBranch ? `&branch=${requestedBranch}` : ''}`;
  async function api(action, body) {
    try {
      return body === undefined ? await DM.get(O(action), true) : await DM.post(O(action), body, true);
    } catch (e) {
      if (e.status === 401) { window.location.replace('login.html'); throw e; }
      lastApiError = e.message || '';
      throw e;
    }
  }

  function showToast(msg, isError = false) {
    if (isError && lastApiError) { msg = lastApiError; lastApiError = ''; }
    const toast = document.getElementById('toast');
    document.getElementById('toast-msg').textContent = msg;
    document.getElementById('toast-icon').className = isError ? 'ph-bold ph-x-circle text-red-500' : 'ph-bold ph-check-circle text-green-600';
    toast.className = `fixed bottom-20 lg:bottom-5 left-5 z-[70] px-5 py-3 rounded-2xl shadow-2xl border text-xs font-bold flex items-center gap-2 transition-all ${isError ? 'bg-cream border-red-500 text-ink' : 'bg-brand border-brand text-cream'} show`;
    clearTimeout(showToast.t);
    showToast.t = setTimeout(() => { toast.classList.remove('show'); }, 3200);
  }

  function switchTab(tab) {
    ['products', 'categories', 'coupons', 'sales', 'msettings'].forEach(t => {
      document.getElementById(`section-${t}`).classList.toggle('hidden', tab !== t);
      document.getElementById(`tab-${t}`).classList.toggle('active', tab === t);
    });
    // صف التبويبات يتمرر بالجوال: التبويب المفتوح يبان
    document.getElementById(`tab-${tab}`).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    if (tab === 'coupons') openCouponsTab();
    if (tab === 'sales') loadSales(salesRange);
    if (tab === 'msettings') placePhone('menu');
  }
  // جوال المعاينة: عنصر واحد ينتقل لصفحة البيجر (صفحة الانتظار) أو لإعدادات المنيو (المنيو)
  function placePhone(view) {
    const wrap = document.getElementById('pg-phone-wrap'), slot = document.getElementById(view === 'menu' ? 'menu-phone-slot' : 'pager-phone-slot');
    if (!wrap || !slot) return;
    if (wrap.parentElement !== slot) slot.appendChild(wrap);
    phoneView = view; reloadPagerPhone();
  }
  // يفتح تبويب إعدادات المنيو (من أزرار في أماكن ثانية)
  function openMenuSettings(scrollTo) {
    if (location.hash !== '#menu') location.hash = 'menu'; else showPage('menu');
    setTimeout(() => { switchTab('msettings'); if (scrollTo) { const el = document.getElementById(scrollTo); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } }, 80);
  }

  // ─── التنقل بين الصفحات ───
  const PAGES = {
    dashboard: ['الرئيسية', 'نظرة عامة على منشأتك وخدماتك'],
    menu:      ['المنيو', 'أضف أطباقك وأقسامك ورتّبها'],
    waitlist:  ['قائمة الانتظار', 'سجّل عملاءك وبلّغهم لما يجي دورهم'],
    loyalty:   ['بطاقة الولاء', 'تصميم البطاقة وإعداداتها وأرقامها'],
    customers: ['العملاء', 'أعضاء بطاقة الولاء في كل فروعك'],
    messages:  ['الرسائل', 'أرسل عروضك وأخبارك لجوالات عملائك'],
    branches:  ['الفروع', 'فروعك ومميزات كل فرع وروابط الكاشير'],
    account:   ['الاشتراك', 'باقتك وتجديدها وطلباتك للإدارة'],
    pagerset:  ['البيجر', 'إعدادات البيجر وصفحة الانتظار عند العميل'],
    settings:  ['هوية المنشأة', 'الرابط والاسم والشعار والمظهر ومعلومات التواصل']
  };
  // المميزات اللي مو ضمن باقة المشترك: الصفحة تعرض "أضفها لباقتك" بدل محتواها
  // الرسائل: من بطاقة الولاء، أو من بطاقة النداء (إضافة على البيجر)
  const PAGE_FEATURE = { menu: 'menu', pagerset: 'pager', waitlist: 'waitlist', loyalty: 'loyalty', customers: 'loyalty', messages: () => DMPlans.has(client, 'loyalty') || DMPlans.has(client, 'pager') ? null : 'pager' };
  // الخدمات اللي مو ضمن باقته (في التجربة أو الاشتراك) تختفي من اللوحة كلها
  const featureLocked = (key) => !!client && ['active', 'trial'].includes(client.subscription_status) && !DMPlans.has(client, key);
  let lockedKey = null;
  function showLocked(key) {
    lockedKey = key;
    const f = DMPlans.FEATURES[key];
    document.getElementById('lock-icon').className = `ph-bold ${f.icon}`;
    document.getElementById('lock-title').textContent = `${f.name} مو ضمن باقتك`;
    document.getElementById('lock-desc').textContent = f.desc;
    document.getElementById('lock-price').textContent = `تضيفها بـ ${f.month} ر.س بالشهر أو ${f.year} ر.س بالسنة`;
  }
  function addFeature() {
    if (client.parent_id) return showToast('الاشتراك يتعدل من المتجر الرئيسي', true);
    chosenFeatures(); if (lockedKey) pickFeatures.add(lockedKey);
    planPick = client.subscription_plan === 'month' ? 'month' : 'year';
    openPlan();
  }
  // شاشة الكاشير تشتغل للبيجر وللولاء (مسح بطاقات الزبائن)
  const deskLocked = () => featureLocked('pager') && featureLocked('loyalty') && !(client && client.menu_order_mode && !featureLocked('menu'));
  function openPagerDesk(a) {
    if (deskLocked()) { location.hash = 'pager'; showPage('pager'); return false; }
    a.href = 'pager-desk.html' + location.search; return true;
  }
  // روابط الخدمات المفعّلة
  const SVC_PAGES = [['menu', 'menu', 'المنيو', 'ph-fork-knife'], ['pager', 'pager', 'البيجر', 'ph-bell'], ['waitlist', 'waitlist', 'قائمة الانتظار', 'ph-hourglass-medium'], ['loyalty', 'loyalty', 'بطاقة الولاء', 'ph-seal-check']];
  function renderServiceLinks() {
    const box = document.getElementById('svc-links');
    if (!box || !client) return;
    const on = SVC_PAGES.filter(([k]) => !featureLocked(k));
    // الرابط الرئيسي = صفحة الروابط السريعة (فيها كل الخدمات)، وتحته رابط كل خدمة
    // الباقة المجانية (البيجر بعد التجربة) ما فيها صفحة الروابط السريعة
    const free = DMPlans.isFree(client);
    ['links-bg-card', 'links-order-card', 'appearance-card'].forEach(id => { const el = document.getElementById(id); if (el) el.style.display = free ? 'none' : ''; });
    // الفرع: صفحة الروابط وحدة للمحل كله، خلفيتها وترتيبها من الفرع الرئيسي
    const isBranch = !!client.parent_id;
    ['links-bg-card', 'links-order-card'].forEach(id => { const el = document.getElementById(id); if (el && isBranch) el.style.display = 'none'; });
    const bNote = document.getElementById('links-branch-note');
    if (bNote) bNote.classList.toggle('hidden', !isBranch || free);
    const slugHint = document.getElementById('slug-hint');
    if (slugHint) slugHint.textContent = free ? 'اسم رابط البيجر حقك، ويطلع في رمز QR. الروابط القديمة تبقى شغالة لو غيّرته' : 'شاركه في البايو والرسائل، ويفتح المنيو مباشرة';
    // هوية المنشأة في المجاني: الاسم والشعار ورابط قوقل ماب بس
    applyFreeHide();
    const rows = [...(free ? [] : [['home', 'الرابط الرئيسي', 'ph-house', DM.storeUrl(client.client_slug, 'links')]]), ...on.map(([k, page, name, icon]) => [k, name, icon, DM.storeUrl(client.client_slug, page)])];
    // روابط الشاشات: تفتح بدون حساب المالك (نفس مفتاح رابط الكاشير)
    if (!deskLocked()) {
      const key = client.desk_key ? encodeURIComponent(client.desk_key) : '';
      rows.push(['kiosk', 'شاشة الزبون (للتابلت)', 'ph-device-tablet', key && `${location.origin}/kiosk.html?k=${key}`, 'تفتح بدون حسابك، وتعرض أكواد خدماتك']);
      rows.push(['desk', 'شاشة الكاشير', 'ph-cash-register', key && `${location.origin}/pager-desk.html?k=${key}`, 'للموظف، بدون حسابك']);
    }
    const hint = document.getElementById('svc-links-hint');
    if (hint) hint.textContent = free ? 'صفحة الروابط السريعة متاحة مع الاشتراك. وهذي روابط البيجر وشاشاته.' : 'الرابط الرئيسي يفتح صفحة الروابط السريعة اللي فيها كل خدماتك، حطه في بايو انستجرام وتيك توك. وتحته رابط كل خدمة لحالها.';
    const btn = 'text-[11px] font-bold px-2.5 py-1.5 rounded-lg bg-white border border-brand/15';
    box.innerHTML = rows.map(([k, name, icon, url, sub]) => !url ? `
      <div class="flex flex-wrap items-center gap-2 bg-brand/5 border-brand/15 border rounded-xl px-3 py-2">
        <i class="ph-bold ${icon} text-ink"></i>
        <div class="min-w-0 flex-1"><p class="text-[12px] font-bold">${name}</p><p class="text-[11px] text-ink">${sub}</p></div>
        <button type="button" onclick="makeScreenLinks(this)" class="${btn}"><i class="ph-bold ph-link-simple"></i> أنشئ الرابط</button>
      </div>` : `
      <div class="flex flex-wrap items-center gap-2 ${k === 'home' ? 'bg-white border-brand/30' : 'bg-brand/5 border-brand/15'} border rounded-xl px-3 py-2">
        <i class="ph-bold ${icon} text-ink"></i>
        <div class="min-w-0 flex-1"><p class="text-[12px] font-bold">${name}</p>${sub ? `<p class="text-[11px] text-ink">${sub}</p>` : `<p class="text-[11px] text-ink truncate" dir="ltr">${esc(url.replace(/^https?:\/\//, ''))}</p>`}</div>
        <button type="button" onclick="navigator.clipboard.writeText('${esc(url)}').then(() => showToast('تم نسخ الرابط'))" class="${btn}"><i class="ph-bold ph-copy"></i> نسخ</button>
        <a href="${esc(url)}" target="_blank" rel="noopener" aria-label="فتح" class="${btn}"><i class="ph-bold ph-arrow-square-out"></i></a>
        ${k === 'home' ? `<div class="w-full flex flex-wrap gap-1.5 pt-1">
          <button type="button" id="links-qr-btn" onclick="downloadLinksQr()" class="bg-amber-400 hover:bg-amber-300 text-black px-3 py-1.5 rounded-lg text-[11px] font-bold transition disabled:opacity-50"><i class="ph-bold ph-qr-code"></i> تحميل QR</button>
          <button type="button" onclick="openLinksSettings()" class="${btn} hover:bg-brand/5"><i class="ph-bold ph-sliders-horizontal"></i> تخصيص الصفحة</button>
        </div>` : ''}
      </div>`).join('');
  }
  async function makeScreenLinks(btn) {
    btn.disabled = true;
    try { const r = await api('desk-link'); client.desk_key = new URL(r.kiosk_url).searchParams.get('k'); renderServiceLinks(); showToast('جهز الرابط، انسخه وافتحه على الجهاز'); }
    catch { btn.disabled = false; showToast('ما قدرنا ننشئ الرابط، جرّب مرة ثانية', true); }
  }
  // ─── ملخص الخدمات في الرئيسية ───
  const tile = (v, l) => `<div class="rounded-2xl bg-white border border-brand/[0.13] px-3 py-3"><p class="text-2xl font-bold tnum leading-none">${v}</p><p class="text-[11.5px] text-ink mt-1.5">${l}</p></div>`;
  const svcCard = (icon, title, href, tiles, foot, actions = '', chart = '') => `
    <div class="pro-card p-5 flex flex-col gap-3.5 h-full">
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-[13px] font-bold flex items-center gap-2"><span class="w-8 h-8 rounded-xl bg-brand/10 grid place-items-center"><i class="ph-bold ${icon} text-brand"></i></span> ${title}</h3>
        <a href="${href}" class="text-[11px] font-bold text-brand underline underline-offset-4">${href.startsWith('#') ? 'افتح' : 'افتح الشاشة'}</a>
      </div>
      <div class="grid grid-cols-3 gap-2">${tiles}</div>
      ${chart}
      ${foot ? `<p class="text-[11px] text-ink mt-auto">${foot}</p>` : ''}
      ${actions}
    </div>`;
  // رسم أعمدة لآخر 7 أيام (بتوقيت الرياض): اليوم بالذهبي، والرقم فوق كل عمود
  const dayKeyRiyadh = (t) => new Date(t + 3 * 3600e3).toISOString().slice(0, 10);
  function miniBars(byDay, label) {
    const days = Array.from({ length: 7 }, (_, i) => dayKeyRiyadh(Date.now() - (6 - i) * DAYMS));
    const vals = days.map(d => byDay[d] || 0), max = Math.max(1, ...vals);
    const wd = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('ar-SA-u-nu-latn', { weekday: 'short' });
    return `<div class="rounded-2xl bg-white border border-brand/[0.13] p-3">
      <p class="text-[11px] font-bold text-ink mb-2">${label}</p>
      <div class="flex items-end gap-1.5 h-24">${days.map((d, i) => `
        <div class="flex-1 h-full flex flex-col items-center justify-end gap-1">
          <span class="text-[11px] font-bold tnum ${vals[i] ? 'text-ink' : 'text-ink/30'}">${vals[i]}</span>
          <span class="w-full rounded-md ${i === 6 ? 'bg-[#c9a227]' : 'bg-brand/70'}" style="height:${vals[i] ? Math.max(6, vals[i] / max * 64) : 3}px;${vals[i] ? '' : 'opacity:.25'}"></span>
          <span class="text-[11px] text-ink">${i === 6 ? 'اليوم' : wd(d)}</span>
        </div>`).join('')}</div>
    </div>`;
  }
  // أدوات الولاء اليومية: تنفتح فوق لوحة التحكم نفسها (نفس أدوات شاشة الكاشير داخل إطار)، بدون ما تنتقل لصفحة ثانية
  function openLyTool(open) {
    closeLyTool();
    const f = document.createElement('iframe');
    f.id = 'ly-tool';
    f.allow = 'camera; clipboard-write';
    f.src = `pager-desk.html${location.search ? `${location.search}&` : '?'}open=${open}&embed=1`;
    f.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;border:0;z-index:90;background:transparent';
    document.body.appendChild(f);
  }
  function closeLyTool() { const f = document.getElementById('ly-tool'); if (f) { f.remove(); renderServiceSummary(); } }
  window.addEventListener('message', (e) => { if (e.origin === location.origin && e.data && e.data.dm === 'desk-closed') closeLyTool(); });
  const lyActions = () => `
      <div class="grid grid-cols-2 gap-2 pt-1">
        <button type="button" onclick="openLyTool('scan')" class="flex items-center gap-2 rounded-xl bg-brand text-cream px-3 py-3 text-[13px] font-bold text-right"><i class="ph-bold ph-camera text-lg text-[#c9a227]"></i> امسح بطاقة زبون</button>
        <button type="button" onclick="openLyTool('stamp')" class="flex items-center gap-2 rounded-xl bg-[#c9a227] text-[#15271b] px-3 py-3 text-[13px] font-bold text-right"><i class="ph-bold ph-seal-check text-lg"></i> كود ختم</button>
        <button type="button" onclick="openLyTool('join')" class="flex items-center gap-2 rounded-xl bg-brand/10 border border-brand/45 px-3 py-3 text-[13px] font-bold text-right"><i class="ph-bold ph-user-plus text-lg"></i> QR تسجيل الولاء</button>
        <a href="kiosk.html${location.search}" target="_blank" class="flex items-center gap-2 rounded-xl bg-brand/10 border border-brand/45 px-3 py-3 text-[13px] font-bold"><i class="ph-bold ph-device-tablet text-lg"></i> شاشة الختم</a>
      </div>`;
  async function renderServiceSummary() {
    const box = document.getElementById('svc-summary');
    if (!box || !client) return;
    const jobs = [];
    const mins = (m) => m == null ? '—' : `${Math.round(m)} د`;
    if (!featureLocked('pager')) jobs.push(Promise.all([api('pager').catch(() => null), api('pager-stats&days=7').catch(() => null)]).then(([d, st]) => {
      const tk = (d && d.tickets) || [];
      return svcCard('ph-bell', 'البيجر اليوم', 'pager-desk.html' + location.search,
        tile(tk.filter(t => t.status === 'waiting').length, 'بالانتظار') + tile(tk.filter(t => t.status === 'ready').length, 'تم النداء') + tile(tk.length, 'أرقام اليوم'),
        st && st.total ? `آخر 7 أيام: متوسط الانتظار ${mins(st.wait.avg)}${st.rating && st.rating.n ? `، والتقييم ${st.rating.avg} ★ من ${st.rating.n}` : ''}` : 'أول ما ياخذون أرقام تطلع الأرقام هنا', '',
        miniBars(Object.fromEntries(((st && st.daily) || []).map(x => [x.d, x.n])), 'أرقام البيجر آخر 7 أيام'));
    }));
    if (!featureLocked('loyalty')) jobs.push(api('loyalty').catch(() => null).then(d => {
      const st = (d && d.stats) || {};
      return svcCard('ph-seal-check', 'بطاقة الولاء', '#loyalty',
        tile(st.members || 0, 'عضو') + tile(st.stamps7 || 0, 'ختم هالأسبوع') + tile(st.redeemed || 0, 'مكافأة'),
        d && !d.enabled ? 'البطاقة متوقفة، شغّلها من صفحة الولاء' : `${st.active30 || 0} عضو زاروك آخر 30 يوم`,
        d && d.enabled ? lyActions() : '',
        miniBars(Object.fromEntries(((d && d.week) || []).map(x => [x.d, x.n])), 'الأختام آخر 7 أيام'));
    }));
    if (!featureLocked('waitlist') && client.waitlist_enabled) jobs.push(api('waitlist').catch(() => null).then(d => {
      const en = (d && d.entries) || [];
      return svcCard('ph-hourglass-medium', 'قائمة الانتظار اليوم', '#waitlist',
        tile(en.filter(e => e.status === 'waiting').length, 'ينتظرون') + tile(en.filter(e => e.status === 'notified').length, 'تم نداؤهم') + tile(en.filter(e => e.status === 'seated').length, 'حضروا'), '', '',
        // أول المنتظرين بالترتيب
        (() => { const w = en.filter(e => e.status === 'waiting' || e.status === 'notified').slice(0, 4);
          return `<div class="rounded-2xl bg-white border border-brand/[0.13] p-3"><p class="text-[11px] font-bold text-ink mb-2">الدور الحين</p>${w.length ? w.map(e => `
            <div class="flex items-center justify-between gap-2 py-1.5 border-b border-brand/[0.07] last:border-0 text-[12.5px]">
              <span class="font-bold truncate">${esc(e.name || 'زبون')}</span>
              <span class="shrink-0 text-ink">${e.party_size ? `${e.party_size} أشخاص` : ''}${e.status === 'notified' ? ' <b class="text-[#8a6d0f]">تم النداء</b>' : ''}</span>
            </div>`).join('') : '<p class="text-[12px] text-ink py-3 text-center">ما فيه أحد ينتظر الحين</p>'}</div>`; })());
    }));
    const cards = await Promise.all(jobs);
    box.innerHTML = cards.join('');
    box.classList.toggle('hidden', !cards.length);
  }
  function localizeDash() {}
  function applyFeatureLocks() {
    // مشترك الولاء بدون البيجر: نفس الشاشة اسمها "شاشة الكاشير" (مسح البطاقات وكود الختم)
    const deskLabel = document.getElementById('nav-desk-label');
    if (deskLabel) deskLabel.textContent = featureLocked('pager') ? 'شاشة الكاشير' : 'شاشة البيجر';
    const bLabel = document.getElementById('bnav-desk-label');
    if (bLabel) bLabel.textContent = featureLocked('pager') ? 'الكاشير' : 'البيجر';
    renderServiceLinks();
    renderServiceSummary();
    document.querySelectorAll('[data-nav], [data-feature]').forEach(el => {
      const key = el.dataset.feature || PAGE_FEATURE[el.dataset.nav];
      if (!key) return;
      const off = key === 'pager' && el.dataset.feature ? deskLocked() : featureLocked(key);
      el.style.display = off ? 'none' : '';
    });
    // data-needs="menu|pager": يطلع لو عنده وحدة منها على الأقل
    document.querySelectorAll('[data-needs]').forEach(el => { el.style.display = el.dataset.needs.split('|').every(featureLocked) ? 'none' : ''; });
    document.querySelectorAll('[data-hide-always]').forEach(el => { el.style.display = 'none'; });
    applyFreeHide();
  }
  // البيجر المجاني: نخفي اللي ما يخصه (data-free-hide)، ونطلع عدّاد الأرقام في الرئيسية
  function applyFreeHide() {
    const free = !!client && DMPlans.isFree(client);
    document.querySelectorAll('[data-free-hide]').forEach(el => { if (free) el.style.display = 'none'; else if (!el.dataset.needs) el.style.display = ''; });
    document.getElementById('home-free').classList.toggle('hidden', !(client && DMPlans.pagerLite(client)));
  }

  function showPage(page) {
    if (!PAGES[page] && page !== 'pager') page = 'dashboard';
    const key = page === 'pager' ? 'pager' : typeof PAGE_FEATURE[page] === 'function' ? PAGE_FEATURE[page]() : PAGE_FEATURE[page];
    const locked = key && featureLocked(key);
    if (page === 'pager' && !locked) page = 'dashboard';
    if (locked) showLocked(key);
    document.querySelectorAll('[data-page]').forEach(sec => sec.classList.toggle('hidden', locked ? sec.dataset.page !== 'locked' : sec.dataset.page !== page));
    if (page === 'pagerset' && !locked) setTimeout(() => placePhone('pager'), 50);
    if (page === 'menu' && !locked && !document.getElementById('section-msettings').classList.contains('hidden')) setTimeout(() => placePhone('menu'), 50);
    if (locked) {
      document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('nav-active', b.dataset.nav === page));
      document.getElementById('page-title').textContent = DMPlans.FEATURES[key].name;
      document.getElementById('page-subtitle').textContent = 'أضفها لباقتك وتشتغل على طول';
      if (location.hash !== '#' + page) history.replaceState(null, '', location.pathname + location.search + '#' + page);
      return window.scrollTo({ top: 0 });
    }
    document.querySelectorAll('[data-nav]').forEach(b => b.classList.toggle('nav-active', b.dataset.nav === page));
    document.getElementById('page-title').textContent = PAGES[page][0];
    document.getElementById('page-subtitle').textContent = PAGES[page][1];
    if (location.hash !== '#' + page) history.replaceState(null, '', location.pathname + location.search + '#' + page);
    window.scrollTo({ top: 0 });
    if (typeof onWaitlistPage === 'function') onWaitlistPage(page === 'waitlist');
    // صفحات الولاء والعملاء والرسائل تاخذ بياناتها من بطاقة الولاء
    if (['loyalty', 'customers'].includes(page) || (page === 'messages' && DMPlans.has(client, 'loyalty'))) onLoyaltyPage();
    if (page === 'messages') renderNotifyCard();
  }
  function toggleMore(on) { const m = document.getElementById('more-sheet'); m.classList.toggle('hidden', !on); m.classList.toggle('flex', on); }
  document.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => {
    if (location.hash === '#' + b.dataset.nav) return showPage(b.dataset.nav);
    location.hash = b.dataset.nav;
  }));
  window.addEventListener('hashchange', () => showPage(location.hash.slice(1)));

  function goAddDish() {
    showPage('menu');
    switchTab('products');
    if (editingProductId) cancelEdit();
    document.getElementById('add-product-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => document.getElementById('prod-name').focus({ preventScroll: true }), 350);
  }

  function setStoreName(name) {
    document.getElementById('header-title').textContent = name;
    document.getElementById('greeting').textContent = `أهلاً بك في ${name}`;
  }
  function setLogo(url) {
    const logo = safeUrl(url);
    if (!logo) return;
    ['logo-preview', 'sidebar-logo', 'mobile-logo'].forEach(id => { document.getElementById(id).src = logo; });
  }

  // ملخص الرئيسية: الأرقام السريعة + جاهزية المنيو
  function renderDashboardSummary() {
    if (!client || !document.getElementById('quick-counts')) return;
    const total = loadedProducts.length;
    const available = loadedProducts.filter(p => p.is_available !== false).length;
    const noImg = loadedProducts.filter(p => !p.image_url).length;
    const noCal = loadedProducts.filter(p => p.calories == null).length;
    document.getElementById('nav-count').textContent = total;

    // شريط واحد بأرقام المنيو؛ "نفدت الكمية" يتلون بس لما فيه أطباق نافدة
    const soldOut = total - available;
    const cell = (label, value, page, icon, tone = '') => `
      <button onclick="location.hash='${page}'" class="kpi ${tone}">
        <span class="kpi-ic"><i class="ph-bold ${icon}"></i></span>
        <span class="min-w-0"><b>${value}</b><small>${label}</small></span>
      </button>`;
    document.getElementById('quick-counts').innerHTML = `
      <h3 class="text-sm font-bold mb-3">نظرة عامة على المنيو</h3>
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">` +
      cell(total === 1 ? 'طبق في المنيو' : 'أطباق في المنيو', total, 'menu', 'ph-fork-knife') +
      cell('أقسام', loadedCategories.length, 'menu', 'ph-squares-four') +
      cell('متوفر الآن', available, 'menu', 'ph-check-circle', 'gold') +
      cell('نفدت الكمية', soldOut, 'menu', 'ph-warning-circle', soldOut > 0 ? 'warn' : '') + '</div>';

    const items = [
      ['شعار المنشأة', !!client.logo_url, 'settings'],
      ['خلفية المنيو (صورة أو فيديو)', !!(client.bg_image_url || client.bg_video_url), 'settings'],
      ['قسم واحد على الأقل', loadedCategories.length > 0, 'menu'],
      ['5 أطباق أو أكثر', total >= 5, 'menu'],
      [noImg ? `صور لكل الأطباق (باقي ${noImg})` : 'صور لكل الأطباق', total > 0 && noImg === 0, 'menu'],
      ...(showCalories() ? [[noCal ? `السعرات لكل الأطباق (باقي ${noCal})` : 'السعرات لكل الأطباق', total > 0 && noCal === 0, 'menu']] : []),
      ['رقم واتساب المنشأة', isValidWa(client.whatsapp_number), 'settings'],
      ['ساعات العمل', !!client.opening_hours, 'settings']
    ];
    const done = items.filter(i => i[1]).length;
    const pct = Math.round((done / items.length) * 100);
    document.getElementById('checklist-pct').textContent = pct === 100 ? 'مكتمل 🎉' : `${pct}%`;
    document.getElementById('checklist-bar').style.width = `${pct}%`;
    document.getElementById('checklist-body').innerHTML = items.map(([label, ok, page]) => `
      <li class="flex items-center justify-between gap-2 text-[11px]">
        <span class="flex items-center gap-2 ${ok ? 'text-ink line-through decoration-brand/30' : 'text-ink/90'}">
          <i class="ph-bold ${ok ? 'ph-check-circle text-emerald-600' : 'ph-circle text-ink/15'}"></i> ${label}
        </span>
        ${ok ? '' : `<button onclick="location.hash='${page}'" class="text-[11px] font-bold text-amber-700 hover:text-amber-800">أكمل</button>`}
      </li>`).join('');
  }

  // رابط المنيو مبني على مسار الصفحة الحالية (يشتغل على GitHub Pages داخل مجلد المشروع)
  // روابط المتجر بالنطاق المختصر: https://slug.devmenu.digital
  const menuUrl = () => DM.storeUrl(client.client_slug);
  // رابط رمز QR يحمل src=qr عشان نفرّق في الإحصائيات بين مسح الطاولة والرابط المشارك
  const qrUrl = () => DM.storeUrl(client.client_slug, 'menu', { src: 'qr' });
  const shortUrl = menuUrl;
  const linksUrl = () => DM.storeUrl(client.client_slug, 'links');

  async function logout() {
    await DM.logout();
    window.location.replace('login.html');
  }

  // ─── التحقق من الدخول وتحميل المتجر ───
  async function initAuth() {
    if (!DM.signedIn()) { window.location.replace('login.html'); return false; }
    DM.watchAccount();
    let data;
    try { data = await api('load'); }
    catch (e) {
      if (e.status === 401) return false;
      document.getElementById('auth-loading').innerHTML = `<i class="ph-bold ph-warning text-lg"></i><span>${esc(e.message)}</span>`;
      return false;
    }
    isSuperAdmin = data.is_admin === true;
    userEmail = data.email || '';

    if (!data.store) {
      if (isSuperAdmin) { window.location.replace('super-admin.html'); return false; }
      document.getElementById('auth-loading').innerHTML = `
        <i class="ph-bold ph-prohibit text-lg"></i>
        <span>لا يوجد متجر مرتبط بحسابك.</span>
        <div class="flex gap-2 mt-2">
          <a href="index.html#register" class="bg-brand text-cream font-bold px-4 py-2 rounded-xl">أنشئ متجرك</a>
          <button onclick="logout()" class="bg-brand/10 text-ink font-bold px-4 py-2 rounded-xl border border-brand/25">تسجيل الخروج</button>
        </div>`;
      return false;
    }

    client = data.store;
    currentClientId = client.id;
    // مصطلحات النشاط: غير المطاعم والمقاهي «منتج» بدل «طبق» في كل اللوحة (ومع أي شي ينضاف بعدين)
    if (!localizeDash.on && !DMSectors.isFood(client)) { localizeDash.on = true; DMSectors.localizeDom(document.body, client, true); }
    loadedCategories = (data.categories || []).sort(bySort);
    loadedProducts = (data.products || []).sort(bySort);
    branches = data.branches || [];
    watchLive(data.live);
    if (!isSuperAdmin && requestedSlug) history.replaceState(null, '', 'admin.html' + (requestedBranch ? `?branch=${requestedBranch}` : '') + location.hash);
    fillClientUI();
    document.getElementById('auth-loading').remove();
    document.getElementById('app').style.visibility = 'visible';
    return true;
  }

  function fillClientUI() {
    const name = client.name || 'المنشأة';
    setStoreName(name);
    document.getElementById('admin-mode-badge').classList.toggle('hidden', !isSuperAdmin);
    renderBranchSwitch();
    renderBranchesCard(); renderDeskCard(); renderNotifyCard(); loadNotifs();
    renderAlsoBranches();
    document.getElementById('sa-link').classList.toggle('hidden', !isSuperAdmin);
    document.getElementById('sidebar-preview').href = menuUrl();
    document.getElementById('user-email').textContent = userEmail;
    document.getElementById('setting-name').value = client.name || '';
    document.getElementById('promo-message-input').value = client.promo_message || '';
    document.getElementById('preview-menu-btn').href = menuUrl();

    const qr = document.getElementById('qrcode');
    qr.innerHTML = '';
    if (window.QRCode) new QRCode(qr, { text: qrUrl(), width: 80, height: 80 });

    document.getElementById('social-web').value = client.website_url || '';
    document.getElementById('social-tiktok').value = client.tiktok_url || '';
    document.getElementById('social-insta').value = client.instagram_url || '';
    setWaInput(client.whatsapp_number);
    document.getElementById('social-whatsapp-cc').onchange = (e) => { document.getElementById('social-whatsapp').placeholder = e.target.value === '966' ? '05xxxxxxxx' : 'رقم الواتساب'; };
    document.getElementById('social-snap').value = client.snapchat_url || '';
    setLogo(client.logo_url); renderBgPreview(); renderLinksOrder();

    document.getElementById('info-hours').value = client.opening_hours || '';
    document.getElementById('info-location').value = client.location_url || '';
    document.getElementById('info-review').value = client.google_review_url || '';
    renderStorePin();
    document.getElementById('info-wa-orders').checked = client.whatsapp_orders === true;
    renderOrderMode();
    renderWaOrderState();
    renderBusinessType();
    applyCaloriesSetting(); applyMenuChatSetting(); renderInsightChips(); loadChatTop();
    renderMenuLayout();
    applyCurrencySetting();
    deliveryApps = (Array.isArray(client.delivery_apps) ? client.delivery_apps : []).map(d => ({ ...d }));
    renderDeliveryPicker();
    renderAppearance();
    occasions = familyOccasions();
    occEditing = -1;
    renderOccasions();
    document.getElementById('slug-input').value = client.client_slug || '';
    document.getElementById('short-link-open').href = shortUrl();
    orderNumbers = (Array.isArray(client.order_numbers) ? client.order_numbers : []).map(n => ({ ...n }));
    renderOrderNumbers();
    customLinks = (Array.isArray(client.custom_links) ? client.custom_links : []).map(l => ({ ...l }));
    renderCustomLinks();

    renderWaitlistShell();

    renderSubscriptionStatus(); loadSupport();
    renderPromoState();
    applyFeatureLocks();
  }

  // ─── نافذة تأكيد الحذف ───
  let pendingDeleteAction = null;
  function openDeleteModal(title, desc, onConfirm) {
    document.getElementById('delete-modal-title').textContent = title;
    document.getElementById('delete-modal-desc').textContent = desc;
    pendingDeleteAction = onConfirm;
    const m = document.getElementById('delete-modal');
    m.classList.remove('hidden'); m.classList.add('flex');
    document.getElementById('confirm-delete-btn').focus();
  }
  function closeDeleteModal() {
    const m = document.getElementById('delete-modal');
    m.classList.add('hidden'); m.classList.remove('flex');
    pendingDeleteAction = null;
  }
  document.getElementById('confirm-delete-btn').addEventListener('click', async () => {
    const action = pendingDeleteAction;
    closeDeleteModal();
    if (action) await action();
  });
  document.getElementById('delete-modal').addEventListener('click', (e) => { if (e.target.id === 'delete-modal') closeDeleteModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && pendingDeleteAction) closeDeleteModal(); });

  async function updateSocialLinks() {
    const fields = { website_url: 'social-web', tiktok_url: 'social-tiktok', instagram_url: 'social-insta', snapchat_url: 'social-snap' };
    const payload = {};
    for (const [col, id] of Object.entries(fields)) {
      const v = document.getElementById(id).value.trim();
      if (v && !safeUrl(v)) return showToast('رابط غير صحيح: يجب أن يبدأ بـ https://', true);
      payload[col] = v;
    }
    const waRaw = document.getElementById('social-whatsapp').value;
    const wa = DM.intlPhone(waRaw, document.getElementById('social-whatsapp-cc').value);
    if (waRaw.trim() && !wa) return showToast('رقم الواتساب غير صحيح، تأكد من رمز الدولة والرقم', true);
    payload.whatsapp_number = wa;
    setWaInput(wa);

    if (!isValidWa(payload.whatsapp_number) && client.whatsapp_orders) payload.whatsapp_orders = false;
    if (await updateClient(payload)) {
      renderWaOrderState();
      showToast(payload.whatsapp_orders === false ? 'تم الحفظ، وأُوقفت طلبات واتساب لعدم وجود رقم صالح' : 'تم حفظ روابط التواصل');
    }
    else showToast('تعذر حفظ الروابط', true);
  }

  // ─── رفع الملفات (الصور تُضغط تلقائياً قبل الرفع) ───
  const MAX_ORIGINAL_IMAGE_MB = 20;

  function validateFile(file, kind) {
    if (!file) return 'اختر الملف أولاً';
    if (!file.type.startsWith(kind + '/')) return kind === 'video' ? 'الملف لازم يكون فيديو (MP4)' : 'الملف لازم يكون صورة';
    const max = kind === 'video' ? MAX_VIDEO_MB : MAX_ORIGINAL_IMAGE_MB;
    if (file.size > max * 1024 * 1024) return `حجم الملف كبير، الحد الأقصى ${max} ميجابايت`;
    return '';
  }

  // تصغير الصورة وتحويلها WebP: أخف بكثير وأسرع في الفتح على جوال الزبون
  // معاينة صورة الطبق في خانة الرفع
  function setDishImagePreview(src, label) {
    const ph = document.getElementById('img-drop-ph'), name = document.getElementById('img-drop-name');
    if (!ph) return;
    ph.innerHTML = src ? `<img src="${esc(src)}" alt="">` : '<i class="ph-bold ph-camera"></i>';
    name.textContent = label || (src ? 'تم اختيار الصورة (اضغط لتغييرها)' : 'اختر صورة الطبق');
  }
  function previewDishImage(input) {
    const f = input.files && input.files[0];
    const warn = document.getElementById('img-ratio-warn');
    warn.classList.add('hidden');
    if (!f) return setDishImagePreview(null);
    const url = URL.createObjectURL(f);
    setDishImagePreview(url, f.name.length > 28 ? f.name.slice(0, 25) + '…' : f.name);
    // المنيو يعرض الصورة بالعرض 4:3: الطولية والمربعة تطلع بحواف على الجنبين، فنقول له قبل ما يحفظ
    const img = new Image();
    img.onload = () => {
      const r = img.naturalWidth / img.naturalHeight;
      if (r >= 1.2 && r <= 1.5) return;
      const shape = r < 0.9 ? 'رأسية' : r < 1.2 ? 'شبه مربعة' : 'عريضة جداً';
      const dims = (w, h) => `<bdi dir="ltr">${Number(w)}×${Number(h)}</bdi>`;
      warn.innerHTML = `الصورة المختارة ${shape} (${dims(img.naturalWidth, img.naturalHeight)})، وستظهر في المنيو بحواف ${r > 1.5 ? 'في الأعلى والأسفل' : 'على الجانبين'}. لظهورها كاملة، يُرجى استخدام صورة أفقية أو قصّها بنسبة 4:3 (مثل ${dims(1200, 900)}).
        <button type="button" id="img-crop-btn" class="mt-2 inline-flex items-center gap-1.5 bg-white border border-amber-300 text-amber-900 rounded-lg px-3 py-1.5 text-[12px] font-bold"><i class="ph-bold ph-crop"></i> قصّ الصورة 4:3</button>`;
      warn.classList.remove('hidden');
      document.getElementById('img-crop-btn').onclick = () => openCropper(url, (blob) => {
        const name = f.name.replace(/\.[^.]+$/, '') + '-4x3.jpg';
        const dt = new DataTransfer(); dt.items.add(new File([blob], name, { type: 'image/jpeg' }));
        input.files = dt.files;
        previewDishImage(input);
      });
    };
    img.src = url;
  }
