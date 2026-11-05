// =====================================================================
// DEV MENU — لوحة التحكم: الحساب: الاشتراك والباقة، التواصل مع الإدارة، الإشعارات، تنبيه الإدارة، العرض الترويجي، معلومات الحساب، العملة ونوع النشاط
// (ملفات js/admin/ تتحمّل بالترتيب، وتتشارك نفس المتغيرات العامة)
// =====================================================================
  // ─── الاشتراك والتجديد ───
  const daysText = (n) => n === 1 ? 'يوم واحد' : n === 2 ? 'يومين' : n <= 10 ? `${n} أيام` : `${n} يوم`;
  // ─── الباقة بالمميزات (الأسعار في js/plans.js) ───
  // الحساب = المتجر الرئيسي وفروعه باشتراك واحد، شهري أو سنوي
  const branchList = () => branches.filter(b => b.parent_id);
  const branchCount = () => branchList().length;
  // مجموع الفروع في السعر (كل فرع: رسومه + مميزاته، والقديم برسوم الفرع بس)
  const branchesTotal = (pr) => pr.lines.filter(l => l.key === 'branch').reduce((a, l) => a + l.amount, 0);
  const myFeatures = () => DMPlans.featuresOf(client);
  let pickFeatures = null;   // المميزات اللي يختارها الحين في البطاقة
  let freeAllPlans = false;
  function chosenFeatures() {
    if (!pickFeatures) {
      const base = (client.requested_features && client.requested_features.length) ? client.requested_features
        : DMPlans.isFree(client) ? ['pager']   // البيجر المجاني: الترقية الطبيعية اشتراك البيجر
        : client.subscription_status === 'active' ? (client.plan_features && client.plan_features.length ? DMPlans.clean(client.plan_features) : myFeatures()) : DMPlans.LEGACY;
      pickFeatures = new Set(base);
    }
    return DMPlans.clean([...pickFeatures]);
  }
  const planTotal = (plan = 'year', feats = chosenFeatures()) => DMPlans.price(feats, plan, branchList()).total;
  function renewMsg(plan) {
    const feats = chosenFeatures();
    const names = [...feats, ...wide].map(k => DMPlans.FEATURES[k].name).join(' + ');
    return `أبغى أشترك/أجدد بالباقة ${plan === 'month' ? 'الشهرية' : 'السنوية'}: ${names}${branchCount() ? ` + ${branchCount()} فرع` : ''}. المجموع ${planTotal(plan)} ر.س.`;
  }

  // ─── التواصل مع الإدارة: الطلب يوصل لصفحة المدير العام، والرد يطلع هنا ───
  const SUPPORT_KIND = { renew: 'تجديد', plan: 'تغيير باقة', addon: 'تفعيل إضافة', branch: 'فرع جديد', suspended: 'حساب موقوف', contact: 'رسالة' };
  // التجربة: اللي اختار البيجر بدون الرسائل يجربها مجاناً (وتتوقف بعد التجربة إلا إذا أضافها)
  const trialGift = () => !!client && client.subscription_status === 'trial' && DMPlans.has(client, 'notify') && !(client.plan_features || []).includes('notify') && !DMPlans.has(client, 'loyalty');
  // ─── جرس الإشعارات ───
  // يتحدث لحظياً، وصاحب المحل يقرأ ويحذف بنفسه (المقروءة تنحذف بعد يوم)
  let notifs = [], notifOpen = false;
  // أيقونة ولون كل نوع: رد، فرع، تنبيه، تذكير، معلومة، أو إشعار من الإدارة
  const NOTIF_ICON = { order: 'ph-receipt', reply: 'ph-chat-circle-text', branch: 'ph-git-branch', admin: 'ph-megaphone', alert: 'ph-warning', reminder: 'ph-clock', info: 'ph-info' };
  const NOTIF_TONE = { order: 'bg-emerald-500/15 text-emerald-800', alert: 'bg-red-500/10 text-red-700', reminder: 'bg-amber-500/15 text-amber-800', info: 'bg-sky-500/10 text-sky-800' };
  async function loadNotifs() {
    try {
      // ما يحتاج تحديث الصفحة: يجي الإشعار لحظياً، وهذا احتياط كل دقيقة
      const r = await api('notifications');
      notifs = r.items || [];
      const b = document.getElementById('notif-badge');
      b.textContent = r.unread > 9 ? '9+' : r.unread; b.classList.toggle('hidden', !r.unread);
      if (notifOpen) renderNotifs();
    } catch {}
  }
  function renderNotifs() {
    const when = (iso) => new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    const unread = notifs.filter(n => !n.read_at).length;
    document.getElementById('notif-read-all').classList.toggle('hidden', !unread);
    document.getElementById('notif-del-all').classList.toggle('hidden', !notifs.length);
    const b = document.getElementById('notif-badge');
    b.textContent = unread > 9 ? '9+' : unread; b.classList.toggle('hidden', !unread);
    document.getElementById('notif-list').innerHTML = notifs.length ? notifs.map(n => `
      <div class="relative group ${n.read_at ? '' : 'bg-amber-50/70'}">
      <button type="button" onclick="deleteNotif(${n.id})" aria-label="حذف الإشعار" title="حذف" class="absolute top-2.5 left-2.5 w-7 h-7 rounded-lg text-ink hover:text-rose-700 hover:bg-rose-50 flex items-center justify-center"><i class="ph-bold ph-x text-[11px]"></i></button>
      <button type="button" onclick="openNotif(${n.id})" class="w-full text-right flex gap-3 ps-4 pe-12 py-3 hover:bg-brand/[0.04]">
        <span class="w-9 h-9 rounded-xl ${NOTIF_TONE[n.kind] || 'bg-brand/10 text-brand'} grid place-items-center shrink-0"><i class="ph-bold ${NOTIF_ICON[n.kind] || 'ph-bell'}"></i></span>
        <span class="flex-1 min-w-0">
          <span class="flex items-center gap-2"><b class="text-[13px]">${esc(n.title)}</b>${n.read_at ? '' : '<span class="w-2 h-2 rounded-full bg-red-600 shrink-0" aria-label="جديد"></span>'}</span>
          ${n.body ? `<span class="block text-[12px] text-ink leading-relaxed mt-0.5 whitespace-pre-line">${esc(n.body)}</span>` : ''}
          <span class="block text-[11px] text-ink mt-1">${when(n.created_at)}</span>
        </span>
      </button>
      </div>`).join('') : '<p class="text-[12px] text-ink text-center py-10 px-6">ما فيه إشعارات للحين. لما ترد الإدارة على طلبك أو يوصلك إشعار منها، يطلع هنا.</p>';
  }
  async function toggleNotifs(on = !notifOpen) {
    notifOpen = on;
    const panel = document.getElementById('notif-panel');
    panel.classList.toggle('hidden', !on);
    if (!on) return;
    // تحت الشريط العلوي مهما كان طوله (في الجوال سطرين)
    panel.style.top = `${Math.round(document.querySelector('header.sticky').getBoundingClientRect().bottom) + 8}px`;
    renderNotifs();
  }
  // يضغط على الإشعار: يصير مقروء، ويوديه لمكانه لو له رابط
  async function openNotif(id) {
    const n = notifs.find(x => x.id === id); if (!n) return;
    if (!n.read_at) {
      n.read_at = new Date().toISOString(); renderNotifs();
      api('notifications-read', { id }).catch(() => {});
    }
    if (n.link && n.link.startsWith('#')) { toggleNotifs(false); location.hash = n.link.slice(1); }
    else if (n.link && /pager-desk\.html$/.test(n.link)) { toggleNotifs(false); window.open('pager-desk.html' + location.search, '_blank', 'noopener'); }
  }
  async function readAllNotifs() {
    notifs = notifs.map(n => ({ ...n, read_at: n.read_at || new Date().toISOString() })); renderNotifs();
    try { await api('notifications-read', {}); } catch { showToast('ما انحفظ، تأكد من الإنترنت', true); }
  }
  // حذف إشعار واحد، أو الكل (بعد تأكيد)
  async function deleteNotif(id) {
    if (id == null && !(await DMDialog.confirm({ title: 'حذف كل الإشعارات', message: 'تنحذف كل الإشعارات من القائمة، وما ترجع.', confirmText: 'احذف الكل', cancelText: 'تراجع', tone: 'danger' }))) return;
    const keep = notifs;
    notifs = id == null ? [] : notifs.filter(n => n.id !== id); renderNotifs();
    try { await api('notifications-delete', id == null ? {} : { id }); }
    catch { notifs = keep; renderNotifs(); showToast('ما انحذف، تأكد من الإنترنت', true); }
  }
  // ضغطة برا القائمة تقفلها (زر الحذف ينشال من الصفحة بعد الضغط، فما نعتبره برا)
  document.addEventListener('click', (e) => { if (notifOpen && e.target.isConnected && !e.target.closest('#notif-panel, #notif-btn, .dmd-back')) toggleNotifs(false); });
  setInterval(() => { if (!document.hidden && client) loadNotifs(); }, 60000);

  // الترقية من الشهري للسنوي: كم يوفّر، وطلب يوصل للإدارة بضغطة
  function upgradeBox() {
    const f = myFeatures(), list = branchList();
    const month = DMPlans.price(f, 'month', list).total, year = DMPlans.price(f, 'year', list).total, save = month * 12 - year;
    return `<div class="rounded-2xl border border-emerald-600/30 bg-emerald-600/5 p-3.5 space-y-2">
      <p class="text-[13px] font-bold text-ink"><i class="ph-bold ph-arrow-circle-up text-emerald-700"></i> رقّ اشتراكك إلى السنوي</p>
      <p class="text-[12px] text-ink">اشتراكك الحالي شهري (${month} ر.س). السنوي ${year} ر.س${save > 0 ? `، وتوفّر ${save} ر.س في السنة` : ''}، ويشمل فروعك.</p>
      <button type="button" onclick="requestUpgrade()" class="w-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold py-2.5 rounded-xl text-[13px] transition"><i class="ph-bold ph-arrow-circle-up"></i> الترقية إلى الاشتراك السنوي</button>
    </div>`;
  }
  async function requestUpgrade() {
    if (!(await DMDialog.confirm({ title: 'الترقية إلى الاشتراك السنوي', message: 'يوصل طلبك للإدارة، ونتواصل معك لإتمام الدفع، ويتحوّل اشتراكك وفروعك إلى السنوي.', confirmText: 'أرسل طلب الترقية', cancelText: 'تراجع', tone: 'success' }))) return;
    try {
      await api('support-send', { kind: 'plan', body: 'طلب ترقية الاشتراك من الشهري إلى السنوي (الحساب وفروعه).' });
      showToast('وصل طلب الترقية للإدارة، وبنتواصل معك قريب');
      loadSupport();
    } catch (e) { showToast(e.message || 'ما انرسل. تأكد من الإنترنت وحاول مرة ثانية', true); }
  }
  async function contactAdmin(kind = 'contact', prefill = '', title = 'راسل إدارة DEV MENU') {
    const v = await DMDialog.form({ title, subtitle: 'توصل لإدارة DEV MENU، والرد يطلع لك هنا تحت "اشتراكك"', icon: 'ph-chat-circle-text',
      fields: [{ name: 'body', label: 'رسالتك', value: prefill, maxlength: 1000, required: true, multiline: true }], confirmText: 'أرسل' });
    if (!v) return;
    try {
      await api('support-send', { kind, body: v.body });
      showToast('وصل طلبك للإدارة، والرد يطلع لك تحت "اشتراكك"');
      loadSupport();
    } catch (e) { showToast(e.message || 'ما انرسل. تأكد من الإنترنت وحاول مرة ثانية', true); }
  }
  let supportRows = [];
  async function loadSupport() {
    const box = document.getElementById('support-box');
    if (!box) return;
    let r = { requests: [] };
    try { r = await api('support-list'); } catch {}
    supportRows = r.requests || []; renderBranchesCard();
    const when = (iso) => new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short' });
    box.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <h3 class="text-sm font-bold text-ink"><i class="ph-bold ph-chat-circle-text"></i> طلباتك للإدارة</h3>
        <button type="button" onclick="contactAdmin()" class="text-[12px] font-bold px-3 py-1.5 rounded-lg bg-brand text-cream">راسل الإدارة</button>
      </div>
      ${(r.requests || []).slice(0, 5).map(x => `
        <div class="rounded-xl border border-brand/10 bg-brand/[0.03] p-3 space-y-1.5">
          <div class="flex items-center justify-between gap-2 text-[11px]">
            <span class="font-bold">${SUPPORT_KIND[x.kind] || 'رسالة'}</span>
            <span class="${x.status === 'done' ? 'text-emerald-700' : 'text-amber-700'} font-bold">${x.status === 'done' ? 'تم' : 'قيد المتابعة'} <span class="text-ink font-normal">${when(x.created_at)}</span></span>
          </div>
          <p class="text-[12px] text-ink whitespace-pre-line">${esc(x.body)}</p>
          ${x.reply ? `<p class="text-[12px] bg-white rounded-lg border border-brand/10 px-2.5 py-2"><b class="text-brand">رد الإدارة:</b> ${esc(x.reply)}</p>` : ''}
        </div>`).join('') || '<p class="text-[11px] text-ink">التجديد وتغيير الباقة وأي استفسار: راسلنا من هنا، والرد يطلع لك في نفس المكان.</p>'}`;
  }

  // ─── اختيار الباقة: العميل يختار المميزات والمدة، والطلب يوصل للإدارة (لوحة المشتركين + بريد) ───
  let planChoice = null, planPick = null, planSending = false, planOpen = false;
  const planName = (p) => p === 'month' ? 'الشهرية' : 'السنوية';
  function requestedPlan() { return planChoice || (!client.parent_id && client.requested_plan) || null; }
  function pickPlan(p) { planPick = p; renderSubscriptionStatus(); }
  function toggleFeature(k) { pickFeatures = new Set(DMPlans.toggle(chosenFeatures(), k)); renderSubscriptionStatus(); }
  function changePlan() { planChoice = null; planOpen = true; if (!client.parent_id) client.requested_plan = null; renderSubscriptionStatus(); }
  function openPlan() { planOpen = true; renderSubscriptionStatus(); goToPlans(); }
  async function choosePlan(plan) {
    if (planSending) return;
    const features = chosenFeatures();
    if (!features.length) return showToast('اختر ميزة وحدة على الأقل', true);
    planSending = true; renderSubscriptionStatus();
    try {
      const r = await api('plan-request', { plan, features });
      planChoice = r.requested_plan;
      if (!client.parent_id) { client.requested_plan = r.requested_plan; client.requested_features = r.requested_features; }
      // في التجربة الخدمات تتفعّل على طول
      if (client.subscription_status === 'trial') { client.plan_features = r.requested_features; client.waitlist_enabled = r.requested_features.includes('waitlist'); applyFeatureLocks(); }
      showToast(`وصلنا طلبك، بنتواصل معك للدفع والتفعيل`);
    } catch (e) { showToast(e.message || 'تعذر إرسال الطلب، جرّب مرة ثانية', true); }
    planSending = false; renderSubscriptionStatus();
  }
  function goToPlans() {
    if (location.hash !== '#account') location.hash = 'account';
  }

  // تفصيل حسبة الطلب: كل ميزة بسعرها، والفروع، والخصم، والمجموع
  function reqBreakdown(plan, feats) {
    const pr = DMPlans.price(feats, plan, branchList());
    const line = (label, amount, cls = '') => `<p class="flex justify-between gap-3 ${cls}"><span>${esc(label)}</span><span class="tnum">${amount}</span></p>`;
    return `<div class="mt-2 rounded-xl bg-white border border-brand/15 p-3 space-y-1 text-[12.5px] text-ink">
      ${pr.lines.map(l => line(l.label, sar(l.amount))).join('')}
      ${pr.discounts.map(d => line(d.label, `- ${sar(d.amount)}`, 'text-emerald-800')).join('')}
      ${line(`المجموع ${plan === 'month' ? 'بالشهر' : 'بالسنة'}`, sar(pr.total), 'border-t border-brand/10 pt-1.5 font-bold')}
    </div>`;
  }
  function planPicker(verb) {
    const req = requestedPlan();
    if (req) {
      const feats = DMPlans.clean(client.requested_features || chosenFeatures());
      return `
        <div class="plan-done">
          <span class="plan-done-ic"><i class="ph-bold ph-check"></i></span>
          <div class="min-w-0">
            <p class="font-bold text-[13px] text-ink">وصلنا طلبك للباقة ${planName(req)}</p>
            ${reqBreakdown(req, feats)}
            <p class="text-[12px] text-ink mt-2">بنتواصل معك على جوالك للدفع، وبعدها يتفعّل اشتراكك على طول.</p>
            <div class="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2.5 text-[12px] font-bold">
              <button type="button" onclick="contactAdmin('renew', renewMsg('${req}'))" class="text-brand hover:underline"><i class="ph-bold ph-chat-circle-text"></i> راسل الإدارة</button>
              <button type="button" onclick="changePlan()" class="text-ink hover:text-ink">غيّر الباقة</button>
            </div>
          </div>
        </div>`;
    }
    const feats = chosenFeatures();
    const pick = planPick || 'year';
    const pr = DMPlans.price(feats, pick, branchList());
    const save = planTotal('month') * 12 - planTotal('year');
    const row = (k) => {
      const f = DMPlans.FEATURES[k], on = feats.includes(k), covered = DMPlans.coveredNote(feats, k);
      // الرسائل مع الولاء: مشمولة فيه، فتطلع معطّلة ومعها السبب بدل السعر
      if (covered) return `
        <div role="checkbox" aria-checked="false" aria-disabled="true" class="feat-row covered">
          <span class="feat-box"><i class="ph-bold ph-check text-ink"></i></span>
          <span class="flex-1 min-w-0 text-right"><b class="block text-[13px]"><i class="ph-bold ${f.icon}"></i> ${f.name}</b><span class="block text-[11px] text-ink leading-relaxed">${covered}.</span></span>
        </div>`;
      return `
        <button type="button" role="checkbox" aria-checked="${on}" onclick="toggleFeature('${k}')" class="feat-row ${on ? 'on' : ''}">
          <span class="feat-box">${on ? '<i class="ph-bold ph-check"></i>' : ''}</span>
          <span class="flex-1 min-w-0 text-right"><b class="block text-[13px]"><i class="ph-bold ${f.icon}"></i> ${f.name}${k === 'loyalty' ? ' <span class="text-[11px] font-bold bg-saffron/20 text-amber-900 rounded-full px-2 py-0.5">باقة مستقلة</span>' : ''}</b><span class="block text-[11px] text-ink leading-relaxed">${f.desc}</span></span>
          <span class="text-[12px] font-bold text-ink shrink-0">${sar(f[pick])}</span>
        </button>`;
    };
    const tile = (p) => {
      const on = pick === p, yearly = p === 'year';
      return `
        <button type="button" role="radio" aria-checked="${on}" onclick="pickPlan('${p}')" class="plan-tile ${on ? 'on' : ''}">
          <span class="flex items-center justify-between gap-2"><span class="text-[12px] font-bold text-ink">${yearly ? 'سنوي' : 'شهري'}</span><span class="plan-dot">${on ? '<i class="ph-bold ph-check"></i>' : ''}</span></span>
          <span class="block mt-2 text-[20px] font-bold text-ink leading-none">${sar(planTotal(p))}</span>
          <span class="block mt-1.5 text-[11px] text-ink">${yearly ? `بالسنة، يعني ${sar(Math.round(planTotal('year') / 12))} بالشهر` : 'بالشهر'}</span>
          ${yearly && save > 0 ? `<span class="plan-save">توفّر ${sar(save)}</span>` : ''}
        </button>`;
    };
    // البيجر المجاني: نعرض البيجر وإضافته بس، ووش يزيد مع الاشتراك، وباقي الخدمات بضغطة
    const freeShort = DMPlans.isFree(client) && !freeAllPlans;
    return `
      <div class="space-y-3 pt-1">
        ${freeShort ? `<div class="rounded-xl bg-brand/5 border border-brand/15 p-3">
          <p class="text-[12px] font-bold text-ink">مع اشتراك البيجر تحصل على:</p>
          <ul class="mt-1.5 space-y-1 text-[12px] text-ink">
            <li><i class="ph-bold ph-check text-emerald-600"></i> أرقام بدون حد، والبيجر ما يتوقف</li>
            <li><i class="ph-bold ph-check text-emerald-600"></i> بطاقة النداء بشعارك في محفظة جوال الزبون</li>
            <li><i class="ph-bold ph-check text-emerald-600"></i> صفحة الروابط السريعة والمظهر وروابط التواصل</li>
            <li><i class="ph-bold ph-check text-emerald-600"></i> إضافة فروع</li>
          </ul>
        </div>` : '<p class="text-[12px] font-bold text-ink">اختر اللي تحتاجه:</p>'}
        <div class="space-y-2">${(freeShort ? ['pager', 'notify'] : DMPlans.ORDER).map(row).join('')}</div>
        ${freeShort ? `<button type="button" onclick="freeAllPlans = true; renderSubscriptionStatus()" class="text-[12px] font-bold text-brand hover:underline"><i class="ph-bold ph-plus"></i> تبي المنيو أو الولاء؟ اعرض كل الخدمات</button>` : ''}
        ${pr.discounts.map(d => `<p class="text-[12px] font-bold text-emerald-800 flex justify-between"><span><i class="ph-bold ph-tag"></i> ${d.label}</span><span>- ${sar(d.amount)}</span></p>`).join('')}
        ${branchCount() ? `<p class="text-[11px] text-ink">يشمل ${branchCount()} ${branchCount() === 1 ? 'فرع' : 'فروع'} بـ ${sar(branchesTotal(pr))}</p>` : ''}
        <div role="radiogroup" aria-label="المدة" class="grid grid-cols-2 gap-2.5 pt-1">${tile('year')}${tile('month')}</div>
        <button type="button" onclick="choosePlan('${pick}')" ${planSending || !feats.length ? 'disabled' : ''} class="w-full bg-brand hover:bg-brand-dark text-cream rounded-xl py-3 text-[13px] font-bold transition disabled:opacity-50 flex items-center justify-center gap-2">
          ${planSending ? '<i class="ph-bold ph-spinner-gap ph-spin"></i> جاري الإرسال' : feats.length ? `${verb} بـ ${sar(pr.total)} ${pick === 'month' ? 'بالشهر' : 'بالسنة'}` : 'اختر ميزة وحدة على الأقل'}
        </button>
      </div>`;
  }

  // البيجر المجاني: كم رقم باقي هالشهر، ولو خلص يتوقف البيجر لين أول الشهر الجاي (ونوضح السبب)
  function renderFreeUsage(r) {
    const els = [document.getElementById('free-usage'), ...document.querySelectorAll('.free-usage-box')].filter(Boolean);
    if (!els.length || !(r && r.limit)) return;
    const left = Math.max(0, r.limit - r.used), full = left === 0, low = !full && left <= r.limit * 0.2;
    const now = new Date(Date.now() + 3 * 3600e3);
    const reset = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' });
    const pct = Math.min(100, Math.round(r.used / r.limit * 100));
    const html = `
      <div class="flex items-baseline justify-between gap-2">
        <p class="text-[13px] text-ink"><b class="text-[18px]">${left}</b> رقم باقي لك هالشهر</p>
        <p class="text-[11px] text-ink">استخدمت ${r.used} من ${r.limit}</p>
      </div>
      <div class="h-1.5 rounded-full bg-brand/10 mt-2 overflow-hidden"><div class="h-full rounded-full ${full ? 'bg-brick' : low ? 'bg-amber-500' : 'bg-brand'}" style="width:${Math.max(4, pct)}%"></div></div>
      <p class="text-[11px] text-ink mt-1.5">ترجع ${r.limit} رقم من جديد يوم ${reset}.</p>`;
    els.forEach(el => { el.innerHTML = html; });
    const banner = document.getElementById('renew-banner');
    if (!full && !low) return banner.classList.add('hidden');
    const text = full
      ? `البيجر متوقف: خلصت الـ ${r.limit} رقم المجانية لهالشهر، فالزبون اللي يمسح الرمز يطلع له إنه يطلب من الموظف. يرجع يشتغل يوم ${reset}، أو اشترك في البيجر ويرجع على طول بدون حد.`
      : `باقي لك ${left} رقم بس من البيجر المجاني لهالشهر. إذا خلصت يتوقف البيجر لين ${reset}، واشترك عشان ما يوقف.`;
    banner.className = `rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border ${full ? 'bg-red-500/10 border-red-500/40' : 'bg-amber-500/10 border-amber-500/40'}`;
    banner.innerHTML = `<p class="text-xs font-bold ${full ? 'text-red-800' : 'text-amber-800'} flex items-center gap-2"><i class="ph-bold ${full ? 'ph-warning-circle' : 'ph-clock'}"></i> ${esc(text)}</p>
      <button type="button" onclick="openPlan()" class="${full ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'} text-white px-4 py-2 rounded-xl text-xs font-bold transition">اشترك في البيجر</button>`;
  }
  function renderSubscriptionStatus() {
    const box = document.getElementById('subscription-info');
    const status = client.subscription_status;
    const end = status === 'active' ? client.subscription_end_date : client.trial_ends_at;
    const left = end ? Math.ceil((new Date(end) - Date.now()) / 86400000) : null;
    // مهلة 3 أيام بعد انتهاء الاشتراك المدفوع: المنيو يبقى شغال للزبائن (29-grace-reminders.sql)
    const graceEnd = status === 'active' && end ? new Date(end).getTime() + 3 * 86400000 : 0;
    const inGrace = left !== null && left <= 0 && Date.now() < graceEnd;
    const free = DMPlans.isFree(client);   // انتهت التجربة وكمّل على البيجر المجاني
    const expired = !free && !inGrace && ((status !== 'active' && status !== 'trial') || (left !== null && left <= 0));
    const suspended = client.is_active === false;
    const live = !suspended && !expired;
    // في التجربة ومعه البيجر: بعد التجربة يكمل على البيجر المجاني بدل ما يتوقف كل شي
    const staysFree = !free && status === 'trial' && !client.parent_id && Array.isArray(client.plan_features) && client.plan_features.includes('pager');
    const onlyPager = staysFree && client.plan_features.length === 1;
    const graceText = graceEnd ? new Date(graceEnd).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long' }) : '';

    let pill, pillCls, note = '';
    if (suspended)               { pill = 'موقوف'; pillCls = 'bg-brick/10 text-brick'; note = 'المتجر موقوف من الإدارة، والمنيو ما يظهر للزبائن.'; }
    else if (expired)            { pill = 'منتهي'; pillCls = 'bg-brick/10 text-brick'; note = 'انتهى اشتراكك، والمنيو ما يظهر للزبائن. اختر باقتك ويرجع على طول.'; }
    else if (free)               { pill = 'الباقة المجانية'; pillCls = 'bg-emerald-600/10 text-emerald-800'; note = `البيجر شغال لك مجاناً (${DMPlans.FREE.pager} رقم بالشهر لفرع واحد). اشترك عشان تضيف بطاقة النداء والرسائل وباقي الخدمات.`; }
    else if (inGrace)            { pill = 'مهلة'; pillCls = 'bg-amber-400/20 text-amber-900'; note = `انتهى اشتراكك، وأعطيناك مهلة: المنيو شغال لزبائنك لين ${graceText}. جدّد قبلها عشان ما يوقف.`; }
    else if (status === 'trial') { pill = 'تجربة مجانية'; pillCls = 'bg-sky-500/10 text-sky-800';
      if (staysFree) note = onlyPager ? `بعد التجربة يكمل البيجر لك مجاناً (${DMPlans.FREE.pager} رقم بالشهر لفرع واحد)، وتتوقف بطاقة النداء والرسائل إلا إذا اشتركت.`
        : `بعد التجربة يكمل البيجر لك مجاناً (${DMPlans.FREE.pager} رقم بالشهر)، وتتوقف باقي خدماتك وبطاقة النداء إلا إذا اشتركت.`; }
    else                         { pill = client.subscription_plan ? `الباقة ${planName(client.subscription_plan)}` : 'مشترك'; pillCls = 'bg-emerald-600/10 text-emerald-800'; }

    // شريط المدة: التجربة 14 يوم، والشهري 30، والسنوي 365
    const span = status === 'trial' ? DMPlans.TRIAL_DAYS : client.subscription_plan === 'month' ? 30 : 365;
    const pct = live && left !== null ? Math.max(4, Math.min(100, Math.round(left / span * 100))) : 0;
    const endText = end ? new Date(end).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
    const showPlans = !suspended && (planOpen || free || !live || status === 'trial' || (left !== null && left <= 7));
    const verb = status === 'active' ? 'جدّد' : 'اشترك';

    box.innerHTML = `
      <div class="flex items-center justify-between gap-2">
        <span class="text-[11px] font-bold px-2.5 py-1 rounded-full ${pillCls}">${pill}</span>
        <span class="text-[11px] text-ink" dir="ltr">${esc(client.client_slug)}</span>
      </div>
      ${note ? `<p class="text-[12px] font-bold ${free || staysFree ? 'text-emerald-800' : inGrace ? 'text-amber-900' : 'text-brick'}">${note}</p>` : ''}
      ${free ? '<div id="free-usage" class="text-[12px] text-ink"></div>' : ''}
      ${live && left !== null && !inGrace && !free ? `
        <div>
          <div class="flex items-baseline justify-between gap-2">
            <p class="text-[13px] text-ink"><b class="text-[18px]">${left}</b> ${left === 1 ? 'يوم باقي' : left <= 10 ? 'أيام باقية' : 'يوم باقي'}</p>
            <p class="text-[11px] text-ink">ينتهي ${esc(endText)}</p>
          </div>
          <div class="h-1.5 rounded-full bg-brand/10 mt-2 overflow-hidden"><div class="h-full rounded-full ${left <= 3 ? 'bg-brick' : 'bg-brand'}" style="width:${pct}%"></div></div>
        </div>` : ''}
      ${status === 'active' ? `<div class="flex flex-wrap items-center gap-1.5">${myFeatures().map(k => `<span class="text-[11px] font-bold bg-brand/5 border border-brand/15 rounded-full px-2.5 py-1"><i class="ph-bold ${DMPlans.FEATURES[k].icon}"></i> ${DMPlans.FEATURES[k].name}</span>`).join('')}${!showPlans && !client.parent_id ? '<button type="button" onclick="openPlan()" class="text-[11px] font-bold text-brand underline underline-offset-4">عدّل باقتك</button>' : ''}</div>` : ''}
      ${trialGift() ? `<div class="rounded-xl border border-amber-300/60 bg-amber-50 px-3 py-2.5 text-[12px] text-amber-900 leading-relaxed"><b><i class="ph-bold ph-gift"></i> هدية التجربة:</b> "رسائل لزبائنك" مفعّلة لك مجاناً مع البيجر خلال التجربة، وتتوقف بعدها إلا إذا أضفتها لاشتراكك بـ ${DMPlans.FEATURES.notify.month} ر.س بالشهر. <a href="#messages" class="font-bold underline underline-offset-2">جرّبها الحين</a></div>` : ''}
      ${client.parent_id ? '<p class="text-[11px] text-ink"><i class="ph-bold ph-tree-structure"></i> اشتراك الفرع تابع للمتجر الرئيسي</p>' : ''}
      ${live && status === 'active' && client.subscription_plan === 'month' && !client.parent_id ? upgradeBox() : ''}
      ${showPlans && !client.parent_id ? planPicker(verb) : ''}`;

    // شريط تنبيه بارز أعلى اللوحة
    const banner = document.getElementById('renew-banner');
    if (!free && (!live || (left !== null && left <= 3))) {
      const danger = !live || inGrace;
      const text = suspended ? 'متجرك موقوف من الإدارة، والمنيو لا يظهر للزبائن حالياً.'
        : !live ? 'انتهى اشتراكك، والمنيو لا يظهر للزبائن حالياً. جدّد الآن ليعود فوراً.'
        : inGrace ? `انتهى اشتراكك. المنيو شغال لزبائنك لين ${graceText} بس، جدّد الحين عشان ما يوقف.`
        : staysFree ? `تنتهي تجربتك المجانية خلال ${daysText(left)}. بعدها يكمل البيجر مجاناً، واشترك عشان ما تتوقف ${onlyPager ? 'بطاقة النداء والرسائل' : 'باقي خدماتك'}.`
        : `${status === 'trial' ? 'تنتهي تجربتك المجانية' : 'ينتهي اشتراكك'} خلال ${daysText(left)}. جدّد الآن حتى لا يتوقف المنيو.`;
      banner.className = `rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 border ${danger ? 'bg-red-500/10 border-red-500/40' : 'bg-amber-500/10 border-amber-500/40'}`;
      banner.innerHTML = `
        <p class="text-xs font-bold ${danger ? 'text-red-800' : 'text-amber-800'} flex items-center gap-2">
          <i class="ph-bold ${danger ? 'ph-warning-circle' : 'ph-clock'}"></i> ${esc(text)}
        </p>
        ${suspended
          ? `<button type="button" onclick="contactAdmin('suspended', 'حسابي موقوف، أبغى أعرف السبب وكيف أرجّعه.')" class="bg-brand text-cream px-3 py-1.5 rounded-lg text-[11px] font-black"><i class="ph-bold ph-chat-circle-text"></i> راسل الإدارة</button>`
          : `<button type="button" onclick="goToPlans()" class="bg-brand hover:bg-brand-dark text-cream px-3.5 py-2 rounded-lg text-[12px] font-bold">${requestedPlan() ? 'تابع طلبك' : 'اختر باقتك'}</button>`}`;
      banner.classList.remove('hidden');
    } else {
      banner.classList.add('hidden');
    }

    const chip = document.getElementById('store-status');
    const chipColor = inGrace ? 'bg-amber-400' : free ? 'bg-green-400' : live ? (status === 'trial' ? 'bg-blue-400' : 'bg-green-400') : 'bg-red-400';
    chip.innerHTML = `<span class="w-1.5 h-1.5 rounded-full ${chipColor}"></span> ${suspended ? 'موقوف' : free ? 'مجاني' : !live ? 'منتهي' : inGrace ? 'مهلة' : status === 'trial' ? 'تجريبي' : 'مشترك'}${live && left !== null && !inGrace && !free ? ` · ${daysText(left)}` : ''}`;

    if (DMPlans.pagerLite(client)) api('free-usage').then(renderFreeUsage).catch(() => {});   // المجاني، أو مشترك مضاف له البيجر المجاني

    const notice = (client.admin_notification || '').trim();
    document.getElementById('admin-notice-text').textContent = notice;
    document.getElementById('admin-notice-box').classList.toggle('hidden', !notice);
  }

  function copyMenuLink() {
    navigator.clipboard.writeText(menuUrl())
      .then(() => showToast('تم نسخ رابط المنيو'))
      .catch(() => showToast('تعذر النسخ، انسخ الرابط من زر المعاينة', true));
  }

  // يحدّث بيانات المتجر ويتأكد إن التحديث تم فعلاً
  async function updateClient(payload) {
    try {
      const res = await api('update-store', payload);
      Object.assign(client, res.store || payload);
      if (Object.keys(payload).some(k => /^(pager_|kiosk_call|name|logo_url|accent_color|theme|google_review_url|instagram_url|tiktok_url|snapchat_url|website_url)/.test(k))) setTimeout(reloadPagerPhone, 300);
      renderDashboardSummary();
      renderPagerStatus();
      if (linksOrder.length) renderLinksOrder(false);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  async function updateRestaurantName() {
    const newName = document.getElementById('setting-name').value.trim();
    if (!newName) return showToast('يرجى كتابة اسم المنشأة', true);
    if (await updateClient({ name: newName })) {
      showToast('تم حفظ الاسم');
      setStoreName(newName);
    } else showToast('تعذر حفظ الاسم', true);
  }

  // ─── تنبيه الإدارة: صاحب المتجر يقدر يخفيه بعد ما يقرأه ───
  async function dismissNotice() {
    const btn = document.getElementById('admin-notice-close');
    btn.disabled = true;
    try {
      await api('notice-dismiss', {});
      client.admin_notification = null;
      document.getElementById('admin-notice-box').classList.add('hidden');
      showToast('تم إخفاء التنبيه');
    } catch { showToast('تعذر إخفاء التنبيه', true); }
    finally { btn.disabled = false; }
  }

  // ─── العرض الترويجي: حالة + حفظ + حذف ───
  function renderPromoState() {
    const input = document.getElementById('promo-message-input');
    const current = (client.promo_message || '').trim();
    const typed = input.value.trim();
    document.getElementById('promo-counter').textContent = `${input.value.length}/120`;
    document.getElementById('promo-status').innerHTML = current
      ? `<span class="inline-flex items-center gap-1.5 bg-green-500/15 text-green-700 border border-green-500/30 px-2.5 py-1 rounded-full font-bold"><span class="w-1.5 h-1.5 rounded-full bg-green-400"></span> منشور الآن في المنيو</span>`
      : `<span class="inline-flex items-center gap-1.5 bg-brand/5 text-ink border border-brand/15 px-2.5 py-1 rounded-full font-bold"><span class="w-1.5 h-1.5 rounded-full bg-gray-500"></span> لا يوجد عرض منشور</span>`;
    // الحفظ متاح فقط إذا تغيّر النص وكان غير فارغ، والحذف فقط إذا فيه عرض منشور
    document.getElementById('promo-save-btn').disabled = !typed || typed === current;
    document.getElementById('promo-delete-btn').disabled = !current;
  }

  async function updatePromoMessage() {
    const msg = document.getElementById('promo-message-input').value.trim();
    if (!msg) return showToast('اكتب نص العرض أولاً', true);
    if (msg === (client.promo_message || '').trim()) return;
    const wasEmpty = !(client.promo_message || '').trim();
    if (await updateClient({ promo_message: msg })) {
      document.getElementById('promo-message-input').value = msg;
      showToast(wasEmpty ? 'تم نشر العرض في المنيو' : 'تم تحديث العرض في المنيو');
    } else showToast('تعذر حفظ العرض', true);
    renderPromoState();
  }

  function deletePromoMessage() {
    if (!(client.promo_message || '').trim()) return;
    openDeleteModal('حذف الإعلان الترويجي', 'سيختفي هذا العرض من أعلى المنيو فوراً.', async () => {
      if (await updateClient({ promo_message: '' })) {
        document.getElementById('promo-message-input').value = '';
        showToast('تم حذف الإعلان من المنيو');
      } else showToast('تعذر حذف الإعلان', true);
      renderPromoState();
    });
  }

  document.getElementById('promo-message-input').addEventListener('input', renderPromoState);
  document.getElementById('promo-message-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); if (!document.getElementById('promo-save-btn').disabled) updatePromoMessage(); }
  });

  // ─── معلومات الحساب ───
  function openAccount() {
    if (!client) return;
    const status = client.subscription_status, monthly = client.subscription_plan === 'month';
    const day = (iso) => iso ? new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' }) : '';
    // في التجربة: الخدمات اللي اختارها وسعرها بعد التجربة
    const feats = status === 'active' ? myFeatures() : chosenFeatures(), period = status === 'active' ? (monthly ? 'month' : 'year') : (client.requested_plan === 'month' ? 'month' : 'year');
    const pr = DMPlans.price(feats, period, branchList()), per = period === 'month' ? 'بالشهر' : 'بالسنة';
    const state = client.is_active === false ? 'موقوف'
      : DMPlans.isFree(client) ? `الباقة المجانية: البيجر (${DMPlans.FREE.pager} رقم بالشهر)`
      : status === 'trial' ? `تجربة مجانية، تنتهي ${day(client.trial_ends_at)}`
      : status === 'active' ? (Date.parse(client.subscription_end_date) > Date.now() ? `مشترك، يتجدد ${day(client.subscription_end_date)}` : `منتهي من ${day(client.subscription_end_date)}`)
      : 'غير مشترك';
    const row = (k, v, ltr) => `<div class="flex justify-between gap-4 py-2.5"><dt class="text-ink shrink-0">${k}</dt><dd class="font-bold text-left"${ltr ? ' dir="ltr"' : ''}>${v}</dd></div>`;
    document.getElementById('acct-body').innerHTML = [
      row('المنشأة', esc(client.name || '')),
      row('الإيميل', esc(userEmail || client.email || ''), true),
      row('الحالة', state),
      row('نوع الاشتراك', period === 'month' ? 'شهري' : 'سنوي'),
      row('الباقة', feats.length ? feats.map(k => DMPlans.FEATURES[k].name).join('، ') : 'ما اخترت خدمات'),
      ...pr.lines.filter(l => l.key === 'branch').map(l => row(esc(l.label), `${sar(l.amount)}${l.detail ? `<span class="block text-[11px] font-medium text-ink">ربط الفرع + ${esc(l.detail)}</span>` : ''}`)),
      ...pr.discounts.map(d => row(esc(d.label), `- ${sar(d.amount)}`)),
      row(status === 'trial' ? 'السعر بعد التجربة' : 'السعر', `${sar(pr.total)} ${per}`)
    ].join('');
    const box = document.getElementById('acct'); box.classList.remove('hidden'); box.classList.add('flex');
  }
  function closeAccount() { const box = document.getElementById('acct'); box.classList.add('hidden'); box.classList.remove('flex'); }
  function closeProductImport() { const box = document.getElementById('pi-import'); box.classList.add('hidden'); box.classList.remove('flex'); }
  async function sendProductImport() {
    const rows = productImportRows();
    if (!rows.length) return showToast('ما فيه أطباق لها اسم', true);
    const btn = document.getElementById('pi-go'); btn.disabled = true;
    btn.innerHTML = '<i class="ph-bold ph-spinner-gap ph-spin"></i> نضيف الأطباق…';
    try {
      const r = await api('products-import', { rows });
      closeProductImport();
      const why = (r.skipped || []).map(x => `الصف ${x.row}: ${x.reason}`).join('\n');
      await DMDialog.confirm({ title: 'تمت الإضافة', tone: '', icon: 'ph-check-circle', confirmText: 'تمام', cancelText: 'إغلاق',
        message: `انضاف ${r.added === 1 ? 'طبق واحد' : r.added === 2 ? 'طبقين' : r.added <= 10 ? `${r.added} أطباق` : `${r.added} طبق`}${r.categories ? ` و${r.categories} ${r.categories === 1 ? 'قسم جديد' : 'أقسام جديدة'}` : ''}.${r.skipped_count ? `\n\nما انضاف ${r.skipped_count}:\n${why}` : ''}\n\nأضف صورة كل طبق من زر التعديل.` });
      refreshAll();
    } catch (e) { showToast(e.message || 'تعذر الاستيراد', true); }
    btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-file-arrow-up"></i> أضف الأطباق';
  }

  function closeLyMember() { const box = document.getElementById('ly-member'); box.classList.add('hidden'); box.classList.remove('flex'); ly.member = null; }
  async function giveLyStamp() {
    if (!ly.member) return;
    const at = await askLyBranch({ title: 'إعطاء ختم', message: `تعطي ${memberName(ly.member)} ختم الحين؟`, confirmText: 'أعطه ختم' });
    if (!at) return;
    const btn = document.getElementById('lm-stamp'); btn.disabled = true;
    try { await api('loyalty-give-stamp', { card_id: ly.member.id, ...at }); showToast('انضاف الختم'); const id = ly.member.id; await onLoyaltyPage(); openLyMember(id); }
    catch (e) { showToast(e.message || 'تعذر إضافة الختم', true); btn.disabled = false; }
  }
  async function sendLyMemberMsg() {
    const body = document.getElementById('lm-msg').value.trim();
    if (body.length < 2 || !ly.member) return showToast('اكتب الرسالة', true);
    const btn = document.getElementById('lm-send'); btn.disabled = true;
    try {
      const r = await api('loyalty-message', { body, card_id: ly.member.id });
      document.getElementById('lm-msg').value = '';
      showToast(r.message.wallet_sent ? 'انرسلت ووصلته إشعار' : 'انرسلت، وتطلع له في صفحة بطاقته');
      openLyMember(ly.member.id);
    } catch (e) { showToast(e.message || 'ما انرسل. تأكد من الإنترنت وحاول مرة ثانية', true); }
    btn.disabled = false;
  }

  // ─── المساعد الذكي ───
  const AI_KINDS = { welcome: 'ترحيب', miss: 'لما يغيب', second: 'بعد أول زيارة', almost: 'باقي له ختم', ready: 'مكافأته جاهزة', near: 'لما يقرب من المحل' };
  async function toggleLyAi() {
    try { const r = await api('loyalty-ai', { enabled: !ly.data.ai }); ly.data.ai = r.ai; renderLoyalty(); showToast(r.ai ? 'المساعد الذكي شغّال، يبدأ يكتب لزبائنك كل يوم' : 'المساعد الذكي متوقف'); }
    catch (e) { showToast(e.message || 'ما انحفظ التعديل. تأكد من الإنترنت وحاول مرة ثانية', true); }
  }
  async function previewLyAi() {
    const btn = document.getElementById('ly-ai-preview'), html = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-spinner-gap ph-spin"></i> يكتب...';
    try {
      const r = await api('loyalty-ai-preview', {});
      document.getElementById('ly-ai-out').innerHTML = `<p class="text-[11px] text-ink">أمثلة (ما انرسلت لأحد). كل مرة تضغط يطلع لك كلام غير:</p>` + Object.entries(r.examples).map(([k, t]) => `
        <div class="rounded-xl bg-brand/[0.04] border border-brand/10 p-3"><p class="text-[11px] font-bold text-ink mb-0.5">${AI_KINDS[k] || k}</p><p class="leading-relaxed">${esc(t)}</p></div>`).join('');
    } catch (e) { showToast(e.message || 'تعذر كتابة الأمثلة', true); }
    btn.disabled = false; btn.innerHTML = html;
  }
  async function runLyAi() {
    const btn = document.getElementById('ly-ai-run'), html = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-spinner-gap ph-spin"></i> يشتغل...';
    try {
      const r = await api('loyalty-ai-run', {});
      showToast(r.messages ? `كتب ${r.messages} رسالة${r.wallet ? ` ووصلت إشعار لـ ${r.wallet} جوال` : ''}` : 'ما فيه زبائن يحتاجون رسالة اليوم');
      await onLoyaltyPage();
    } catch (e) { showToast(e.message || 'تعذر تشغيل المساعد', true); }
    btn.disabled = false; btn.innerHTML = html;
  }

  async function toggleLoyalty() {
    const next = !(ly.data && ly.data.enabled);
    try { const r = await api('loyalty-settings', { enabled: next }); ly.data.enabled = r.enabled; renderLoyalty(); showToast(r.enabled ? 'بطاقة الولاء شغّالة' : 'بطاقة الولاء متوقفة'); }
    catch (e) { showToast(e.message || 'ما انحفظ التعديل. تأكد من الإنترنت وحاول مرة ثانية', true); }
  }
  async function saveLoyalty(ev) {
    ev.preventDefault();
    const btn = document.getElementById('ly-save'); btn.disabled = true;
    try {
      const r = await api('loyalty-settings', { settings: {
        needed: +document.getElementById('ly-needed').value, reward: document.getElementById('ly-reward').value.trim(), reward_en: document.getElementById('ly-reward-en').value.trim(),
        cooldown_hours: +document.getElementById('ly-cooldown').value, radius_m: +document.getElementById('ly-radius').value,
        welcome: { mode: (document.querySelector('[name="ly-welcome"]:checked') || {}).value || 'ai', text: document.getElementById('ly-welcome-text').value.trim() },
        redeem_msg: { mode: (document.querySelector('[name="ly-redeem"]:checked') || {}).value || 'ai', text: document.getElementById('ly-redeem-text').value.trim() },
        happy: { enabled: document.getElementById('ly-happy').checked, from: +document.getElementById('ly-happy-from').value, to: +document.getElementById('ly-happy-to').value, days: [...(ly.happyDays || [])] },
        feedback: { enabled: document.getElementById('ly-fb').checked, gift: document.getElementById('ly-fb-gift').checked, days: +document.getElementById('ly-fb-days').value || 30 },
        gifts: { enabled: document.getElementById('ly-gifts').checked },
        pager_stamp: document.getElementById('ly-pager-stamp').checked
      } });
      ly.data.settings = r.settings; renderLoyalty(); showToast('تم حفظ إعدادات البطاقة');
    } catch (e) { showToast(e.message || 'ما انحفظ التعديل. تأكد من الإنترنت وحاول مرة ثانية', true); }
    btn.disabled = false;
  }
  // موقع المحل: نجمع قراءات لثواني ونختار الأدق
  function bestPosition(ms = 8000) {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) return reject(new Error('المتصفح ما يدعم تحديد الموقع'));
      let best = null, done = false;
      const end = () => { if (done) return; done = true; navigator.geolocation.clearWatch(id); best ? resolve(best) : reject(new Error('ما قدرنا نحدد الموقع، حاول مرة ثانية')); };
      const id = navigator.geolocation.watchPosition(p => {
        const c = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
        if (!best || c.acc < best.acc) best = c;
        if (c.acc <= 15) end();
      }, e => { if (done) return; done = true; navigator.geolocation.clearWatch(id); reject(new Error(e.code === 1 ? 'ما سمحت بالموقع، فعّله من إعدادات المتصفح' : 'ما قدرنا نحدد الموقع، حاول مرة ثانية')); },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
      setTimeout(end, ms);
    });
  }
  async function setLoyaltyLocation() {
    const btn = document.getElementById('ly-loc-btn'), html = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-spinner-gap ph-spin"></i> نحدد الموقع...';
    try {
      const pos = await bestPosition();
      const r = await api('loyalty-location', pos);
      ly.data.location_set = true; renderLoyalty();
      showToast(`تم حفظ موقع المحل (الدقة ${r.accuracy} متر)`);
    } catch (e) { showToast(e.message || 'تعذر تحديد الموقع', true); }
    btn.disabled = false; btn.innerHTML = html;
  }
  // موقع المحل لبطاقة النداء (نفس موقع بطاقة الولاء): البطاقة تطلع على شاشة قفل الزبون لما يقرب من المحل
  // الولاء شغّال ويختم مع البيجر: الزبون يوصله النداء من بطاقة الولاء، فإعدادات بطاقة النداء ما لها داعي
  function syncPagerCardBox(d) {
    const viaLoyalty = !!(d && d.enabled && d.settings && d.settings.pager_stamp !== false);
    document.getElementById('info-pager-card').classList.toggle('hidden', viaLoyalty);
  }
  function renderStorePin() {
    if (!featureLocked('loyalty')) (ly.data ? Promise.resolve(ly.data) : api('loyalty').catch(() => null)).then(syncPagerCardBox);
    renderPagerStatus();
    const near = document.getElementById('info-near');
    near.placeholder = `أنت قريب من ${client.name || 'المحل'}، تفضّل 👋`;
    near.value = client.pager_near_text || '';
    document.getElementById('info-near-count').textContent = `${near.value.length}/80`;
  }
  async function saveNearText() {
    const v = document.getElementById('info-near').value.replace(/\s+/g, ' ').trim();
    if (await updateClient({ pager_near_text: v })) { client.pager_near_text = v || null; showToast(v ? 'تم حفظ الرسالة' : 'رجعت الرسالة الافتراضية'); }
  }
  async function setStorePin() {
    const btn = document.getElementById('info-pin-btn'), html = btn.innerHTML;
    btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-spinner-gap ph-spin"></i> نحدد الموقع...';
    try {
      const pos = await bestPosition();
      const r = await api('loyalty-location', pos);
      client.loyalty_lat = pos.lat; client.loyalty_lng = pos.lng; renderStorePin();
      if (ly.data) { ly.data.location_set = true; renderLoyalty(); }
      showToast(`تم حفظ موقع المحل (الدقة ${r.accuracy} متر)`);
    } catch (e) { showToast(e.message || 'تعذر تحديد الموقع', true); }
    btn.disabled = false; btn.innerHTML = html;
  }
  // كرت للطباعة: اسم المحل + الكود + المكافأة
  async function downloadLoyaltyCard() {
    const st = ly.data.settings, W = 1200, H = 1600, cx = W / 2;
    const FONT = '"IBM Plex Sans Arabic", Tahoma, Arial, sans-serif';
    try { await document.fonts.load(`700 64px "IBM Plex Sans Arabic"`); } catch {}
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const g = cv.getContext('2d'); g.textAlign = 'center'; g.direction = 'rtl';
    g.fillStyle = '#fbf8f3'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#233d2c'; g.fillRect(0, 0, W, 420);
    g.fillStyle = '#c9a227'; g.font = `700 44px ${FONT}`; g.fillText(client.name || '', cx, 150);
    g.fillStyle = '#fbf8f3'; g.font = `700 76px ${FONT}`; g.fillText('امسح وسجّل في بطاقة الولاء', cx, 290);
    const qr = document.querySelector('#ly-qr canvas') || document.querySelector('#ly-qr img');
    g.fillStyle = '#fff'; g.fillRect(cx - 330, 520, 660, 660);
    g.imageSmoothingEnabled = false; g.drawImage(qr, cx - 300, 550, 600, 600);
    g.fillStyle = '#22362a'; g.font = `700 60px ${FONT}`;
    g.fillText(`كل ${st.needed} زيارات: ${st.reward}`, cx, 1300);
    g.fillStyle = '#6f7d72'; g.font = `500 40px ${FONT}`; g.fillText('بعد كل شراء اعرض كود بطاقتك للكاشير', cx, 1390);
    g.font = `500 32px ${FONT}`; g.fillText('DEV MENU', cx, 1530);
    const a = document.createElement('a'); a.download = `loyalty-${client.client_slug}.png`; a.href = cv.toDataURL('image/png'); a.click();
  }

  // ─── عملة المتجر ───
  function applyCurrencySetting() {
    const code = (client && client.currency) || 'SAR';
    document.getElementById('info-currency').innerHTML = DM.currencyOptions(code);
    document.querySelectorAll('.cur-sign').forEach(el => { el.textContent = curSign(); });
    document.getElementById('cp-min').placeholder = curSign();
    document.getElementById('cp-fixed-opt').textContent = `مبلغ ثابت ${curSign()}`;
  }
  async function changeCurrency(code) {
    if (await updateClient({ currency: code })) {
      applyCurrencySetting();
      filterProducts();
      showToast(`صارت أسعار المنيو تظهر بـ ${DM.currencyText(code)}`);
    } else {
      applyCurrencySetting();
      showToast('تعذر حفظ العملة', true);
    }
  }

  // ─── نوع النشاط ───
  const BIZ_HINTS = { restaurant: 'أطباق ووجبات', cafe: 'قهوة مختصة ومشروبات', mixed: 'أطباق وقهوة مختصة', bakery: 'مخبوزات وحلا', clinic: 'مواعيد ومراجعين', salon: 'حلاقة وتجميل', carwash: 'غسيل وتلميع', laundry: 'غسيل وكوي', retail: 'محل ومتجر', pharmacy: 'أدوية ومستلزمات', services: 'خدمات وانتظار', other: 'اكتب نشاطك' };
  const BUSINESS_TYPES = Object.fromEntries(Object.entries(DMSectors.SECTORS).map(([k, v]) => [k, [v.name, v.icon, BIZ_HINTS[k]]]));
  const allowsCoffee = () => ['cafe', 'mixed'].includes(client && client.business_type);

  function renderBusinessType() {
    const current = client.business_type || 'restaurant';
    document.getElementById('biz-other').classList.toggle('hidden', current !== 'other');
    document.getElementById('biz-label').value = client.business_label || '';
    document.getElementById('biz-type').innerHTML = Object.entries(BUSINESS_TYPES).map(([k, [name, icon, hint]]) => `
      <button type="button" onclick="setBusinessType('${k}')"
        class="text-right p-3 rounded-xl border transition ${k === current ? 'bg-brand text-cream border-brand' : 'bg-brand/5 border-brand/15 text-ink/90 hover:bg-brand/10'}">
        <i class="ph-bold ${icon} ${k === current ? '' : 'text-ink'}"></i>
        <p class="text-xs font-black mt-1.5">${name}</p>
        <p class="text-[11px] ${k === current ? 'text-cream/70' : 'text-ink'}">${hint}</p>
      </button>`).join('');
    // حقول القهوة تظهر للمقهى و"مطعم ومقهى" فقط
    const coffeeBox = document.getElementById('coffee-details');
    coffeeBox.classList.toggle('hidden', !allowsCoffee());
    if (!allowsCoffee()) coffeeBox.open = false;
  }

  async function saveBizLabel() {
    const label = document.getElementById('biz-label').value.trim();
    if (await updateClient({ business_type: 'other', business_label: label })) showToast('تم حفظ نوع النشاط');
    else showToast('ما انحفظ التعديل. تأكد من الإنترنت وحاول مرة ثانية', true);
  }
  async function setBusinessType(type) {
    if (!BUSINESS_TYPES[type] || type === client.business_type) return;
    const hadCoffee = allowsCoffee();
    if (await updateClient({ business_type: type })) {
      renderBusinessType();
      filterProducts();
      const hidden = hadCoffee && !allowsCoffee() && loadedProducts.some(p => p.coffee);
      showToast(hidden ? `تم التغيير إلى "${BUSINESS_TYPES[type][0]}". تفاصيل القهوة مخفية ومحفوظة لو رجعت لها` : `نوع النشاط: ${BUSINESS_TYPES[type][0]}`);
    } else {
      showToast('تعذر الحفظ — تأكد من تشغيل ملف 09-business-type.sql', true);
    }
  }

