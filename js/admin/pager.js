// =====================================================================
// DEV MENU — لوحة التحكم: البيجر: الفروع، رابط الكاشير، رسائل لزبائنك
// (ملفات js/admin/ تتحمّل بالترتيب، وتتشارك نفس المتغيرات العامة)
// =====================================================================
  // ─── الفروع: التبديل بين المتجر الرئيسي وفروعه ───
  function renderBranchSwitch() {
    const sel = document.getElementById('branch-switch');
    sel.classList.toggle('hidden', branches.length < 2);
    if (branches.length < 2) return;
    sel.innerHTML = branches.map(b => `<option value="${Number(b.id)}" ${b.id === client.id ? 'selected' : ''}>${b.parent_id ? '' : '★ '}${esc(b.name || b.client_slug)}</option>`).join('');
  }
  // ─── رابط الكاشير (لكل فرع رابطه) ───
  function renderDeskCard() {
    const on = !!client && (DMPlans.has(client, 'pager') || DMPlans.has(client, 'loyalty'));
    document.getElementById('desk-card').classList.toggle('hidden', !on);
    document.getElementById('desk-branch').textContent = branches.length > 1 ? ` (${client.name || ''})` : '';
    document.getElementById('desk-link-box').classList.add('hidden');
    document.getElementById('desk-show').classList.remove('hidden');
    // شاشة الزبون: تعرض أكواد الخدمات (المنيو والبيجر والانتظار والولاء)
    const kon = !!client && ['menu', 'pager', 'waitlist', 'loyalty'].some(k => DMPlans.has(client, k));
    document.getElementById('kiosk-card').classList.toggle('hidden', !kon);
    document.getElementById('kiosk-branch').textContent = branches.length > 1 ? ` (${client.name || ''})` : '';
    document.getElementById('kiosk-link-box').classList.add('hidden');
    document.getElementById('kiosk-show').classList.remove('hidden');
  }
  async function showKioskLink() {
    try {
      const r = await api('desk-link');
      document.getElementById('kiosk-link').value = r.kiosk_url;
      document.getElementById('kiosk-open').href = r.kiosk_url;
      document.getElementById('kiosk-link-box').classList.remove('hidden');
      document.getElementById('kiosk-show').classList.add('hidden');
    } catch (e) { showToast(e.message || 'ما قدرنا نطلع الرابط', true); }
  }
  function copyKioskLink() {
    navigator.clipboard.writeText(document.getElementById('kiosk-link').value).then(() => showToast('تم نسخ رابط شاشة الزبون')).catch(() => showToast('انسخ الرابط يدوياً من الخانة', true));
  }
  async function showDeskLink(reset = false) {
    try {
      const r = reset ? await api('desk-link', { reset: true }) : await api('desk-link');
      document.getElementById('desk-link').value = r.url;
      client.desk_key = new URL(r.url).searchParams.get('k'); renderServiceLinks();
      document.getElementById('desk-link-box').classList.remove('hidden');
      document.getElementById('desk-show').classList.add('hidden');
      if (reset) { showToast('تغيّر الرابط، والقديم وقف'); document.getElementById('kiosk-link').value = r.kiosk_url; document.getElementById('kiosk-open').href = r.kiosk_url; }
    } catch (e) { showToast(e.message || 'ما قدرنا نطلع الرابط', true); }
  }
  function copyDeskLink() {
    navigator.clipboard.writeText(document.getElementById('desk-link').value).then(() => showToast('تم نسخ رابط الكاشير')).catch(() => showToast('انسخ الرابط يدوياً من الخانة', true));
  }
  async function resetDeskLink() {
    if (!(await DMDialog.confirm({ title: 'تغيير رابط الكاشير', message: 'الرابط القديم بيوقف على كل الأجهزة اللي مفتوح فيها، ومعه رابط شاشة الزبون. لازم تفتح الروابط الجديدة على جهاز الكاشير والشاشة.', confirmText: 'غيّره', cancelText: 'تراجع' }))) return;
    showDeskLink(true);
  }
  // ─── رسائل لزبائنك (بطاقة النداء) ───
  // تطلع للمحل اللي عنده البيجر بدون ولاء (اللي عنده ولاء يرسل من صفحة الولاء)
  let ntQuota = null;
  async function renderNotifyCard() {
    const on = !!client && DMPlans.has(client, 'pager') && !DMPlans.has(client, 'loyalty');
    document.getElementById('nt-card').classList.toggle('hidden', !on);
    if (!on) return;
    const paid = DMPlans.has(client, 'notify'), f = DMPlans.FEATURES.notify;
    document.getElementById('nt-locked').classList.toggle('hidden', paid);
    document.getElementById('nt-box').classList.toggle('hidden', !paid);
    document.getElementById('nt-price').textContent = `${f.month} ر.س بالشهر أو ${f.year} ر.س بالسنة`;
    // في التجربة: الرسائل تنجرب مع البيجر مجاناً، وبعد الاشتراك تحتاج تضيفها (لو ما اختارها)
    const tryOnly = paid && client.subscription_status === 'trial' && !(client.plan_features || []).includes('notify');
    document.getElementById('nt-trial').classList.toggle('hidden', !tryOnly);
    if (tryOnly) document.getElementById('nt-trial').textContent = `تجربها مجاناً مع البيجر لين تنتهي التجربة. بعدها تشتغل لو أضفتها لاشتراكك بـ ${f.month} ر.س بالشهر.`;
    if (!paid) return;
    try {
      const r = await api('pager-messages', {});
      ntQuota = r;
      const when = (iso) => new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
      // أكثر من فرع: يختار كل الفروع أو زبائن فرع واحد (ولو فاتح لوحة فرع، يكون هو المختار)
      const many = branches.length > 1, sel = document.getElementById('nt-to'), prev = sel.value;
      document.getElementById('nt-to-box').classList.toggle('hidden', !many);
      if (many) {
        sel.innerHTML = `<option value="">كل الفروع (${r.cards} زبون)</option>` + branches.map(x => `<option value="${x.id}">${esc(x.name || '')} (${(r.by_branch || {})[x.id] || 0} زبون)</option>`).join('');
        sel.value = prev && sel.querySelector(`option[value="${prev}"]`) ? prev : client.parent_id ? String(client.id) : '';
      } else sel.innerHTML = '';
      ntToChanged(); ntPreview(); renderWinback(r.winback);
      document.getElementById('nt-send').disabled = false;
      const branchName = (id) => (branches.find(x => x.id === id) || {}).name;
      document.getElementById('nt-list').innerHTML = r.messages.length ? `<h4 class="text-xs font-bold text-ink border-b border-ink/10 pb-1.5">آخر الرسائل</h4><div class="divide-y divide-brand/10">${r.messages.map(m => `
        <div class="py-2"><p class="leading-relaxed">${esc(m.body)}</p><p class="text-[11px] text-ink mt-0.5">${when(m.created_at)}${many ? ` · ${m.branch_id ? `زبائن ${esc(branchName(m.branch_id) || 'فرع')}` : 'كل الفروع'}` : ''}${m.sent ? ` · وصلت لـ ${m.sent} جوال` : ''}</p></div>`).join('')}</div>` : '';
    } catch { document.getElementById('nt-send-label').textContent = 'أرسل'; }
  }
  // "وحشتنا" التلقائية: تنرسل كل يوم العصر للي غاب من عدد الأيام المختار
  function renderWinback(w) {
    w = w || {};
    document.getElementById('nt-wb-on').checked = w.enabled === true;
    document.getElementById('nt-wb-days').value = String(w.days || 14);
    document.getElementById('nt-wb-text').value = w.text || ''; sayWinback();
    const when = (iso) => new Date(iso).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short' });
    document.getElementById('nt-wb-last').textContent = w.last && w.last.sent ? `آخر مرة: ${when(w.last.at)} · وصلت لـ ${w.last.sent} زبون` : w.enabled ? 'تنرسل كل يوم العصر للي غابوا' : '';
  }
  async function saveWinback() {
    const btn = document.getElementById('nt-wb-save'), html = btn.innerHTML;
    const body = { enabled: document.getElementById('nt-wb-on').checked, days: Number(document.getElementById('nt-wb-days').value), text: document.getElementById('nt-wb-text').value.trim() };
    if (body.enabled && body.text.length < 2) return showToast('اكتب رسالة «وحشتنا»', true);
    btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-spinner-gap ph-spin"></i> يحفظ...';
    try {
      const r = await api('pager-winback', body);
      renderWinback({ ...(ntQuota && ntQuota.winback), ...r.winback });
      showToast(body.enabled ? 'تم، «وحشتنا» شغالة وتوصل للي يغيبون' : 'تم إيقاف «وحشتنا»');
    } catch (e) { showToast(e.message || 'تعذر الحفظ', true); }
    btn.disabled = false; btn.innerHTML = html;
  }
  // عدد الزبائن اللي بتوصلهم الرسالة حسب الاختيار
  const ntTarget = () => { const v = document.getElementById('nt-to').value; return v ? Number(v) : null; };
  const ntCount = () => !ntQuota ? null : ntTarget() ? (ntQuota.by_branch || {})[ntTarget()] || 0 : ntQuota.cards;
  // زر الإرسال يقول كم زبون بتوصله
  function ntToChanged() {
    if (!ntQuota) return;
    document.getElementById('nt-send-label').textContent = `أرسل لـ ${ntCount()} زبون`;
  }
  // المعاينة: اسم المحل الرئيسي وشعاره (البطاقة وحدة لكل الفروع) ونص الرسالة
  function ntPreview() {
    const home = branches.find(x => !x.parent_id) || client;
    const logo = document.getElementById('nt-pv-logo'), src = home.logo_url || client.logo_url || '';
    if (src && logo.getAttribute('src') !== src) logo.src = src;
    logo.classList.toggle('invisible', !src);
    document.getElementById('nt-pv-name').textContent = home.name || client.name || '';
    const v = document.getElementById('nt-body').value.trim();
    const t = document.getElementById('nt-pv-text');
    t.textContent = v || 'رسالتك تطلع هنا';
    t.classList.toggle('text-white/40', !v);
  }
  function addNotify() {
    if (client.parent_id) return showToast('الاشتراك يتعدل من المتجر الرئيسي', true);
    lockedKey = 'notify'; addFeature();
  }
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'nt-body') document.getElementById('nt-count').textContent = `${e.target.value.length}/150`; });
  // الإرسال يكمل بالخلفية: الرسالة تطلع في القائمة على طول ("يرسل…") وصاحب المحل يكمل شغله، وبعدها يطلع كم جوال وصلت
  async function sendNotify() {
    const input = document.getElementById('nt-body'), body = input.value.trim();
    if (body.length < 2) return showToast('اكتب الرسالة', true);
    const to = ntTarget(), toName = to ? (branches.find(x => x.id === to) || {}).name : '';
    const who = to ? `لزبائن ${toName} (اللي أخذوا رقم منه)` : 'لكل زبون حافظ بطاقة النداء';
    if (!(await DMDialog.confirm({ title: 'إرسال الرسالة', message: `توصل إشعار ${who}${ntQuota ? ` (${ntCount()})` : ''}:\n${body}`, confirmText: 'أرسل', cancelText: 'تراجع', tone: 'success' }))) return;
    input.value = ''; document.getElementById('nt-count').textContent = '0/150'; ntPreview();
    const list = document.getElementById('nt-list'), row = document.createElement('div');
    row.className = 'py-2'; row.innerHTML = `<p class="leading-relaxed">${esc(body)}</p><p class="text-[11px] text-emerald-700 font-bold mt-0.5"><i class="ph-bold ph-spinner-gap ph-spin"></i> يرسل لزبائنك…</p>`;
    if (!list.querySelector('.divide-y')) list.innerHTML = '<h4 class="text-xs font-bold text-ink border-b border-ink/10 pb-1.5">آخر الرسائل</h4><div class="divide-y divide-brand/10"></div>';
    list.querySelector('.divide-y').prepend(row);
    showToast('انرسلت، وبتوصل لزبائنك خلال ثواني');
    try {
      const r = await api('pager-message', { body, ...(to ? { branch_id: to } : {}) });
      const label = branches.length > 1 ? ` · ${to ? `زبائن ${toName}` : 'كل الفروع'}` : '';
      const line = row.lastElementChild;
      if (!r.queued) { line.className = 'text-[11px] text-ink mt-0.5'; line.textContent = `الحين${label} · ما فيه أحد حافظ البطاقة للحين`; return; }
      // الطابور يرسلها بالخلفية: نتابع كم وصلت لين تخلص (أو 3 دقايق، وبعدها تكمل بدون ما ننتظر)
      let st = { sent: 0, gone: 0, pending: r.queued, waiting_limit: 0 };
      for (let i = 0; i < 45 && st.pending; i++) {
        line.innerHTML = `<i class="ph-bold ph-spinner-gap ph-spin"></i> وصلت لـ ${st.sent} من ${r.queued}…`;
        await new Promise(res => setTimeout(res, 4000));
        try { st = (await api('pager-message-status', { message_id: r.message.id })).status; } catch {}
        if (st.pending && st.pending === st.waiting_limit) break;   // الباقي ينتظر حد قوقل اليومي
      }
      line.className = 'text-[11px] text-ink mt-0.5';
      line.textContent = `الحين${label} · وصلت لـ ${st.sent} جوال${st.pending ? `، و${st.pending} بتوصلهم ${st.waiting_limit === st.pending ? 'بكرة (حد قوقل اليومي)' : 'خلال دقايق'}` : ''}`;
      if (st.gone) showToast(`وصلت لـ ${st.sent} جوال، و${st.gone} حذفوا البطاقة من محفظتهم`);
    } catch (e) {
      row.remove(); input.value = body; document.getElementById('nt-count').textContent = `${body.length}/150`; ntPreview();
      showToast(e.message || 'ما انرسلت. تأكد من الإنترنت وحاول مرة ثانية', true);
    }
  }
  // سعر الفرع: رسوم الفرع (19/199) + سعر مميزاته، حسب نوع اشتراك الحساب، والمستحق الحين لو انضاف في نص الاشتراك
  const accountFeatures = () => DMPlans.clean(client.plan_features && client.plan_features.length ? client.plan_features : DMPlans.LEGACY);
  // نوع اشتراك الحساب (الفروع تمشي عليه): المشترك حسب اشتراكه، وفي التجربة حسب اللي اختاره عند التسجيل
  const accountPeriod = () => {
    const m = branches.find(b => !b.parent_id) || client;
    const v = m.subscription_status === 'active' ? (m.subscription_plan || client.subscription_plan) : (m.requested_plan || client.requested_plan || m.subscription_plan || client.subscription_plan);
    return v === 'year' ? 'year' : 'month';
  };
  function branchQuote(feats) {
    const monthly = accountPeriod() === 'month', p = monthly ? 'month' : 'year', per = monthly ? 'بالشهر' : 'بالسنة';
    const fee = DMPlans.BRANCH[p], price = DMPlans.branchPrice(feats || [], p), extra = price - fee;
    const base = { fee, price, per, extra };
    const end = client.subscription_status === 'active' ? Date.parse(client.subscription_end_date) : NaN;
    if (client.subscription_status === 'trial') return { ...base, text: 'وأنت في التجربة المجانية، فينضاف مجاناً الحين ويدخل في أول فاتورة.' };
    if (!(end > Date.now())) return { ...base, text: 'ويتفعّل مع تجديد اشتراكك.' };
    const days = Math.ceil((end - Date.now()) / 864e5), now = Math.round(price * days / (monthly ? 30 : 365));
    return { ...base, now, days, text: `تدفع الحين ${now} ر.س عن ${days} يوم الباقية لين تجديد اشتراكك، وبعدها يتجدد مع حسابك.` };
  }
  const pendingBranch = () => supportRows.find(x => x.kind === 'branch' && x.status === 'open');
  async function requestBranch() {
    if (DMPlans.isFree(client)) {
      const ok = await DMDialog.confirm({ title: 'إضافة فرع', icon: 'ph-git-branch', tone: 'success', confirmText: 'اشترك الحين', cancelText: 'لاحقاً',
        message: `البيجر المجاني لفرع واحد. لإضافة فرع اشترك في البيجر، يبدأ من ${DMPlans.FEATURES.pager.month} ر.س بالشهر، وبعدها تضيف فروعك من هنا.` });
      if (ok) { location.hash = 'account'; setTimeout(openPlan, 150); }
      return;
    }
    if (pendingBranch()) return showToast('عندك طلب فرع قيد الإضافة، بنضيفه لك قريب', true);
    const p = accountPeriod(), fee = DMPlans.BRANCH[p];
    const wide = accountFeatures().filter(k => DMPlans.ACCOUNT_WIDE.includes(k)), wideNames = wide.map(k => DMPlans.FEATURES[k].name).join(' و');
    const v = await DMDialog.form({ title: 'اطلب فرع جديد', subtitle: `اشتراك الفرع ${p === 'month' ? 'شهري' : 'سنوي'} مثل اشتراك حسابك. ربط الفرع ${fee} ر.س ${p === 'month' ? 'بالشهر' : 'بالسنة'}، ومعه سعر الخدمات اللي تختارها للفرع.`, icon: 'ph-git-branch', confirmText: 'أرسل الطلب',
      fields: [
        { name: 'name', label: 'اسم الفرع', value: `${client.name || ''} - `, maxlength: 80, required: true, placeholder: `${client.name || ''} - فرع النخيل` },
        { name: 'features', label: 'مميزات الفرع (محددة نفس حسابك، وتقدر تغيّرها)', type: 'multi', required: !wide.length, requiredText: 'اختر ميزة وحدة على الأقل للفرع',
          value: DMPlans.ownBranch(accountFeatures()),
          options: DMPlans.BRANCH_KEYS.map(k => ({ value: k, label: DMPlans.FEATURES[k].name, icon: DMPlans.FEATURES[k].icon, price: `${DMPlans.FEATURES[k][p]} ر.س` })) },
        { name: 'menu', label: 'منيو الفرع', type: 'choice', value: 'copy', showIf: (vals) => vals.features.includes('menu'), options: [
          { value: 'copy', label: 'نفس منيو المحل', desc: 'نفس الأقسام والأطباق، وتقدر تغيّر الأسعار وتخفي أطباق لهالفرع', icon: 'ph-copy' },
          { value: 'empty', label: 'منيو جديد', desc: 'يبدأ فاضي، وتضيف أطباقه بنفسك', icon: 'ph-file' }
        ] }
      ],
      live: (vals) => {
        const feats = DMPlans.clean(vals.features);
        if (!feats.length && !wide.length) return '';
        const q = branchQuote(feats), pr = DMPlans.price(feats, p);
        return `<div style="display:flex;justify-content:space-between"><span>ربط الفرع</span><span>${q.fee} ر.س</span></div>
          ${pr.lines.map(l => `<div style="display:flex;justify-content:space-between"><span>${l.label}</span><span>${l.amount} ر.س</span></div>`).join('')}
          ${pr.discounts.map(d => `<div style="display:flex;justify-content:space-between;color:#047857"><span>${d.label}</span><span>- ${d.amount} ر.س</span></div>`).join('')}
          <div style="display:flex;justify-content:space-between;font-weight:900;border-top:1px solid rgba(56,79,61,.15);margin-top:4px;padding-top:4px"><span>سعر الفرع ${q.per}</span><span>${q.price} ر.س</span></div>
          ${wide.length ? `<div style="font-size:11px;color:#047857;margin-top:4px">${wideNames} تشتغل في الفرع مع حسابك بدون سعر إضافي.</div>` : ''}
          <div style="font-size:11px;color:rgba(34,54,42,.7);margin-top:4px">${q.text}</div>`;
      },
      note: 'الطلب يوصل لإدارة DEV MENU، وبعد ما ينضاف الفرع يطلع لك في "فروعك"، وتوصلك الفاتورة على بريدك.' });
    if (!v) return;
    const feats = DMPlans.clean(v.features), q = branchQuote(feats), empty = !feats.includes('menu') || v.menu === 'empty';
    const names = [...feats, ...wide].map(k => DMPlans.FEATURES[k].name).join(' + ');
    const body = `أبغى أضيف فرع جديد: "${v.name}".\nالمميزات: ${names}${feats.includes('menu') ? ` (${v.menu === 'empty' ? 'منيو جديد' : 'نفس منيو المحل'})` : ''}.\nالسعر: ${q.price} ر.س ${q.per}${q.now ? `، والمستحق الحين ${q.now} ر.س عن ${q.days} يوم` : ''}.`;
    try {
      await api('support-send', { kind: 'branch', body, meta: { name: v.name, features: feats, empty_menu: empty } });
      showToast('وصل طلبك، وبيطلع الفرع في "فروعك" أول ما ينضاف');
      loadSupport();
    } catch (e) { showToast(e.message || 'ما انرسل. تأكد من الإنترنت وحاول مرة ثانية', true); }
  }
  // مميزات فرع موجود: صاحب المحل يختار، ويشوف السعر الجديد والفرق، والطلب يوصل الإدارة تفعّله بضغطة
  const pendingBranchFeatures = (id) => supportRows.some(x => x.kind === 'addon' && x.status === 'open' && x.meta && Number(x.meta.branch_id) === id);
  const branchOwn = (b) => DMPlans.ownBranch(Array.isArray(b.branch_features) ? b.branch_features : accountFeatures());
  async function requestBranchFeatures(id) {
    const b = branches.find(x => x.id === id); if (!b) return;
    if (pendingBranchFeatures(id)) return showToast('عندك طلب لهالفرع قيد التفعيل، بنفعّله لك قريب', true);
    const p = accountPeriod(), per = p === 'month' ? 'بالشهر' : 'بالسنة';
    const cur = branchOwn(b), curPrice = DMPlans.branchPrice(b.branch_features, p);
    const wide = accountFeatures().filter(k => DMPlans.ACCOUNT_WIDE.includes(k));
    const v = await DMDialog.form({ title: `مميزات ${b.name || 'الفرع'}`, subtitle: `سعره الحين ${curPrice} ر.س ${per}${Array.isArray(b.branch_features) ? '' : ' (السعر القديم للفروع)'}. اختر اللي يحتاجه الفرع.`, icon: 'ph-sliders-horizontal', confirmText: 'أرسل الطلب',
      fields: [{ name: 'features', label: 'مميزات الفرع', type: 'multi', value: cur, required: !wide.length, requiredText: 'اختر ميزة وحدة على الأقل للفرع',
        options: DMPlans.BRANCH_KEYS.map(k => ({ value: k, label: DMPlans.FEATURES[k].name, icon: DMPlans.FEATURES[k].icon, price: `${DMPlans.FEATURES[k][p]} ر.س` })) }],
      live: (vals) => {
        const feats = DMPlans.clean(vals.features), q = branchQuote(feats), old = branchQuote(b.branch_features);
        const diff = q.now != null && old.now != null ? q.now - (Array.isArray(b.branch_features) ? old.now : Math.round(DMPlans.BRANCH[p] * q.days / (p === 'month' ? 30 : 365))) : null;
        return `<div style="display:flex;justify-content:space-between;font-weight:900"><span>سعر الفرع الجديد ${per}</span><span>${q.price} ر.س</span></div>
          <div style="font-size:11px;color:rgba(34,54,42,.7);margin-top:4px">${client.subscription_status === 'trial' ? 'وأنت في التجربة المجانية، فتتفعّل مجاناً الحين.' : diff > 0 ? `تدفع الحين الفرق ${diff} ر.س عن ${q.days} يوم الباقية لين تجديد اشتراكك.` : 'ما عليك مبلغ الحين، والسعر الجديد يبدأ مع تجديد اشتراكك.'}</div>
          ${wide.length ? `<div style="font-size:11px;color:#047857;margin-top:4px">${wide.map(k => DMPlans.FEATURES[k].name).join(' و')} تشتغل في الفرع مع حسابك بدون سعر إضافي.</div>` : ''}`;
      },
      note: 'الطلب يوصل لإدارة DEV MENU، وبعد التفعيل يطلع لك الرد تحت "اشتراكك"، وتوصلك الفاتورة على بريدك لو عليك فرق.' });
    if (!v) return;
    const feats = DMPlans.clean(v.features);
    if (feats.join() === cur.join() && Array.isArray(b.branch_features)) return showToast('ما غيّرت شي في مميزات الفرع');
    const q = branchQuote(feats);
    const body = `أبغى أغيّر مميزات فرع "${b.name}": ${feats.map(k => DMPlans.FEATURES[k].name).join(' + ') || 'بدون مميزات خاصة'}.\nسعر الفرع الجديد: ${q.price} ر.س ${q.per}.`;
    try {
      await api('support-send', { kind: 'addon', body, meta: { branch_id: b.id, features: feats } });
      showToast('وصل طلبك، وبنفعّل المميزات قريب');
      loadSupport();
    } catch (e) { showToast(e.message || 'ما انرسل. تأكد من الإنترنت وحاول مرة ثانية', true); }
  }
  function renderBranchesCard() {
    // المحل الرئيسي يشوف البطاقة دايم (عشان يطلب فرع)، والفرع يشوفها لو فيه أكثر من فرع
    const main = !client.parent_id;
    document.getElementById('branches-card').classList.toggle('hidden', !main && branches.length < 2);
    document.getElementById('branch-ask').classList.toggle('hidden', !main);
    // البيجر المجاني لفرع واحد: نوضح له السعر، والزر يوديه للاشتراك
    const free = DMPlans.isFree(client);
    if (main) { const q = branchQuote(); document.getElementById('branch-ask-price').textContent = free ? `البيجر المجاني لفرع واحد. لإضافة فرع اشترك في البيجر (يبدأ من ${DMPlans.FEATURES.pager.month} ر.س بالشهر)` : `كل فرع: ربط ${q.fee} ر.س ${q.per} + سعر مميزاته`; }
    document.getElementById('branch-ask-btn').innerHTML = free ? '<i class="ph-bold ph-crown"></i> اشترك وأضف فرع' : '<i class="ph-bold ph-plus"></i> اطلب فرع جديد';
    // الطلب المفتوح يطلع كسطر في القائمة لين ينضاف الفرع
    const wait = main && pendingBranch();
    document.getElementById('branch-ask-btn').classList.toggle('hidden', !!wait);
    document.getElementById('branches-list').innerHTML = (wait ? `
      <div class="flex items-center gap-2 border border-dashed border-amber-500/50 bg-amber-50/60 rounded-xl p-2.5">
        <i class="ph-bold ph-hourglass-medium text-amber-600"></i>
        <div class="min-w-0 flex-1">
          <p class="text-xs font-black text-ink truncate">${esc((wait.meta && wait.meta.name) || 'فرع جديد')}</p>
          <p class="text-[11px] text-ink">وصل طلبك للإدارة، وبيطلع هنا أول ما ينضاف</p>
        </div>
        <span class="text-[11px] font-bold text-amber-700 shrink-0">قيد الإضافة</span>
      </div>` : '') + branches.map(b => `
      <div class="flex items-center gap-2 bg-brand/5 border ${b.id === client.id ? 'border-brand' : 'border-brand/15'} rounded-xl p-2.5">
        <div class="min-w-0 flex-1">
          <p class="text-xs font-black text-ink truncate">${b.parent_id ? '' : '<i class="ph-bold ph-star text-amber-500 text-[10px]"></i> '}${esc(b.name || b.client_slug)}${b.id === client.id ? ' <span class="text-[10px] font-bold text-emerald-700">(مفتوح الحين)</span>' : ''}</p>
          <a href="${esc(DM.storeUrl(b.client_slug))}" target="_blank" rel="noopener" class="block truncate text-[11px] text-ink hover:text-ink text-right" dir="ltr">${esc(b.client_slug)}.devmenu.digital</a>
        </div>
        ${main && b.parent_id ? (pendingBranchFeatures(b.id) ? '<span class="text-[11px] font-bold text-amber-700 shrink-0">قيد التفعيل</span>' : `<button type="button" onclick="requestBranchFeatures(${Number(b.id)})" class="px-2.5 h-8 rounded-lg bg-brand/10 border border-brand/45 text-[11px] font-bold text-ink hover:bg-brand/10"><i class="ph-bold ph-sliders-horizontal"></i> المميزات</button>`) : ''}
        <button type="button" onclick="renameBranch(${Number(b.id)})" title="تعديل الاسم" class="w-8 h-8 rounded-lg bg-white border border-brand/20 text-ink hover:bg-brand/10"><i class="ph-bold ph-pencil-simple text-[11px]"></i></button>
        ${b.id === client.id ? '' : `<button type="button" onclick="switchBranch(${Number(b.id)})" class="px-2.5 h-8 rounded-lg bg-brand text-cream text-[11px] font-bold">إدارة</button>`}
      </div>`).join('');
  }
  async function renameBranch(id) {
    const b = branches.find(x => x.id === id); if (!b) return;
    const r = await DMDialog.form({
      title: 'تعديل اسم الفرع', subtitle: 'يظهر هذا الاسم أعلى المنيو ولوحة التحكم.', icon: 'ph-git-branch',
      fields: [{ name: 'name', label: 'اسم الفرع', value: b.name || '', maxlength: 80, required: true, placeholder: 'مثال: دجئ - فرع النخيل' }]
    });
    if (!r || r.name === b.name) return;
    const name = r.name;
    try {
      const res = await api('branch-rename', { id, name });
      branches = branches.map(x => ({ ...x, ...(res.family.find(f => f.id === x.id) || {}) }));
      if (id === client.id) { client.name = name; setStoreName(client.name); document.getElementById('setting-name').value = client.name; }
      renderBranchSwitch(); renderBranchesCard(); renderDeskCard();
      showToast('تم تعديل اسم الفرع');
    } catch { showToast('تعذر تعديل الاسم', true); }
  }

  function switchBranch(id) {
    const main = branches.find(b => !b.parent_id);
    const q = new URLSearchParams();
    if (requestedSlug) q.set('client', requestedSlug);
    if (!main || String(main.id) !== String(id)) q.set('branch', id);
    location.href = `admin.html${q.toString() ? `?${q}` : ''}${location.hash}`;
  }

