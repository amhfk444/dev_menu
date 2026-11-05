// =====================================================================
// DEV MENU — لوحة التحكم: بطاقة الولاء: التبويبات، شكل البطاقة، الرسائل، الأعضاء، الاستيراد
// (ملفات js/admin/ تتحمّل بالترتيب، وتتشارك نفس المتغيرات العامة)
// =====================================================================
  // ─── بطاقة الولاء ───
  const ly = { data: null, members: [], qrUrl: '', design: null, dirty: false, filter: 'all', branch: null, member: null };
  const loyaltyUrl = () => DM.storeUrl(client.client_slug, 'loyalty');   // كود التسجيل ثابت، ما ينتهي
  // ─── تبويبات صفحة الولاء ───
  function setLyTab(tab) {
    ly.tab = tab;
    document.querySelectorAll('[data-lyt]').forEach(b => b.setAttribute('aria-selected', String(b.dataset.lyt === tab)));
    document.querySelectorAll('[data-lytab]').forEach(el => el.classList.toggle('hidden', el.dataset.lytab !== tab));
    const grid = document.getElementById('ly-grid');
    grid.classList.toggle('hidden', tab !== 'settings');
    try { localStorage.setItem('dm_ly_tab', tab); } catch {}
  }
  document.querySelectorAll('[data-lyt]').forEach(b => b.addEventListener('click', () => setLyTab(b.dataset.lyt)));
  async function onLoyaltyPage() {
    let saved = ''; try { saved = localStorage.getItem('dm_ly_tab') || ''; } catch {}
    setLyTab(['overview', 'design', 'settings'].includes(ly.tab || saved) ? (ly.tab || saved) : 'overview');
    try { [ly.data, ly.members] = await Promise.all([api('loyalty'), api('loyalty-members').then(r => r.members)]); }
    catch (e) { showToast(e.message || 'تعذر تحميل بطاقة الولاء', true); return; }
    renderLoyalty();
    renderLyMembers();
  }
  function renderLoyalty() {
    const d = ly.data, st = d.settings;
    syncPagerCardBox(d);
    if (!ly.dirty) ly.design = { ...st.design };
    renderDesign();
    renderLyMessages();
    const sw = document.getElementById('ly-enabled');
    sw.setAttribute('aria-checked', String(d.enabled));
    sw.querySelector('.avail-label').textContent = d.enabled ? 'شغّالة' : 'متوقفة';
    document.getElementById('ly-needed').innerHTML = Array.from({ length: 9 }, (_, i) => i + 4).map(n => `<option value="${n}" ${n === st.needed ? 'selected' : ''}>${n} أختام</option>`).join('');
    document.getElementById('ly-reward').value = st.reward;
    document.getElementById('ly-reward').placeholder = 'مثلاً: ' + DMSectors.loyal(client).reward;
    document.getElementById('ly-reward-en').value = st.reward_en || '';
    document.getElementById('ly-cooldown').value = String(st.cooldown_hours);
    sayLoyaltyBasics();
    document.getElementById('ly-radius').value = String(st.radius_m);
    document.getElementById('ly-pager-stamp').checked = st.pager_stamp !== false;
    const wm = (st.welcome && st.welcome.mode) || 'ai';
    document.querySelectorAll('[name="ly-welcome"]').forEach(r => { r.checked = r.value === wm; });
    document.getElementById('ly-welcome-text').value = (st.welcome && st.welcome.text) || '';
    document.getElementById('ly-welcome-text').classList.toggle('hidden', wm !== 'custom');
    const rm = (st.redeem_msg && st.redeem_msg.mode) || 'ai';
    document.querySelectorAll('[name="ly-redeem"]').forEach(r => { r.checked = r.value === rm; });
    document.getElementById('ly-redeem-text').value = (st.redeem_msg && st.redeem_msg.text) || '';
    document.getElementById('ly-redeem-text').classList.toggle('hidden', rm !== 'custom');
    const hp = st.happy || {}, hours = Array.from({ length: 25 }, (_, h) => h);
    const hlabel = (h) => h === 0 || h === 24 ? '12 بالليل' : h < 12 ? `${h} الصبح` : h === 12 ? '12 الظهر' : h <= 17 ? `${h - 12} العصر` : `${h - 12} بالليل`;
    document.getElementById('ly-happy').checked = !!hp.enabled;
    document.getElementById('ly-happy-box').classList.toggle('hidden', !hp.enabled);
    document.getElementById('ly-happy-from').innerHTML = hours.slice(0, 24).map(h => `<option value="${h}" ${h === hp.from ? 'selected' : ''}>${hlabel(h)}</option>`).join('');
    document.getElementById('ly-happy-to').innerHTML = hours.slice(1).map(h => `<option value="${h}" ${h === hp.to ? 'selected' : ''}>${hlabel(h)}</option>`).join('');
    ly.happyDays = new Set(hp.days || [0, 1, 2, 3, 4, 5, 6]);
    renderHappyDays();
    document.getElementById('ly-fb').checked = !st.feedback || st.feedback.enabled !== false;
    document.getElementById('ly-fb-gift').checked = !st.feedback || st.feedback.gift !== false;
    document.getElementById('ly-fb-days').value = String((st.feedback && st.feedback.days) || 30);
    document.getElementById('ly-gifts').checked = !st.gifts || st.gifts.enabled !== false;
    // الولاء وحدة لكل الفروع: الإعدادات والأعضاء مشتركة، والموقع لكل فرع
    document.getElementById('ly-loc-branch').textContent = branches.length > 1 ? ` (${client.name || ''})` : '';
    document.getElementById('ly-shared').classList.toggle('hidden', branches.length < 2);
    document.getElementById('ly-loc-status').innerHTML = d.location_set
      ? '<span class="text-emerald-700 font-semibold"><i class="ph-bold ph-check-circle"></i> موقع المحل محدد</span>'
      : '<span class="text-ink font-semibold"><i class="ph-bold ph-info"></i> اختياري: لو حددته، تطلع بطاقة الزبون على شاشة قفل جواله لما يقرب من المحل. الختم والصرف والإشعارات ما تعتمد عليه.</span>';
    // الكود
    const url = loyaltyUrl();
    document.getElementById('ly-link').value = url.replace(/^https?:\/\//, '');
    document.getElementById('ly-open').href = url;
    if (ly.qrUrl !== url) {
      ly.qrUrl = url;
      const box = document.getElementById('ly-qr'); box.innerHTML = '';
      new QRCode(box, { text: url, width: 176, height: 176, colorDark: '#22362a', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
    }
    // المساعد الذكي
    const aiSw = document.getElementById('ly-ai');
    aiSw.setAttribute('aria-checked', String(!!d.ai));
    aiSw.querySelector('.avail-label').textContent = d.ai ? 'شغّال' : 'متوقف';
    document.getElementById('ly-ai-run').classList.toggle('hidden', !d.ai);
  }
  // ─── شكل البطاقة: معاينة حيّة ───
  const LY_STYLES = [['gradient', 'متدرج'], ['glass', 'زجاجي'], ['solid', 'لون سادة'], ['paper', 'ورقي'], ['dark', 'داكن']];
  const LY_CARD_COLORS = ['#233d2c', '#1f2937', '#7c2d12', '#1e3a8a', '#831843', '#0f766e', '#b45309'];
  const LY_STAMP_COLORS = ['#c9a227', '#ffffff', '#f97316', '#ef4444', '#22c55e', '#38bdf8', '#1b1b1b'];
  function setLyDesign(patch) { ly.design = { ...ly.design, ...patch }; ly.dirty = true; flashPhone(); renderDesign(); }
  // وهو يسحب في منتقي اللون: نحدّث الجوال بس، بدون ما نعيد رسم الأزرار (إعادة الرسم تقفل المنتقي)
  function pickLyColor(key, value) {
    ly.design = { ...ly.design, [key]: value }; ly.dirty = true;
    renderPhone();
  }
  function undoLyDesign() { ly.design = { ...ly.data.settings.design }; ly.dirty = false; flashPhone(); renderDesign(); }
  function flashPhone() {
    const ph = document.getElementById('ly-phone'); ph.classList.add('flash');
    clearTimeout(flashPhone.t); flashPhone.t = setTimeout(() => ph.classList.remove('flash'), 600);
  }
  // وين يشوفها الزبون: صفحة البطاقة، المحفظة، شاشة القفل
  document.querySelectorAll('[data-lyv]').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('[data-lyv]').forEach(x => x.setAttribute('aria-selected', String(x === b)));
    document.querySelectorAll('[data-lyv-pane]').forEach(el => el.classList.toggle('hidden', el.dataset.lyvPane !== b.dataset.lyv));
  }));
  // التعديلات اللي ما انحفظت (بأسماء يفهمها صاحب المحل)
  const LY_CHANGE_LABELS = [[['color'], 'لون البطاقة'], [['color2'], 'اللون الثاني'], [['text_color'], 'لون الخط'], [['style'], 'الشكل'], [['bg', 'bg_image'], 'الخلفية'],
    [['stamp_color'], 'لون الختم'], [['icon', 'stamp_image'], 'صورة الختم'], [['logo'], 'الشعار'], [['reward_image'], 'صورة المكافأة']];
  function lyChanges() {
    const a = ly.design || {}, b = (ly.data && ly.data.settings.design) || {};
    return LY_CHANGE_LABELS.filter(([keys]) => keys.some(k => (a[k] ?? null) !== (b[k] ?? null))).map(([, label]) => label);
  }
  // الجوال: يرسم البطاقة كما يشوفها الزبون بالضبط
  function renderPhone() {
    const d = ly.design, st = ly.data.settings, n = st.needed;
    if (!Number.isInteger(ly.pvCount)) ly.pvCount = Math.min(3, n - 1);
    const s = ly.pvCount = Math.max(0, Math.min(n, ly.pvCount));
    const range = document.getElementById('ly-pv-count'); range.max = n; range.value = s;
    document.getElementById('ly-pv-count-label').textContent = `${s}/${n}`;
    const name = client.name || 'محلك', logo = d.logo || client.logo_url || '';
    const pic = (id, url) => { const el = document.getElementById(id); el.classList.toggle('hidden', !url); if (url && el.getAttribute('src') !== url) el.src = url; };
    // صفحة البطاقة
    document.getElementById('pv-store').textContent = name;
    pic('pv-logo', client.logo_url || '');
    DMLoyaltyCard.apply(document.getElementById('ly-preview'), d);
    document.getElementById('ly-pv-needed').textContent = `${s}/${n}`;
    document.getElementById('ly-pv-reward').textContent = s >= n ? 'كمّلت الأختام!' : `باقي ${n - s} على ${st.reward}`;
    const pv = document.getElementById('ly-pv-stamps');
    pv.className = `stamps ${n === 5 || n === 10 ? 'c5' : ''}`;
    pv.innerHTML = DMLoyaltyCard.stamps(s, n, d);
    // المحفظة: لون واحد للبطاقة، والأختام في الشريط (مع اللون الثاني لو فيه)
    const pass = document.getElementById('pv-pass'), color = d.color || '#233d2c', stampC = d.stamp_color || '#c9a227';
    const ink = DMLoyaltyCard.inkFor(color);
    pass.style.background = color; pass.style.color = ink;
    document.getElementById('pv-pass-name').textContent = name;
    pic('pv-pass-logo', logo);
    document.getElementById('pv-pass-count').textContent = `${s} / ${n}`;
    document.getElementById('pv-pass-rlabel').textContent = s >= n ? 'مكافأتك جاهزة' : 'المكافأة';
    document.getElementById('pv-pass-reward').textContent = st.reward;
    const strip = document.getElementById('pv-pass-strip'), two = ['gradient', 'glass'].includes(d.style) && d.color2;
    strip.style.background = d.bg === 'image' && d.bg_image ? `linear-gradient(rgba(0,0,0,.35), rgba(0,0,0,.35)), center / cover url("${d.bg_image}")`
      : two ? `radial-gradient(75% 120% at 50% 50%, ${d.color2}, ${color})` : `radial-gradient(60% 120% at 50% 50%, color-mix(in srgb, ${stampC} 16%, ${color}), ${color})`;
    strip.style.color = DMLoyaltyCard.inkFor(two ? d.color2 : color);
    strip.style.setProperty('--stamp', stampC); strip.style.setProperty('--stamp-ink', DMLoyaltyCard.inkFor(stampC));
    strip.style.gridTemplateColumns = `repeat(${n <= 6 ? n : Math.ceil(n / 2)}, 1fr)`;
    strip.innerHTML = DMLoyaltyCard.stamps(s, n, d);
    // شاشة القفل: خلفية من لون البطاقة، وإشعار المحفظة
    const lock = document.querySelector('.pv-lock');
    lock.style.background = `linear-gradient(165deg, ${d.color2 || color} 0%, color-mix(in srgb, ${color} 55%, #000) 100%)`;
    ['pv-n-name', 'pv-n-name2'].forEach(id => { document.getElementById(id).textContent = name; });
    document.getElementById('pv-n-stamp').textContent = s >= n ? `مكافأتك جاهزة: ${st.reward}` : `صار عندك ${s} ختم`;
    // ملخص التعديلات
    const ch = lyChanges();
    document.getElementById('ly-changes-text').textContent = ch.length ? 'عدّلت هذي، والجوال فوق يعرضها. احفظ عشان توصل لزبائنك:' : 'كل شي محفوظ. أي تعديل تسويه يطلع في الجوال على طول.';
    document.getElementById('ly-changes-list').innerHTML = ch.map(c => `<span class="ly-chip">${c}</span>`).join('');
    document.getElementById('ly-design-undo').classList.toggle('hidden', !ch.length);
    ly.dirty = ch.length > 0;
    const btn = document.getElementById('ly-design-save');
    btn.textContent = ly.dirty ? 'حفظ الشكل' : 'محفوظ'; btn.disabled = !ly.dirty;
    btn.classList.toggle('opacity-60', !ly.dirty);
  }
  function renderDesign() {
    const d = ly.design;
    renderPhone();
    const bg = d.bg === 'image' && d.bg_image ? 'image' : 'color';
    document.getElementById('ly-bg').innerHTML = [['color', 'لون', 'ph-palette'], ['image', 'صورة', 'ph-image']].map(([k, label, ic]) => `
      <button type="button" onclick="pickCardBg('${k}')" class="rounded-xl border px-3 py-2.5 text-[13px] font-bold transition ${bg === k ? 'border-brand bg-brand text-cream' : 'border-brand/20 bg-white hover:border-brand/40'}"><i class="ph-bold ${ic}"></i> ${label}</button>`).join('');
    document.getElementById('ly-bg-up').classList.toggle('hidden', bg !== 'image');
    document.getElementById('ly-style-box').classList.toggle('hidden', bg !== 'color');
    document.getElementById('ly-styles').innerHTML = LY_STYLES.map(([k, label]) => `
      <button type="button" onclick="setLyDesign({ style: '${k}' })" class="rounded-xl border px-3 py-2.5 text-[13px] font-bold transition ${d.style === k ? 'border-brand bg-brand text-cream' : 'border-brand/20 bg-white hover:border-brand/40'}">${label}</button>`).join('');
    const swatches = (list, key, cur) => list.map(c => `
      <button type="button" aria-label="${c}" onclick="setLyDesign({ ${key}: '${c}' })" class="w-8 h-8 rounded-full border ${cur === c ? 'ring-2 ring-offset-2 ring-brand' : 'border-black/10'}" style="background:${c}"></button>`).join('') + `
      <label class="relative w-8 h-8 rounded-full border border-dashed border-ink/30 grid place-items-center cursor-pointer text-ink" title="لون آخر"><i class="ph-bold ph-paint-brush"></i>
        <input type="color" value="${cur || '#ffffff'}" class="absolute inset-0 opacity-0 cursor-pointer" oninput="pickLyColor('${key}', this.value)" onchange="setLyDesign({ ${key}: this.value })"></label>`;
    document.getElementById('ly-colors').innerHTML = swatches(LY_CARD_COLORS, 'color', d.color);
    document.getElementById('ly-stamp-colors').innerHTML = swatches(LY_STAMP_COLORS, 'stamp_color', d.stamp_color);
    // "بدون" = يرجع للتلقائي (null)
    const none = (key, cur, label) => `<button type="button" onclick="setLyDesign({ ${key}: null })" class="h-8 px-3 rounded-full border text-[12px] font-bold ${!cur ? 'border-brand bg-brand text-cream' : 'border-brand/20 bg-white'}">${label}</button>`;
    document.getElementById('ly-color2-box').classList.toggle('hidden', bg !== 'color' || !['gradient', 'glass'].includes(d.style));
    document.getElementById('ly-colors2').innerHTML = none('color2', d.color2, 'بدون') + swatches(['#4a6650', '#c9a227', '#0f172a', '#be185d', '#0ea5e9', '#f97316'], 'color2', d.color2 || '');
    document.getElementById('ly-text-colors').innerHTML = none('text_color', d.text_color, 'تلقائي') + swatches(['#ffffff', '#1b1b1b', '#c9a227', '#f5f2eb'], 'text_color', d.text_color || '');
    const pic = (id, clear, url) => { const el = document.getElementById(id); el.classList.toggle('hidden', !url); if (url) el.src = url; document.getElementById(clear).classList.toggle('hidden', !url); };
    pic('ly-logo-pv', 'ly-logo-clear', d.logo);
    pic('ly-reward-pv', 'ly-reward-clear', d.reward_image);
    // أيقونات نشاطه أولاً: المطاعم والمقاهي أيقونات الأكل، والمتاجر والورد والصالونات أيقوناتها
    const foodIco = ['coffee', 'fork-knife', 'hamburger', 'pizza', 'ice-cream', 'bread', 'cookie', 'cake', 'bowl-food', 'popcorn'];
    const isF = DMSectors.isFood(client), mine = DMSectors.loyal(client).stamp;
    const rank = (k) => k === mine ? 0 : (foodIco.includes(k) === isF ? 1 : 2);
    document.getElementById('ly-icons').innerHTML = Object.entries(DMLoyaltyCard.ICONS).sort((a, b) => rank(a[0]) - rank(b[0])).map(([k, cls]) => `
      <button type="button" aria-label="${k}" onclick="setLyDesign({ icon: '${k}', stamp_image: null })" class="w-11 h-11 rounded-xl border grid place-items-center text-lg transition ${!d.stamp_image && d.icon === k ? 'border-brand bg-brand text-cream' : 'border-brand/20 bg-white hover:border-brand/40'}"><i class="ph-bold ${cls}"></i></button>`).join('');
    document.getElementById('ly-stamp-clear').classList.toggle('hidden', !d.stamp_image);
  }
  // خلفية البطاقة: صورة تغطي البطاقة، وفي المحفظة تطلع ورا الأختام
  function pickCardBg(k) {
    if (k === 'color' || ly.design.bg_image) return setLyDesign({ bg: k });
    document.getElementById('ly-bg-file').click();
  }
  async function uploadCardBg(input) {
    const file = input.files && input.files[0]; input.value = '';
    if (!file) return;
    const url = await uploadFile(file, 'card_bg', 1280);
    if (!url) return showToast(lastUploadError || 'ما انرفعت الصورة. جرّب صورة أصغر أو تأكد من الإنترنت', true);
    setLyDesign({ bg: 'image', bg_image: url });
    showToast('انرفعت الصورة، شوفها في الجوال واضغط "حفظ الشكل"');
  }
  async function uploadStampImage(input) {
    const file = input.files && input.files[0]; input.value = '';
    if (!file) return;
    const url = await uploadFile(file, 'stamp', 500);
    if (!url) return showToast(lastUploadError || 'ما انرفعت الصورة. جرّب صورة أصغر أو تأكد من الإنترنت', true);
    setLyDesign({ stamp_image: url });
    showToast('انرفعت الصورة، شوفها في الجوال واضغط "حفظ الشكل"');
  }
  // شعار البطاقة أو صورة المكافأة
  async function uploadLyImage(input, key) {
    const file = input.files && input.files[0]; input.value = '';
    if (!file) return;
    const url = await uploadFile(file, 'stamp', 500);
    if (!url) return showToast(lastUploadError || 'ما انرفعت الصورة. جرّب صورة أصغر أو تأكد من الإنترنت', true);
    setLyDesign({ [key]: url });
    showToast('انرفعت الصورة، شوفها في الجوال واضغط "حفظ الشكل"');
  }
  async function saveLyDesign() {
    const btn = document.getElementById('ly-design-save'); btn.disabled = true;
    try {
      const r = await api('loyalty-settings', { settings: { design: ly.design } });
      ly.data.settings = r.settings; ly.design = { ...r.settings.design }; ly.dirty = false;
      showToast(r.wallet_updated ? `تم حفظ الشكل، وتحدّثت ${r.wallet_updated} بطاقة في المحفظة` : 'تم حفظ شكل البطاقة، ويطلع للزبائن على طول');
    } catch (e) { showToast(e.message || 'ما انحفظ التعديل. تأكد من الإنترنت وحاول مرة ثانية', true); }
    renderDesign();
  }

  // ─── رسائل الأعضاء ───
  const lyCardLabel = (c) => `${c.name || `عضو #${c.member_no}`}${c.name ? ` #${c.member_no}` : ''}${c.phone ? ` (${c.phone})` : ''}`;
  function renderLyMessages() {
    const d = ly.data, sel = document.getElementById('ly-msg-to'), keep = sel.value;
    // أكثر من فرع: زبائن فرع واحد (سجّلوا فيه أو انختم لهم فيه)
    const lyBr = (d.branches || []).filter(x => x.id != null);
    const brOpts = lyBr.length > 1 ? `<optgroup label="زبائن فرع">${lyBr.map(x => `<option value="b:${x.id}">${esc(x.name || '')} (${x.visitors || 0})</option>`).join('')}</optgroup>` : '';
    sel.innerHTML = `<option value="">كل الأعضاء (${d.stats.members})</option>${brOpts}<option value="away">اللي ما جوا من أكثر من 30 يوم (${d.stats.away30 || 0})</option>` + (d.cards.length ? `<optgroup label="عضو واحد">${d.cards.map(c => `<option value="${c.id}">${esc(lyCardLabel(c))}</option>`).join('')}</optgroup>` : '');
    if ([...sel.options].some(o => o.value === keep)) sel.value = keep;
    const byId = Object.fromEntries(d.cards.map(c => [c.id, c]));
    const when = (iso) => new Date(iso).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
    document.getElementById('ly-msg-list').innerHTML = (d.messages || []).length ? `
      <p class="text-xs font-bold text-ink mt-2 mb-1">آخر الرسائل</p>
      <div class="divide-y divide-brand/10">${d.messages.map(m => `
        <div class="py-2.5">
          <p class="leading-relaxed">${m.source === 'ai' ? '<span class="text-[11px] font-bold bg-violet-500/10 text-violet-700 rounded-full px-2 py-0.5 ml-1"><i class="ph-bold ph-sparkle"></i> المساعد</span>' : ''}${esc(m.body)}</p>
          <p class="text-[11px] text-ink mt-0.5">${m.card_id ? esc(byId[m.card_id] ? lyCardLabel(byId[m.card_id]) : `زبون #${m.card_id}`) : m.branch_id ? `زبائن ${esc((lyBr.find(x => x.id === m.branch_id) || {}).name || 'فرع')}` : 'لكل الأعضاء'} · ${when(m.created_at)}${m.wallet_sent ? ` · وصلت إشعار لـ ${m.wallet_sent} جوال` : ''}</p>
        </div>`).join('')}</div>` : '';
  }
  const LY_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  function renderHappyDays() {
    document.getElementById('ly-happy-days').innerHTML = LY_DAYS.map((d, i) => `<button type="button" onclick="ly.happyDays.has(${i}) ? ly.happyDays.delete(${i}) : ly.happyDays.add(${i}); renderHappyDays()" class="text-[12px] font-bold px-2.5 py-1 rounded-full border ${ly.happyDays.has(i) ? 'bg-brand text-cream border-brand' : 'border-brand/20'}">${d}</button>`).join('');
  }
  document.addEventListener('change', (e) => { if (e.target && e.target.id === 'ly-happy') document.getElementById('ly-happy-box').classList.toggle('hidden', !e.target.checked); });
  document.addEventListener('change', (e) => { if (e.target && e.target.name === 'ly-welcome') document.getElementById('ly-welcome-text').classList.toggle('hidden', e.target.value !== 'custom'); });
  document.addEventListener('change', (e) => { if (e.target && e.target.name === 'ly-redeem') document.getElementById('ly-redeem-text').classList.toggle('hidden', e.target.value !== 'custom'); });
  document.addEventListener('input', (e) => { if (e.target && e.target.id === 'ly-msg-body') document.getElementById('ly-msg-count').textContent = `${e.target.value.length}/200`; });
  async function sendLyMessage() {
    const body = document.getElementById('ly-msg-body').value.trim();
    const to = document.getElementById('ly-msg-to').value;
    if (body.length < 2) return showToast('اكتب الرسالة', true);
    const br = to.startsWith('b:') ? (ly.data.branches || []).find(x => String(x.id) === to.slice(2)) : null;
    const target = br ? `زبائن ${br.name} (${br.visitors || 0})` : to === 'away' ? `اللي ما جوا من أكثر من 30 يوم (${ly.data.stats.away30 || 0})` : to ? lyCardLabel(ly.data.cards.find(c => String(c.id) === to)) : `كل الأعضاء (${ly.data.stats.members})`;
    if (!(await DMDialog.confirm({ title: 'إرسال الرسالة', message: `لـ ${target}:\n${body}`, confirmText: 'أرسل', cancelText: 'تراجع' }))) return;
    const btn = document.getElementById('ly-msg-send'); btn.disabled = true;
    try {
      const r = await api('loyalty-message', br ? { body, branch_id: br.id } : to === 'away' ? { body, audience: 'away' } : { body, card_id: to || null });
      document.getElementById('ly-msg-body').value = ''; document.getElementById('ly-msg-count').textContent = '0/200';
      // للكل أو لفرع: الطابور يرسلها بالخلفية، ونتابع كم وصلت (3 دقايق بالكثير، وبعدها تكمل بدون ما ننتظر)
      if (r.queued != null) {
        let st = { sent: 0, pending: r.queued, waiting_limit: 0, gone: 0 };
        for (let i = 0; i < 45 && st.pending && r.message && r.message.id; i++) {
          btn.innerHTML = `<i class="ph-bold ph-spinner-gap ph-spin"></i> وصلت لـ ${st.sent} من ${r.queued}`;
          await new Promise(res => setTimeout(res, 4000));
          try { st = (await api('loyalty-message-status', { message_id: r.message.id })).status; } catch {}
          if (st.pending && st.pending === st.waiting_limit) break;
        }
        btn.innerHTML = '<i class="ph-bold ph-paper-plane-tilt"></i> أرسل';
        showToast(!r.queued ? 'انرسلت، وتطلع لهم في صفحة البطاقة'
          : !r.message.id ? `انرسلت، وبتوصل إشعار لـ ${r.queued} جوال خلال دقايق`
          : `وصلت إشعار لـ ${st.sent} جوال${st.pending ? `، و${st.pending} بتوصلهم ${st.waiting_limit === st.pending ? 'بكرة (حد قوقل اليومي)' : 'خلال دقايق'}` : ''}`);
      } else {
        const sent = (r.progress && r.progress.sent) || 0;
        showToast(sent ? 'انرسلت، ووصلت إشعار لجواله' : 'انرسلت، وتطلع له في صفحة البطاقة');
      }
      await onLoyaltyPage();
    } catch (e) { showToast(e.message || 'ما انرسل. تأكد من الإنترنت وحاول مرة ثانية', true); }
    btn.disabled = false;
  }

  // ─── الأعضاء: داشبورد + قائمة + CSV ───
  const DAYMS = 864e5;
  const daysAgo = (iso) => iso ? Math.floor((Date.now() - Date.parse(iso)) / DAYMS) : null;
  const agoText = (iso) => { const d = daysAgo(iso); return d == null ? '' : d === 0 ? 'اليوم' : d === 1 ? 'أمس' : d <= 10 ? `قبل ${d} أيام` : `قبل ${d} يوم`; };
  const memberName = (c) => c.name || `عضو #${c.member_no}`;
  const LY_FILTERS = [
    ['all', 'الكل', () => true],
    ['loyal', 'دايم يجون (3 زيارات وأكثر)', c => c.visits >= 3],
    ['once', 'مرة وحدة وما رجعوا', c => c.visits === 1 && daysAgo(c.last_stamp_at) >= 7],
    ['away', 'غايبين أكثر من 30 يوم', c => daysAgo(c.last_stamp_at) > 30],
    ['ready', 'مكافأتهم جاهزة', c => ly.data && c.stamps >= ly.data.settings.needed],
    ['wallet', 'حافظينها في المحفظة', c => c.in_wallet],
    ['removed', 'حذفوا البطاقة', c => c.wallet_removed],
    ['m', 'رجال', c => c.gender === 'm'],
    ['f', 'نساء', c => c.gender === 'f']
  ];
  // عملاء كل فرع: اللي زاروه آخر 30 يوم، وزياراته، والأعضاء اللي سجلوا فيه، والمكافآت المصروفة فيه
  function renderLyBranches() {
    const B = (ly.data && ly.data.branches) || null, card = document.getElementById('ly-branches-card');
    card.classList.toggle('hidden', !B);
    if (!B) return;
    const max = Math.max(1, ...B.map(b => b.customers30));
    const stat = (v, l) => `<span class="text-[11px] text-ink"><b class="text-ink text-[13px] tnum">${v}</b> ${l}</span>`;
    document.getElementById('ly-branches').innerHTML = B.map(b => `
      <div class="space-y-1.5">
        <div class="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p class="text-[13px] font-bold">${b.id == null ? '<span class="text-ink">قبل تتبع الفروع</span>' : `${b.main ? '<i class="ph-bold ph-star text-amber-500 text-[11px]"></i> ' : ''}${esc(b.name || '')}`}</p>
          <div class="flex flex-wrap gap-x-4 gap-y-1">${stat(b.customers30, 'عميل')}${stat(b.stamps30, 'زيارة')}${stat(b.members, 'سجّلوا فيه')}${stat(b.redeems30, 'مكافأة')}</div>
        </div>
        <div class="h-2.5 rounded-full bg-brand/10 overflow-hidden"><div class="h-full rounded-full ${b.id == null ? 'bg-ink/25' : 'bg-brand'}" style="width:${Math.round(b.customers30 / max * 100)}%"></div></div>
      </div>`).join('');
  }
  function renderLyMembers() {
    const M = ly.members || [], n = ly.data ? ly.data.settings.needed : 8;
    const week = M.filter(c => daysAgo(c.created_at) <= 7).length;
    const once = M.filter(c => c.visits === 1 && daysAgo(c.last_stamp_at) >= 7);
    const S = (ly.data && ly.data.stats) || {};
    const kpi = (icon, label, v, hint = '') => `<div class="ly-kpi"><div class="flex items-center justify-between"><p class="text-[12px] font-semibold text-ink">${label}</p><span class="k-ic"><i class="ph-bold ${icon}"></i></span></div><p class="text-[28px] font-bold mt-1 tnum">${v}</p>${hint ? `<p class="text-[11px] text-ink">${hint}</p>` : ''}</div>`;
    document.getElementById('ly-kpis').innerHTML =
      kpi('ph-users-three', 'الأعضاء', M.length, week ? `+${week} هالأسبوع` : '') +
      kpi('ph-storefront', 'الزيارات', S.stamps7 || 0, 'آخر 7 أيام') +
      kpi('ph-arrows-clockwise', 'عملاء عائدون', S.returning7 || 0, 'آخر 7 أيام') +
      kpi('ph-gift', 'مكافآت مستخدمة', S.redeemed || 0, M.length ? `${once.length} زاروا مرة وما رجعوا` : '');
    renderLyBranches();
    document.getElementById('lyt-count').textContent = M.length || '';
    document.getElementById('ly-members-sub').textContent = `${M.length} عضو، منهم ${M.filter(c => c.in_wallet).length} حافظين البطاقة في المحفظة`;
    // الزيارات خلال الأسبوع
    const W = (ly.data && ly.data.week) || [], maxW = Math.max(1, ...W.map(w => w.n));
    const dayName = (d) => new Date(d + 'T12:00:00Z').toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'short' });
    document.getElementById('ly-week').innerHTML = W.map((w, i) => `<div class="flex-1 h-full flex flex-col items-center justify-end gap-1.5"><span class="text-[11px] font-bold tnum ${w.n ? '' : 'text-ink/30'}">${w.n}</span><div class="w-full rounded-lg ${i === W.length - 1 ? 'bg-brand' : 'bg-brand/30'}" style="height:${Math.max(4, w.n / maxW * 100)}%"></div><span class="text-[10.5px] text-ink">${i === W.length - 1 ? 'اليوم' : dayName(w.d)}</span></div>`).join('');
    // آخر الزيارات
    const R = (ly.data && ly.data.recent) || [];
    const hrsAgo = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 6e4); return m < 60 ? `قبل ${Math.max(1, m)} د` : m < 1440 ? `قبل ${Math.round(m / 60)} س` : agoText(iso); };
    document.getElementById('ly-recent').innerHTML = R.length ? R.map(r => `<button type="button" onclick="openLyMember(${r.id})" class="w-full flex items-center gap-3 py-2.5 text-right hover:bg-brand/[0.03] rounded-lg px-1">
      <span class="ly-av bg-brand/10 text-brand">${esc((r.name || '#').trim().charAt(0))}</span>
      <span class="flex-1 min-w-0"><span class="block font-semibold text-[13px] truncate">${esc(r.name || `عضو #${r.no}`)}</span><span class="block text-[11px] text-ink">${hrsAgo(r.at)}</span></span>
      <span class="text-[12px] font-bold text-ink tnum" dir="ltr">${Math.min(r.stamps || 0, n)} / ${n}</span></button>`).join('') : '<p class="text-xs text-ink py-6 text-center">أول ما ينختم لأحد تطلع زيارته هنا.</p>';
    const top = [...M].sort((a, b) => b.visits - a.visits).slice(0, 5).filter(c => c.visits > 0);
    const line = (c, right) => `<button type="button" onclick="openLyMember(${c.id})" class="w-full flex items-center justify-between gap-2 py-1.5 hover:bg-brand/[0.03] rounded-lg px-1 text-right"><span class="truncate font-semibold">${esc(memberName(c))}</span><span class="text-xs text-ink shrink-0">${right}</span></button>`;
    document.getElementById('ly-top').innerHTML = top.length ? top.map((c, i) => line(c, `${['🥇', '🥈', '🥉', '', ''][i]} ${c.visits} زيارة`)).join('') : '<p class="text-xs text-ink py-2">للحين ما فيه زيارات.</p>';
    document.getElementById('ly-once').innerHTML = once.length ? once.slice(0, 5).map(c => line(c, `آخر مرة ${agoText(c.last_stamp_at)}`)).join('') + (once.length > 5 ? `<p class="text-[11px] text-ink pt-1">و${once.length - 5} غيرهم</p>` : '') : '<p class="text-xs text-ink py-2">ممتاز، كل اللي جوا رجعوا.</p>';
    // الفئات: عدد الأعضاء، ومجموع الزيارات، ومتوسط الزيارة لكل فئة
    const g = (k) => { const L = M.filter(c => c.gender === k); const v = L.reduce((a, c) => a + c.visits, 0); return { n: L.length, v, avg: L.length ? (v / L.length).toFixed(1) : '0' }; };
    const gm = g('m'), gf = g('f'), gu = M.filter(c => !c.gender).length, totalV = gm.v + gf.v || 1;
    const bar = (label, x, color) => `<div><div class="flex justify-between text-[13px] mb-1"><span class="font-semibold">${label}</span><span class="text-ink">${x.n} عضو · ${x.v} زيارة · متوسط ${x.avg} زيارة</span></div><div class="h-2.5 rounded-full bg-brand/10 overflow-hidden"><div class="h-full rounded-full" style="width:${Math.round(x.v / totalV * 100)}%;background:${color}"></div></div></div>`;
    const lead = gm.v === gf.v ? '' : `<p class="text-[12px] text-ink"><i class="ph-bold ph-crown text-[#c9a227]"></i> ${gm.v > gf.v ? 'الرجال' : 'النساء'} أكثر زيارة: ${Math.round(Math.max(gm.v, gf.v) / totalV * 100)}% من الزيارات</p>`;
    document.getElementById('ly-gender').innerHTML = M.length ? bar('رجال', gm, '#384f3d') + bar('نساء', gf, '#c9a227') + lead + (gu ? `<p class="text-[11px] text-ink">${gu} عضو قديم ما كمّل بياناته</p>` : '') : '<p class="text-xs text-ink">لما يسجلون الأعضاء تطلع هنا.</p>';
    // ليش ما رجعوا + الهدايا
    if (ly.data) {
      const fb = ly.data.feedback || { total: 0, reasons: {}, notes: [] };
      const RS = { wait: 'الانتظار طويل', price: 'الأسعار', quality: 'الطعم أو الجودة', far: 'المكان بعيد', busy: 'ما صار عندهم وقت', other: 'شي ثاني' };
      const sorted = Object.entries(fb.reasons).sort((a, b) => b[1] - a[1]);
      document.getElementById('ly-fb-stats').innerHTML = fb.total ? sorted.map(([k, v]) => `
        <div><div class="flex justify-between text-[13px] mb-1"><span class="font-semibold">${RS[k] || k}</span><span class="text-ink">${Math.round(v / fb.total * 100)}% (${v})</span></div>
        <div class="h-2 rounded-full bg-brand/10 overflow-hidden"><div class="h-full rounded-full bg-brick/70" style="width:${Math.round(v / fb.total * 100)}%"></div></div></div>`).join('') +
        ((fb.latest || []).length ? `<div class="pt-3 mt-1 border-t border-brand/10"><p class="text-[12px] font-bold mb-2">آخر الردود</p><div class="space-y-1.5 max-h-72 overflow-y-auto">${fb.latest.map(r => `
          <button type="button" onclick="openLyMember(${Number(r.card_id)})" class="w-full text-right rounded-lg bg-brand/[0.04] hover:bg-brand/[0.08] px-2.5 py-2 block">
            <span class="flex items-center justify-between gap-2 text-[12px]"><b>${esc(r.name || `عضو #${r.no || ''}`)}</b><span class="text-ink" dir="ltr">${new Date(r.created_at).toLocaleDateString('ar-SA-u-nu-latn', { day: 'numeric', month: 'short' })}</span></span>
            <span class="block text-[12px] text-brick font-semibold">${RS[r.reason] || r.reason}</span>
            ${r.note ? `<span class="block text-[12px] text-ink">«${esc(r.note)}»</span>` : ''}</button>`).join('')}</div></div>` : '')
        : `<p class="text-xs text-ink">للحين ما فيه ردود. اللي يرجع بعد غياب ${(ly.data.settings.feedback && ly.data.settings.feedback.days) || 30} يوم ويختم من شاشة الختم، ينسأل وش أخّره.</p>`;
      const gs = ly.data.gifts || {};
      const tile = (l, v) => `<div class="rounded-xl bg-brand/[0.04] border border-brand/10 p-2.5"><p class="text-[11px] text-ink">${l}</p><p class="text-lg font-bold">${v || 0}</p></div>`;
      document.getElementById('ly-gift-stats').innerHTML = tile('هدايا انرسلت', gs.sent) + tile('انستلمت', gs.claimed) + tile('انصرفت في المحل', gs.redeemed) + tile('زبائن جدد جوا بهدية', gs.new_members);
    }
    // الفروع: أعضاء كل فرع (سجّلوا فيه أو انختم لهم فيه)، والفلاتر تحت تحسب على الفرع المختار
    const fam = branches.length > 1 ? branches : [];
    const inBranch = (c, id) => id === 'none' ? !(c.branch_ids || []).length : (c.branch_ids || []).map(Number).includes(id);
    if (ly.branch != null && !fam.some(x => x.id === ly.branch) && ly.branch !== 'none') ly.branch = null;
    const MB = ly.branch == null ? M : M.filter(c => inBranch(c, ly.branch));
    const chip = (val, label, count) => `<button type="button" onclick="ly.branch=${val === null ? 'null' : typeof val === 'string' ? `'${val}'` : val}; renderLyMembers()" class="text-[12px] font-bold px-3 py-1.5 rounded-full border transition ${ly.branch === val ? 'bg-brand text-cream border-brand' : 'border-brand/20 hover:border-brand/40'}"><i class="ph-bold ph-git-branch"></i> ${label} <span class="opacity-60">${count}</span></button>`;
    const noBranch = M.filter(c => inBranch(c, 'none')).length;
    const bf = document.getElementById('ly-branch-filters');
    bf.classList.toggle('hidden', !fam.length);
    bf.innerHTML = fam.length ? chip(null, 'كل الفروع', M.length) + fam.map(x => chip(x.id, esc(x.name || ''), M.filter(c => inBranch(c, x.id)).length)).join('') + (noBranch ? chip('none', 'ما انعرف فرعهم', noBranch) : '') : '';
    if (fam.length && ly.branch != null) document.getElementById('ly-members-sub').textContent = ly.branch === 'none' ? `${MB.length} عضو قديم ما انختم لهم من وقت ما بدينا نسجّل الفروع` : `${MB.length} عضو في ${(fam.find(x => x.id === ly.branch) || {}).name || ''}، منهم ${MB.filter(c => c.in_wallet).length} حافظين البطاقة في المحفظة`;
    const branchNames = (c) => fam.length ? (c.branch_ids || []).map(id => (fam.find(x => x.id === Number(id)) || {}).name).filter(Boolean).join('، ') : '';
    document.getElementById('ly-filters').innerHTML = LY_FILTERS.map(([k, label, fn]) => `<button type="button" onclick="ly.filter='${k}'; renderLyMembers()" class="text-[12px] font-bold px-3 py-1.5 rounded-full border transition ${ly.filter === k ? 'bg-brand text-cream border-brand' : 'text-ink border-brand/40 hover:border-brand/60'}">${label} <span class="font-black">${MB.filter(fn).length}</span></button>`).join('');
    const q = (document.getElementById('ly-q').value || '').trim().toLowerCase();
    const fn = (LY_FILTERS.find(f => f[0] === ly.filter) || LY_FILTERS[0])[2];
    const list = MB.filter(fn).filter(c => !q || memberName(c).toLowerCase().includes(q) || String(c.phone || '').includes(q) || String(c.member_no) === q);
    const AV = ['bg-brand/10 text-brand', 'bg-amber-100 text-amber-800', 'bg-sky-100 text-sky-800', 'bg-rose-100 text-rose-800', 'bg-violet-100 text-violet-800'];
    document.getElementById('ly-rows').innerHTML = list.slice(0, 200).map(c => {
      const st = Math.min(c.stamps, n), ready = c.stamps >= n;
      return `
      <tr onclick="openLyMember(${c.id})">
        <td><div class="flex items-center gap-3"><span class="ly-av ${AV[c.id % AV.length]}">${esc(memberName(c).trim().charAt(0))}</span><div class="min-w-0"><p class="font-semibold truncate">${esc(memberName(c))}</p><p class="text-[11px] text-ink"><span dir="ltr">#${c.member_no}</span>${c.gender ? ` <span class="mx-1 text-ink/25">|</span> ${c.gender === 'f' ? 'أنثى' : 'ذكر'}` : ''}${c.in_wallet ? ` <span class="mx-1 text-ink/25">|</span> <i class="ph-bold ph-wallet" title="في المحفظة"></i>` : c.wallet_removed ? ` <span class="mx-1 text-ink/25">|</span> <span class="text-brick font-semibold"><i class="ph-bold ph-wallet"></i> حذف البطاقة</span>` : ''}${branchNames(c) ? ` <span class="mx-1 text-ink/25">|</span> <i class="ph-bold ph-git-branch"></i> ${esc(branchNames(c))}` : ''}</p></div></div></td>
        <td class="text-ink" dir="ltr">${esc(c.phone || '—')}</td>
        <td><div class="flex items-center gap-2"><div class="ly-prog"><span style="width:${st / n * 100}%;${ready ? 'background:#c9a227' : ''}"></span></div><span class="text-[12px] font-bold tnum" dir="ltr">${st}/${n}</span>${ready ? '<span class="text-[11px] font-bold bg-amber-100 text-amber-800 rounded-full px-2 py-0.5">مكافأة جاهزة</span>' : ''}</div></td>
        <td class="font-semibold tnum">${c.visits}</td>
        <td class="text-ink">${agoText(c.last_stamp_at) || '—'}</td>
        <td class="text-ink">${agoText(c.created_at)}</td>
        <td class="text-left whitespace-nowrap" onclick="event.stopPropagation()">
          <button type="button" class="ly-act" title="ملف العضو" onclick="openLyMember(${c.id})"><i class="ph-bold ph-eye"></i></button>
          <button type="button" class="ly-act del" title="حذف العضو" onclick="deleteLyMember(${c.id})"><i class="ph-bold ph-trash"></i></button>
        </td>
      </tr>`; }).join('') || '<tr><td colspan="7" class="py-10 text-center text-ink">ما فيه أعضاء هنا.</td></tr>';
    document.getElementById('ly-more').textContent = list.length > 200 ? `يطلع أول 200 من ${list.length}. نزّل CSV عشان تشوف الكل.` : '';
  }
  function exportLyCsv() {
    const M = ly.members || [], n = ly.data ? ly.data.settings.needed : 8;
    const d = (iso) => iso ? new Date(iso).toISOString().slice(0, 16).replace('T', ' ') : '';
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['رقم العضو', 'الاسم', 'الجوال', 'النوع', 'الأختام', 'المطلوب', 'الزيارات', 'المكافآت المستخدمة', 'آخر زيارة', 'أول زيارة', 'في المحفظة']]
      .concat(M.map(c => [c.member_no, c.name || '', c.phone || '', c.gender === 'f' ? 'أنثى' : c.gender === 'm' ? 'ذكر' : '', Math.min(c.stamps, n), n, c.visits, c.rewards, d(c.last_stamp_at), d(c.created_at), c.in_wallet ? 'نعم' : c.wallet_removed ? 'حذفها' : 'لا']));
    const blob = new Blob(['﻿' + rows.map(r => r.map(cell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `loyalty-members-${client.client_slug}-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  // الختم أو الصرف من اللوحة: اللي عنده فروع يختار الفرع اللي صار فيه (عشان ينحسب في "عملاؤك في كل فرع")
  // يرجّع { branch_id } أو null لو تراجع
  async function askLyBranch({ title, message, confirmText }) {
    if (branches.length < 2) return (await DMDialog.confirm({ title, message, confirmText, cancelText: 'تراجع', tone: 'success' })) ? {} : null;
    let last = null; try { last = Number(localStorage.getItem('dm_ly_branch')); } catch {}
    const ids = branches.map(b => b.id), pick = ids.includes(last) ? last : client.id;
    const v = await DMDialog.form({ title, subtitle: message, icon: 'ph-storefront', confirmText, cancelText: 'تراجع',
      fields: [{ name: 'branch', label: 'من أي فرع؟', type: 'choice', value: String(pick),
        options: branches.map(b => ({ value: String(b.id), label: b.name || b.client_slug, icon: b.parent_id ? 'ph-git-branch' : 'ph-star' })) }] });
    if (!v) return null;
    try { localStorage.setItem('dm_ly_branch', v.branch); } catch {}
    return { branch_id: Number(v.branch) };
  }
  async function redeemLyMember() {
    if (!ly.member) return;
    const at = await askLyBranch({ title: 'صرف المكافأة', message: `تصرف ${ly.data.settings.reward} لـ ${memberName(ly.member)} الحين؟`, confirmText: 'اصرفها' });
    if (!at) return;
    try { const r = await api('loyalty-redeem', { card_id: ly.member.id, ...at }); showToast(`تم صرف ${r.reward}`); const id = ly.member.id; await onLoyaltyPage(); openLyMember(id); }
    catch (e) { showToast(e.message || 'ما انصرفت المكافأة. حاول مرة ثانية', true); }
  }
  // ─── حذف عضو ───
  async function deleteLyMember(id) {
    const c = (ly.members || []).find(x => x.id === id) || ly.member || { id };
    const ok = await DMDialog.confirm({ title: 'حذف العضو', message: `يتحذف ${memberName(c)} وكل أختامه وزياراته ورسائله، وتنلغي بطاقته في محفظة جواله. ما تقدر ترجعه بعدين.`, confirmText: 'احذف العضو', cancelText: 'تراجع', tone: 'danger' });
    if (!ok) return;
    try {
      const r = await api('loyalty-member-delete', { card_id: id });
      ly.members = (ly.members || []).filter(x => x.id !== id);
      if (ly.member && ly.member.id === id) closeLyMember();
      renderLyMembers(); showToast(r.wallet === 'revoked' ? 'تم حذف العضو، وانلغت بطاقته في المحفظة' : 'تم حذف العضو');
    } catch (e) { showToast(e.message || 'ما انحذف. حاول مرة ثانية', true); }
  }

  // ─── ملف العضو ───
  async function openLyMember(id) {
    const box = document.getElementById('ly-member');
    box.classList.remove('hidden'); box.classList.add('flex');
    document.getElementById('lm-title').textContent = 'جاري التحميل...';
    document.getElementById('lm-events').innerHTML = ''; document.getElementById('lm-msgs').innerHTML = ''; document.getElementById('lm-stats').innerHTML = '';
    try {
      const r = await api(`loyalty-member&id=${id}`);
      ly.member = r.member; renderLyMember(r);
    } catch (e) { closeLyMember(); showToast(e.message || 'تعذر فتح ملف العضو', true); }
  }
  function renderLyMember(r) {
    const m = r.member, n = ly.data.settings.needed;
    document.getElementById('lm-title').textContent = memberName(m);
    document.getElementById('lm-sub').textContent = `رقم العضوية #${m.member_no} · ${m.gender === 'f' ? 'أنثى · ' : m.gender === 'm' ? 'ذكر · ' : ''}${m.phone ? `${m.phone} · ` : ''}عضو من ${new Date(m.created_at).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' })}${m.in_wallet ? ' · البطاقة في محفظته' : m.wallet_removed ? ' · حذف البطاقة من محفظته' : ''}`;
    const st = (label, v, ltr = false) => `<div class="rounded-xl bg-brand/[0.04] border border-brand/10 py-2"><p class="text-lg font-bold" ${ltr ? 'dir="ltr"' : ''}>${v}</p><p class="text-[11px] text-ink">${label}</p></div>`;
    const dates = r.events.filter(e => e.kind === 'stamp').map(e => Date.parse(e.created_at)).sort((a, b) => a - b);
    const gap = dates.length > 1 ? Math.round((dates[dates.length - 1] - dates[0]) / DAYMS / (dates.length - 1)) : null;
    document.getElementById('lm-stats').innerHTML = st('الأختام', `${Math.min(m.stamps, n)}/${n}`, true) + st('الزيارات', m.visits) + st('المكافآت', m.rewards) + st('يجي كل', gap ? `${gap} يوم` : '—');
    const wa = document.getElementById('lm-wa');
    wa.classList.toggle('hidden', !m.phone); if (m.phone) wa.href = `https://wa.me/${m.phone}`;
    const rs = document.getElementById('lm-restore');
    if (rs) rs.onclick = async () => {
      if (!(await DMDialog.confirm({ title: 'رابط بطاقة العضو', message: 'هذا الرابط يفتح بطاقته بأختامها. أرسله بس للعضو نفسه بعد ما تتأكد منه (مثلاً من رقم جواله أو قدامك في المحل).', confirmText: 'انسخ الرابط', cancelText: 'تراجع', tone: '' }))) return;
      navigator.clipboard.writeText(m.restore_url).then(() => showToast('انتسخ رابط بطاقته'));
    };
    document.getElementById('lm-stamp').disabled = m.stamps >= n;
    document.getElementById('lm-redeem').classList.toggle('hidden', m.stamps < n);
    document.getElementById('lm-events').innerHTML = r.events.length ? r.events.map(e => `
      <div class="flex items-center justify-between gap-2 py-2">
        <span>${e.kind === 'gift' ? '<i class="ph-bold ph-heart text-[#c9a227]"></i> أهدى مكافأته لصديق' : e.kind === 'gift_redeem' ? '<i class="ph-bold ph-gift text-[#c9a227]"></i> استخدم هدية من صديق' : e.kind === 'redeem' ? '<i class="ph-bold ph-gift text-[#c9a227]"></i> استخدم المكافأة' : e.distance_m == null ? '<i class="ph-bold ph-seal-check text-ink"></i> ختم من صاحب المحل' : '<i class="ph-bold ph-seal-check text-emerald-700"></i> ختم زيارة'}</span>
        <span class="text-xs text-ink">${new Date(e.created_at).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
      </div>`).join('') : '<p class="text-xs text-ink py-2">ما فيه زيارات.</p>';
    if (m.transferred_at) document.getElementById('lm-events').insertAdjacentHTML('beforeend', `
      <div class="flex items-center justify-between gap-2 py-2">
        <span><i class="ph-bold ph-arrows-left-right text-[#c9a227]"></i> نقل ${m.transferred} ${m.transferred === 1 ? 'ختم' : 'أختام'} من بطاقته القديمة</span>
        <span class="text-xs text-ink">${new Date(m.transferred_at).toLocaleString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</span>
      </div>`);
    const RSN = { wait: 'الانتظار طويل', price: 'الأسعار', quality: 'الطعم أو الجودة', far: 'المكان بعيد', busy: 'ما صار عنده وقت', other: 'شي ثاني' };
    const fbHtml = (r.feedback || []).length ? `<div class="rounded-xl border border-brick/20 bg-brick/[0.04] p-3 mb-3"><p class="text-xs font-bold text-brick mb-1"><i class="ph-bold ph-question"></i> ليش غاب؟ (جوابه)</p>${r.feedback.map(f => `<p class="text-[13px]"><b>${RSN[f.reason] || f.reason}</b>${f.note ? `: «${esc(f.note)}»` : ''} <span class="text-[11px] text-ink">${agoText(f.created_at)}</span></p>`).join('')}</div>` : '';
    document.getElementById('lm-msgs').innerHTML = fbHtml + (r.messages.length ? `<p class="text-xs font-bold text-ink mb-1">رسائله</p><div class="text-sm divide-y divide-brand/10">${r.messages.map(x => `
      <div class="py-2"><p>${x.source === 'ai' ? '<span class="text-[11px] font-bold bg-violet-500/10 text-violet-700 rounded-full px-2 py-0.5 ml-1">المساعد</span>' : ''}${esc(x.body)}</p><p class="text-[11px] text-ink">${agoText(x.created_at)}</p></div>`).join('')}</div>` : '');
  }
  // ─── استيراد أعضاء من نظام سابق (CSV أو Excel) ───
  const LI = { head: [], rows: [] };
  const digitsEn = (v) => String(v ?? '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) & 15)).trim();
  function parseCsv(text) {
    const sep = (text.split('\n')[0].match(/;/g) || []).length > (text.split('\n')[0].match(/,/g) || []).length ? ';' : (text.includes('\t') && !text.includes(',') ? '\t' : ',');
    const out = []; let row = [], cell = '', inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (inQ) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else inQ = false; } else cell += c; }
      else if (c === '"') inQ = true;
      else if (c === sep) { row.push(cell); cell = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); out.push(row); row = []; cell = ''; }
      else cell += c;
    }
    if (cell || row.length) { row.push(cell); out.push(row); }
    return out.filter(r => r.some(x => String(x).trim()));
  }
  const loadXlsx = () => window.XLSX ? Promise.resolve() : new Promise((ok, no) => {
    const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'; s.onload = ok; s.onerror = no; document.head.appendChild(s);
  });
  async function readLyImport(input) {
    const file = input.files && input.files[0]; input.value = '';
    if (!file) return;
    try {
      let table;
      if (/\.xlsx?$/i.test(file.name)) {
        await loadXlsx();
        const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
        table = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false, defval: '' });
      } else table = parseCsv((await file.text()).replace(/^\uFEFF/, ''));
      table = table.filter(r => r.some(x => String(x).trim()));
      if (table.length < 2) return showToast('الملف فاضي أو ما فيه غير العناوين', true);
      LI.head = table[0].map((h, i) => String(h).trim() || `عمود ${i + 1}`); LI.rows = table.slice(1);
      // نخمّن الأعمدة من عناوينها
      const find = (re) => LI.head.findIndex(h => re.test(h));
      let phone = find(/جوال|هاتف|موبايل|رقم ال|phone|mobile|tel/i);
      if (phone < 0) phone = LI.head.findIndex((_, i) => LI.rows.slice(0, 20).filter(r => /^(\+?966|0)?5\d{8}$/.test(digitsEn(r[i]).replace(/[\s-]/g, ''))).length >= 3);
      const name = find(/اسم|name|عميل|customer/i), stamps = find(/ختم|اختام|أختام|نقاط|رصيد|stamp|point|balance|visit/i);
      const opts = (sel, v, allowNone) => { const el = document.getElementById(sel); el.innerHTML = (allowNone ? '<option value="-1">بدون</option>' : '') + LI.head.map((h, i) => `<option value="${i}">${esc(h)}</option>`).join(''); el.value = String(v); };
      opts('li-phone', Math.max(0, phone), false); opts('li-name', name, true); opts('li-stamps', stamps, true);
      document.getElementById('li-sub').textContent = `${file.name}: ${LI.rows.length} صف`;
      renderLyImport();
      const box = document.getElementById('ly-import'); box.classList.remove('hidden'); box.classList.add('flex');
    } catch (e) { showToast('ما قدرنا نقرأ الملف. احفظه CSV أو Excel وجرب مرة ثانية', true); }
  }
  function lyImportRows() {
    const p = +document.getElementById('li-phone').value, n = +document.getElementById('li-name').value, s = +document.getElementById('li-stamps').value;
    return LI.rows.map(r => ({ phone: digitsEn(r[p]), name: n >= 0 ? String(r[n] || '').trim() : '', stamps: s >= 0 ? digitsEn(r[s]) : '0' })).filter(r => r.phone);
  }
  function renderLyImport() {
    const rows = lyImportRows();
    document.getElementById('li-rows').innerHTML = rows.slice(0, 6).map(r => `<tr class="border-t border-brand/10"><td class="p-2" dir="ltr">${esc(r.phone)}</td><td class="p-2">${esc(r.name || '—')}</td><td class="p-2">${esc(r.stamps || '0')}</td></tr>`).join('');
    document.getElementById('li-count').textContent = `${rows.length} عضو فيهم جوال`;
  }
  function closeLyImport() { const box = document.getElementById('ly-import'); box.classList.add('hidden'); box.classList.remove('flex'); }
  async function sendLyImport() {
    const rows = lyImportRows();
    if (!rows.length) return showToast('ما فيه صفوف فيها جوال', true);
    const btn = document.getElementById('li-go'); btn.disabled = true;
    let added = 0, existing = 0, invalid = 0;
    try {
      for (let i = 0; i < rows.length; i += 1000) {
        btn.innerHTML = `<i class="ph-bold ph-spinner-gap ph-spin"></i> ${Math.min(i + 1000, rows.length)} من ${rows.length}`;
        const r = await api('loyalty-import', { rows: rows.slice(i, i + 1000) });
        added += r.added; existing += r.existing; invalid += r.invalid;
      }
      closeLyImport();
      await DMDialog.confirm({ title: 'تم الاستيراد', tone: '', icon: 'ph-check-circle', confirmText: 'تمام', cancelText: 'إغلاق', message: `انضاف ${added} عضو.${existing ? `\n${existing} مسجلين عندك من قبل وما تغيروا.` : ''}${invalid ? `\n${invalid} رقم جوال غير صحيح وما انضاف.` : ''}\n\nلما يمسح العميل كود التسجيل ويكتب نفس جواله، تطلع له بطاقته بأختامه.` });
      await onLoyaltyPage();
    } catch (e) { showToast(e.message || 'تعذر الاستيراد', true); }
    btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-file-arrow-up"></i> استورد';
  }

