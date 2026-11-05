// =====================================================================
// DEV MENU — لوحة التحكم: قائمة الانتظار: التسجيلات، التحديث اللحظي، سجل الضيوف والتصدير
// (ملفات js/admin/ تتحمّل بالترتيب، وتتشارك نفس المتغيرات العامة)
// =====================================================================
  // ─── قائمة الانتظار ───
  const WL_FIELDS = { name: 'الاسم', phone: 'رقم الجوال', email: 'البريد الإلكتروني', party_size: 'عدد الأشخاص', seating: 'تفضيل الجلسة', notes: 'ملاحظات' };
  const WL_SEATING = { indoor: 'داخلي', outdoor: 'خارجي', any: 'أي مكان' };
  let wl = { settings: null, entries: [], tab: 'active', timer: null, tick: null, seen: new Set(), first: true };
  const wlUrl = () => DM.storeUrl(client.client_slug, 'waitlist');
  const minsSince = (iso) => Math.max(0, Math.floor((Date.now() - new Date(iso)) / 60000));
  const minsText = (m) => m < 1 ? 'الآن' : m < 60 ? `${m} د` : `${Math.floor(m / 60)} س ${m % 60} د`;

  function renderWaitlistShell() {
    const on = client.waitlist_enabled === true;
    document.getElementById('wl-upsell').classList.toggle('hidden', on);
    document.getElementById('wl-app').classList.toggle('hidden', !on);
    document.getElementById('wl-price-month').textContent = 'مشمولة';
    document.getElementById('wl-price-year').textContent = 'في باقتك السنوية';
    document.getElementById('wl-request').onclick = (e) => { e.preventDefault(); contactAdmin('addon', 'أبغى أفعّل "قائمة الانتظار".'); };
    if (!on) return;
    document.getElementById('wl-link').value = wlUrl();
    document.getElementById('wl-open-link').href = wlUrl();
  }

  // التحديث التلقائي: كل 15 ثانية داخل الصفحة، وكل 45 ثانية بالخلفية (عشان عدّاد القائمة الجانبية)
  function onWaitlistPage(active) {
    clearInterval(wl.timer); clearInterval(wl.tick);
    if (!client || !client.waitlist_enabled) return;
    loadWaitlist();
    if (active) loadGuestHistory();
    wl.timer = setInterval(() => { if (!document.hidden) loadWaitlist(); }, active ? 15000 : 45000);
    if (active) wl.tick = setInterval(renderWaitlistList, 30000);
  }

  // ─── تحديث لحظي: تسجيل جديد في الانتظار أو تقييم جديد يظهر على طول بدون تحديث الصفحة ───
  let liveWired = false;
  function watchLive(L) {
    if (!L || liveWired) return;
    liveWired = true;
    // ملخص الرئيسية يتحدث لحظياً مع أي حركة (رقم بيجر، ختم، تسجيل انتظار)، بعد ثانية من آخر حركة
    const refreshHome = () => { clearTimeout(refreshHome.t); refreshHome.t = setTimeout(() => {
      if (document.hidden) return;
      const page = (location.hash || '#dashboard').slice(1);
      if (page === 'dashboard') renderServiceSummary();
      if (page === 'loyalty' && typeof onLoyaltyPage === 'function') onLoyaltyPage();
    }, 1000); };
    DM.live(L.waitlist, () => { if (client && client.waitlist_enabled) loadWaitlist(); refreshHome(); });
    if (L.pager) DM.live(L.pager, refreshHome);
    DM.live(L.owner, (ev) => {
      if (ev === 'loyalty') refreshHome();
      // إشعار جديد من الإدارة: الجرس يتحدث على طول، ورسالة صغيرة تنبّهه
      if (ev === 'notify') loadNotifs().then(() => { const n = notifs.find(x => !x.read_at); if (n) showToast(`🔔 ${n.title}`); });
    });

  }

  async function loadWaitlist(manual = false) {
    try {
      const data = await api('waitlist');
      const fresh = data.entries.filter(e => e.status === 'waiting' && !wl.seen.has(e.id));
      data.entries.forEach(e => wl.seen.add(e.id));
      wl.entries = data.entries;
      if (!wl.settings || manual) { wl.settings = data.settings; renderWaitlistSettings(); }
      document.getElementById('wl-mail-warning').classList.toggle('hidden', data.mail_ready !== false);
      renderWaitlistOpen();
      renderWaitlistList();
      if (!wl.first && fresh.length) { beep(); showToast(`تسجيل جديد في الانتظار: ${fresh[0].name || '#' + fresh[0].ticket}`); }
      wl.first = false;
      if (manual) showToast('تم التحديث');
    } catch (e) { lastApiError = ''; console.error(e); }
  }

  function beep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination); o.frequency.value = 880; g.gain.value = 0.08;
      o.start(); o.stop(ctx.currentTime + 0.18);
    } catch {}
  }

  function renderWaitlistOpen() {
    const open = wl.settings && wl.settings.open;
    const t = document.getElementById('wl-open-toggle');
    t.setAttribute('aria-checked', open ? 'true' : 'false');
    t.className = `relative w-14 h-8 rounded-full transition shrink-0 ${open ? 'bg-green-600' : 'bg-brand/25'}`;
    t.firstElementChild.style.right = open ? '4px' : '28px';
    document.getElementById('wl-open-text').textContent = open ? 'مفتوحة — الضيوف يقدرون يسجلون' : 'مغلقة — ما يقبل تسجيلات جديدة';

    // زر المنيو
    const inMenu = wl.settings && wl.settings.show_in_menu !== false;
    const m = document.getElementById('wl-menu-toggle');
    m.setAttribute('aria-checked', inMenu ? 'true' : 'false');
    m.className = `relative w-14 h-8 rounded-full transition shrink-0 ${inMenu ? 'bg-green-600' : 'bg-brand/25'}`;
    m.firstElementChild.style.right = inMenu ? '4px' : '28px';
    document.getElementById('wl-menu-text').textContent = !inMenu
      ? 'مخفي — الضيوف يسجلون من الرابط أو QR فقط'
      : open ? 'ظاهر — يشوفه الزبون أعلى المنيو' : 'ظاهر لما تفتح القائمة';
  }

  async function toggleWaitlistInMenu() {
    const show = !(wl.settings && wl.settings.show_in_menu !== false);
    try {
      const res = await api('waitlist-settings', { show_in_menu: show });
      wl.settings = res.settings; renderWaitlistOpen();
      showToast(show ? 'زر قائمة الانتظار ظاهر في المنيو' : 'تم إخفاء زر قائمة الانتظار من المنيو');
    } catch { showToast('ما قدرنا نحدّث البيانات. تأكد من الإنترنت', true); }
  }

  async function toggleWaitlistOpen() {
    const open = !(wl.settings && wl.settings.open);
    try {
      const res = await api('waitlist-settings', { open });
      wl.settings = res.settings; renderWaitlistOpen();
      showToast(open ? 'قائمة الانتظار مفتوحة' : 'تم إغلاق قائمة الانتظار');
    } catch { showToast('ما قدرنا نحدّث البيانات. تأكد من الإنترنت', true); }
  }

  function renderWaitlistStats() {
    const E = wl.entries;
    const waiting = E.filter(e => e.status === 'waiting').length;
    const notified = E.filter(e => e.status === 'notified').length;
    const seated = E.filter(e => e.status === 'seated');
    const noShow = E.filter(e => e.status === 'no_show').length;
    const waits = E.filter(e => e.notified_at).map(e => (new Date(e.notified_at) - new Date(e.created_at)) / 60000);
    const avg = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
    const tile = (label, value, icon, color) => `
      <div class="pro-card p-3 sm:p-4">
        <p class="text-[11px] text-ink flex items-center gap-1.5"><i class="ph-bold ${icon} ${color}"></i> ${label}</p>
        <p class="text-xl sm:text-2xl font-black mt-1">${value}</p>
      </div>`;
    document.getElementById('wl-stats').innerHTML =
      tile('بالانتظار الآن', waiting, 'ph-hourglass-medium', 'text-amber-600') +
      tile('تم تنبيههم', notified, 'ph-bell', 'text-blue-600') +
      tile('جلسوا اليوم', seated.length, 'ph-chair', 'text-green-600') +
      tile('متوسط الانتظار', avg === null ? '—' : `${avg} د`, 'ph-timer', 'text-ink');
    ['nav-waitlist', 'bnav-waitlist'].forEach(id => {
      const b = document.getElementById(id);
      b.textContent = waiting; b.classList.toggle('hidden', waiting === 0);
    });
    document.getElementById('wl-count-active').textContent = waiting + notified ? `(${waiting + notified})` : '';
    const done = seated.length + noShow + E.filter(e => e.status === 'cancelled').length;
    document.getElementById('wl-count-done').textContent = done ? `(${done})` : '';
    document.title = waiting ? `(${waiting}) قائمة الانتظار | Dev Menu` : 'لوحة التحكم | Dev Menu';
  }

  // كم مرة جاء الضيف قبل (من تسجيلاته السابقة بنفس الجوال أو البريد)
  const timesText = (n) => n === 1 ? 'مرة' : n === 2 ? 'مرتين' : n <= 10 ? `${n} مرات` : `${n} مرة`;
  const shortDate = (iso) => iso ? new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'short' }) : '';
  function historyBadge(h) {
    if (!h) return '';
    const chip = (cls, html) => `<span class="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}">${html}</span>`;
    if (!h.visits) return `<div class="flex flex-wrap gap-1.5 mt-1.5">${chip('bg-blue-500/10 text-blue-700', '<i class="ph-bold ph-plant"></i> أول زيارة')}</div>`;
    const out = [];
    if (h.seated) out.push(chip(h.seated >= 3 ? 'bg-amber-400/20 text-amber-800' : 'bg-green-500/15 text-green-700',
      `<i class="ph-bold ${h.seated >= 3 ? 'ph-star' : 'ph-arrow-counter-clockwise'}"></i> زارك ${timesText(h.seated)} قبل${h.seated >= 3 ? ' · عميل دائم' : ''}`));
    else out.push(chip('bg-brand/10 text-ink', `<i class="ph-bold ph-clock-counter-clockwise"></i> سجّل ${timesText(h.visits)} قبل`));
    if (h.no_show) out.push(chip('bg-red-500/10 text-red-700', `<i class="ph-bold ph-warning"></i> لم يحضر ${timesText(h.no_show)}`));
    if (h.last) out.push(`<span class="text-[11px] text-ink">آخر زيارة ${esc(shortDate(h.last))}</span>`);
    return `<div class="flex flex-wrap items-center gap-1.5 mt-1.5">${out.join('')}</div>`;
  }

  function renderWaitlistList() {
    if (!client || !client.waitlist_enabled) return;
    renderWaitlistStats();
    const active = wl.tab === 'active';
    const list = wl.entries.filter(e => active ? ['waiting', 'notified'].includes(e.status) : !['waiting', 'notified'].includes(e.status));
    if (!active) list.reverse();
    const box = document.getElementById('wl-list');
    if (!list.length) {
      box.innerHTML = `<div class="text-center py-10 text-ink text-xs"><i class="ph-bold ph-coffee text-2xl mb-2 block"></i>${active ? 'ما فيه أحد بالانتظار الحين' : 'ما فيه تسجيلات منتهية اليوم'}</div>`;
      return;
    }
    const STATUS = {
      seated: ['جلس', 'bg-green-500/15 text-green-700'], no_show: ['لم يحضر', 'bg-red-500/10 text-red-700'],
      cancelled: ['ألغى', 'bg-brand/10 text-ink']
    };
    box.innerHTML = list.map(e => {
      const waited = minsSince(e.created_at);
      const notified = e.status === 'notified';
      const since = notified ? minsSince(e.notified_at) : 0;
      const late = notified && since > (wl.settings ? wl.settings.hold_minutes : 10);
      const info = [
        e.party_size ? `<span><i class="ph-bold ph-users-three"></i> ${esc(e.party_size)}</span>` : '',
        e.seating ? `<span><i class="ph-bold ph-chair"></i> ${esc(WL_SEATING[e.seating] || e.seating)}</span>` : '',
        e.phone ? `<a href="tel:${esc(e.phone)}" class="text-blue-700" dir="ltr"><i class="ph-bold ph-phone"></i> ${esc(e.phone)}</a>` : '',
        e.email ? `<span class="truncate max-w-[180px]" dir="ltr"><i class="ph-bold ph-envelope-simple"></i> ${esc(e.email)}</span>` : ''
      ].filter(Boolean).join('');
      const id = Number(e.id);
      const actions = active ? (notified
        ? `<button onclick="wlSet(${id},'seated')" class="bg-green-600 text-white">جلس ✓</button>
           <button onclick="wlSet(${id},'notified',true)" class="bg-brand/10 text-ink border border-brand/20">إعادة التنبيه</button>
           <button onclick="wlSet(${id},'no_show')" class="bg-red-500/10 text-red-700 border border-red-500/20">لم يحضر</button>`
        : `<button onclick="wlSet(${id},'notified')" class="bg-brand text-cream col-span-2 sm:col-span-1"><i class="ph-bold ph-bell"></i> جاء دوره</button>
           <button onclick="wlSet(${id},'seated')" class="bg-brand/10 text-ink border border-brand/20">جلس مباشرة</button>
           <button onclick="wlSet(${id},'cancelled')" class="bg-red-500/10 text-red-700 border border-red-500/20">إلغاء</button>`)
        : `<button onclick="wlSet(${id},'waiting')" class="bg-brand/10 text-ink border border-brand/20"><i class="ph-bold ph-arrow-counter-clockwise"></i> إرجاع للقائمة</button>`;
      return `
        <div class="rounded-2xl border p-3 sm:p-3.5 space-y-2.5 ${notified ? (late ? 'border-red-400/60 bg-red-500/5' : 'border-green-500/50 bg-green-500/5') : 'border-brand/15 bg-brand/[0.03]'}">
          <div class="flex items-start gap-3">
            <div class="w-12 h-12 rounded-xl ${notified ? 'bg-green-600 text-white' : 'bg-brand text-cream'} flex flex-col items-center justify-center shrink-0 leading-none">
              <span class="text-[10px] opacity-75">دور</span><span class="text-lg font-black">${e.ticket}</span>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center justify-between gap-2">
                <p class="font-black text-sm truncate">${esc(e.name || 'ضيف')}</p>
                ${active
                  ? `<span class="text-[11px] font-bold shrink-0 ${notified ? (late ? 'text-red-700' : 'text-green-700') : 'text-ink'}">${notified ? `نُبّه ${minsText(since)}${late ? ' · تأخر' : ''}` : `ينتظر ${minsText(waited)}`}</span>`
                  : `<span class="text-[11px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS[e.status][1]}">${STATUS[e.status][0]}</span>`}
              </div>
              <div class="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink mt-1">${info}</div>
              ${historyBadge(e.history)}
              ${e.notes ? `<p class="text-[11px] text-ink bg-amber-100/60 rounded-lg px-2 py-1 mt-1.5"><i class="ph-bold ph-note text-amber-600"></i> ${esc(e.notes)}</p>` : ''}
            </div>
          </div>
          <div class="grid ${active && !notified ? 'grid-cols-2' : active ? 'grid-cols-3' : 'grid-cols-1'} sm:flex sm:justify-end gap-1.5 [&>button]:px-3 [&>button]:py-2 [&>button]:rounded-lg [&>button]:text-[11px] [&>button]:font-bold">${actions}</div>
        </div>`;
    }).join('');
  }

  document.getElementById('wl-tabs').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wltab]'); if (!b) return;
    wl.tab = b.dataset.wltab;
    document.querySelectorAll('[data-wltab]').forEach(x => {
      const on = x === b;
      x.classList.toggle('bg-brand', on); x.classList.toggle('text-cream', on); x.classList.toggle('text-ink', !on);
    });
    renderWaitlistList();
  });

  async function wlSet(id, status, resend = false) {
    try {
      const res = await api('waitlist-update', { id, status });
      const i = wl.entries.findIndex(e => e.id === id);
      if (i >= 0) wl.entries[i] = { ...wl.entries[i], ...res.entry };
      renderWaitlistList();
      if (status === 'notified') {
        showToast(res.email_sent ? (resend ? 'أعدنا إرسال التنبيه للضيف' : 'تم تنبيه الضيف بالبريد ✉️') : 'تم التحديث، لكن البريد ما انرسل', !res.email_sent);
      } else {
        showToast({ seated: 'تم تجليس الضيف', no_show: 'سُجّل كـ "لم يحضر"', cancelled: 'تم الإلغاء', waiting: 'رجع للقائمة' }[status]);
      }
    } catch { showToast('ما قدرنا نحدّث البيانات. تأكد من الإنترنت', true); }
  }

  function renderWaitlistSettings() {
    const s = wl.settings; if (!s) return;
    document.getElementById('wl-fields').innerHTML = Object.entries(WL_FIELDS).map(([k, label]) => {
      const f = s.fields[k], locked = k === 'email';
      return `
        <div class="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-3 py-2.5 text-xs">
          <span class="font-bold">${label}${locked ? ' <span class="text-[10px] text-ink font-normal">(اختياري للزبون، يوصله عليه التنبيه)</span>' : ''}</span>
          <input type="checkbox" data-wlf="${k}" data-kind="on" ${f.on ? 'checked' : ''} ${locked ? 'disabled' : ''} class="w-5 h-5 accent-[#384f3d]">
          <input type="checkbox" data-wlf="${k}" data-kind="req" ${f.req ? 'checked' : ''} ${locked || !f.on ? 'disabled' : ''} class="w-5 h-5 accent-[#b45309]">
        </div>`;
    }).join('');
    document.getElementById('wl-minutes').value = s.minutes_per_party;
    document.getElementById('wl-hold').value = s.hold_minutes;
    document.getElementById('wl-max-party').value = s.max_party;
    document.getElementById('wl-message').value = s.message || '';
    document.getElementById('wl-preview').href = wlUrl();
    sayWaitlist();
  }
  document.getElementById('wl-fields').addEventListener('change', (e) => {
    const cb = e.target.closest('[data-wlf]'); if (!cb || cb.dataset.kind !== 'on') return;
    const req = document.querySelector(`[data-wlf="${cb.dataset.wlf}"][data-kind="req"]`);
    req.disabled = !cb.checked; if (!cb.checked) req.checked = false;
  });

  // مثال حي لصاحب المحل: كيف يقرا الزبون عدد الأختام والمكافأة
  function sayLoyaltyBasics() {
    const n = +document.getElementById('ly-needed').value || 0, r = document.getElementById('ly-reward').value.trim();
    document.getElementById('ly-basics-say').innerHTML = `<b>يطلع للزبون في بطاقته:</b> «بعد ${n} أختام تاخذ ${r ? esc(r) : '...'}»`;
  }
  document.getElementById('ly-needed').addEventListener('change', sayLoyaltyBasics);
  document.getElementById('ly-reward').addEventListener('input', sayLoyaltyBasics);
  // مثال حي لوقت الانتظار
  function sayWaitlist() {
    const m = +document.getElementById('wl-minutes').value || 0, h = +document.getElementById('wl-hold').value || 0;
    document.getElementById('wl-say-eta').innerHTML = `مثال: لو قدّام الضيف 3 مجموعات، يطلع له <b>~${m * 3} دقيقة</b>.`;
    document.getElementById('wl-say-hold').innerHTML = `لما يجي دوره يطلع له: <b>«عندك ${h} دقايق تحضر»</b>، وبعدها تقدر تعطي دوره للي بعده.`;
  }
  ['wl-minutes', 'wl-hold'].forEach(id => document.getElementById(id).addEventListener('input', sayWaitlist));
  // مثال حي لرسالة "وحشتنا"
  function sayWinback() {
    const el = document.getElementById('nt-wb-say'); if (!el) return;
    const d = document.getElementById('nt-wb-days').value, t = document.getElementById('nt-wb-text').value.trim();
    el.innerHTML = `<b>مثال:</b> زبون آخر رقم أخذه قبل ${d} يوم، يوصله على شاشة القفل من بطاقة النداء: «${t ? esc(t) : '...'}». ومرة وحدة بس لين يرجع.`;
  }
  ['nt-wb-days', 'nt-wb-text'].forEach(id => { const el = document.getElementById(id); if (el) el.addEventListener(id === 'nt-wb-days' ? 'change' : 'input', sayWinback); });
  async function saveWaitlistSettings() {
    const fields = {};
    Object.keys(WL_FIELDS).forEach(k => {
      fields[k] = {
        on: document.querySelector(`[data-wlf="${k}"][data-kind="on"]`).checked,
        req: document.querySelector(`[data-wlf="${k}"][data-kind="req"]`).checked
      };
    });
    try {
      const res = await api('waitlist-settings', {
        fields,
        minutes_per_party: Number(document.getElementById('wl-minutes').value),
        hold_minutes: Number(document.getElementById('wl-hold').value),
        max_party: Number(document.getElementById('wl-max-party').value),
        message: document.getElementById('wl-message').value.trim()
      });
      wl.settings = res.settings; renderWaitlistSettings(); renderWaitlistOpen();
      showToast('تم حفظ إعدادات قائمة الانتظار');
    } catch { showToast('تعذر حفظ الإعدادات', true); }
  }

  // ─── سجل الضيوف + التصدير ───
  const WL_STATUS_AR = { waiting: 'بالانتظار', notified: 'تم التنبيه', seated: 'جلس', no_show: 'لم يحضر', cancelled: 'ألغى' };
  let wlh = { entries: [], loaded: null };
  const fmtDateTime = (iso) => iso ? new Date(iso).toLocaleString('en-GB', { timeZone: 'Asia/Riyadh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '') : '';
  const waitMins = (e) => e.notified_at ? Math.max(0, Math.round((new Date(e.notified_at) - new Date(e.created_at)) / 60000)) : null;
  // نفس الضيف لو تطابق البريد أو آخر 9 أرقام من الجوال
  const guestKeys = (e) => {
    const k = [];
    const m = String(e.email || '').trim().toLowerCase(); if (m) k.push(`e:${m}`);
    const d = String(e.phone || '').replace(/\D/g, ''); if (d.length >= 7) k.push(`p:${d.slice(-9)}`);
    return k.length ? k : [`#${e.ticket}-${e.created_at}`];
  };
  // يجمع التسجيلات حسب الضيف (union-find على البريد والجوال)
  function groupGuests(list) {
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    list.forEach(e => {
      const ks = guestKeys(e);
      ks.forEach(k => { if (!parent.has(k)) parent.set(k, k); });
      ks.slice(1).forEach(k => parent.set(find(k), find(ks[0])));
    });
    const groups = new Map();
    list.slice().sort((a, b) => (a.created_at < b.created_at ? -1 : 1)).forEach(e => {
      const root = find(guestKeys(e)[0]);
      const g = groups.get(root) || { name: '', phone: '', email: '', visits: 0, seated: 0, no_show: 0, first: e.created_at, last: e.created_at };
      g.visits++; if (e.status === 'seated') g.seated++; if (e.status === 'no_show') g.no_show++;
      g.last = e.created_at; g.name = e.name || g.name; g.phone = e.phone || g.phone; g.email = e.email || g.email;
      groups.set(root, g);
    });
    return [...groups.values()].sort((a, b) => b.seated - a.seated || b.visits - a.visits || (a.last < b.last ? 1 : -1));
  }
  let wlhView = 'guests';

  async function loadGuestHistory(force = false) {
    const days = document.getElementById('wlh-range').value;
    if (!force && wlh.loaded === days) return renderGuestHistory();
    document.getElementById('wlh-rows').innerHTML = '<tr><td colspan="8" class="text-center py-6 text-ink"><i class="ph-bold ph-spinner-gap ph-spin"></i> جاري التحميل...</td></tr>';
    try {
      const data = await api(`waitlist-history&days=${days}`);
      wlh = { entries: data.entries || [], loaded: days };
    } catch (e) { lastApiError = ''; wlh = { entries: [], loaded: null }; }
    renderGuestHistory();
  }

  function filteredGuests() {
    const q = document.getElementById('wlh-search').value.trim().toLowerCase();
    return !q ? wlh.entries : wlh.entries.filter(e => [e.name, e.phone, e.email].some(v => v && String(v).toLowerCase().includes(q)));
  }

  function renderGuestHistory() {
    const list = filteredGuests();
    const groups = groupGuests(list);
    const unique = groups.length;
    const regulars = groups.filter(g => g.seated >= 2).length;
    const seated = list.filter(e => e.status === 'seated').length;
    const waits = list.map(waitMins).filter(v => v !== null);
    const avg = waits.length ? Math.round(waits.reduce((a, b) => a + b, 0) / waits.length) : null;
    const tile = (label, value) => `<div class="bg-brand/5 border border-brand/10 rounded-xl p-2.5"><p class="text-[11px] text-ink">${label}</p><p class="text-lg font-black">${value}</p></div>`;
    document.getElementById('wlh-stats').innerHTML =
      tile('التسجيلات', list.length) + tile('ضيوف مختلفين', unique) + tile('رجعوا أكثر من مرة', regulars) + tile('متوسط الانتظار', avg === null ? '—' : `${avg} د`);

    // عرض الضيوف: كل ضيف وكم مرة جاء
    document.getElementById('wlh-guests-wrap').classList.toggle('hidden', wlhView !== 'guests');
    document.getElementById('wlh-visits-wrap').classList.toggle('hidden', wlhView !== 'visits');
    const gShown = groups.slice(0, 300);
    document.getElementById('wlh-guest-rows').innerHTML = gShown.length ? gShown.map(g => `
      <tr>
        <td class="px-3 py-2 font-bold">${esc(g.name || 'ضيف')}${g.seated >= 3 ? ' <i class="ph-bold ph-star text-amber-500" title="عميل دائم"></i>' : ''}</td>
        <td class="px-3 py-2" dir="ltr">${g.phone ? `<a href="tel:${esc(g.phone)}" class="text-blue-700">${esc(g.phone)}</a>` : '—'}</td>
        <td class="px-3 py-2" dir="ltr">${esc(g.email || '—')}</td>
        <td class="px-3 py-2"><span class="inline-block min-w-[26px] text-center font-black px-2 py-0.5 rounded-full ${g.seated >= 3 ? 'bg-amber-400/20 text-amber-800' : g.seated ? 'bg-green-500/15 text-green-700' : 'bg-brand/10 text-ink'}">${g.seated}</span></td>
        <td class="px-3 py-2">${g.visits}</td>
        <td class="px-3 py-2 ${g.no_show ? 'text-red-700 font-bold' : 'text-ink'}">${g.no_show || '—'}</td>
        <td class="px-3 py-2 text-ink" dir="ltr">${esc(fmtDateTime(g.last))}</td>
      </tr>`).join('') : '<tr><td colspan="7" class="text-center py-6 text-ink">لا يوجد ضيوف في هذه الفترة</td></tr>';

    const shown = list.slice(0, 200);
    document.getElementById('wlh-rows').innerHTML = shown.length ? shown.map(e => `
      <tr>
        <td class="px-3 py-2 text-ink" dir="ltr">${esc(fmtDateTime(e.created_at))}</td>
        <td class="px-3 py-2 font-bold">#${esc(e.ticket)}</td>
        <td class="px-3 py-2 font-bold">${esc(e.name || '—')}</td>
        <td class="px-3 py-2" dir="ltr">${e.phone ? `<a href="tel:${esc(e.phone)}" class="text-blue-700">${esc(e.phone)}</a>` : '—'}</td>
        <td class="px-3 py-2" dir="ltr">${esc(e.email || '—')}</td>
        <td class="px-3 py-2">${esc(e.party_size ?? '—')}</td>
        <td class="px-3 py-2">${waitMins(e) === null ? '—' : `${waitMins(e)} د`}</td>
        <td class="px-3 py-2">${esc(WL_STATUS_AR[e.status] || e.status)}</td>
      </tr>`).join('') : '<tr><td colspan="8" class="text-center py-6 text-ink">لا توجد تسجيلات في هذه الفترة</td></tr>';
    document.getElementById('wlh-note').textContent = wlhView === 'guests'
      ? `مرات الحضور = عدد المرات اللي جلس فيها الضيف فعلاً${groups.length > 300 ? ` · يظهر أول 300 ضيف من ${groups.length}` : ''}. الضيف ينعرف بجواله أو بريده.`
      : (list.length > 200 ? `يظهر أحدث 200 تسجيل من ${list.length}. الملف المصدَّر يحتوي على الكل.` : '');
  }
  document.getElementById('wlh-range').addEventListener('change', () => loadGuestHistory(true));
  document.getElementById('wlh-search').addEventListener('input', renderGuestHistory);
  document.getElementById('wlh-view').addEventListener('click', (e) => {
    const b = e.target.closest('[data-wlhview]'); if (!b) return;
    wlhView = b.dataset.wlhview;
    document.querySelectorAll('[data-wlhview]').forEach(x => {
      const on = x === b;
      x.classList.toggle('bg-brand', on); x.classList.toggle('text-cream', on); x.classList.toggle('text-ink', !on);
    });
    renderGuestHistory();
  });

  // ملف CSV يفتح في Excel بالعربي، وفيه حقوق DEV MENU أعلى وأسفل الملف
  function exportGuests(kind) {
    const list = filteredGuests();
    if (!list.length) return showToast('ما فيه بيانات للتصدير في هذه الفترة', true);
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    // نحافظ على الصفر في بداية رقم الجوال لما يفتح الملف في Excel
    const phoneCell = (p) => p ? `\t${p}` : '';
    const rangeText = document.getElementById('wlh-range').selectedOptions[0].textContent.trim();
    const year = new Date().getFullYear();
    const now = fmtDateTime(new Date().toISOString());
    const rows = [
      ['DEV MENU — منصة المنيو الرقمي', 'app.devmenu.digital'],
      [kind === 'guests' ? 'قائمة ضيوف قائمة الانتظار' : 'سجل تسجيلات قائمة الانتظار', client.name || '', `الفترة: ${rangeText}`, `تاريخ التصدير: ${now}`],
      []
    ];
    if (kind === 'guests') {
      rows.push(['الاسم', 'الجوال', 'البريد الإلكتروني', 'مرات الحضور', 'عدد التسجيلات', 'لم يحضر', 'أول زيارة', 'آخر زيارة']);
      groupGuests(list).forEach(g =>
        rows.push([g.name, phoneCell(g.phone), g.email, g.seated, g.visits, g.no_show, fmtDateTime(g.first), fmtDateTime(g.last)]));
    } else {
      rows.push(['التاريخ والوقت', 'رقم الدور', 'الاسم', 'الجوال', 'البريد الإلكتروني', 'عدد الأشخاص', 'تفضيل الجلسة', 'الملاحظات', 'الحالة', 'وقت التنبيه', 'مدة الانتظار (دقيقة)']);
      list.forEach(e => rows.push([
        fmtDateTime(e.created_at), e.ticket, e.name, phoneCell(e.phone), e.email, e.party_size, WL_SEATING[e.seating] || '', e.notes,
        WL_STATUS_AR[e.status] || e.status, fmtDateTime(e.notified_at), waitMins(e) ?? ''
      ]));
    }
    rows.push([], [`© ${year} DEV MENU — جميع الحقوق محفوظة. هذه البيانات خاصة بـ "${client.name || ''}" وتُستخدم لخدمة الضيوف فقط، ولا يجوز مشاركتها مع أي طرف آخر.`]);

    const csv = '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `DEV-MENU_${kind === 'guests' ? 'guests' : 'waitlist'}_${client.client_slug}_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    showToast(kind === 'guests' ? `تم تنزيل قائمة ${groupGuests(list).length} ضيف` : `تم تنزيل ${list.length} تسجيل`);
  }

  function copyWaitlistLink() {
    navigator.clipboard.writeText(wlUrl()).then(() => showToast('تم نسخ رابط قائمة الانتظار')).catch(() => showToast('انسخ الرابط يدوياً من الخانة', true));
  }
  function downloadWaitlistQr() {
    downloadQrCard({
      url: wlUrl(), caption: 'امسح الرمز للتسجيل في قائمة الانتظار', captionEn: 'Scan to join the waitlist',
      filePrefix: 'waitlist-qr', button: document.getElementById('wl-qr-btn')
    });
  }

