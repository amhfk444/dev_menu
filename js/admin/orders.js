// =====================================================================
// DEV MENU — لوحة التحكم: الطلب من المنيو: الإعدادات، طرق الاستلام والتوصيل، وتقرير المبيعات
// (ملفات js/admin/ تتحمّل بالترتيب، وتتشارك نفس المتغيرات العامة)
// =====================================================================
  // ─── الطلب من المنيو إلى الكاشير ───
  function renderOrderMode() {
    const m = !!client.menu_order_mode;
    document.getElementById('mo-on').checked = m;
    // تبويب المبيعات يظهر بس لما الطلب من المنيو مفعّل
    document.getElementById('tab-sales').classList.toggle('hidden', !m);
    if (!m && !document.getElementById('section-sales').classList.contains('hidden')) switchTab('products');
    const desk = 'pager-desk.html' + location.search;
    document.getElementById('mo-tables').classList.toggle('hidden', !m);
    document.getElementById('mo-opts').classList.toggle('hidden', !m);
    if (m) renderOrderOpts();
    document.getElementById('mo-status').innerHTML = !m ? '' : `<div class="flex flex-wrap items-center justify-between gap-2 bg-green-500/10 border border-green-500/25 rounded-lg px-3 py-2">
        <span class="text-green-800"><i class="ph-bold ph-check-circle"></i> الطلبات تصل لشاشة الكاشير${client.whatsapp_orders ? '، بدل واتساب' : ''}</span>
        <a href="${desk}" target="_blank" rel="noopener" class="bg-brand text-cream font-bold px-2.5 py-1 rounded-md text-[11px]"><i class="ph-bold ph-cash-register"></i> افتح شاشة الكاشير</a>
      </div>`;
  }
  // رموز الطاولات: صفحة طباعة A4 (6 بطاقات بالصفحة)، كل بطاقة فيها رقم الطاولة ورمز يفتح المنيو عليها
  async function printTableQrs(btn) {
    const from = Math.max(1, parseInt(document.getElementById('mo-t-from').value, 10) || 1);
    const to = Math.min(999, parseInt(document.getElementById('mo-t-to').value, 10) || from);
    if (to < from) return showToast('رقم «إلى طاولة» لازم يكون أكبر من «من طاولة»', true);
    if (to - from >= 120) return showToast('اطبعها على دفعات: 120 طاولة بالمرة', true);
    const win = window.open('', '_blank');   // نفتحها من الضغطة نفسها عشان المتصفح ما يمنعها
    if (!win) return showToast('المتصفح منع فتح صفحة الطباعة، اسمح بالنوافذ المنبثقة', true);
    btn.disabled = true;
    try {
      const qr = (text) => { const tmp = document.createElement('div'); new QRCode(tmp, { text, width: 480, height: 480, colorDark: '#15271b', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M }); return tmp.querySelector('canvas').toDataURL('image/png'); };
      // الشعار داخل الصفحة نفسها (صفحة الطباعة الجديدة ما تحمّل صور من روابط خارجية بشكل مضمون)
      let logo = null;
      const lu = safeUrl(client.logo_url);
      if (lu) try { const im = await loadImage(lu); const c = document.createElement('canvas'); c.width = c.height = 160; const x = c.getContext('2d'); const k = Math.max(160 / im.width, 160 / im.height); x.drawImage(im, 80 - im.width * k / 2, 80 - im.height * k / 2, im.width * k, im.height * k); logo = c.toDataURL('image/png'); } catch {}
      const self = false;
      const cards = [];
      for (let n = from; n <= to; n++) {
        cards.push(`<div class="card"><div class="top">${logo ? `<img class="logo" src="${logo}" alt="">` : ''}<p class="name">${esc(client.name || '')}</p></div>
          <p class="tbl">طاولة <b>${n}</b></p><img class="qr" src="${qr(DM.storeUrl(client.client_slug, 'menu', { src: 'qr', table: n }))}" alt="">
          <p class="cta">امسح واطلب من جوالك</p><p class="sub">${self ? 'تختار طلبك، ويرن جوالك لما يجهز' : 'يوصل طلبك للكاشير، ويجيك على الطاولة'}</p></div>`);
      }
      win.document.write(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>رموز الطاولات ${from}-${to}</title>
        <link rel="stylesheet" href="${location.origin}/css/fonts.css">
        <style>@page{size:A4;margin:10mm}*{box-sizing:border-box}body{margin:0;font-family:"IBM Plex Sans Arabic",Tahoma,sans-serif;color:#15271b;background:#f1f1f1}
        .bar{position:sticky;top:0;display:flex;gap:12px;align-items:center;justify-content:center;padding:12px;background:#15271b;color:#f5f2eb;font-weight:700;font-size:14px}
        .bar button{font:inherit;font-weight:800;background:#c9a227;color:#15271b;border:0;border-radius:10px;padding:10px 18px;cursor:pointer}
        .sheet{display:grid;grid-template-columns:repeat(2,90mm);gap:6mm;justify-content:center;padding:8mm 0}
        .card{height:88mm;background:#fff;border:1px solid #d9d4c7;border-radius:6mm;padding:5mm;display:flex;flex-direction:column;align-items:center;text-align:center;break-inside:avoid}
        .top{display:flex;align-items:center;gap:3mm;justify-content:center}.logo{width:10mm;height:10mm;border-radius:50%;object-fit:cover}.name{margin:0;font-size:13px;font-weight:700;color:#5b6b60}
        .tbl{margin:2mm 0 1mm;font-size:16px;font-weight:700}.tbl b{font-size:30px;font-weight:800}
        .qr{width:44mm;height:44mm}.cta{margin:2mm 0 0;font-size:15px;font-weight:800}.sub{margin:1mm 0 0;font-size:10.5px;font-weight:600;color:#5b6b60}
        @media print{body{background:#fff}.bar{display:none}.sheet{padding:0}.card{border-color:#bbb}}</style></head>
        <body><div class="bar">${cards.length} بطاقة: اطبعها على A4، أو احفظها PDF من نافذة الطباعة <button onclick="print()">اطبع</button></div><div class="sheet">${cards.join('')}</div></body></html>`);
      win.document.close();
    } catch (e) { console.error(e); win.close(); showToast('تعذر تجهيز رموز الطاولات', true); }
    finally { btn.disabled = false; }
  }
  // ─── طرق الاستلام والتوصيل والطلب المسبق ───
  function renderOrderOpts(onlyDelivery) {
    const o = client.menu_order_opts || {};
    if (!onlyDelivery) {
      document.getElementById('mo-o-dine').checked = o.dine !== false;
      document.getElementById('mo-o-pickup').checked = o.pickup !== false;
      document.getElementById('mo-o-delivery').checked = o.delivery === true;
      document.getElementById('mo-o-fee').value = o.fee || '';
      document.getElementById('mo-o-area').value = o.area || '';
      document.getElementById('mo-o-schedule').checked = o.schedule === true;
    }
    document.getElementById('mo-o-delbox').classList.toggle('hidden', !document.getElementById('mo-o-delivery').checked);
  }
  async function saveOrderOpts(btn) {
    const opts = { dine: document.getElementById('mo-o-dine').checked, pickup: document.getElementById('mo-o-pickup').checked, delivery: document.getElementById('mo-o-delivery').checked,
      fee: parseFloat(document.getElementById('mo-o-fee').value) || 0, area: document.getElementById('mo-o-area').value.trim(), schedule: document.getElementById('mo-o-schedule').checked };
    if (!opts.dine && !opts.pickup && !opts.delivery) return showToast('اختر طريقة استلام وحدة على الأقل', true);
    btn.disabled = true;
    if (await updateClient({ menu_order_opts: opts })) { showToast('تم حفظ طرق الاستلام'); phoneView = 'menu'; reloadPagerPhone(); }
    else showToast('تعذر الحفظ', true);
    btn.disabled = false;
  }

  async function saveOrderMode(box) {
    const prev = client.menu_order_mode || null;
    const m = box.checked ? 'table' : null;
    if (await updateClient({ menu_order_mode: m })) {
      renderOrderMode(); applyFeatureLocks(); phoneView = 'menu'; reloadPagerPhone();
      showToast(m ? 'صار العميل يطلب من المنيو ويوصل طلبه للكاشير' : 'تم إيقاف الطلب من المنيو');
    } else { client.menu_order_mode = prev; renderOrderMode(); showToast('تعذر حفظ الإعداد', true); }
  }

  async function togglePagerUpsell(on) {
    if (await updateClient({ pager_upsell: on })) { renderPagerStatus(); showToast(on ? 'الزبون يقدر يضيف لطلبه وهو ينتظر' : 'تم إيقاف «أضف لطلبك»'); }
    else { document.getElementById('info-pager-upsell').checked = !on; showToast('تعذر حفظ الإعداد', true); }
  }
  async function togglePagerFlag(key, box) {
    const on = box.checked, msgs = { pager_chat: ['المساعد صار يظهر في صفحة الانتظار', 'تم إيقاف المساعد في صفحة الانتظار'], pager_game: ['اللعبة تظهر للزبون وهو ينتظر', 'تم إيقاف اللعبة'] };
    if (await updateClient({ [key]: on })) { renderPagerStatus(); showToast(msgs[key][on ? 0 : 1]); }
    else { box.checked = !on; showToast('تعذر حفظ الإعداد', true); }
  }
  async function saveGameReward() {
    const reward = document.getElementById('info-game-reward').value.trim(), moves = Number(document.getElementById('info-game-moves').value);
    if (await updateClient({ pager_game_reward: reward, pager_game_moves: moves, pager_quiz_need: Number(document.getElementById('info-quiz-need').value) })) { renderPagerStatus(); showToast(reward ? 'تم حفظ جائزة اللعبة' : 'تم إيقاف جائزة اللعبة'); }
    else showToast('تعذر حفظ الجائزة', true);
  }
  async function toggleKioskCall(on) {
    if (await updateClient({ kiosk_call: on })) showToast(on ? 'الأرقام الجاهزة تظهر على شاشة الزبون' : 'شاشة الزبون تعرض الأكواد بس');
    else { document.getElementById('info-kiosk-call').checked = !on; showToast('تعذر حفظ الإعداد', true); }
  }
  async function toggleCalories(on) {
    if (await updateClient({ show_calories: on })) {
      applyCaloriesSetting();
      filterProducts();
      showToast(on ? 'السعرات تظهر الآن في المنيو' : 'تم إخفاء السعرات من المنيو');
    } else {
      document.getElementById('info-show-calories').checked = !on;
      showToast('تعذر حفظ الإعداد', true);
    }
  }

  // ─── المبيعات ───
  let salesRange = '7';
  async function loadSales(range) {
    salesRange = range;
    document.querySelectorAll('.sr-btn').forEach(b => { const on = b.dataset.srange === range; b.classList.toggle('bg-brand', on); b.classList.toggle('text-cream', on); b.classList.toggle('text-ink', !on); });
    const box = document.getElementById('sales-body');
    let r;
    try { r = await api(`sales&range=${range}`); }
    catch (e) { box.innerHTML = `<p class="text-xs text-red-600 text-center py-10">${esc(e.message || 'تعذر تحميل المبيعات')}</p>`; return; }
    if (salesRange !== range) return;
    document.getElementById('sales-off').classList.toggle('hidden', !!r.order_mode);
    const num = (n) => Number(n || 0).toLocaleString('en-US');
    const tile = (label, value, sub) => `<div class="pro-card p-4"><p class="text-[12px] font-semibold text-ink/70">${label}</p><p class="text-2xl font-black text-ink mt-1" dir="ltr" style="text-align:right">${value}</p>${sub ? `<p class="text-[11px] text-ink/60 mt-1">${sub}</p>` : ''}</div>`;
    if (!r.orders) {
      box.innerHTML = `<div class="pro-card p-8 text-center"><i class="ph-bold ph-chart-bar text-3xl text-brand/40"></i><p class="font-bold text-ink mt-2">ما فيه طلبات من المنيو في هالفترة</p><p class="text-[12px] text-ink/60 mt-1">أول ما يطلب العملاء من المنيو تطلع أرقامهم هنا.</p></div>`;
      return;
    }
    const bars = (vals, labels, fmt) => {
      const max = Math.max(1, ...vals);
      return `<div class="flex items-end gap-[3px] h-28" dir="ltr">${vals.map((v, i) => `<div class="flex-1 flex flex-col items-center justify-end h-full min-w-0" title="${esc(labels[i])}: ${fmt(v)}"><div class="w-full rounded-t-[4px] ${v ? 'bg-brand' : 'bg-brand/10'}" style="height:${Math.max(v ? 6 : 2, Math.round(v / max * 100))}%"></div></div>`).join('')}</div>`;
    };
    const dayFmt = new Intl.DateTimeFormat('ar-SA-u-nu-latn-ca-gregory', { day: 'numeric', month: 'short' });
    const daily = r.daily.length > 1 ? `<div class="pro-card p-4"><div class="flex justify-between text-[12px] font-bold text-ink mb-3"><span>المبيعات اليومية</span><span class="text-ink/60">أعلى يوم ${money(Math.max(...r.daily.map(d => d.amount)))}</span></div>
      ${bars(r.daily.map(d => d.amount), r.daily.map(d => dayFmt.format(new Date(d.d + 'T12:00:00Z'))), money)}
      <div class="flex justify-between text-[10px] text-ink/50 mt-1.5" dir="ltr"><span>${dayFmt.format(new Date(r.daily[0].d + 'T12:00:00Z'))}</span><span>${dayFmt.format(new Date(r.daily[r.daily.length - 1].d + 'T12:00:00Z'))}</span></div></div>` : '';
    const hourLbl = (h) => h === 0 ? '12 ص' : h < 12 ? `${h} ص` : h === 12 ? '12 م' : `${h - 12} م`;
    const peakH = r.hours.indexOf(Math.max(...r.hours));
    const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const peakD = r.weekdays.indexOf(Math.max(...r.weekdays));
    const hours = `<div class="pro-card p-4"><div class="flex justify-between text-[12px] font-bold text-ink mb-3"><span>أوقات الطلب</span><span class="text-ink/60">الذروة ${hourLbl(peakH)}${salesRange === '30' ? ` · ${DAYS[peakD]}` : ''}</span></div>
      ${bars(r.hours, r.hours.map((_, h) => hourLbl(h)), (v) => `${v} طلب`)}
      <div class="flex justify-between text-[10px] text-ink/50 mt-1.5" dir="ltr"><span>12 ص</span><span>6 ص</span><span>12 م</span><span>6 م</span><span>11 م</span></div></div>`;
    const row = (name, right, sub) => `<li class="flex items-center justify-between gap-3 py-2 border-b border-brand/10 last:border-0"><span class="min-w-0 truncate text-[13px] font-semibold text-ink">${esc(name)}${sub ? ` <span class="text-ink/50 font-normal">${esc(sub)}</span>` : ''}</span><span class="text-[13px] font-bold text-ink shrink-0" dir="ltr">${right}</span></li>`;
    const top = `<div class="pro-card p-4"><p class="text-[12px] font-bold text-ink mb-1">الأكثر طلباً</p><ul>${r.top.map(p => row(p.name, `${num(p.qty)} × · ${money(p.amount)}`)).join('')}</ul></div>`;
    const DINE = { in: 'محلي', out: 'استلام', delivery: 'توصيل' };
    const dine = Object.entries(r.dine).filter(([, v]) => v.n);
    const dineBox = dine.length > 1 || r.fees ? `<div class="pro-card p-4"><p class="text-[12px] font-bold text-ink mb-1">طريقة الطلب</p><ul>${dine.map(([k, v]) => row(DINE[k], `${num(v.n)} طلب · ${money(v.amount)}`)).join('')}${r.fees ? row('رسوم التوصيل', money(r.fees)) : ''}</ul></div>` : '';
    const extras = r.extras.length ? `<div class="pro-card p-4"><p class="text-[12px] font-bold text-ink mb-1">أكثر الإضافات</p><ul>${r.extras.map(x => row(x.name, `${num(x.qty)} ×`, x.group)).join('')}</ul></div>` : '';
    const least = r.least.length || r.unsold.length ? `<div class="pro-card p-4"><p class="text-[12px] font-bold text-ink mb-1">الأقل طلباً</p><ul>${r.least.map(p => row(p.name, `${num(p.qty)} ×`)).join('')}</ul>${r.unsold.length ? `<p class="text-[12px] font-bold text-ink mt-3 mb-1">ما انطلبت في هالفترة</p><p class="text-[12px] text-ink/70 leading-relaxed">${r.unsold.map(esc).join('، ')}</p>` : ''}</div>` : '';
    box.innerHTML = `<div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${tile('إجمالي المبيعات', money(r.total), r.fees ? `شامل التوصيل ${money(r.fees)}` : '')}
        ${tile('عدد الطلبات', num(r.sold), r.cancelled ? `وانلغى ${num(r.cancelled)}` : '')}
        ${tile('متوسط الطلب', money(r.avg), '')}
        ${tile('تم تسليمها', num(r.served), r.open ? `${num(r.open)} للحين مفتوحة` : '')}
      </div>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">${daily}${hours}${top}${dineBox}${extras}${least}</div>`;
    DMSectors.localizeDom(box, client);
  }

