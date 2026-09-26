<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<meta name="theme-color" content="#384f3d">
<title>قائمة الانتظار | DEV MENU</title>

<script src="https://cdn.tailwindcss.com"></script>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
<script src="js/api.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800;900&display=swap" rel="stylesheet">

<script>
tailwind.config = { theme: { extend: {
  colors: { sand: '#efe5dc', cream: '#faf6f1', ink: '#22362a', brand: { DEFAULT: '#384f3d', dark: '#2a3e2f' } }
}}};
</script>

<style>
  body { font-family: 'Cairo', sans-serif; background: #efe5dc; color: #22362a; min-height: 100vh; -webkit-text-size-adjust: 100%; }
  .card { background: #faf6f1; border: 1px solid rgba(56,79,61,.14); border-radius: 22px; box-shadow: 0 18px 40px -24px rgba(34,54,42,.35); }
  .field { width: 100%; background: #fff; border: 1.5px solid rgba(56,79,61,.2); border-radius: 14px; padding: .8rem 1rem; font-size: 16px; color: #22362a; transition: all .2s; }
  .field:focus { outline: none; border-color: #384f3d; box-shadow: 0 0 0 3px rgba(56,79,61,.12); }
  .field::placeholder { color: rgba(34,54,42,.35); }
  .lbl { display: block; font-size: 12px; font-weight: 800; margin-bottom: 6px; }
  .req { color: #b45309; }
  .chip { display: flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 6px; border-radius: 12px; border: 1.5px solid rgba(56,79,61,.2); background: #fff; font-size: 12px; font-weight: 800; color: rgba(34,54,42,.75); cursor: pointer; transition: all .15s; }
  .peer:checked + .chip { background: #384f3d; border-color: #384f3d; color: #faf6f1; }
  .pulse-ring { animation: ring 2s ease-out infinite; }
  @keyframes ring { 0% { box-shadow: 0 0 0 0 rgba(21,128,61,.45); } 100% { box-shadow: 0 0 0 22px rgba(21,128,61,0); } }
</style>
</head>
<body class="px-4 py-6" style="padding-bottom: calc(24px + env(safe-area-inset-bottom))">

<main class="max-w-md mx-auto space-y-4">

  <!-- المتجر -->
  <header class="text-center space-y-2 pt-2">
    <div class="w-20 h-20 mx-auto rounded-3xl bg-cream border border-brand/15 overflow-hidden flex items-center justify-center shadow-md">
      <img id="store-logo" src="images/logo.jpeg" alt="" class="w-full h-full object-cover" onerror="this.onerror=null;this.src='images/logo.jpeg'">
    </div>
    <h1 id="store-name" class="text-xl font-black">...</h1>
    <p class="text-xs font-bold text-ink/55"><i class="fa-solid fa-hourglass-half"></i> قائمة الانتظار</p>
  </header>

  <!-- جاري التحميل -->
  <div id="view-loading" class="card p-8 text-center text-sm text-ink/60">
    <i class="fa-solid fa-spinner fa-spin"></i> جاري التحميل...
  </div>

  <!-- غير متاحة -->
  <div id="view-unavailable" class="hidden card p-8 text-center space-y-2">
    <div class="w-14 h-14 mx-auto rounded-2xl bg-brand/10 flex items-center justify-center text-xl"><i class="fa-solid fa-store-slash"></i></div>
    <p id="unavailable-title" class="font-black">قائمة الانتظار غير متاحة حالياً</p>
    <p id="unavailable-sub" class="text-xs text-ink/60">جرّب لاحقاً أو اسأل الاستقبال.</p>
  </div>

  <!-- النموذج -->
  <section id="view-form" class="hidden space-y-4">
    <div class="card p-4 grid grid-cols-2 divide-x divide-x-reverse divide-brand/10 text-center">
      <div>
        <p class="text-[11px] font-bold text-ink/55">بالانتظار الآن</p>
        <p class="text-2xl font-black"><span id="info-waiting">0</span> <span class="text-xs font-bold text-ink/50">مجموعة</span></p>
      </div>
      <div>
        <p class="text-[11px] font-bold text-ink/55">الانتظار التقريبي</p>
        <p class="text-2xl font-black">~<span id="info-eta">0</span> <span class="text-xs font-bold text-ink/50">دقيقة</span></p>
      </div>
    </div>

    <p id="store-message" class="hidden text-xs font-bold text-ink/75 bg-amber-100/70 border border-amber-300/50 rounded-2xl px-4 py-3 leading-relaxed"></p>

    <form id="join-form" class="card p-5 space-y-4" novalidate>
      <div data-field="name">
        <label class="lbl" for="f-name">الاسم <span class="req hidden">*</span></label>
        <input id="f-name" type="text" maxlength="60" autocomplete="name" placeholder="اسمك" class="field">
      </div>
      <div data-field="phone">
        <label class="lbl" for="f-phone">رقم الجوال <span class="req hidden">*</span></label>
        <input id="f-phone" type="tel" inputmode="tel" maxlength="16" autocomplete="tel" placeholder="05xxxxxxxx" class="field" dir="ltr">
      </div>
      <div data-field="email">
        <label class="lbl" for="f-email">البريد الإلكتروني <span class="req hidden">*</span></label>
        <input id="f-email" type="email" inputmode="email" maxlength="120" autocomplete="email" placeholder="name@example.com" class="field" dir="ltr">
        <p class="text-[10px] text-ink/50 mt-1">يوصلك عليه تأكيد التسجيل، وتنبيه أول ما تجهز طاولتك.</p>
      </div>
      <div data-field="party_size">
        <span class="lbl">عدد الأشخاص <span class="req hidden">*</span></span>
        <div class="flex items-center gap-3" dir="ltr">
          <button type="button" id="party-minus" class="w-12 h-12 rounded-2xl bg-white border border-brand/20 text-xl font-black">−</button>
          <span id="party-value" class="flex-1 text-center text-2xl font-black">2</span>
          <button type="button" id="party-plus" class="w-12 h-12 rounded-2xl bg-white border border-brand/20 text-xl font-black">+</button>
        </div>
      </div>
      <div data-field="seating">
        <span class="lbl">تفضيل الجلسة <span class="req hidden">*</span></span>
        <div class="grid grid-cols-3 gap-2">
          <label><input type="radio" name="seating" value="indoor" class="peer hidden"><span class="chip"><i class="fa-solid fa-house"></i> داخلي</span></label>
          <label><input type="radio" name="seating" value="outdoor" class="peer hidden"><span class="chip"><i class="fa-solid fa-tree"></i> خارجي</span></label>
          <label><input type="radio" name="seating" value="any" class="peer hidden"><span class="chip"><i class="fa-solid fa-shuffle"></i> أي مكان</span></label>
        </div>
      </div>
      <div data-field="notes">
        <label class="lbl" for="f-notes">ملاحظات <span class="req hidden">*</span></label>
        <textarea id="f-notes" rows="2" maxlength="200" placeholder="مثال: كرسي أطفال، مناسبة خاصة..." class="field resize-none"></textarea>
      </div>

      <p class="text-[10px] text-ink/50 leading-relaxed">بالتسجيل، توافق على مشاركة بياناتك مع المطعم لإدارة دورك والتواصل معك. <a href="privacy.html" target="_blank" class="underline">سياسة الخصوصية</a></p>

      <p id="form-error" class="hidden text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl px-3 py-2"></p>

      <button type="submit" id="join-btn" class="w-full bg-brand hover:bg-brand-dark text-cream font-black text-sm py-4 rounded-2xl transition flex items-center justify-center gap-2 disabled:opacity-60">
        <i class="fa-solid fa-user-plus"></i> <span>سجّلني في قائمة الانتظار</span>
      </button>
    </form>
  </section>

  <!-- مغلقة -->
  <div id="view-closed" class="hidden card p-8 text-center space-y-2">
    <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center text-xl"><i class="fa-solid fa-door-closed"></i></div>
    <p class="font-black">قائمة الانتظار مغلقة حالياً</p>
    <p class="text-xs text-ink/60">المطعم ما يستقبل تسجيلات جديدة الحين. جرّب بعد شوي.</p>
  </div>

  <!-- متابعة الدور -->
  <section id="view-status" class="hidden space-y-4">
    <div id="status-card" class="card p-6 text-center space-y-4">
      <div>
        <p class="text-[11px] font-bold text-ink/55">رقم دورك</p>
        <p id="st-ticket" class="text-6xl font-black leading-none mt-1">#0</p>
        <p id="st-name" class="text-xs font-bold text-ink/60 mt-2"></p>
      </div>
      <div id="st-body" class="space-y-3"></div>
    </div>
    <div id="st-actions" class="space-y-2"></div>
    <p class="text-center text-[10px] text-ink/45"><i class="fa-solid fa-rotate"></i> الصفحة تتحدث تلقائياً</p>
  </section>

  <footer class="text-center pt-4">
    <a id="menu-link" href="#" class="text-[11px] font-bold text-ink/55 hover:text-ink"><i class="fa-solid fa-utensils"></i> تصفّح المنيو وأنت تنتظر</a>
    <p class="text-[10px] text-ink/35 mt-2">DEV MENU</p>
  </footer>
</main>

<script>
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const params = new URLSearchParams(location.search);
  const slug = (params.get('client') || '').trim().toLowerCase();
  const tokenKey = `wl:${slug}`;
  let token = params.get('t') || (() => { try { return localStorage.getItem(tokenKey) || ''; } catch { return ''; } })();
  let settings = null, partySize = 2, pollTimer = null, lastStatus = null;

  const views = ['loading', 'unavailable', 'form', 'closed', 'status'];
  function show(name) { views.forEach(v => document.getElementById(`view-${v}`).classList.toggle('hidden', v !== name)); }
  function unavailable(title, sub) {
    document.getElementById('unavailable-title').textContent = title;
    document.getElementById('unavailable-sub').textContent = sub;
    show('unavailable');
  }
  const saveToken = (t) => { token = t; try { t ? localStorage.setItem(tokenKey, t) : localStorage.removeItem(tokenKey); } catch {} };

  function setStore(store) {
    document.getElementById('store-name').textContent = store.name || '';
    document.title = `قائمة الانتظار | ${store.name || 'DEV MENU'}`;
    if (store.logo_url) document.getElementById('store-logo').src = store.logo_url;
  }

  // ─── النموذج ───
  async function loadForm() {
    let info;
    try { info = await DM.get(`/api/waitlist?action=info&slug=${encodeURIComponent(slug)}`); }
    catch (e) { return unavailable(e.status === 404 || e.status === 400 ? 'قائمة الانتظار غير متاحة حالياً' : 'تعذر التحميل', e.status === 0 ? 'تحقق من اتصالك بالإنترنت.' : 'جرّب لاحقاً أو اسأل الاستقبال.'); }
    setStore(info.store);
    settings = info.settings;
    if (!settings.open) return show('closed');

    document.getElementById('info-waiting').textContent = info.waiting;
    document.getElementById('info-eta').textContent = info.eta;
    const msg = document.getElementById('store-message');
    msg.textContent = settings.message || '';
    msg.classList.toggle('hidden', !settings.message);

    // إظهار الحقول اللي اختارها المطعم، وعلامة * للإلزامية
    document.querySelectorAll('[data-field]').forEach(el => {
      const f = settings.fields[el.dataset.field] || { on: false };
      el.classList.toggle('hidden', !f.on);
      const star = el.querySelector('.req');
      if (star) star.classList.toggle('hidden', !f.req);
    });
    show('form');
  }

  document.getElementById('party-minus').onclick = () => { partySize = Math.max(1, partySize - 1); document.getElementById('party-value').textContent = partySize; };
  document.getElementById('party-plus').onclick = () => { partySize = Math.min(settings ? settings.max_party : 20, partySize + 1); document.getElementById('party-value').textContent = partySize; };

  function formError(msg) {
    const el = document.getElementById('form-error');
    el.textContent = msg; el.classList.toggle('hidden', !msg);
  }

  document.getElementById('join-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    formError('');
    const F = settings.fields;
    const data = {
      slug,
      name: document.getElementById('f-name').value.trim(),
      phone: document.getElementById('f-phone').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      party_size: F.party_size.on ? partySize : null,
      seating: (document.querySelector('[name="seating"]:checked') || {}).value || '',
      notes: document.getElementById('f-notes').value.trim()
    };
    const labels = { name: 'الاسم', phone: 'رقم الجوال', email: 'البريد الإلكتروني', seating: 'تفضيل الجلسة', notes: 'الملاحظات' };
    for (const k of Object.keys(labels)) if (F[k].on && F[k].req && !data[k]) return formError(`${labels[k]} مطلوب`);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return formError('البريد الإلكتروني غير صحيح');

    const btn = document.getElementById('join-btn');
    btn.disabled = true;
    try {
      const res = await DM.post('/api/waitlist?action=join', data);
      saveToken(res.token);
      history.replaceState(null, '', `waitlist.html?client=${encodeURIComponent(slug)}&t=${encodeURIComponent(res.token)}`);
      await loadStatus(true);
    } catch (err) {
      formError(err.message || 'تعذر التسجيل، حاول مرة أخرى');
    } finally { btn.disabled = false; }
  });

  // ─── متابعة الدور ───
  const STATUS_VIEW = {
    waiting: (s) => `
      <div class="grid grid-cols-2 gap-3">
        <div class="bg-brand/5 border border-brand/10 rounded-2xl p-3">
          <p class="text-[11px] font-bold text-ink/55">ترتيبك</p>
          <p class="text-3xl font-black">${s.position}</p>
        </div>
        <div class="bg-brand/5 border border-brand/10 rounded-2xl p-3">
          <p class="text-[11px] font-bold text-ink/55">الوقت التقريبي</p>
          <p class="text-3xl font-black">~${s.eta}<span class="text-xs font-bold text-ink/50"> د</span></p>
        </div>
      </div>
      <p class="text-xs font-bold text-ink/65 leading-relaxed">${s.position === 1 ? 'أنت التالي! جهّز نفسك 👌' : 'أنت في القائمة ✅ راح يوصلك بريد أول ما تجهز طاولتك.'}</p>`,
    notified: (s) => `
      <div class="pulse-ring mx-auto w-20 h-20 rounded-full bg-green-600 text-white flex items-center justify-center text-3xl"><i class="fa-solid fa-bell-concierge"></i></div>
      <p class="text-2xl font-black text-green-700">طاولتك جاهزة! 🎉</p>
      <p class="text-sm font-bold text-ink/75 leading-relaxed">توجّه للاستقبال خلال <b>${s.hold_minutes} دقائق</b> وأخبرهم برقم دورك.</p>`,
    seated: () => `<p class="text-lg font-black">أهلاً وسهلاً 🌿</p><p class="text-xs text-ink/60">نتمنى لك وقت ممتع.</p>`,
    cancelled: () => `<p class="text-lg font-black">تم إلغاء تسجيلك</p><p class="text-xs text-ink/60">تقدر تسجّل من جديد في أي وقت.</p>`,
    no_show: () => `<p class="text-lg font-black">انتهى دورك</p><p class="text-xs text-ink/60">ما وصلت في الوقت المحدد. تقدر تسجّل من جديد.</p>`,
    expired: () => `<p class="text-lg font-black">انتهى هذا التسجيل</p><p class="text-xs text-ink/60">التسجيل كان ليوم سابق. تقدر تسجّل من جديد.</p>`
  };

  async function loadStatus(firstTime = false) {
    let s;
    try { s = await DM.get(`/api/waitlist?action=status&slug=${encodeURIComponent(slug)}&t=${encodeURIComponent(token)}`); }
    catch (e) {
      if (e.status === 404 && e.code === 'NOT_FOUND') { saveToken(''); return loadForm(); }
      if (e.status === 404) return unavailable('قائمة الانتظار غير متاحة حالياً', 'جرّب لاحقاً أو اسأل الاستقبال.');
      return; // انقطاع مؤقت: نحاول في التحديث الجاي
    }
    setStore(s.store);
    const st = s.entry.status;
    document.getElementById('st-ticket').textContent = `#${s.entry.ticket}`;
    document.getElementById('st-name').textContent = [s.entry.name, s.entry.party_size ? `${s.entry.party_size} أشخاص` : ''].filter(Boolean).join(' · ');
    document.getElementById('st-body').innerHTML = (STATUS_VIEW[st] || STATUS_VIEW.expired)({ ...s, hold_minutes: s.hold_minutes });
    document.getElementById('status-card').classList.toggle('ring-4', st === 'notified');
    document.getElementById('status-card').classList.toggle('ring-green-500/40', st === 'notified');

    const active = st === 'waiting' || st === 'notified';
    document.getElementById('st-actions').innerHTML = active
      ? `<button onclick="cancelEntry()" class="w-full bg-cream border border-red-300 text-red-700 font-bold text-xs py-3 rounded-2xl"><i class="fa-solid fa-xmark"></i> إلغاء تسجيلي</button>`
      : `<button onclick="newEntry()" class="w-full bg-brand text-cream font-black text-sm py-3.5 rounded-2xl"><i class="fa-solid fa-user-plus"></i> تسجيل جديد</button>`;

    // تنبيه لحظة جهوز الطاولة
    if (st === 'notified' && lastStatus && lastStatus !== 'notified' && navigator.vibrate) navigator.vibrate([300, 150, 300]);
    lastStatus = st;
    show('status');

    clearTimeout(pollTimer);
    if (active) pollTimer = setTimeout(() => loadStatus(), document.hidden ? 60000 : 15000);
    else saveToken('');
  }

  async function cancelEntry() {
    if (!confirm('متأكد تبي تلغي تسجيلك في قائمة الانتظار؟')) return;
    try { await DM.post('/api/waitlist?action=cancel', { slug, t: token }); } catch {}
    loadStatus();
  }
  function newEntry() {
    saveToken('');
    history.replaceState(null, '', `waitlist.html?client=${encodeURIComponent(slug)}`);
    show('loading'); loadForm();
  }
  document.addEventListener('visibilitychange', () => { if (!document.hidden && token && lastStatus) loadStatus(); });

  document.getElementById('menu-link').href = `menu.html?client=${encodeURIComponent(slug)}`;
  if (!slug) unavailable('الرابط غير مكتمل', 'اطلب رابط قائمة الانتظار من المطعم.');
  else if (token) loadStatus(true);
  else loadForm();
</script>
</body>
</html>
