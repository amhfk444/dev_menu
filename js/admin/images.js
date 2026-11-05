// =====================================================================
// DEV MENU — لوحة التحكم: الصور: قص صورة الطبق، وإزالة الخلفية بالذكاء داخل المتصفح
// (ملفات js/admin/ تتحمّل بالترتيب، وتتشارك نفس المتغيرات العامة)
// =====================================================================
  // ─── قص صورة الطبق 4:3 ───
  // الإطار ثابت (نفس شكل صورة الطبق في المنيو)، والصورة تتحرك تحته وتتكبر. أقل تكبير يغطي الإطار كامل
  const crop = { img: null, base: 1, zoom: 1, x: 0, y: 0, done: null };
  function cropLayout() {
    const st = document.getElementById('crop-stage'), W = st.clientWidth, H = st.clientHeight, im = crop.img;
    const sc = crop.base * crop.zoom, w = im.naturalWidth * sc, h = im.naturalHeight * sc;
    crop.x = Math.min(0, Math.max(W - w, crop.x)); crop.y = Math.min(0, Math.max(H - h, crop.y));
    im.style.transform = `translate(${crop.x}px, ${crop.y}px) scale(${sc})`;
  }
  function openCropper(src, done) {
    const im = document.getElementById('crop-img'), modal = document.getElementById('crop-modal');
    crop.done = done; crop.zoom = 1; document.getElementById('crop-zoom').value = 1;
    modal.classList.replace('hidden', 'flex');
    im.crossOrigin = /^blob:|^data:/.test(src) ? null : 'anonymous';
    im.onload = () => {
      const st = document.getElementById('crop-stage'), W = st.clientWidth, H = st.clientHeight;
      im.style.width = `${im.naturalWidth}px`; im.style.height = `${im.naturalHeight}px`;
      crop.img = im; crop.base = Math.max(W / im.naturalWidth, H / im.naturalHeight);
      crop.x = (W - im.naturalWidth * crop.base) / 2; crop.y = (H - im.naturalHeight * crop.base) / 2;
      cropLayout();
    };
    im.onerror = () => { closeCropper(); showToast('تعذر فتح الصورة، ارفعها من جديد', true); };
    // نسخة جديدة بإذن CORS (النسخة المحفوظة في المتصفح بدون إذن تمنع حفظ القص)
    im.src = im.crossOrigin ? `${src}${src.includes('?') ? '&' : '?'}crop=1` : src;
  }
  function closeCropper() { document.getElementById('crop-modal').classList.replace('flex', 'hidden'); crop.done = null; }
  (() => {
    const st = document.getElementById('crop-stage');
    let drag = null;
    st.addEventListener('pointerdown', (e) => { if (!crop.img) return; drag = { x: e.clientX - crop.x, y: e.clientY - crop.y }; st.setPointerCapture(e.pointerId); st.style.cursor = 'grabbing'; });
    st.addEventListener('pointermove', (e) => { if (!drag) return; crop.x = e.clientX - drag.x; crop.y = e.clientY - drag.y; cropLayout(); });
    const end = () => { drag = null; st.style.cursor = ''; };
    st.addEventListener('pointerup', end); st.addEventListener('pointercancel', end);
    // التكبير من نص الإطار
    const zoomTo = (z) => {
      const W = st.clientWidth, H = st.clientHeight, old = crop.base * crop.zoom;
      crop.zoom = Math.min(3, Math.max(1, z));
      const sc = crop.base * crop.zoom;
      crop.x = W / 2 - (W / 2 - crop.x) * sc / old; crop.y = H / 2 - (H / 2 - crop.y) * sc / old;
      document.getElementById('crop-zoom').value = crop.zoom; cropLayout();
    };
    document.getElementById('crop-zoom').addEventListener('input', (e) => crop.img && zoomTo(Number(e.target.value)));
    st.addEventListener('wheel', (e) => { if (!crop.img) return; e.preventDefault(); zoomTo(crop.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08)); }, { passive: false });
    document.getElementById('crop-cancel').onclick = closeCropper;
    document.getElementById('crop-save').onclick = () => {
      const im = crop.img, sc = crop.base * crop.zoom;
      const W = st.clientWidth, H = st.clientHeight;
      const sx = -crop.x / sc, sy = -crop.y / sc, sw = W / sc, sh = H / sc;
      const out = document.createElement('canvas'); out.width = Math.min(1200, Math.round(sw)); out.height = Math.round(out.width * 3 / 4);
      out.getContext('2d').drawImage(im, sx, sy, sw, sh, 0, 0, out.width, out.height);
      const fn = crop.done;
      closeCropper();
      try {
        out.toBlob((blob) => { if (blob && fn) fn(blob); else showToast('تعذر قص الصورة', true); }, 'image/jpeg', 0.88);
      } catch { showToast('تعذر قص هذه الصورة، ارفعها من جديد وقصّها', true); }
    };
  })();

  // أطباق صورها مو 4:3: نقيس الصور مرة وحدة لكل رابط، ونعرضها فوق قائمة الأطباق مع زر القص
  const photoRatio = new Map();
  function checkPhotoRatios() {
    const box = document.getElementById('crop-needed');
    if (!box) return;
    const withImg = loadedProducts.filter(p => p.image_url);
    const pending = withImg.filter(p => !photoRatio.has(p.image_url));
    pending.forEach(p => {
      photoRatio.set(p.image_url, null);
      const im = new Image();
      im.onload = () => { photoRatio.set(p.image_url, im.naturalWidth / im.naturalHeight); checkPhotoRatios(); };
      im.src = p.image_url;
    });
    const bad = withImg.filter(p => { const r = photoRatio.get(p.image_url); return r && (r < 1.2 || r > 1.5); });
    box.classList.toggle('hidden', !bad.length);
    if (!bad.length) return;
    document.getElementById('crop-needed-title').textContent = bad.length === 1 ? 'طبق واحد صورته تحتاج قص' : `${bad.length} أطباق صورها تحتاج قص`;
    document.getElementById('crop-needed-list').innerHTML = bad.slice(0, 30).map(p => `
      <div class="flex items-center gap-3 bg-brand/5 border border-brand/15 rounded-xl px-3 py-2">
        <img src="${esc(safeUrl(p.image_url))}" alt="" class="w-11 h-11 rounded-lg object-cover shrink-0">
        <p class="min-w-0 flex-1 text-[13px] font-bold text-ink truncate">${esc(p.name)}</p>
        <button type="button" data-crop="${Number(p.id)}" class="text-xs bg-brand text-cream font-bold px-3.5 py-2 rounded-xl transition hover:bg-brand-dark flex items-center gap-1.5"><i class="ph-bold ph-crop"></i> قصّ</button>
      </div>`).join('');
  }
  document.getElementById('crop-needed-list').addEventListener('click', (e) => {
    const b = e.target.closest('[data-crop]'); if (!b) return;
    const p = loadedProducts.find(x => x.id === Number(b.dataset.crop)); if (!p) return;
    openCropper(p.image_url, async (blob) => {
      showToast('جاري حفظ الصورة...');
      const url = await uploadFile(new File([blob], 'dish-4x3.jpg', { type: 'image/jpeg' }), 'prod', 1200);
      if (!url) return showToast(`فشل رفع الصورة: ${lastUploadError}`, true);
      try { await api('product-image', { id: p.id, image_url: url }); }
      catch { return showToast('تعذر حفظ الصورة', true); }
      photoRatio.set(url, 4 / 3);
      showToast('تم قص الصورة، وتظهر الآن كاملة في المنيو');
      refreshAll();
    });
  });

  async function compressImage(file, maxDim = 1600, quality = 0.82) {
    if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
      const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
      const canvas = document.createElement('canvas');
      canvas.width = w; canvas.height = h;
      canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
      if (bmp.close) bmp.close();
      const blob = await new Promise(r => canvas.toBlob(r, 'image/webp', quality));
      if (!blob || blob.type !== 'image/webp') return file;
      if (scale === 1 && blob.size >= file.size) return file;
      return new File([blob], file.name.replace(/\.[^.]+$/, '') + '.webp', { type: 'image/webp' });
    } catch (e) {
      console.warn('Image compression skipped:', e);
      return file;
    }
  }

  function uploadErrorText(err) {
    const m = (err && err.message) || String(err || '');
    if (/mime type/i.test(m)) return 'صيغة الملف غير مدعومة، استخدم JPG أو PNG أو MP4';
    if (/exceed|too large|maximum allowed size/i.test(m)) return 'حجم الملف أكبر من المسموح';
    if (/row-level security|policy|unauthori/i.test(m)) return 'لا تملك صلاحية الرفع لهذا المتجر';
    if (/failed to fetch|network|load failed|timeout/i.test(m)) return 'انقطع الاتصال أثناء الرفع. تأكد من الإنترنت وجرّب مرة ثانية';
    return m;
  }

  // الملفات تنحفظ داخل مجلد رقم المتجر: menu-images/<id>/...
  function progressToast(label) {
    let last = -1;
    return (pct) => {
      if (pct === last || (pct < 100 && pct - last < 5)) return;
      last = pct;
      showToast(`${label} ${pct}%`);
    };
  }

  // الخادم يعطي رابط رفع موقّع لملف واحد داخل مجلد المتجر، والملف يروح مباشرة للتخزين
  async function uploadFile(file, prefix, maxDim = 1600, onProgress = null) {
    if (file.type.startsWith('image/')) {
      file = await compressImage(file, maxDim);
      if (file.size > MAX_IMAGE_MB * 1024 * 1024) {
        lastUploadError = `الصورة كبيرة حتى بعد الضغط، الحد الأقصى ${MAX_IMAGE_MB} ميجابايت`;
        return null;
      }
    }
    try {
      const { upload_url, public_url } = await api('upload-url', { kind: prefix, type: file.type, size: file.size });
      lastApiError = '';
      if (onProgress) onProgress(0);   // الملف جاهز وبدأ الرفع
      await DM.putFile(upload_url, file, onProgress || progressToast(file.type.startsWith('video/') ? 'جاري رفع الفيديو...' : 'جاري الرفع...'));
      return public_url;
    } catch (error) {
      console.error('Upload error:', error, { size: file.size, type: file.type });
      lastApiError = '';
      lastUploadError = uploadErrorText(error);
      return null;
    }
  }

  // الزر نفسه يوضح حالة الرفع: يتعبّى بالنسبة، وبعدها "تم"، ومعاينة الخلفية الحالية تحته
  function uploadBtn(type) {
    const btn = document.getElementById(`upl-${type}`), label = btn.dataset.label || (btn.dataset.label = btn.textContent);
    const paint = (txt, pct = null, tone = '') => {
      btn.innerHTML = txt;
      btn.style.background = pct == null ? '' : `linear-gradient(to left, #1f2e23 ${pct}%, #384f3d ${pct}%)`;
      btn.classList.toggle('!bg-emerald-600', tone === 'ok'); btn.classList.toggle('!text-white', tone === 'ok'); btn.classList.toggle('!border-emerald-600', tone === 'ok');
    };
    return {
      busy(txt) { btn.disabled = true; paint(`<i class="ph-bold ph-spinner-gap ph-spin"></i> ${txt}`, 0); },
      progress(pct) { paint(`<i class="ph-bold ph-spinner-gap ph-spin"></i> جاري الرفع ${pct}%`, pct); },
      done(txt) { paint(`<i class="ph-bold ph-check-circle"></i> ${txt}`, null, 'ok'); setTimeout(() => { btn.disabled = false; paint(label); }, 3500); },
      fail() { btn.disabled = false; paint(label); }
    };
  }
  function renderBgPreview() {
    const img = safeUrl(client.bg_image_url), vid = safeUrl(client.bg_video_url);
    const box = (id, html) => { const el = document.getElementById(id); el.classList.toggle('hidden', !html); el.innerHTML = html || ''; };
    box('bg-img-prev', img && !vid ? `<p class="text-[11px] font-bold text-emerald-700 mb-1"><i class="ph-bold ph-check-circle"></i> الخلفية الحالية</p><img src="${esc(img)}" alt="" class="w-full h-20 object-cover rounded-xl border border-brand/15">` : '');
    box('bg-video-prev', vid ? `<p class="text-[11px] font-bold text-emerald-700 mb-1"><i class="ph-bold ph-check-circle"></i> الفيديو الحالي</p><video src="${esc(vid)}" muted loop autoplay playsinline class="w-full h-20 object-cover rounded-xl border border-brand/15"></video>` : '');
    const limg = safeUrl(client.links_bg_image_url), lvid = safeUrl(client.links_bg_video_url);
    box('links-bg-prev', lvid ? `<p class="text-[11px] font-bold text-emerald-700 mb-1"><i class="ph-bold ph-check-circle"></i> فيديو صفحة الروابط الحالي</p><video src="${esc(lvid)}" muted loop autoplay playsinline class="w-full max-w-xs h-24 object-cover rounded-xl border border-brand/15"></video>`
      : limg ? `<p class="text-[11px] font-bold text-emerald-700 mb-1"><i class="ph-bold ph-check-circle"></i> صورة صفحة الروابط الحالية</p><img src="${esc(limg)}" alt="" class="w-full max-w-xs h-24 object-cover rounded-xl border border-brand/15">` : '');
    document.getElementById('links-bg-status').innerHTML = lvid || limg
      ? `<span class="text-emerald-700"><i class="ph-bold ph-check-circle"></i> خلفية خاصة</span><button type="button" onclick="resetLinksBg()" class="bg-white hover:bg-brand/10 text-ink border border-brand/25 px-2.5 py-1 rounded-lg transition">استخدم خلفية المنيو</button>`
      : '<span>حالياً: نفس خلفية المنيو</span>';
  }
  // ─── إزالة الخلفية بالذكاء الاصطناعي داخل المتصفح (الصورة ما تطلع لأي خدمة خارجية) ───
  // النموذج ormbg (Apache-2.0) ينحمّل مرة وحدة (~44 ميجا) ويبقى محفوظ في المتصفح
  // نسخة +esm من jsDelivr تحوّل استيرادات onnxruntime لروابط CDN
  const BG_LIB = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/+esm';
  let bgRemover = null, bgProgress = null;
  function getBgRemover() {
    if (!bgRemover) {
      bgRemover = (async () => {
        const { pipeline } = await import(BG_LIB);
        return pipeline('background-removal', 'onnx-community/ormbg-ONNX', {
          dtype: 'q8',
          progress_callback: (e) => { if (bgProgress && e.status === 'progress' && /\.onnx$/.test(e.file || '')) bgProgress(e.progress); }
        });
      })().catch((e) => { bgRemover = null; throw e; });
    }
    return bgRemover;
  }
  // هل الصورة فيها شفافية أصلاً؟
  async function hasTransparency(file) {
    try {
      const bmp = await createImageBitmap(file);
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const ctx = c.getContext('2d'); ctx.drawImage(bmp, 0, 0, 64, 64);
      const d = ctx.getImageData(0, 0, 64, 64).data;
      let clear = 0; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
      return clear > 64 * 64 * 0.03;
    } catch { return false; }
  }
  // النموذج أحياناً يخلي الأجزاء البيضاء (مثل جسم رجل الثلج) شبه شفافة:
  // كل شي داخل حدود الشكل يصير معتم، والأطراف (3 بكسل) تبقى ناعمة، والظلال الخفيفة تنشال
  function solidify(d, w, h, cut = 20, edge = 3) {
    const INF = 1e9, dist = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) dist[i] = d[i * 4 + 3] >= cut ? INF : 0;
    // المسافة لأقرب بكسل خارج الشكل (chamfer 3-4، مرورين)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (!dist[i]) continue;
      let m = dist[i];
      m = Math.min(m, x > 0 ? dist[i - 1] + 3 : 3);
      if (y > 0) { m = Math.min(m, dist[i - w] + 3); if (x > 0) m = Math.min(m, dist[i - w - 1] + 4); if (x < w - 1) m = Math.min(m, dist[i - w + 1] + 4); } else m = Math.min(m, 3);
      dist[i] = m;
    }
    for (let y = h - 1; y >= 0; y--) for (let x = w - 1; x >= 0; x--) {
      const i = y * w + x; if (!dist[i]) continue;
      let m = dist[i];
      m = Math.min(m, x < w - 1 ? dist[i + 1] + 3 : 3);
      if (y < h - 1) { m = Math.min(m, dist[i + w] + 3); if (x < w - 1) m = Math.min(m, dist[i + w + 1] + 4); if (x > 0) m = Math.min(m, dist[i + w - 1] + 4); } else m = Math.min(m, 3);
      dist[i] = m;
    }
    for (let i = 0; i < w * h; i++) {
      const a = d[i * 4 + 3], px = dist[i] / 3;
      d[i * 4 + 3] = a < cut ? 0 : px >= edge ? 255 : Math.max(a, Math.round(px / edge * 255));
    }
  }
  // نقص الأطراف الشفافة ونصغّر لـ 600 بكسل
  async function trimToFile(source) {
    const w = source.width, h = source.height;
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d'); ctx.drawImage(source, 0, 0);
    const img = ctx.getImageData(0, 0, w, h);
    solidify(img.data, w, h);
    ctx.putImageData(img, 0, 0);
    const d = img.data;
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 16) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    if (x1 < 0) return null;
    const pad = 6; x0 = Math.max(0, x0 - pad); y0 = Math.max(0, y0 - pad); x1 = Math.min(w - 1, x1 + pad); y1 = Math.min(h - 1, y1 + pad);
    const cw = x1 - x0 + 1, ch = y1 - y0 + 1, scale = Math.min(1, 600 / Math.max(cw, ch));
    const out = document.createElement('canvas'); out.width = Math.round(cw * scale); out.height = Math.round(ch * scale);
    out.getContext('2d').drawImage(c, x0, y0, cw, ch, 0, 0, out.width, out.height);
    const blob = await new Promise(r => out.toBlob(r, 'image/png'));
    return blob && new File([blob], 'sticker.png', { type: 'image/png' });
  }
  async function removeBackground(file) {
    const seg = await getBgRemover();
    const url = URL.createObjectURL(file);
    try {
      const res = await seg(url);
      const mask = Array.isArray(res) ? res[0] : res;
      return await trimToFile(mask.toCanvas());
    } finally { URL.revokeObjectURL(url); }
  }
  // يعرض قبل/بعد ويرجع الملف اللي اختاره صاحب المتجر (أو null لو ألغى)
  function chooseBackground(file) {
    const panel = document.getElementById('bg-panel');
    const status = document.getElementById('bg-status'), bar = document.getElementById('bg-progress-bar');
    const show = (id, on) => document.getElementById(id).classList.toggle('hidden', !on);
    const before = URL.createObjectURL(file);
    let after = null, cut = null, done = false;
    panel.classList.remove('hidden'); show('bg-compare', false); show('bg-actions', false); show('bg-progress', false);
    status.innerHTML = '<i class="ph-bold ph-spinner-gap ph-spin"></i> جاري إزالة الخلفية...';
    bgProgress = (p) => { show('bg-progress', true); bar.style.width = `${Math.round(p)}%`; status.innerHTML = `<i class="ph-bold ph-download-simple"></i> تجهيز أداة إزالة الخلفية لأول مرة... ${Math.round(p)}%`; };
    return new Promise((resolve) => {
      const finish = (v) => {
        if (done) return; done = true;
        panel.classList.add('hidden'); panel.onclick = null; bgProgress = null;
        URL.revokeObjectURL(before); if (after) URL.revokeObjectURL(after);
        resolve(v);
      };
      panel.onclick = (e) => {
        const b = e.target.closest('[data-bg]'); if (!b) return;
        finish(b.dataset.bg === 'cut' ? cut : b.dataset.bg === 'orig' ? file : null);
      };
      removeBackground(file).then((f) => {
        if (done) return;
        if (!f) throw new Error('empty');
        cut = f; after = URL.createObjectURL(f);
        document.getElementById('bg-before').src = before;
        document.getElementById('bg-after').src = after;
        show('bg-progress', false); show('bg-compare', true); show('bg-actions', true);
        status.innerHTML = '<i class="ph-bold ph-magic-wand text-emerald-600"></i> تمت إزالة الخلفية، اختر النسخة اللي تبيها';
      }).catch((e) => {
        console.warn('background removal failed', e);
        if (done) return;
        show('bg-progress', false);
        status.innerHTML = '<i class="ph-bold ph-warning text-amber-600"></i> تعذر إزالة الخلفية على هذا الجهاز. تقدر ترفع الصورة الأصلية.';
        document.getElementById('bg-before').src = before;
        show('bg-compare', false); show('bg-actions', true);
        panel.querySelector('[data-bg="cut"]').classList.add('hidden');
      });
    }).then((v) => { panel.querySelector('[data-bg="cut"]').classList.remove('hidden'); return v; });
  }

  function renderOccasionPreview() {
    const o = occDraft(); if (!o) return;
    const box = document.getElementById('occ-preview');
    DMTheme.apply({ theme: client.theme, accent_color: client.accent_color }, box);
    const logo = safeUrl(client.logo_url);
    if (logo) document.getElementById('occ-preview-logo').src = logo;
    document.getElementById('occ-preview-name').textContent = client.name || '';
    DMOccasions.render(o, { header: document.getElementById('occ-preview-header'), greet: document.getElementById('occ-preview-greet'), host: box, contained: true });
  }
  async function saveOccasions() {
    for (const o of occasions) {
      if (!String(o.title || '').trim()) return showToast('اكتب اسم كل مناسبة', true);
      if (!o.starts_on || !o.ends_on) return showToast(`حدد تواريخ "${o.title}"`, true);
      if (o.ends_on < o.starts_on) return showToast(`تاريخ النهاية قبل البداية في "${o.title}"`, true);
    }
    const payload = occasions.map(o => ({ ...o, title: o.title.trim(), greeting: String(o.greeting || '').trim() }));
    if (multiBranch()) {
      try {
        const res = await api('occasions-save', {
          occasions: payload.map(({ copy_to, ...o }) => o),
          copies: payload.filter(o => o.copy_to.length).map(o => ({ id: o.id, branch_ids: o.copy_to }))
        });
        branches = res.family;
        client.occasions = res.occasions;
        occasions = familyOccasions();
        if (occEditing >= occasions.length) closeOccasionEditor(); else if (occEditing >= 0) renderOccasionBranches();
        renderOccasionList();
        const n = res.copied_to.length;
        showToast(n ? `تم الحفظ، ونسخت المناسبات لـ ${n === 1 ? 'فرع' : `${n} فروع`}. عدّلها من صفحة كل فرع` : 'تم حفظ المناسبات');
      } catch { showToast('تعذر حفظ المناسبات', true); }
      return;
    }
    if (await updateClient({ occasions: payload.map(({ copy_to, ...o }) => o) })) {
      showToast('تم حفظ المناسبات، وتظهر في المنيو خلال تواريخها');
      renderOccasionList();
    } else showToast('تعذر حفظ المناسبات', true);
  }

