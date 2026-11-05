// =====================================================================
// DEV MENU — لوحة التحكم: المنيو: مساعد المنيو، المنيو من صورة، الاستيراد، القهوة، الحساسية، الأقسام والأطباق، الأحجام، الإضافات، الكوبونات، نموذج الطبق
// (ملفات js/admin/ تتحمّل بالترتيب، وتتشارك نفس المتغيرات العامة)
// =====================================================================
  // ─── مساعد المنيو الذكي ───
  async function applyMenuChatSetting() {
    const box = document.getElementById('info-menu-chat'), info = document.getElementById('chat-usage');
    box.checked = !!(client && client.menu_chat);
    // المساعد إضافة مدفوعة على المنيو: لو مو في الباقة، الخيار مقفول ونوضح كيف يضيفه
    const locked = featureLocked('chat');
    box.disabled = locked;
    if (locked) { info.innerHTML = '<i class="ph-bold ph-lock-simple"></i> أضف "المساعد الذكي" لباقتك من صفحة الاشتراك (19 ر.س بالشهر)'; return; }
    try {
      const r = await api('chat-usage');
      info.innerHTML = `<i class="ph-bold ph-chat-circle-dots"></i> أسئلة زبائنك للمساعد هالشهر: ${r.used.toLocaleString('en')}`;
    } catch { info.textContent = ''; }
  }
  async function toggleMenuChat(on) {
    if (await updateClient({ menu_chat: on })) showToast(on ? 'المساعد الذكي صار في منيو محلك' : 'تم إيقاف المساعد الذكي');
    else { document.getElementById('info-menu-chat').checked = !on; showToast('تعذر حفظ الإعداد', true); }
  }

  // ─── المنيو من صورة ───
  let mpItems = [], mpBusy = false;
  // الصورة للقراءة بس (ما تنحفظ): أي صورة يقدر الجوال يفتحها (HEIC وPNG الكبيرة وغيرها) تتحول JPEG بالمقاس المطلوب
  async function menuReadImage(file, maxDim, quality) {
    let bmp;
    try { bmp = await createImageBitmap(file); }
    catch {
      // بعض المتصفحات ما تفتح الصورة بـ createImageBitmap: نجرب عنصر صورة عادي
      bmp = await new Promise((ok, no) => { const u = URL.createObjectURL(file), im = new Image(); im.onload = () => { ok(im); setTimeout(() => URL.revokeObjectURL(u), 0); }; im.onerror = () => { URL.revokeObjectURL(u); no(new Error('ما قدرنا نفتح الصورة على هذا الجهاز، صوّر المنيو بكاميرا الجوال وارفعها')); }; im.src = u; });
    }
    const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight, k = Math.min(1, maxDim / Math.max(w0, h0));
    const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) bmp.close();
    return { type: 'image/jpeg', data: c.toDataURL('image/jpeg', quality).split(',')[1] };
  }
  async function readMenuPhoto(input) {
    const files = [...(input.files || [])].slice(0, 8); input.value = '';
    if (!files.length) return;
    const box = document.getElementById('mp');
    box.classList.remove('hidden'); box.classList.add('flex');
    document.getElementById('mp-wait').classList.remove('hidden'); document.getElementById('mp-body').classList.add('hidden');
    document.getElementById('mp-sub').textContent = files.length === 1 ? 'صورة وحدة' : `${files.length} صور`;
    mpBusy = true;
    try {
      // كل طلب للخادم حده 4.5 ميجا و4 صور: نصغّر الصور لين تدخل، ونقسمها دفعات لو كثيرة
      const LIMIT = 3.9e6, batches = [];
      for (let i = 0; i < files.length; i += 4) batches.push(files.slice(i, i + 4));
      const items = [];
      for (const batch of batches) {
        let images = [];
        for (const [dim, qual] of [[1800, .85], [1500, .8], [1200, .75], [1000, .7]]) {
          images = [];
          for (const f of batch) images.push(await menuReadImage(f, dim, qual));
          if (images.reduce((n, im) => n + im.data.length, 0) <= LIMIT) break;
        }
        // دفعة ما فيها أطباق (صورة غلاف مثلاً) ما توقف الباقي
        try { items.push(...(await api('menu-from-photo', { images })).items); }
        catch (e) { if (e.code !== 'NO_ITEMS' || batches.length === 1) throw e; }
      }
      if (!items.length) throw new Error('ما لقينا أطباق في الصور، جرّب صورة أوضح للمنيو');
      mpItems = items.map(it => ({ ...it }));
      renderMenuPhoto();
      document.getElementById('mp-wait').classList.add('hidden'); document.getElementById('mp-body').classList.remove('hidden');
    } catch (e) {
      closeMenuPhoto();
      showToast(e.message || 'ما قدرنا نقرأ المنيو، جرّب صورة أوضح', true);
    } finally { mpBusy = false; }
  }
  function renderMenuPhoto() {
    // كل طبق بطاقة: الاسم والسعر فوق، والقسم والوصف تحت (تشتغل زين على الجوال)
    const cell = (i, k, ph, cls = '', type = 'text') => `<label class="block ${cls}"><span class="block text-[11px] font-bold text-ink mb-0.5">${ph}</span><input type="${type}" value="${esc(mpItems[i][k] ?? '')}" oninput="mpItems[${i}].${k}=this.value; mpCount()" class="input-pro text-[12.5px] !py-1.5"${type === 'number' ? ' dir="ltr" step="0.01" min="0" inputmode="decimal"' : ''}></label>`;
    document.getElementById('mp-rows').innerHTML = mpItems.map((it, i) => `<div class="relative rounded-xl border ${mpPriced(it) ? 'border-brand/15' : 'border-amber-500/50 bg-amber-50/40'} p-2.5 pe-[4.5rem] grid grid-cols-4 sm:grid-cols-12 gap-2">
      ${cell(i, 'name', 'اسم الطبق', (it.sizes || []).length ? 'col-span-4 sm:col-span-6' : 'col-span-3 sm:col-span-4')}${(it.sizes || []).length ? '' : cell(i, 'price', 'السعر', 'col-span-1 sm:col-span-2', 'number')}
      ${cell(i, 'category', 'القسم', 'col-span-2 sm:col-span-2')}${cell(i, 'description', 'الوصف', 'col-span-2 sm:col-span-4')}
      <div class="col-span-4 sm:col-span-12 flex flex-wrap items-end gap-1.5">${(it.sizes || []).map((z, j) => `<div class="flex items-end gap-1 rounded-lg bg-brand/5 p-1.5">
        <label><span class="block text-[11px] font-bold text-ink mb-0.5">الحجم</span><input value="${esc(z.name)}" oninput="mpItems[${i}].sizes[${j}].name=this.value" class="input-pro text-[12px] !py-1 w-20"></label>
        <label><span class="block text-[11px] font-bold text-ink mb-0.5">السعر</span><input type="number" dir="ltr" step="0.01" min="0" inputmode="decimal" value="${esc(z.price ?? '')}" oninput="mpItems[${i}].sizes[${j}].price=this.value; mpCount()" class="input-pro text-[12px] !py-1 w-16"></label>
        <button type="button" onclick="mpItems[${i}].sizes.splice(${j}, 1); renderMenuPhoto()" aria-label="حذف الحجم" class="w-7 h-7 rounded-md text-brick hover:bg-brick/10"><i class="ph-bold ph-x"></i></button></div>`).join('')}
        <button type="button" onclick="mpAddSize(${i})" class="text-[11px] font-bold text-brand hover:underline px-1 py-1.5"><i class="ph-bold ph-plus"></i> ${(it.sizes || []).length ? 'حجم' : 'أحجام'}</button></div>
      <div class="absolute top-2.5 left-2.5 flex flex-col items-center gap-1">
        <label class="w-14 h-14 rounded-lg border border-dashed border-brand/30 bg-white grid place-items-center overflow-hidden cursor-pointer hover:border-brand/60" title="صورة الطبق">
          ${it.uploading ? '<i class="ph-bold ph-spinner-gap ph-spin text-brand"></i>' : it.image_url ? `<img src="${esc(it.image_url)}" alt="" class="w-full h-full object-cover">` : '<span class="grid place-items-center text-brand/70 leading-tight"><i class="ph-bold ph-image text-[18px]"></i><span class="text-[9.5px] font-bold">أضف صورة</span></span>'}
          <input type="file" accept="image/*" class="hidden" onchange="mpPhoto(${i}, this)"></label>
        <button type="button" onclick="mpItems.splice(${i}, 1); renderMenuPhoto()" aria-label="حذف الطبق" class="w-8 h-8 rounded-lg text-brick hover:bg-brick/10"><i class="ph-bold ph-trash"></i></button></div></div>`).join('');
    mpCount();
  }
  // الطبق مسعّر: له سعر، أو كل أحجامه لها سعر
  const mpPriced = (it) => (it.sizes || []).length ? it.sizes.every(z => String(z.name || '').trim() && Number(z.price) > 0) : Number(it.price) > 0;
  function mpAddSize(i) {
    const it = mpItems[i]; it.sizes = it.sizes || [];
    if (it.sizes.length >= 6) return showToast('الأحجام حدها 6', true);
    if (!it.sizes.length && Number(it.price) > 0) it.sizes.push({ name: 'صغير', price: it.price });
    it.sizes.push({ name: '', price: '' }); renderMenuPhoto();
  }
  // صورة لكل طبق قبل الإضافة (اختيارية)
  async function mpPhoto(i, input) {
    const file = input.files && input.files[0]; input.value = '';
    const it = mpItems[i]; if (!file || !it) return;
    it.uploading = true; renderMenuPhoto();
    const url = await uploadFile(file, 'prod', 1200, () => {});
    it.uploading = false;
    if (url) it.image_url = url; else showToast(lastUploadError || 'تعذر رفع الصورة', true);
    renderMenuPhoto();
  }
  function mpCount() {
    const ok = mpItems.filter(it => String(it.name || '').trim());
    const noPrice = ok.filter(it => !mpPriced(it)).length;
    const cats = new Set(ok.map(it => it.category || 'أطباق')).size;
    document.getElementById('mp-count').textContent = `${ok.length} طبق في ${cats} ${cats === 1 ? 'قسم' : 'أقسام'}${noPrice ? ` · ${noPrice} بدون سعر، اكتبه قبل الإضافة` : ''}`;
  }
  function mpAddRow() { mpItems.push({ category: (mpItems[mpItems.length - 1] || {}).category || '', name: '', price: '', description: '' }); renderMenuPhoto(); }
  function closeMenuPhoto() { const box = document.getElementById('mp'); box.classList.add('hidden'); box.classList.remove('flex'); }
  async function sendMenuPhoto() {
    const named = mpItems.filter(it => String(it.name || '').trim());
    if (named.some(it => !mpPriced(it))) return showToast('فيه أطباق بدون سعر، اكتب سعرها أو احذفها', true);
    const rows = named.map(it => ({ category: String(it.category || '').trim(), name: String(it.name).trim(), price: digitsEn(String(it.price ?? '')),
      sizes: (it.sizes || []).map(z => ({ name: String(z.name).trim(), price: Number(digitsEn(String(z.price))) })),
      description: String(it.description || '').trim(), calories: it.calories ? String(it.calories) : '', name_en: String(it.name_en || '').trim(), image_url: it.image_url || '' }));
    if (!rows.length) return showToast('ما فيه أطباق', true);
    if (mpItems.some(it => it.uploading)) return showToast('انتظر لين تخلص الصور تنرفع', true);
    const btn = document.getElementById('mp-go'); btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-spinner-gap ph-spin"></i> نضيف الأطباق…';
    try {
      const r = await api('products-import', { rows });
      closeMenuPhoto();
      const why = (r.skipped || []).map(x => `الصف ${x.row}: ${x.reason}`).join('\n');
      await DMDialog.confirm({ title: 'تمت الإضافة', tone: '', icon: 'ph-check-circle', confirmText: 'تمام', cancelText: 'إغلاق',
        message: `انضاف ${r.added} طبق${r.categories ? ` و${r.categories} قسم جديد` : ''}.${why ? `\n\nما انضاف:\n${why}` : ''}${rows.some(r => !r.image_url) ? '\n\nتقدر تضيف صور باقي الأطباق من صفحة المنيو.' : ''}` });
      refreshAll();
    } catch (e) { showToast(e.message || 'تعذر الإضافة', true); }
    btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-check"></i> أضف للمنيو';
  }

  // ─── استيراد الأطباق من Excel/CSV ───
  const PI = { head: [], rows: [] };
  const PI_COLS = { category: /قسم|تصنيف|category|section/i, name: /اسم|طبق|منتج|صنف|name|item|dish/i, price: /سعر|ثمن|price|cost/i,
    description: /وصف|مكونات|desc/i, calories: /سعر[اة]ت|كالوري|calor/i, name_en: /انجليزي|إنجليزي|english|name.?en/i };
  async function readProductImport(input) {
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
      PI.head = table[0].map((h, i) => String(h).trim() || `عمود ${i + 1}`); PI.rows = table.slice(1);
      // نخمّن الأعمدة من عناوينها ("السعرات" قبل "السعر" عشان ما يختلطون، والاسم الإنجليزي قبل الاسم)
      const used = new Set(), guess = {};
      for (const k of ['calories', 'name_en', 'category', 'price', 'description', 'name']) {
        const i = PI.head.findIndex((h, j) => !used.has(j) && PI_COLS[k].test(h));
        guess[k] = i; if (i >= 0) used.add(i);
      }
      for (const k of Object.keys(PI_COLS)) {
        const el = document.getElementById('pi-' + k), must = k === 'name' || k === 'price';
        el.innerHTML = (must ? '' : '<option value="-1">بدون</option>') + PI.head.map((h, i) => `<option value="${i}">${esc(h)}</option>`).join('');
        el.value = String(guess[k] >= 0 ? guess[k] : must ? 0 : -1);
      }
      document.getElementById('pi-sub').textContent = `${file.name}: ${PI.rows.length} صف`;
      renderProductImport();
      const box = document.getElementById('pi-import'); box.classList.remove('hidden'); box.classList.add('flex');
    } catch (e) { showToast('ما قدرنا نقرأ الملف. احفظه Excel أو CSV وجرب مرة ثانية', true); }
  }
  function productImportRows() {
    const col = (k) => +document.getElementById('pi-' + k).value;
    const get = (r, k) => col(k) >= 0 ? String(r[col(k)] ?? '').trim() : '';
    return PI.rows.map(r => ({ category: get(r, 'category'), name: get(r, 'name'), price: digitsEn(get(r, 'price')), description: get(r, 'description'), calories: digitsEn(get(r, 'calories')), name_en: get(r, 'name_en') }))
      .filter(r => r.name);
  }
  function renderProductImport() {
    const rows = productImportRows();
    document.getElementById('pi-rows').innerHTML = rows.slice(0, 8).map(r => `<tr class="border-t border-brand/10"><td class="p-2">${esc(r.category || 'أطباق')}</td><td class="p-2">${esc(r.name)}</td><td class="p-2" dir="ltr">${esc(r.price || '—')}</td></tr>`).join('');
    const cats = new Set(rows.map(r => r.category || 'أطباق')).size;
    const dishes = (n) => n === 1 ? 'طبق واحد' : n === 2 ? 'طبقين' : n <= 10 ? `${n} أطباق` : `${n} طبق`;
    document.getElementById('pi-count').textContent = `${dishes(rows.length)} في ${cats === 1 ? 'قسم واحد' : cats === 2 ? 'قسمين' : `${cats} أقسام`}`;
  }
  // نموذج يفتح في Excel (CSV بترميز يفهمه للعربي)
  function downloadProductTemplate() {
    const rows = [['القسم', 'اسم الطبق', 'السعر', 'الوصف', 'السعرات', 'الاسم بالإنجليزي'],
      ['المشروبات الساخنة', 'لاتيه', '18', 'إسبريسو مع حليب مبخّر', '190', 'Latte'],
      ['الحلويات', 'تشيز كيك', '24', 'تشيز كيك بصوص التوت', '420', 'Cheesecake']];
    const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = 'devmenu-dishes.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  // ─── تفاصيل القهوة المختصة ───
  const COFFEE_PROCESS = { washed: 'مغسولة', natural: 'مجففة (طبيعية)', honey: 'عسلية', anaerobic: 'لاهوائية', carbonic: 'كربونية', other: 'أخرى' };
  const COFFEE_ROAST   = { light: 'فاتحة', medium: 'متوسطة', dark: 'داكنة' };
  const COFFEE_METHODS = { v60: 'V60', chemex: 'كيمكس', aeropress: 'إيروبرس', frenchpress: 'فرنش برس', espresso: 'إسبريسو', coldbrew: 'كولد برو' };
  const NOTE_SUGGESTIONS = ['توت', 'شوكولاتة', 'كراميل', 'حمضيات', 'ياسمين', 'زهور', 'فانيلا', 'خوخ', 'ليمون', 'عسل', 'تفاح', 'كرز', 'مكسرات', 'فراولة', 'برتقال', 'قرفة'];
  let coffeeNotes = [];

  document.getElementById('coffee-process').innerHTML = '<option value="">—</option>' +
    Object.entries(COFFEE_PROCESS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  document.getElementById('coffee-roast').innerHTML = Object.entries(COFFEE_ROAST).map(([k, v]) => `
    <label class="cursor-pointer">
      <input type="radio" name="coffee-roast" value="${k}" class="peer hidden">
      <span class="block text-center text-[11px] font-bold py-2 rounded-lg border border-brand/15 bg-brand/5 text-ink peer-checked:bg-amber-400 peer-checked:text-black peer-checked:border-amber-400 transition">${v}</span>
    </label>`).join('');
  document.getElementById('coffee-methods').innerHTML = Object.entries(COFFEE_METHODS).map(([k, v]) => `
    <label class="cursor-pointer">
      <input type="checkbox" value="${k}" class="coffee-method peer hidden">
      <span class="block text-[11px] font-bold px-2.5 py-1.5 rounded-lg border border-brand/15 bg-brand/5 text-ink peer-checked:bg-brand peer-checked:text-cream transition">${v}</span>
    </label>`).join('');
  // الضغط مرة ثانية على نفس التحميص يلغي الاختيار
  const roastBox = document.getElementById('coffee-roast');
  roastBox.addEventListener('pointerdown', (e) => {
    const input = e.target.closest('label')?.querySelector('input');
    if (input) input.dataset.was = input.checked ? '1' : '0';
  });
  roastBox.addEventListener('click', (e) => {
    if (e.target.tagName !== 'INPUT') return;
    if (e.target.dataset.was === '1') { e.target.checked = false; e.target.dataset.was = '0'; }
  });

  function renderNotes() {
    const box = document.getElementById('notes-box');
    box.querySelectorAll('.note-chip').forEach(x => x.remove());
    const input = document.getElementById('notes-input');
    coffeeNotes.forEach((n, i) => {
      const chip = document.createElement('span');
      chip.className = 'note-chip inline-flex items-center gap-1 bg-amber-400/15 text-amber-800 border border-amber-400/30 text-[11px] font-bold pr-2 pl-1 py-0.5 rounded-full';
      chip.innerHTML = `${esc(n)} <button type="button" data-rm="${i}" aria-label="حذف" class="w-4 h-4 rounded-full hover:bg-brand/10 text-amber-800/70">×</button>`;
      box.insertBefore(chip, input);
    });
    document.getElementById('notes-suggest').innerHTML = NOTE_SUGGESTIONS.filter(n => !coffeeNotes.includes(n)).slice(0, 10)
      .map(n => `<button type="button" data-add="${esc(n)}" class="text-[11px] text-ink hover:text-ink bg-brand/5 hover:bg-brand/10 border border-brand/15 px-2 py-0.5 rounded-full transition">+ ${esc(n)}</button>`).join('');
  }
  function addNote(raw) {
    const n = String(raw || '').trim().replace(/[،,]+$/, '').slice(0, 25);
    if (!n || coffeeNotes.includes(n) || coffeeNotes.length >= 8) return;
    coffeeNotes.push(n);
    renderNotes();
  }
  document.getElementById('notes-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === '،') {
      e.preventDefault();
      addNote(e.target.value); e.target.value = '';
    } else if (e.key === 'Backspace' && !e.target.value && coffeeNotes.length) {
      coffeeNotes.pop(); renderNotes();
    }
  });
  document.getElementById('notes-input').addEventListener('blur', (e) => { if (e.target.value.trim()) { addNote(e.target.value); e.target.value = ''; } });
  document.getElementById('notes-box').addEventListener('click', (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { coffeeNotes.splice(Number(rm.dataset.rm), 1); renderNotes(); return; }
    document.getElementById('notes-input').focus();
  });
  document.getElementById('notes-suggest').addEventListener('click', (e) => {
    const b = e.target.closest('[data-add]');
    if (b) addNote(b.dataset.add);
  });

  function getCoffee() {
    const v = (id) => document.getElementById(id).value.trim();
    const alt = parseInt(v('coffee-altitude'), 10);
    const c = {
      origin: v('coffee-origin'), region: v('coffee-region'), process: v('coffee-process'), variety: v('coffee-variety'),
      process_other: v('coffee-process') === 'other' ? v('coffee-process-other') : '',
      altitude: Number.isFinite(alt) && alt > 0 ? alt : null,
      roast: document.querySelector('[name="coffee-roast"]:checked')?.value || '',
      notes: [...coffeeNotes],
      methods: [...document.querySelectorAll('.coffee-method:checked')].map(x => x.value)
    };
    if (c.process === 'other' && !c.process_other) c.process = '';   // "أخرى" بدون نص = بدون معالجة
    const empty = !c.origin && !c.region && !c.process && !c.variety && !c.altitude && !c.roast && !c.notes.length && !c.methods.length;
    return empty ? null : c;
  }
  function setCoffee(c) {
    c = c || {};
    document.getElementById('coffee-origin').value = c.origin || '';
    document.getElementById('coffee-region').value = c.region || '';
    document.getElementById('coffee-process').value = c.process || '';
    document.getElementById('coffee-process-other').value = c.process_other || '';
    toggleProcessOther();
    document.getElementById('coffee-variety').value = c.variety || '';
    document.getElementById('coffee-altitude').value = c.altitude || '';
    document.querySelectorAll('[name="coffee-roast"]').forEach(r => { r.checked = r.value === c.roast; r.dataset.was = r.checked ? '1' : '0'; });
    document.querySelectorAll('.coffee-method').forEach(m => { m.checked = (c.methods || []).includes(m.value); });
    coffeeNotes = Array.isArray(c.notes) ? [...c.notes] : [];
    renderNotes();
    document.getElementById('coffee-details').open = !!(c && Object.keys(c).length);
  }
  // عند اختيار "أخرى" يظهر حقل يكتب فيه صاحب المقهى المعالجة بنفسه
  function toggleProcessOther() {
    const other = document.getElementById('coffee-process').value === 'other';
    const input = document.getElementById('coffee-process-other');
    input.classList.toggle('hidden', !other);
    if (other && !input.value) setTimeout(() => input.focus(), 30);
  }
  const processLabel = (c) => c.process === 'other' ? (c.process_other || '') : (COFFEE_PROCESS[c.process] || '');
  const coffeeSummary = (c) => c ? [c.origin, processLabel(c), COFFEE_ROAST[c.roast] && `تحميص ${COFFEE_ROAST[c.roast]}`].filter(Boolean).join(' · ') : '';
  renderNotes();

  // ─── مسببات الحساسية ───
  const ALLERGENS = [
    ['gluten', 'الغلوتين'], ['milk', 'الحليب'], ['egg', 'البيض'],
    ['nuts', 'المكسرات'], ['peanut', 'الفول السوداني'], ['sesame', 'السمسم'],
    ['fish', 'الأسماك'], ['shellfish', 'القشريات'], ['soy', 'الصويا']
  ];
  document.getElementById('allergen-options').innerHTML = ALLERGENS.map(([k, l]) => `
    <label class="flex items-center gap-1.5 bg-brand/5 border border-brand/15 rounded-lg px-2 py-1.5 cursor-pointer">
      <input type="checkbox" value="${k}" class="allergen-cb accent-amber-400"> ${l}
    </label>`).join('');
  const getAllergens = () => [...document.querySelectorAll('.allergen-cb:checked')].map(x => x.value).join(',');
  const setAllergens = (v) => {
    const set = new Set(String(v || '').split(',').filter(Boolean));
    document.querySelectorAll('.allergen-cb').forEach(cb => { cb.checked = set.has(cb.value); });
  };

  // ─── البيانات والترتيب ───
  const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
  const categoryOf = (p) => loadedCategories.find(c => c.key === p.category || c.name === p.category);
  const productsInCategory = (cat) => loadedProducts.filter(p => p.category === cat.key || p.category === cat.name).sort(bySort);

  async function refreshAll() {
    try {
      const data = await api('load');
      if (data.store) Object.assign(client, data.store);
      loadedCategories = (data.categories || []).sort(bySort);
      loadedProducts = (data.products || []).sort(bySort);
    } catch (e) { console.error(e); lastApiError = ''; }
    renderCategories();
    filterProducts();
    renderDashboardSummary();
  }

  // يعيد ترقيم القائمة بالترتيب المطلوب ويحفظ الصفوف اللي تغيّر ترتيبها فقط
  async function saveOrder(table, list) {
    await api('reorder', { table, ids: list.map(x => x.id) });
    list.forEach((row, i) => { row.sort_order = i + 1; });
  }

  async function moveCategory(id, dir) {
    const list = [...loadedCategories].sort(bySort);
    const i = list.findIndex(c => c.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try { await saveOrder('categories', list); showToast('تم حفظ ترتيب الأقسام'); refreshAll(); }
    catch (e) { console.error(e); showToast('تعذر تغيير الترتيب', true); }
  }

  async function moveProduct(id, dir) {
    const p = loadedProducts.find(x => x.id === id);
    if (!p) return;
    const cat = categoryOf(p);
    const list = cat ? productsInCategory(cat) : loadedProducts.filter(x => !categoryOf(x)).sort(bySort);
    const i = list.findIndex(x => x.id === id), j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    try { await saveOrder('products', list); refreshAll(); }
    catch (e) { console.error(e); showToast('تعذر تغيير الترتيب', true); }
  }

  // الفئة الرئيسية لقسم موجود
  const categoryGroups = () => [...new Set(loadedCategories.map(c => c.group_name).filter(Boolean))];
  async function renameCategory(id) {
    const c = loadedCategories.find(x => x.id === id); if (!c) return;
    const r = await DMDialog.form({
      title: 'تعديل اسم القسم', subtitle: branches.length > 1 ? 'الاسم الجديد يتطبق على نفس القسم في كل الفروع.' : '', icon: 'ph-stack',
      fields: [
        { name: 'name', label: 'اسم القسم', value: c.name || '', maxlength: 60, required: true, placeholder: 'مثال: المشروبات الساخنة' },
        { name: 'en', label: 'الاسم بالإنجليزي', value: c.name_en || '', maxlength: 60, dir: 'ltr', placeholder: 'Hot drinks' }
      ]
    });
    if (!r) return;
    try {
      await api('category-rename', { id, name: r.name, name_en: r.en });
      showToast('تم تعديل اسم القسم');
      refreshAll();
    } catch { showToast('تعذر تعديل الاسم', true); }
  }

  async function editCategoryGroup(id) {
    const c = loadedCategories.find(x => x.id === id); if (!c) return;
    const groups = categoryGroups();
    const r = await DMDialog.form({
      title: 'الفئة الرئيسية', subtitle: `لقسم "${c.name}". الأقسام اللي لها نفس الفئة تظهر تحت تبويب واحد أعلى المنيو.`, icon: 'ph-stack',
      fields: [{ name: 'group', label: 'الفئة', value: c.group_name || '', maxlength: 40, placeholder: 'مثال: فطور، غداء، عشاء', suggestions: groups, hint: 'اتركها فاضية لإزالة الفئة.' }]
    });
    if (!r) return;
    try {
      const res = await api('category-group', { id, group_name: r.group });
      c.group_name = res.category.group_name;
      renderCategories();
      showToast(c.group_name ? `صار القسم تحت "${c.group_name}"` : 'تمت إزالة الفئة الرئيسية');
    } catch { showToast('ما انحفظ التعديل. تأكد من الإنترنت وحاول مرة ثانية', true); }
  }

  function renderCategories() {
    document.getElementById('cat-groups').innerHTML = categoryGroups().map(g => `<option value="${esc(g)}">`).join('');
    const optionsHtml = loadedCategories.length > 0
      ? loadedCategories.map(c => `<option value="${esc(c.key)}">${esc(c.name)}</option>`).join('')
      : `<option value="">أضف قسماً أولاً من تبويب الأقسام</option>`;

    const prodSelect = document.getElementById('prod-category');
    const filterSelect = document.getElementById('filter-category');
    const [prevProd, prevFilter] = [prodSelect.value, filterSelect.value];
    prodSelect.innerHTML = optionsHtml;
    filterSelect.innerHTML = `<option value="all">جميع الأقسام</option>` + (loadedCategories.length ? optionsHtml : '');
    if ([...prodSelect.options].some(o => o.value === prevProd)) prodSelect.value = prevProd;
    if ([...filterSelect.options].some(o => o.value === prevFilter)) filterSelect.value = prevFilter;

    const list = document.getElementById('categories-list');
    if (loadedCategories.length === 0) {
      list.innerHTML = `<p class="text-xs text-ink text-center py-4">لا توجد أقسام بعد. أضف أول قسم من النموذج.</p>`;
      return;
    }
    const last = loadedCategories.length - 1;
    list.innerHTML = loadedCategories.map((c, i) => `
      <div class="cat-row" data-id="${Number(c.id)}">
        <span class="cat-grip" aria-hidden="true" title="اسحب لتغيير الترتيب"><i class="ph-bold ph-dots-six-vertical"></i></span>
        <span class="cat-pos">${i + 1}</span>
        <div class="min-w-0 flex-1">
          <p class="text-sm font-semibold text-ink truncate">${esc(c.name)}${c.name_en ? ` <span class="text-ink font-normal text-xs" dir="ltr">${esc(c.name_en)}</span>` : ''}</p>
          <p class="text-xs text-ink mt-0.5"><span class="tnum">${productsInCategory(c).length}</span> طبق${c.group_name ? ` · <span class="text-amber-800 font-semibold">${esc(c.group_name)}</span>` : ''}</p>
        </div>
        <button onclick="moveCategory(${Number(c.id)}, -1)" ${i === 0 ? 'disabled' : ''} aria-label="تحريك ${esc(c.name)} لأعلى" class="cat-arrow"><i class="ph-bold ph-arrow-up text-xs"></i></button>
        <button onclick="moveCategory(${Number(c.id)}, 1)" ${i === last ? 'disabled' : ''} aria-label="تحريك ${esc(c.name)} لأسفل" class="cat-arrow"><i class="ph-bold ph-arrow-down text-xs"></i></button>
        <button onclick="renameCategory(${Number(c.id)})" aria-label="تعديل اسم ${esc(c.name)}" class="cat-act"><i class="ph-bold ph-pencil-simple text-[11px]"></i> <span>الاسم</span></button>
        <button onclick="editCategoryGroup(${Number(c.id)})" aria-label="فئة ${esc(c.name)}" class="cat-act"><i class="ph-bold ph-stack text-[11px]"></i> <span>الفئة</span></button>
        <button onclick="deleteCategory(${Number(c.id)})" aria-label="حذف ${esc(c.name)}" class="cat-act danger"><i class="ph-bold ph-trash text-[11px]"></i> <span>حذف</span></button>
      </div>`).join('');
    enableCategoryDrag(list);
  }

  // سحب وإفلات: نحفظ الترتيب الجديد كامل بعد ما يفلت القسم
  let catSortable = null;
  function enableCategoryDrag(list) {
    if (!window.Sortable) return;   // لو المكتبة ما تحمّلت تبقى الأسهم شغالة
    if (catSortable) catSortable.destroy();
    catSortable = Sortable.create(list, {
      handle: '.cat-grip', animation: 160, ghostClass: 'cat-ghost', chosenClass: 'cat-drag', delay: 0,
      onEnd: async (e) => {
        if (e.oldIndex === e.newIndex) return;
        const ids = [...list.querySelectorAll('.cat-row')].map(el => Number(el.dataset.id));
        const ordered = ids.map(id => loadedCategories.find(c => Number(c.id) === id)).filter(Boolean);
        try { await saveOrder('categories', ordered); showToast('تم حفظ ترتيب الأقسام'); }
        catch (err) { console.error(err); showToast('تعذر حفظ الترتيب', true); }
        refreshAll();
      }
    });
  }

  document.getElementById('add-category-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('cat-name').value.trim();
    const nameEn = document.getElementById('cat-name-en').value.trim();
    if (!name) return showToast('اكتب اسم القسم', true);
    if (loadedCategories.some(c => c.name === name)) return showToast('يوجد قسم بنفس الاسم', true);

    const groupName = document.getElementById('cat-group').value.trim();
    try { await api('category-add', { name, name_en: nameEn, group_name: groupName }); }
    catch (error) { console.error(error); return showToast('تعذر إضافة القسم', true); }
    showToast('تمت إضافة القسم');
    document.getElementById('add-category-form').reset();
    refreshAll();
  });

  async function deleteCategory(id) {
    const cat = loadedCategories.find(c => c.id === id);
    if (!cat) return;
    const count = productsInCategory(cat).length;
    if (count > 0) return showToast(`القسم فيه ${count} طبق. انقلها لقسم آخر (زر تعديل) أو احذفها أولاً`, true);
    openDeleteModal('حذف القسم', `هل أنت متأكد من حذف قسم "${cat.name}" نهائياً؟`, async () => {
      try { await api('category-delete', { id }); }
      catch { return showToast('تعذر حذف القسم', true); }
      showToast('تم حذف القسم');
      refreshAll();
    });
  }

  function filterProducts() {
    checkPhotoRatios();
    const search = document.getElementById('search-input').value.trim().toLowerCase();
    const category = document.getElementById('filter-category').value;
    const catName = loadedCategories.find(c => c.key === category)?.name;
    const catIndex = (p) => { const c = categoryOf(p); return c ? loadedCategories.indexOf(c) : 9999; };
    const filtered = loadedProducts
      .filter(p =>
        [(p.name || ''), (p.name_en || '')].some(t => t.toLowerCase().includes(search)) &&
        (category === 'all' || p.category === category || p.category === catName))
      .sort((a, b) => catIndex(a) - catIndex(b) || bySort(a, b));
    renderProductsList(filtered);
  }

  function renderProductsList(products) {
    const list = document.getElementById('admin-products-list');
    document.getElementById('products-count').textContent = `${products.length} طبق`;
    closeDishMenu();

    if (products.length === 0) {
      list.innerHTML = loadedProducts.length
        ? '<p class="text-sm text-ink text-center py-8">ما فيه طبق بهذا الاسم أو في هذا القسم.</p>'
        : `<div class="text-center py-10 space-y-3">
            <span class="w-14 h-14 mx-auto rounded-2xl bg-brand/10 text-brand grid place-items-center text-2xl"><i class="ph-bold ph-fork-knife"></i></span>
            <p class="text-[15px] font-bold text-ink">المنيو فاضي للحين</p>
            <p class="text-[12.5px] text-ink max-w-xs mx-auto leading-relaxed">${loadedCategories.length ? 'أضف أول طبق من النموذج: الاسم والسعر والقسم يكفون، والباقي تضيفه بعدين.' : 'ابدأ بإضافة قسم (مثل: المشروبات الحارة)، بعدها أضف أطباقك فيه.'}</p>
            ${loadedCategories.length ? '<button type="button" onclick="goAddDish()" class="bg-brand text-cream px-5 py-2.5 rounded-xl text-[13px] font-bold"><i class="ph-bold ph-plus"></i> أضف أول طبق</button>'
              : '<button type="button" onclick="switchTab(\'categories\')" class="bg-brand text-cream px-5 py-2.5 rounded-xl text-[13px] font-bold"><i class="ph-bold ph-stack"></i> أضف قسم</button>'}
          </div>`;
      return;
    }

    let lastCat = null;
    list.innerHTML = products.map(p => {
      const id = Number(p.id);
      const isAvailable = p.is_available !== false;
      const isBestseller = p.is_bestseller === true;
      const isHidden = p.is_hidden === true;
      const img = safeUrl(p.image_url);
      const cat = categoryOf(p);
      const header = cat && cat !== lastCat
        ? `<div class="dish-cat"><h4>${esc(cat.name)}</h4><span class="tnum">${productsInCategory(cat).length} طبق</span></div>` : '';
      lastCat = cat;
      const meta = [
        p.coffee && allowsCoffee() ? esc(coffeeSummary(p.coffee) || 'قهوة مختصة') : '',
        !showCalories() ? '' : p.calories != null ? `${Number(p.calories)} سعرة` : '<span class="text-amber-700">بدون سعرات</span>'
      ].filter(Boolean).join(' · ');
      return `${header}
        <div class="dish-row ${!isAvailable ? 'sold-out' : ''} ${isHidden ? 'is-hidden' : ''} ${editingProductId === id ? 'is-editing' : ''}">
          <button type="button" class="dish-main" onclick="startEdit(${id})" aria-label="تعديل ${esc(p.name)}">
            ${img ? `<img src="${esc(img)}" alt="" loading="lazy" class="dish-thumb">` : `<span class="dish-thumb"><i class="ph-bold ph-fork-knife"></i></span>`}
            <span class="dish-text">
              <span class="dish-name block">${esc(p.name)}${isBestseller ? '<span class="dish-tag bg-saffron/15 text-amber-800">مميز</span>' : ''}${isHidden ? '<span class="dish-tag bg-ink/10 text-ink">مخفي</span>' : ''}</span>
              ${meta ? `<span class="dish-meta block">${meta}</span>` : ''}
            </span>
            <span class="dish-leader" aria-hidden="true"></span>
            <span class="dish-price">${sizesText(p) ? esc(sizesText(p)) : esc(money(p.price))}</span>${(Array.isArray(p.extras) && p.extras.length) ? `<span class="text-[10.5px] font-bold text-ink/70 ms-1"><i class="ph-bold ph-list-plus"></i> ${p.extras.length} ${p.extras.length === 1 ? 'مجموعة إضافات' : 'مجموعات إضافات'}</span>` : ''}
          </button>
          <button type="button" role="switch" aria-checked="${isAvailable}" aria-label="متوفر: ${esc(p.name)}" class="avail" onclick="toggleField(${id}, 'is_available', ${isAvailable})">
            <span class="avail-track"></span><span class="avail-label">${isAvailable ? 'متوفر' : 'نفدت'}</span>
          </button>
          <button type="button" class="more-btn" aria-haspopup="menu" aria-expanded="false" aria-label="خيارات ${esc(p.name)}" onclick="openDishMenu(event, ${id})"><i class="ph-bold ph-dots-three-vertical"></i></button>
        </div>`;
    }).join('');
  }

  // قائمة خيارات الطبق (⋯): تعديل، تمييز، إخفاء، ترتيب، حذف
  let dishMenuFor = null;
  function closeDishMenu() {
    const m = document.getElementById('dish-menu');
    if (m) m.remove();
    document.querySelectorAll('.more-btn[aria-expanded="true"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
    dishMenuFor = null;
  }
  function openDishMenu(e, id) {
    e.stopPropagation();
    if (dishMenuFor === id) return closeDishMenu();
    closeDishMenu();
    const p = loadedProducts.find(x => Number(x.id) === id); if (!p) return;
    const cat = categoryOf(p), siblings = cat ? productsInCategory(cat) : [], pos = siblings.findIndex(x => x.id === p.id);
    const btn = e.currentTarget, r = btn.getBoundingClientRect();
    const m = document.createElement('div');
    m.id = 'dish-menu'; m.setAttribute('role', 'menu');
    const item = (icon, label, fn, extra = '') => `<button type="button" role="menuitem" ${extra} onclick="closeDishMenu(); ${fn}"><i class="ph-bold ${icon}"></i> ${label}</button>`;
    m.innerHTML = [
      item('ph-pencil-simple', 'تعديل الطبق', `startEdit(${id})`),
      item('ph-fire', p.is_bestseller ? 'إلغاء التمييز' : 'تمييز الطبق', `toggleField(${id}, 'is_bestseller', ${p.is_bestseller === true})`),
      item(p.is_hidden ? 'ph-eye' : 'ph-eye-slash', p.is_hidden ? 'إظهار في المنيو' : 'إخفاء من المنيو', `toggleField(${id}, 'is_hidden', ${p.is_hidden === true})`),
      '<hr>',
      item('ph-arrow-up', 'تحريك لأعلى', `moveProduct(${id}, -1)`, pos <= 0 ? 'disabled' : ''),
      item('ph-arrow-down', 'تحريك لأسفل', `moveProduct(${id}, 1)`, pos < 0 || pos >= siblings.length - 1 ? 'disabled' : ''),
      '<hr>',
      item('ph-trash', 'حذف الطبق', `deleteProduct(${id})`, 'class="danger"')
    ].join('');
    document.body.appendChild(m);
    const w = m.offsetWidth, h = m.offsetHeight;
    m.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
    m.style.top = `${r.bottom + h + 8 > innerHeight ? Math.max(8, r.top - h - 4) : r.bottom + 4}px`;
    btn.setAttribute('aria-expanded', 'true');
    dishMenuFor = id;
    m.querySelector('button:not(:disabled)').focus();
  }
  document.addEventListener('click', (e) => { if (dishMenuFor !== null && !e.target.closest('#dish-menu')) closeDishMenu(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dishMenuFor !== null) closeDishMenu(); });
  window.addEventListener('scroll', () => { if (dishMenuFor !== null) closeDishMenu(); }, { passive: true });

  // المفتاح يتغير على طول (بدون انتظار الخادم)، ولو فشل الحفظ يرجع لحالته
  async function toggleField(id, field, current) {
    const p = loadedProducts.find(x => x.id === id);
    const apply = (v) => { if (p) p[field] = v; filterProducts(); renderDashboardSummary(); };
    apply(!current);
    try { await api('product-toggle', { id, field, value: !current }); }
    catch { apply(current); return showToast('ما قدرنا نحدّث البيانات. تأكد من الإنترنت', true); }
    if (field === 'is_available') showToast(current ? 'صار الطبق: نفدت الكمية' : 'صار الطبق: متوفر');
    else if (field === 'is_hidden') showToast(current ? 'الطبق ظاهر في المنيو' : 'تم إخفاء الطبق من المنيو');
    else showToast(current ? 'تمت إزالة التمييز' : 'تم تمييز الطبق');
    if (!p) refreshAll();
  }

  async function deleteProduct(id) {
    const p = loadedProducts.find(x => x.id === id);
    openDeleteModal('حذف الطبق', `هل أنت متأكد من حذف "${p ? p.name : 'الطبق'}" من المنيو؟${branches.length > 1 ? ' ينحذف من هذا الفرع فقط، ويبقى في الفروع الثانية.' : ''}`, async () => {
      try { await api('product-delete', { id }); }
      catch { return showToast('تعذر حذف الطبق', true); }
      if (editingProductId === id) cancelEdit();
      showToast('تم حذف الطبق');
      refreshAll();
    });
  }

  // ─── أحجام الطبق (صغير، وسط، كبير...) ───
  const MAX_SIZES = 6;
  let formSizes = [];
  const sizesText = (p) => (Array.isArray(p.sizes) && p.sizes.length) ? p.sizes.map(z => `${z.name} ${money(z.price)}`).join(' · ') : '';
  function renderSizes() {
    document.getElementById('sizes-list').innerHTML = formSizes.map((z, i) => `
      <div class="flex items-center gap-1.5">
        <input type="text" maxlength="30" value="${esc(z.name || '')}" oninput="formSizes[${i}].name=this.value" placeholder="${['صغير', 'وسط', 'كبير'][i] || 'الحجم'}" class="input-pro !py-1.5 text-xs flex-1 min-w-0">
        <input type="text" maxlength="30" value="${esc(z.name_en || '')}" oninput="formSizes[${i}].name_en=this.value" placeholder="${['Small', 'Medium', 'Large'][i] || 'Size'}" dir="ltr" class="input-pro !py-1.5 text-xs w-20 sm:w-24">
        <input type="number" min="0" step="any" value="${esc(z.price ?? '')}" oninput="formSizes[${i}].price=this.value" placeholder="${esc(curSign())}" dir="ltr" class="input-pro !py-1.5 text-xs w-20">
        <button type="button" onclick="formSizes.splice(${i}, 1); renderSizes()" aria-label="حذف الحجم" class="shrink-0 w-9 h-9 rounded-lg bg-red-500/10 text-red-600 border border-red-500/20 hover:bg-red-500/20"><i class="ph-bold ph-x"></i></button>
      </div>`).join('');
    const on = formSizes.length > 0;
    document.getElementById('price-field').classList.toggle('hidden', on);
    document.getElementById('sizes-hint').classList.toggle('hidden', !on);
    document.getElementById('size-add-btn').disabled = formSizes.length >= MAX_SIZES;
  }
  function addSize() {
    if (formSizes.length >= MAX_SIZES) return;
    // أول حجم ياخذ السعر المكتوب حالياً
    const base = document.getElementById('prod-price').value;
    formSizes.push({ name: '', name_en: '', price: formSizes.length === 0 && base !== '' ? base : '' });
    renderSizes();
    const inputs = document.querySelectorAll('#sizes-list input[type="text"]:not([dir])');
    if (inputs.length) inputs[inputs.length - 1].focus();
  }

  // ─── إضافات الطبق ───
  let formExtras = [];
  // الإضافات الاختيارية (أول مجموعة غير إجبارية) تطلع قائمة مباشرة بدون اسم مجموعة. والإجبارية (مثل نوع الخبز) كل وحدة باسمها
  const mainExtras = () => formExtras.find(g => !g.required);
  function exOptRows(g, gi) {
    return (g.options || []).map((o, oi) => `<div class="flex items-center gap-1.5">
          ${o.pid ? `<span class="flex-1 min-w-0 text-xs font-bold text-ink truncate py-2"><i class="ph-bold ph-link text-emerald-600" title="مربوط بصنف في المنيو"></i> ${esc(exLinkedName(o))}</span>
          <span class="text-xs font-bold text-ink w-20 text-center" dir="ltr">${esc(money(exLinkedPrice(o)))}</span>` : `<input type="text" maxlength="40" value="${esc(o.name || '')}" oninput="formExtras[${gi}].options[${oi}].name=this.value" placeholder="${g.required ? (['عادي', 'بريوش', 'أسمر'][oi] || 'الخيار') : (['صوص جبن', 'مخلل', 'جبن إضافي'][oi] || 'الإضافة')}" class="input-pro !py-1.5 text-xs flex-1 min-w-0">
          <input type="number" min="0" step="any" value="${esc(o.price ?? '')}" oninput="formExtras[${gi}].options[${oi}].price=this.value" placeholder="0" dir="ltr" class="input-pro !py-1.5 text-xs w-20" aria-label="السعر">`}
          <button type="button" onclick="formExtras[${gi}].options.splice(${oi}, 1); renderExtras()" aria-label="حذف" class="shrink-0 w-8 h-8 rounded-lg text-red-600 hover:bg-red-500/10"><i class="ph-bold ph-x"></i></button>
        </div>`).join('') + `<div class="flex flex-wrap gap-x-3"><button type="button" onclick="addExOpt(${gi})" class="text-[11px] font-bold text-brand hover:underline py-1"><i class="ph-bold ph-plus"></i> ${g.required ? 'خيار' : 'إضافة'}</button>
        <button type="button" onclick="pickExFromMenu(${gi})" class="text-[11px] font-bold text-brand hover:underline py-1"><i class="ph-bold ph-list-checks"></i> اختر من المنيو</button></div>`;
  }
  function renderExtras() {
    if (!mainExtras()) formExtras.unshift({ name: 'الإضافات', required: false, options: [] });
    const main = mainExtras(), mi = formExtras.indexOf(main);
    const others = formExtras.map((g, gi) => ({ g, gi })).filter(x => x.g !== main);
    document.getElementById('extras-list').innerHTML = `<div class="space-y-1.5">${exOptRows(main, mi)}</div>` + others.map(({ g, gi }) => `
      <div class="bg-white rounded-lg border border-brand/15 p-2 space-y-1.5">
        <div class="flex items-center gap-1.5">
          <span class="shrink-0 text-[10.5px] font-black px-2 py-1 rounded-md ${g.required ? 'bg-amber-100 text-amber-900' : 'bg-brand/10 text-ink'}">${g.required ? 'إجباري' : 'اختياري'}</span>
          <input type="text" maxlength="40" value="${esc(g.name || '')}" oninput="formExtras[${gi}].name=this.value" placeholder="${g.required ? 'مثل: نوع الخبز' : 'اسم المجموعة'}" aria-label="اسم الاختيار" class="input-pro !py-1.5 text-xs flex-1 min-w-0 font-bold">
          <button type="button" onclick="formExtras.splice(${gi}, 1); renderExtras()" aria-label="حذف" class="shrink-0 w-8 h-8 rounded-lg bg-red-500/10 text-red-600 border border-red-500/20"><i class="ph-bold ph-trash"></i></button>
        </div>
        ${g.required ? '<p class="text-[10.5px] text-ink">يختار العميل واحداً منها قبل أن يضيف الطبق.</p>' : ''}
        ${exOptRows(g, gi)}
      </div>`).join('') + `<button type="button" onclick="addReqGroup()" ${formExtras.length >= 6 ? 'disabled' : ''} class="w-full text-[11px] font-bold bg-white border border-dashed border-brand/40 text-ink rounded-lg py-2 disabled:opacity-40"><i class="ph-bold ph-plus"></i> اختيار إجباري (مثل نوع الخبز أو درجة الطهي)</button>`;
    const has = formExtras.some(g => (g.options || []).length);
    document.getElementById('extras-copy-btn').classList.toggle('hidden', !(editingProductId && has));
  }
  function addReqGroup() { if (formExtras.length >= 6) return; formExtras.push({ name: '', required: true, options: [{ name: '', price: '' }, { name: '', price: '' }] }); renderExtras(); const ins = document.querySelectorAll('#extras-list input[aria-label="اسم الاختيار"]'); if (ins.length) ins[ins.length - 1].focus(); }

  // خيار مربوط بصنف في المنيو: الاسم والسعر الحالي من الصنف
  const exLinked = (o) => loadedProducts.find(x => x.id === o.pid);
  const exLinkedName = (o) => (exLinked(o) || o).name;
  const exLinkedPrice = (o) => { const p = exLinked(o); if (!p) return Number(o.price) || 0; return (Array.isArray(p.sizes) && p.sizes.length) ? Math.min(...p.sizes.map(z => Number(z.price) || 0)) : Number(p.price) || 0; };
  // اختيار الإضافات من أصناف المنيو (قسم «الإضافات» أول)
  function pickExFromMenu(gi) {
    const g = formExtras[gi]; if (!g) return;
    const catName = (k) => (loadedCategories.find(c => c.key === k || c.name === k) || {}).name || k;
    const isExCat = (k) => /إضاف|اضاف|صوص|extra|add/i.test(catName(k));
    const list = loadedProducts.filter(x => x.id !== editingProductId);
    const cats = [...new Set(list.map(x => x.category))].sort((a, b) => (isExCat(a) ? 0 : 1) - (isExCat(b) ? 0 : 1));
    const picked = new Set((g.options || []).filter(o => o.pid).map(o => o.pid));
    const box = document.createElement('div');
    box.className = 'fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4';
    box.innerHTML = `<div class="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
      <div class="p-4 border-b border-ink/10"><b class="text-sm text-ink">${g.required ? `اختر خيارات «${esc(g.name || 'الاختيار')}» من المنيو` : 'اختر الإضافات من المنيو'}</b><p class="text-[11px] text-ink mt-1 leading-relaxed">الاسم والسعر يجون من الصنف نفسه: لو غيّرت سعره في المنيو يتغير هنا، ولو صار غير متوفر يختفي من الإضافات. تقدر تخفي قسم الإضافات من المنيو لو ما تبيه يظهر كأطباق.</p></div>
      <div class="p-3 overflow-y-auto space-y-3">${cats.map(c => `<div><p class="text-[11px] font-black text-ink/70 mb-1">${esc(catName(c))}</p>${list.filter(x => x.category === c).map(o => `<label class="flex items-center gap-2 p-2 rounded-lg hover:bg-brand/5 cursor-pointer text-xs"><input type="checkbox" value="${o.id}" ${picked.has(o.id) ? 'checked' : ''} class="accent-green-600"><span class="flex-1 font-bold text-ink">${esc(o.name)}</span><span class="text-[11px] text-ink" dir="ltr">${esc(money(exLinkedPrice({ pid: o.id })))}</span></label>`).join('')}</div>`).join('') || '<p class="text-xs text-ink p-2">ما فيه أصناف في المنيو.</p>'}</div>
      <div class="p-3 border-t border-ink/10 flex gap-2"><button type="button" data-x="go" class="flex-1 bg-brand text-cream font-bold rounded-xl py-2.5 text-sm">تم</button><button type="button" data-x="no" class="flex-1 border border-ink/15 font-bold rounded-xl py-2.5 text-sm">إلغاء</button></div></div>`;
    document.body.appendChild(box);
    box.addEventListener('click', (e) => {
      if (e.target === box || e.target.closest('[data-x="no"]')) return box.remove();
      if (!e.target.closest('[data-x="go"]')) return;
      const ids = [...box.querySelectorAll('input:checked')].map(i => Number(i.value));
      // نشيل الخيارات الفاضية، والمربوطة اللي انشال اختيارها، ونضيف الجديدة
      g.options = (g.options || []).filter(o => o.pid ? ids.includes(o.pid) : String(o.name || '').trim());
      ids.filter(id => !g.options.some(o => o.pid === id)).forEach(id => { const p = loadedProducts.find(x => x.id === id); if (p) g.options.push({ name: p.name, price: exLinkedPrice({ pid: id }), pid: id }); });
      if (g.options.length > 15) { g.options = g.options.slice(0, 15); showToast('الخيارات حدها 15، انضاف أول 15', true); }
      box.remove(); renderExtras();
    });
  }
  function addExGroup() { if (formExtras.length >= 6) return; formExtras.push({ name: '', required: false, options: [{ name: '', price: '' }] }); renderExtras(); const ins = document.querySelectorAll('#extras-list input[type="text"]'); if (ins.length) ins[ins.length - 2 >= 0 ? ins.length - 2 : 0].focus(); }
  function addExOpt(gi) { const g = formExtras[gi]; if (!g || g.options.length >= 15) return showToast('الإضافات حدها 15', true); g.options.push({ name: '', price: '' }); renderExtras(); const r = document.querySelectorAll('#extras-list input[type="text"]'); const target = [...r].find(x => x.getAttribute('oninput') === `formExtras[${gi}].options[${g.options.length - 1}].name=this.value`); if (target) target.focus(); }
  // تتحقق قبل الحفظ، وترجع null لو فيه خطأ (يطلع للمستخدم)
  function cleanFormExtras() {
    const out = [];
    for (const g of formExtras) {
      const name = String(g.name || '').trim() || (!g.required && g === mainExtras() ? 'الإضافات' : '');
      const options = (g.options || []).map(o => o.pid ? { name: exLinkedName(o), price: exLinkedPrice(o), pid: o.pid } : { name: String(o.name || '').trim(), price: o.price === '' || o.price == null ? 0 : parseFloat(o.price) }).filter(o => o.name);
      if (!options.length) { if (g === mainExtras() || !name) continue; showToast(`أضف خيار واحد على الأقل في «${name}»`, true); return null; }
      if (!name) { showToast('اكتب اسم الاختيار الإجباري، مثل: نوع الخبز', true); return null; }
      const bad = options.find(o => isNaN(o.price) || o.price < 0); if (bad) { showToast(`اكتب سعراً صحيحاً لـ «${bad.name}»`, true); return null; }
      out.push({ name, required: !!g.required, options });
    }
    return out;
  }
  // نسخ الإضافات لأطباق ثانية (اللي في نفس القسم أول)
  function openExtrasCopy() {
    const me = loadedProducts.find(x => x.id === editingProductId); if (!me) return;
    const others = loadedProducts.filter(x => x.id !== me.id).sort((a, b) => (a.category === me.category ? 0 : 1) - (b.category === me.category ? 0 : 1));
    const catName = (k) => (loadedCategories.find(c => c.key === k || c.name === k) || {}).name || k;
    const box = document.createElement('div');
    box.className = 'fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4';
    box.innerHTML = `<div class="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col">
      <div class="p-4 border-b border-ink/10"><b class="text-sm text-ink">انسخ إضافات «${esc(me.name)}» إلى:</b><p class="text-[11px] text-ink mt-1">تنحفظ الإضافات الحالية في الطبق أولاً، والأطباق المختارة تنستبدل إضافاتها بهذي.</p></div>
      <div class="p-3 overflow-y-auto space-y-1">${others.map(o => `<label class="flex items-center gap-2 p-2 rounded-lg hover:bg-brand/5 cursor-pointer text-xs"><input type="checkbox" value="${o.id}" ${o.category === me.category ? 'checked' : ''} class="accent-green-600"><span class="flex-1 font-bold text-ink">${esc(o.name)}</span><span class="text-[10.5px] text-ink/70">${esc(catName(o.category))}</span></label>`).join('') || '<p class="text-xs text-ink p-2">ما فيه أطباق ثانية.</p>'}</div>
      <div class="p-3 border-t border-ink/10 flex gap-2"><button type="button" data-x="go" class="flex-1 bg-brand text-cream font-bold rounded-xl py-2.5 text-sm">انسخ</button><button type="button" data-x="no" class="flex-1 border border-ink/15 font-bold rounded-xl py-2.5 text-sm">إلغاء</button></div></div>`;
    document.body.appendChild(box);
    box.addEventListener('click', async (e) => {
      if (e.target === box || e.target.closest('[data-x="no"]')) return box.remove();
      if (!e.target.closest('[data-x="go"]')) return;
      const to = [...box.querySelectorAll('input:checked')].map(i => Number(i.value));
      if (!to.length) return showToast('اختر الأطباق اللي تنسخ لها', true);
      const extras = cleanFormExtras(); if (extras === null) return;
      try {
        await api('product-save', { ...productPayloadForExtras(me), extras, id: me.id });
        const r = await api('extras-copy', { from: me.id, to });
        box.remove(); showToast(`انسخت الإضافات لـ ${r.copied} ${r.copied === 1 ? 'طبق' : 'أطباق'}`); refreshAll();
      } catch (err) { showToast(err.message || 'تعذر النسخ', true); }
    });
  }
  // حفظ الإضافات بس (قبل النسخ) بنفس بيانات الطبق المحفوظة
  const productPayloadForExtras = (p) => ({ name: p.name, category: p.category, price: p.price, sizes: p.sizes || [], description: p.description || '', is_bestseller: !!p.is_bestseller,
    extra_info: p.extra_info || '', note: p.note || '', name_en: p.name_en || null, description_en: p.description_en || null, allergens: p.allergens || null });

  // ─── كوبونات الخصم ───
  let coupons = null, editingCouponId = null;
  const riyadhDay = (ts) => ts ? new Date(Date.parse(ts) + 3 * 3600000).toISOString().slice(0, 10) : '';

  async function openCouponsTab() {
    document.getElementById('coupons-wa-warning').classList.toggle('hidden', client.whatsapp_orders === true || !!client.menu_order_mode);
    renderCouponForm();
    if (coupons) return renderCoupons();
    try { coupons = (await api('coupons')).coupons || []; }
    catch { document.getElementById('coupons-list').innerHTML = '<p class="text-xs text-red-600 text-center py-6">تعذر تحميل الكوبونات</p>'; return; }
    renderCoupons();
  }

  function couponScopeText(c) {
    if (c.scope === 'all') return 'كل الأصناف';
    const cats = loadedCategories.filter(x => (c.category_keys || []).includes(x.key)).map(x => x.name);
    const n = (c.product_ids || []).length;
    return [cats.length ? `أقسام: ${cats.join('، ')}` : '', n ? `${n} ${n === 1 ? 'صنف' : n === 2 ? 'صنفين' : 'أصناف'}` : ''].filter(Boolean).join(' + ');
  }
  function couponState(c) {
    const now = Date.now();
    if (!c.is_active) return ['موقوف', 'bg-ink/10 text-ink'];
    if (c.ends_at && Date.parse(c.ends_at) < now) return ['منتهي', 'bg-red-500/10 text-red-700'];
    if (c.max_uses != null && c.uses >= c.max_uses) return ['استُنفد', 'bg-red-500/10 text-red-700'];
    if (c.starts_at && Date.parse(c.starts_at) > now) return ['لم يبدأ', 'bg-blue-500/10 text-blue-700'];
    return ['فعّال', 'bg-green-500/15 text-green-700'];
  }
  function renderCoupons() {
    document.getElementById('coupons-count').textContent = coupons.length;
    document.getElementById('coupons-list').innerHTML = coupons.length ? coupons.map(c => {
      const [state, cls] = couponState(c);
      const value = c.type === 'percent' ? `${Number(c.value)}%` : money(Number(c.value));
      const dates = [c.starts_at && `من ${riyadhDay(c.starts_at)}`, c.ends_at && `إلى ${riyadhDay(c.ends_at)}`].filter(Boolean).join(' ');
      return `
        <div class="bg-brand/5 border border-brand/15 rounded-xl p-3 space-y-2 ${editingCouponId === c.id ? 'editing-glow' : ''}">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 min-w-0">
              ${c.auto_apply
                ? '<span class="font-black text-xs text-cream bg-brand px-2.5 py-1 rounded-lg"><i class="ph-bold ph-tag"></i> خصم تلقائي</span>'
                : `<span class="font-black text-sm text-ink tracking-wider bg-white border border-dashed border-brand/40 px-2.5 py-1 rounded-lg" dir="ltr">${esc(c.code)}</span>`}
              <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}">${state}</span>
              ${!c.auto_apply && c.show_in_menu ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-800"><i class="ph-bold ph-eye"></i> ظاهر في المنيو</span>' : ''}
            </div>
            <span class="text-sm font-black text-emerald-700">خصم ${esc(value)}</span>
          </div>
          <p class="text-[11px] text-ink">${esc(couponScopeText(c))}${c.min_order != null ? ` · أقل طلب ${esc(money(Number(c.min_order)))}` : ''}</p>
          <p class="text-[11px] text-ink">${c.auto_apply ? 'يظهر على الأصناف في المنيو مباشرة' : `استُخدم ${Number(c.uses)}${c.max_uses != null ? ` من ${Number(c.max_uses)}` : ''} مرة`}${dates ? ` · ${esc(dates)}` : ''}</p>
          <div class="flex gap-1.5">
            <button onclick="editCoupon(${Number(c.id)})" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-white text-ink/90 border-brand/20 hover:bg-brand/10"><i class="ph-bold ph-pencil-simple text-[10px]"></i> تعديل</button>
            <button onclick="toggleCoupon(${Number(c.id)})" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${c.is_active ? 'bg-white text-ink border-brand/20' : 'bg-green-500/15 text-green-700 border-green-500/30'}">${c.is_active ? 'إيقاف' : 'تفعيل'}</button>
            <button onclick="deleteCoupon(${Number(c.id)})" aria-label="حذف" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-red-500/10 text-red-600 border-red-500/20"><i class="ph-bold ph-trash"></i></button>
          </div>
        </div>`;
    }).join('') : '<p class="text-xs text-ink text-center py-6">ما عندك كوبونات للحين. أنشئ أول كوبون من النموذج.</p>';
  }

  // الأقسام والأصناف المختارة في النموذج
  let cpCats = new Set(), cpProducts = new Set();
  const cpAuto = () => document.querySelector('input[name="cp-kind"]:checked').value === 'auto';
  function renderCouponForm() {
    const auto = cpAuto();
    document.getElementById('cp-code-wrap').classList.toggle('hidden', auto);
    document.querySelectorAll('.cp-code-only').forEach(x => x.classList.toggle('hidden', auto));
    const percent = document.getElementById('cp-type').value === 'percent';
    document.getElementById('cp-value-label').textContent = percent ? 'النسبة % *' : `المبلغ (${curSign()}) *`;
    document.getElementById('cp-value').max = percent ? 100 : 100000;
    const selected = document.querySelector('input[name="cp-scope"]:checked').value === 'selected';
    document.getElementById('cp-targets').classList.toggle('hidden', !selected);
    if (!selected) return;
    document.getElementById('cp-cats').innerHTML = loadedCategories.length ? loadedCategories.map(c => `
      <button type="button" onclick="toggleCpCat('${esc(c.key)}')" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition ${cpCats.has(c.key) ? 'bg-brand text-cream border-brand' : 'bg-white text-ink border-brand/20'}">${esc(c.name)}</button>`).join('')
      : '<p class="text-[11px] text-ink">ما فيه أقسام.</p>';
    document.getElementById('cp-products').innerHTML = loadedCategories.map(c => {
      const ps = loadedProducts.filter(p => p.category === c.key || p.category === c.name);
      if (!ps.length) return '';
      return `<div><p class="text-[11px] font-black text-ink mb-1">${esc(c.name)}${cpCats.has(c.key) ? ' <span class="text-emerald-700">(القسم كامل مختار)</span>' : ''}</p>
        ${ps.map(p => `<label class="flex items-center gap-2 text-xs py-0.5 cursor-pointer ${cpCats.has(c.key) ? 'opacity-40' : ''}">
          <input type="checkbox" ${cpProducts.has(p.id) ? 'checked' : ''} onchange="toggleCpProduct(${Number(p.id)}, this.checked)" class="accent-[#384f3d]"> <span class="truncate">${esc(p.name)}</span></label>`).join('')}</div>`;
    }).join('') || '<p class="text-[11px] text-ink">ما فيه أصناف.</p>';
  }
  function toggleCpCat(key) { cpCats.has(key) ? cpCats.delete(key) : cpCats.add(key); renderCouponForm(); }
  function toggleCpProduct(id, on) { on ? cpProducts.add(id) : cpProducts.delete(id); }

  function resetCouponForm() {
    editingCouponId = null;
    document.getElementById('coupon-form').reset();
    cpCats = new Set(); cpProducts = new Set();
    document.getElementById('coupon-form-title').textContent = 'كوبون جديد';
    document.getElementById('cp-cancel').classList.add('hidden');
    renderCouponForm();
    if (coupons) renderCoupons();
  }
  function editCoupon(id) {
    const c = coupons.find(x => x.id === id); if (!c) return;
    editingCouponId = id;
    document.querySelector(`input[name="cp-kind"][value="${c.auto_apply ? 'auto' : 'code'}"]`).checked = true;
    document.getElementById('cp-code').value = c.auto_apply ? '' : c.code;
    document.getElementById('cp-show').checked = c.show_in_menu === true;
    document.getElementById('cp-type').value = c.type;
    document.getElementById('cp-value').value = Number(c.value);
    document.querySelector(`input[name="cp-scope"][value="${c.scope}"]`).checked = true;
    cpCats = new Set(c.category_keys || []); cpProducts = new Set((c.product_ids || []).map(Number));
    document.getElementById('cp-min').value = c.min_order != null ? Number(c.min_order) : '';
    document.getElementById('cp-max').value = c.max_uses != null ? c.max_uses : '';
    document.getElementById('cp-start').value = riyadhDay(c.starts_at);
    document.getElementById('cp-end').value = riyadhDay(c.ends_at);
    document.getElementById('cp-active').checked = c.is_active;
    document.getElementById('coupon-form-title').textContent = c.auto_apply ? 'تعديل: خصم تلقائي' : `تعديل: ${c.code}`;
    document.getElementById('cp-cancel').classList.remove('hidden');
    renderCouponForm(); renderCoupons();
    document.getElementById('coupon-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('coupon-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id) => document.getElementById(id).value.trim();
    const code = v('cp-code'), type = v('cp-type'), value = parseFloat(v('cp-value'));
    const scope = document.querySelector('input[name="cp-scope"]:checked').value;
    const auto = cpAuto();
    if (!auto && !/^[A-Z0-9-]{3,20}$/.test(code)) return showToast('رمز الكوبون من 3 إلى 20 حرف: حروف إنجليزية وأرقام وشرطة', true);
    if (!auto && code.startsWith('AUTO-')) return showToast('الرموز اللي تبدأ بـ AUTO- محجوزة', true);
    if (isNaN(value) || value <= 0 || (type === 'percent' && value > 100)) return showToast(type === 'percent' ? 'النسبة من 1 إلى 100' : 'اكتب مبلغ خصم صحيح', true);
    if (scope === 'selected' && !cpCats.size && !cpProducts.size) return showToast('اختر قسم أو صنف واحد على الأقل', true);
    if (v('cp-start') && v('cp-end') && v('cp-end') < v('cp-start')) return showToast('تاريخ النهاية قبل تاريخ البداية', true);
    const btn = document.getElementById('cp-submit');
    btn.disabled = true;
    try {
      const res = await api('coupon-save', {
        id: editingCouponId, code: auto ? (coupons.find(x => x.id === editingCouponId) || {}).code : code, type, value, scope,
        auto_apply: auto, show_in_menu: document.getElementById('cp-show').checked,
        category_keys: [...cpCats], product_ids: [...cpProducts],
        min_order: v('cp-min') || null, max_uses: v('cp-max') || null,
        starts_at: v('cp-start') || null, ends_at: v('cp-end') || null,
        is_active: document.getElementById('cp-active').checked
      });
      const i = coupons.findIndex(x => x.id === res.coupon.id);
      if (i >= 0) coupons[i] = res.coupon; else coupons.unshift(res.coupon);
      showToast(editingCouponId ? 'تم حفظ العرض' : res.coupon.auto_apply ? 'تم إنشاء الخصم التلقائي، ويظهر في المنيو' : `تم إنشاء الكوبون ${res.coupon.code}`);
      resetCouponForm();
    } catch { showToast('تعذر حفظ الكوبون', true); }
    finally { btn.disabled = false; }
  });

  async function toggleCoupon(id) {
    const c = coupons.find(x => x.id === id); if (!c) return;
    try {
      const res = await api('coupon-toggle', { id, value: !c.is_active });
      Object.assign(c, res.coupon);
      renderCoupons();
      showToast(c.is_active ? 'تم تفعيل الكوبون' : 'تم إيقاف الكوبون');
    } catch { showToast('تعذر تحديث الكوبون', true); }
  }
  function deleteCoupon(id) {
    const c = coupons.find(x => x.id === id); if (!c) return;
    openDeleteModal('حذف الكوبون', `هل أنت متأكد من حذف الكوبون "${c.code}"؟`, async () => {
      try { await api('coupon-delete', { id }); }
      catch { return showToast('تعذر حذف الكوبون', true); }
      coupons = coupons.filter(x => x.id !== id);
      if (editingCouponId === id) resetCouponForm(); else renderCoupons();
      showToast('تم حذف الكوبون');
    });
  }

  // ─── إضافة وتعديل الأطباق ───
  function startEdit(id) {
    const p = loadedProducts.find(x => x.id === id);
    if (!p) return;
    editingProductId = id;
    document.getElementById('prod-name').value = p.name || '';
    document.getElementById('prod-price').value = p.price ?? '';
    formSizes = (Array.isArray(p.sizes) ? p.sizes : []).map(z => ({ ...z }));
    renderSizes();
    formExtras = (Array.isArray(p.extras) ? p.extras : []).map(g => ({ ...g, options: (g.options || []).map(o => ({ ...o })) }));
    renderExtras();
    document.getElementById('prod-desc').value = p.description || '';
    document.getElementById('prod-extra').value = p.extra_info || '';
    document.getElementById('prod-note').value = p.note || '';
    document.getElementById('prod-calories').value = p.calories ?? '';
    document.getElementById('prod-name-en').value = p.name_en || '';
    document.getElementById('prod-desc-en').value = p.description_en || '';
    setAllergens(p.allergens);
    setCoffee(p.coffee);
    document.getElementById('prod-bestseller').checked = p.is_bestseller === true;
    const cat = categoryOf(p);
    if (cat) document.getElementById('prod-category').value = cat.key;
    document.getElementById('prod-image-file').value = '';
    document.getElementById('image-hint').textContent = p.image_url ? '(اتركها فارغة للإبقاء على الصورة الحالية)' : '';
    document.getElementById('img-ratio-warn').classList.add('hidden');
    setDishImagePreview(p.image_url || null, p.image_url ? 'الصورة الحالية (اضغط لتغييرها)' : null);
    document.getElementById('form-title').textContent = `تعديل: ${p.name}`;
    document.getElementById('form-icon').className = 'ph-bold ph-pencil-simple text-amber-600';
    document.getElementById('submit-btn').textContent = 'حفظ التعديلات';
    document.getElementById('cancel-edit-btn').classList.remove('hidden');
    renderAlsoBranches();
    showPage('menu');
    switchTab('products');
    document.getElementById('add-product-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
    filterProducts();
  }

  function renderAlsoBranches() {
    const others = branches.filter(b => b.id !== client.id);
    const on = others.length > 0 && !editingProductId;
    document.getElementById('also-branches').classList.toggle('hidden', !on);
    document.getElementById('also-branches-list').innerHTML = others.map(b => `
      <label class="flex items-center gap-1.5 bg-white border border-brand/15 rounded-lg px-2.5 py-1.5 text-[11px] font-bold cursor-pointer">
        <input type="checkbox" value="${Number(b.id)}" checked class="accent-[#384f3d]"> ${esc(b.name || b.client_slug)}</label>`).join('');
    document.getElementById('linked-note').classList.toggle('hidden', others.length === 0);
  }

  function cancelEdit() {
    editingProductId = null;
    document.getElementById('add-product-form').reset();
    setDishImagePreview(null);
    setCoffee(null);
    formSizes = [];
    renderSizes();
    formExtras = [];
    renderExtras();
    document.getElementById('image-hint').textContent = '';
    document.getElementById('img-ratio-warn').classList.add('hidden');
    document.getElementById('form-title').textContent = 'إضافة طبق أو منتج جديد';
    document.getElementById('form-icon').className = 'ph-bold ph-plus text-ink';
    document.getElementById('submit-btn').textContent = 'حفظ وإضافة الطبق';
    document.getElementById('cancel-edit-btn').classList.add('hidden');
    renderAlsoBranches();
    filterProducts();
  }

  document.getElementById('add-product-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('prod-name').value.trim();
    const category = document.getElementById('prod-category').value;
    const price = parseFloat(document.getElementById('prod-price').value);
    const description = document.getElementById('prod-desc').value.trim();
    const caloriesRaw = document.getElementById('prod-calories').value.trim();
    const calories = caloriesRaw === '' ? null : Math.round(Number(caloriesRaw));
    const is_bestseller = document.getElementById('prod-bestseller').checked;
    const imageFile = document.getElementById('prod-image-file').files[0];

    if (!name) return showToast('اكتب اسم الطبق', true);
    if (!category) return showToast('أضف قسماً أولاً من تبويب الأقسام', true);
    const sizes = formSizes.map(z => ({ name: String(z.name || '').trim(), name_en: String(z.name_en || '').trim(), price: parseFloat(z.price) }));
    if (sizes.length) {
      if (sizes.some(z => !z.name)) return showToast('اكتب اسم كل حجم', true);
      if (new Set(sizes.map(z => z.name)).size !== sizes.length) return showToast('فيه حجم مكرر', true);
      const bad = sizes.find(z => isNaN(z.price) || z.price < 0);
      if (bad) return showToast(`اكتب سعراً صحيحاً للحجم "${bad.name}"`, true);
    } else if (isNaN(price) || price < 0) return showToast('اكتب سعراً صحيحاً', true);
    if (showCalories() && calories !== null && (isNaN(calories) || calories < 0 || calories > 10000)) return showToast('اكتب عدد سعرات صحيح', true);
    const extras = cleanFormExtras(); if (extras === null) return;

    const btn = document.getElementById('submit-btn');
    btn.disabled = true;
    try {
      const payload = {
        name, category, price: sizes.length ? Math.min(...sizes.map(z => z.price)) : price, sizes, description, is_bestseller,
        extra_info: document.getElementById('prod-extra').value.trim(),
        note: document.getElementById('prod-note').value.trim(),
        name_en: document.getElementById('prod-name-en').value.trim() || null,
        description_en: document.getElementById('prod-desc-en').value.trim() || null,
        allergens: getAllergens() || null,
        extras
      };
      if (allowsCoffee()) payload.coffee = getCoffee();
      if (showCalories()) payload.calories = calories;
      if (imageFile) {
        const problem = validateFile(imageFile, 'image');
        if (problem) return showToast(problem, true);
        showToast('جاري تجهيز صورة الطبق ورفعها...');
        const url = await uploadFile(imageFile, 'prod', 1200);
        if (!url) return showToast(`فشل رفع الصورة: ${lastUploadError}`, true);
        payload.image_url = url;
      }

      // الخادم يتحقق من القسم والصورة ويحدد الترتيب بنفسه
      if (!editingProductId) payload.also_branch_ids = [...document.querySelectorAll('#also-branches-list input:checked')].map(x => Number(x.value));
      let res;
      try { res = await api('product-save', { ...payload, id: editingProductId }); }
      catch (e) { console.error(e); return showToast(lastApiError || 'تعذر حفظ الطبق', true); }

      const n = (res && res.copied_to || []).length, synced = (res && res.synced) || 0;
      const where = (k) => k === 1 ? 'فرع ثاني' : `${k} فروع`;
      showToast(editingProductId
        ? (synced ? `تم حفظ التعديلات هنا وفي ${where(synced)} (السعر لهذا الفرع فقط)` : 'تم حفظ التعديلات')
        : n ? `تمت إضافة الطبق هنا وفي ${where(n)}` : 'تمت إضافة الطبق');
      cancelEdit();
      refreshAll();
    } finally {
      btn.disabled = false;
    }
  });

