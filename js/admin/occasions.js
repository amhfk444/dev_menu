// =====================================================================
// DEV MENU — لوحة التحكم: المناسبات والزينة
// (ملفات js/admin/ تتحمّل بالترتيب، وتتشارك نفس المتغيرات العامة)
// =====================================================================
  // ─── المناسبات والزينة ───
  // كل فرع له مناسباته. copy_to (مؤقت) = الفروع اللي ننسخ لها المناسبة عند الحفظ
  const multiBranch = () => branches.length > 1;
  function familyOccasions() {
    return (Array.isArray(client.occasions) ? client.occasions : []).map(o => ({ ...o, stickers: (o.stickers || []).map(k => ({ ...k })), copy_to: [] }));
  }
  const branchName = (id) => { const b = branches.find(x => x.id === id); return b ? (b.name || b.client_slug) : ''; };

  const MAX_OCCASIONS = 20, MAX_STICKERS = 6;
  let occasions = [], occEditing = -1;
  const occDraft = () => occasions[occEditing];
  const todayRiyadh = () => new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
  const newId = () => (Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 12);
  const HIJRI_PRESETS = ['ramadan', 'eid_fitr', 'eid_adha', 'hijri_new_year'];

  function occState(o) {
    const t = todayRiyadh();
    if (!o.enabled) return ['موقوفة', 'bg-ink/10 text-ink'];
    if (!o.starts_on || !o.ends_on) return ['بدون تاريخ', 'bg-amber-500/15 text-amber-800'];
    if (o.ends_on < t) return ['انتهت', 'bg-ink/10 text-ink'];
    if (o.starts_on > t) { const d = Math.round((Date.parse(o.starts_on) - Date.parse(t)) / 86400000); return [`قادمة · تبدأ بعد ${d === 1 ? 'يوم' : d === 2 ? 'يومين' : `${d} يوم`}`, 'bg-blue-500/10 text-blue-700']; }
    return ['تظهر الحين', 'bg-green-500/15 text-green-700'];
  }
  function renderOccasions() {
    document.getElementById('occ-presets').innerHTML = Object.entries(DMOccasions.PRESETS).map(([key, p]) => `
      <button type="button" onclick="addOccasion('${key}')" class="flex items-center gap-2 p-2.5 rounded-xl border bg-white border-brand/15 hover:border-brand/40 hover:bg-brand/5 text-[11px] font-bold text-ink transition text-right">
        <span class="text-base">${p.icon}</span><span class="truncate">${esc(p.name)}</span><i class="ph-bold ph-plus text-[10px] text-ink mr-auto"></i>
      </button>`).join('');
    renderOccasionList();
  }
  function renderOccasionList() {
    document.getElementById('occ-list').innerHTML = occasions.length ? occasions.map((o, i) => {
      const p = DMOccasions.PRESETS[o.preset] || DMOccasions.PRESETS.custom;
      const [state, cls] = occState(o);
      return `
        <div class="flex flex-wrap items-center gap-2 bg-white border ${i === occEditing ? 'border-brand ring-2 ring-brand/15' : 'border-brand/15'} rounded-xl p-2.5">
          <span class="text-lg">${p.icon}</span>
          <div class="min-w-0 flex-1">
            <p class="text-xs font-black text-ink truncate">${esc(o.title || p.name)}</p>
            <p class="text-[11px] text-ink" dir="ltr" style="text-align:right">${esc(o.starts_on || '—')} → ${esc(o.ends_on || '—')}${o.stickers && o.stickers.length ? ` · ${o.stickers.length} 🖼️` : ''}</p>
            ${o.copy_to && o.copy_to.length ? `<p class="text-[11px] font-bold text-emerald-700 truncate"><i class="ph-bold ph-copy"></i> تنسخ عند الحفظ إلى: ${o.copy_to.map(branchName).map(esc).join('، ')}</p>` : ''}
          </div>
          <span class="text-[11px] font-bold px-2 py-0.5 rounded-full ${cls}">${state}</span>
          <div class="flex gap-1">
            <button type="button" onclick="editOccasion(${i})" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border bg-brand/5 text-ink/90 border-brand/20 hover:bg-brand/10"><i class="ph-bold ph-pencil-simple text-[10px]"></i> تعديل</button>
            <button type="button" onclick="occasions[${i}].enabled=!occasions[${i}].enabled; renderOccasionList()" class="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border ${o.enabled ? 'bg-white text-ink border-brand/20' : 'bg-green-500/15 text-green-700 border-green-500/30'}">${o.enabled ? 'إيقاف' : 'تفعيل'}</button>
            <button type="button" onclick="removeOccasion(${i})" aria-label="حذف" class="px-2.5 py-1.5 rounded-lg text-[11px] border bg-red-500/10 text-red-600 border-red-500/20"><i class="ph-bold ph-trash"></i></button>
          </div>
        </div>`;
    }).join('') : '<p class="text-[11px] text-ink text-center py-2">ما أضفت أي مناسبة. اختر من الأعلى، ونقترح لك التواريخ.</p>';
  }
  function addOccasion(preset) {
    if (occasions.length >= MAX_OCCASIONS) return showToast(`المناسبات حدها ${MAX_OCCASIONS}، احذف القديمة`, true);
    const p = DMOccasions.PRESETS[preset];
    const d = DMOccasions.suggestDates(preset);
    occasions.push({ id: newId(), preset, title: preset === 'custom' ? '' : p.name, greeting: '', starts_on: d.start, ends_on: d.end, enabled: true, stickers: [], copy_to: [] });
    editOccasion(occasions.length - 1);
    if (preset === 'custom') document.getElementById('occ-title').focus();
  }
  function removeOccasion(i) {
    occasions.splice(i, 1);
    if (occEditing === i) closeOccasionEditor(); else { if (occEditing > i) occEditing--; renderOccasionList(); }
  }
  function editOccasion(i) {
    occEditing = i;
    const o = occDraft(), p = DMOccasions.PRESETS[o.preset];
    document.getElementById('occ-editor').classList.remove('hidden');
    document.getElementById('occ-editor-title').textContent = `${p.icon} ${p.name}`;
    document.getElementById('occ-title').value = o.title || '';
    document.getElementById('occ-greeting').value = o.greeting || '';
    document.getElementById('occ-greeting').placeholder = p.greet[0] || 'مثال: خصم 20% بمناسبة افتتاح فرعنا';
    document.getElementById('occ-start').value = o.starts_on || '';
    document.getElementById('occ-end').value = o.ends_on || '';
    document.getElementById('occ-date-hint').classList.toggle('hidden', !HIJRI_PRESETS.includes(o.preset));
    renderOccasionBranches();
    renderOccasionList();
    renderStickerRows();
    renderOccasionPreview();
    document.getElementById('occ-editor').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
  function renderOccasionBranches() {
    const o = occDraft(); if (!o) return;
    const others = branches.filter(b => b.id !== client.id);
    document.getElementById('occ-branches-wrap').classList.toggle('hidden', !others.length);
    document.getElementById('occ-branches').innerHTML = others.map(b => `
      <label class="flex items-center gap-1.5 bg-white border border-brand/15 rounded-lg px-2.5 py-1.5 text-[11px] font-bold cursor-pointer">
        <input type="checkbox" ${o.copy_to.includes(b.id) ? 'checked' : ''} onchange="toggleOccasionCopy(${Number(b.id)}, this.checked)" class="accent-[#384f3d]"> ${esc(b.name || b.client_slug)}</label>`).join('');
  }
  function toggleOccasionCopy(id, on) {
    const o = occDraft(); if (!o) return;
    o.copy_to = on ? [...new Set([...o.copy_to, id])] : o.copy_to.filter(x => x !== id);
    renderOccasionList();
  }
  // يبدأ اليوم، ويحافظ على المدة (أو أسبوع لو التاريخ القديم انتهى)
  function startOccasionToday() {
    const o = occDraft(); if (!o) return;
    const t = todayRiyadh();
    const span = o.starts_on && o.ends_on ? Math.max(0, Math.round((Date.parse(o.ends_on) - Date.parse(o.starts_on)) / 86400000)) : 7;
    o.starts_on = t;
    o.ends_on = new Date(Date.parse(t) + span * 86400000).toISOString().slice(0, 10);
    document.getElementById('occ-start').value = o.starts_on;
    document.getElementById('occ-end').value = o.ends_on;
    renderOccasionList();
    showToast('صارت تبدأ من اليوم، اضغط "حفظ المناسبات"');
  }

  function closeOccasionEditor() {
    occEditing = -1;
    document.getElementById('occ-editor').classList.add('hidden');
    DMOccasions.clear(document.getElementById('occ-preview-header'), document.getElementById('occ-preview-greet'), document.getElementById('occ-preview'));
    renderOccasionList();
  }
  function renderStickerRows() {
    const o = occDraft(); if (!o) return;
    const opts = (map, v) => Object.entries(map).map(([k, t]) => `<option value="${k}" ${k === v ? 'selected' : ''}>${t}</option>`).join('');
    document.getElementById('occ-stickers').innerHTML = o.stickers.length ? o.stickers.map((k, i) => `
      <div class="flex flex-wrap items-center gap-1.5 bg-white border border-brand/15 rounded-xl p-2">
        ${k.lib && DMOccasions.LIBRARY[k.lib] ? `<span class="w-10 h-10 rounded-lg bg-checker p-1 grid place-items-center [&>svg]:w-full [&>svg]:h-full" title="${esc(DMOccasions.LIBRARY[k.lib].name)}">${DMOccasions.LIBRARY[k.lib].svg}</span>` : `<img src="${esc(safeUrl(k.url))}" alt="" class="w-10 h-10 object-contain rounded-lg bg-checker">`}
        <button type="button" ${k.lib ? 'hidden' : ''} onclick="cutExistingSticker(${i})" title="إزالة الخلفية" class="text-[11px] font-bold bg-brand/10 border border-brand/45 hover:bg-brand/10 text-ink px-2 h-9 rounded-lg"><i class="ph-bold ph-scissors"></i> إزالة الخلفية</button>
        <select onchange="occDraft().stickers[${i}].position=this.value; renderOccasionPreview()" class="input-pro !py-1.5 text-[11px] !w-auto flex-1 min-w-[110px] bg-cream">${opts(DMOccasions.POSITIONS, k.position)}</select>
        <select onchange="occDraft().stickers[${i}].size=this.value; renderOccasionPreview()" class="input-pro !py-1.5 text-[11px] !w-auto bg-cream">${opts(DMOccasions.SIZES, k.size)}</select>
        <select onchange="occDraft().stickers[${i}].animation=this.value; renderOccasionPreview()" class="input-pro !py-1.5 text-[11px] !w-auto bg-cream">${opts(DMOccasions.ANIMS, k.animation)}</select>
        <button type="button" onclick="occDraft().stickers.splice(${i}, 1); renderStickerRows(); renderOccasionPreview(); renderOccasionList()" aria-label="حذف الملصق" class="w-9 h-9 rounded-lg bg-red-500/10 text-red-600 border border-red-500/20"><i class="ph-bold ph-x"></i></button>
      </div>`).join('') : '<p class="text-[11px] text-ink">اختياري: اختر من مكتبتنا تحت، أو ارفع شخصية منشأتك أو أي ملصق، والمنصة تحرّكه.</p>';
    document.getElementById('occ-upload-btn').classList.toggle('hidden', o.stickers.length >= MAX_STICKERS);
    renderStickerLibrary();
  }
  // أول مكان فاضي للملصق الجديد
  function nextStickerSpot(o) {
    const taken = new Set(o.stickers.map(k => k.position));
    return ['logo-right', 'logo-left', 'under-right', 'under-left', 'float'].find(p => !taken.has(p)) || 'float';
  }
  // مكتبة الملصقات الجاهزة: ملصقات المناسبة المختارة أول، وبعدها الباقي
  function renderStickerLibrary() {
    const o = occDraft(), box = document.getElementById('occ-library'); if (!o || !box) return;
    const lib = Object.entries(DMOccasions.LIBRARY).sort(([, a], [, b]) => (b.group === o.preset) - (a.group === o.preset));
    const full = o.stickers.length >= MAX_STICKERS;
    box.innerHTML = lib.map(([key, it]) => `<button type="button" ${full ? 'disabled' : ''} onclick="addLibrarySticker('${key}')" title="${esc(it.name)}"
        class="flex flex-col items-center gap-1 rounded-xl border border-brand/15 bg-white hover:border-brand/50 p-1.5 disabled:opacity-40 transition">
        <span class="w-10 h-10 grid place-items-center [&>svg]:w-full [&>svg]:h-full">${it.svg}</span><span class="text-[10px] font-bold text-ink leading-tight">${esc(it.name)}</span></button>`).join('');
  }
  function addLibrarySticker(key) {
    const o = occDraft(), it = DMOccasions.LIBRARY[key]; if (!o || !it) return;
    if (o.stickers.length >= MAX_STICKERS) return showToast(`الملصقات حدها ${MAX_STICKERS}`, true);
    o.stickers.push({ lib: key, position: nextStickerSpot(o), size: 'm', animation: it.anim || 'float' });
    renderStickerRows(); renderOccasionPreview(); renderOccasionList();
  }
  async function uploadSticker(input) {
    const file = input.files[0]; input.value = '';
    const o = occDraft(); if (!file || !o) return;
    if (!/^image\/(png|webp|gif|jpeg)$/.test(file.type)) return showToast('الملصق لازم يكون صورة PNG أو JPG أو WebP أو GIF', true);
    if (file.size > 8 * 1024 * 1024) return showToast('حجم الملصق كبير، الحد 8 ميجا', true);
    if (file.type === 'image/gif' && file.size > 2 * 1024 * 1024) return showToast('ملف GIF لازم يكون أقل من 2 ميجا', true);
    // GIF المتحرك يترفع كما هو (إزالة الخلفية تخرب الحركة)، والصورة الشفافة أصلاً ما تحتاج
    let final = file;
    if (file.type !== 'image/gif' && !(await hasTransparency(file))) {
      final = await chooseBackground(file);
      if (!final) return;
    }
    const url = await uploadStickerFile(final);
    if (!url) return;
    o.stickers.push({ url, position: nextStickerSpot(o), size: 'm', animation: 'float' });
    renderStickerRows(); renderOccasionPreview(); renderOccasionList();
    showToast('تم رفع الملصق، لا تنسَ "حفظ المناسبات"');
  }
  async function uploadStickerFile(file) {
    showToast('جاري رفع الملصق...');
    const url = await uploadFile(file, 'sticker', 600);
    if (!url) showToast(`فشل رفع الملصق: ${lastUploadError}`, true);
    return url;
  }
  // ملصق مرفوع سابقاً: نشيل خلفيته ونستبدله
  async function cutExistingSticker(i) {
    const o = occDraft(); const k = o && o.stickers[i]; if (!k) return;
    let blob;
    try { blob = await (await fetch(safeUrl(k.url))).blob(); } catch { return showToast('تعذر تحميل الملصق', true); }
    const file = new File([blob], 'sticker', { type: blob.type || 'image/png' });
    if (file.type === 'image/gif') return showToast('ملفات GIF المتحركة ما نشيل خلفيتها حتى ما تخرب الحركة', true);
    const final = await chooseBackground(file, { skipIfSame: true });
    if (!final || final === file) return;
    const url = await uploadStickerFile(final);
    if (!url) return;
    k.url = url;
    renderStickerRows(); renderOccasionPreview();
    showToast('تم، لا تنسَ "حفظ المناسبات"');
  }

