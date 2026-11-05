// =====================================================================
// DEV MENU — لوحة التحكم: الإحصائيات واسأل عن أرقامك
// (ملفات js/admin/ تتحمّل بالترتيب، وتتشارك نفس المتغيرات العامة)
// =====================================================================
  // ─── الإحصائيات ───
  let statsDays = 30, lastStats = null;
  const WEEKDAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const fmtNum = (n) => (Number(n) || 0).toLocaleString('en-US');
  const hourLabel = (h) => `${h % 12 || 12} ${h < 12 ? 'ص' : 'م'}`;
  const hourRange = (h) => {
    const part = (x) => x < 5 ? 'فجراً' : x < 12 ? 'صباحاً' : x < 15 ? 'ظهراً' : x < 18 ? 'عصراً' : 'مساءً';
    return `بين ${h % 12 || 12} و${(h + 1) % 12 || 12} ${part(h)}`;
  };

  document.getElementById('stats-periods').addEventListener('click', (e) => {
    const b = e.target.closest('[data-days]');
    if (!b || Number(b.dataset.days) === statsDays) return;
    statsDays = Number(b.dataset.days);
    document.querySelectorAll('.stats-period').forEach(x => {
      const on = x === b;
      x.classList.toggle('bg-brand', on); x.classList.toggle('text-cream', on); x.classList.toggle('text-ink', !on);
    });
    loadStats();
  });

  function deltaBadge(cur, prev) {
    if (!prev && !cur) return '<span class="text-[11px] text-ink">—</span>';
    if (!prev) return '<span class="text-[11px] font-bold text-emerald-600">جديد</span>';
    const pct = Math.round(((cur - prev) / prev) * 100);
    if (pct === 0) return '<span class="text-[11px] font-bold text-ink">بدون تغيير</span>';
    const up = pct > 0;
    return `<span class="text-[11px] font-bold ${up ? 'text-emerald-600' : 'text-red-600'}" dir="ltr">${up ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
  }

  function kpiTile(label, value, sub, icon, color) {
    return `
      <div class="bg-brand/5 border border-brand/15 rounded-xl p-3.5 space-y-1">
        <p class="text-[11px] text-ink flex items-center gap-1.5"><i class="${icon} ${color}"></i> ${label}</p>
        <p class="text-2xl font-black text-ink leading-none">${value}</p>
        <div class="min-h-[14px]">${sub}</div>
      </div>`;
  }

  // شريط أفقي: يبدأ من اليمين، والرقم يلحق نهايته (بدون مسار رمادي يشتت)
  function barRow(label, value, max, color = 'bg-brand/50', extra = '') {
    const w = max && value ? Math.max(1.5, (value / max) * 88) : 0;
    return `
      <div class="flex items-center gap-2 text-[11px]">
        <span class="w-20 shrink-0 truncate text-ink">${label}</span>
        <div class="flex-1 flex items-center gap-1.5 min-w-0">${w ? `<div class="h-2.5 ${color} rounded-full" style="width:${w}%"></div>` : ''}<b class="text-ink tnum">${fmtNum(value)}</b></div>${extra}
      </div>`;
  }
  // أعمدة: خطوط مرجعية خفيفة، رقم فوق أعلى عمود، وتسميات تحت، وتلميح عند المرور أو اللمس (data-tip)
  function colChart(vals, { h = 'h-28', tips, peak = -1, peakCls = 'bg-brand', baseCls = 'bg-brand/40', axis = [] }) {
    const max = Math.max(1, ...vals), top = niceMax(max);
    return `
      <div class="relative ${h} mt-5" dir="ltr">
        ${[1, 0.5].map(f => `<div class="absolute inset-x-0 border-t border-dashed border-brand/10" style="bottom:${f * 100}%"><span class="absolute -top-2 left-0 -translate-y-full text-[10px] text-ink tnum">${fmtNum(Math.round(top * f))}</span></div>`).join('')}
        <div class="absolute inset-x-0 bottom-0 border-t border-brand/20"></div>
        <div class="absolute inset-0 flex items-end gap-[2px]">
          ${vals.map((v, i) => `<div class="relative flex-1 h-full flex items-end cursor-default group" data-tip="${esc(tips[i])}">
            <div class="w-full rounded-t-[4px] ${i === peak && v > 0 ? peakCls : baseCls} group-hover:opacity-80 transition" style="height:${v ? Math.max(2, (v / top) * 100) : 0}%"></div>
            ${i === peak && v > 0 ? `<span class="absolute left-1/2 -translate-x-1/2 text-[11px] font-bold text-ink tnum whitespace-nowrap" style="bottom:calc(${(v / top) * 100}% + 3px)">${fmtNum(v)}</span>` : ''}
          </div>`).join('')}
        </div>
      </div>
      ${axis.length ? `<div class="flex justify-between text-[9.5px] text-ink mt-1.5" dir="ltr">${axis.map(a => `<span dir="rtl">${esc(a)}</span>`).join('')}</div>` : ''}`;
  }
  // أعلى رقم مرتب للخط المرجعي، قريب من أعلى قيمة (12 ← 15، 22 ← 25، 81 ← 100)
  function niceMax(v) {
    if (v <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p;
    return ([1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10].find(x => n <= x)) * p;
  }
  // تلميح واحد لكل الرسوم في الإحصائيات
  function statsTips(box) {
    let tip = document.getElementById('stats-tip');
    if (!tip) { tip = document.createElement('div'); tip.id = 'stats-tip'; tip.className = 'fixed z-50 pointer-events-none hidden bg-ink text-cream text-[11px] font-bold rounded-lg px-2.5 py-1.5 shadow-lg whitespace-nowrap'; document.body.appendChild(tip); }
    const show = (e) => {
      const t = e.target.closest('[data-tip]'); if (!t || !box.contains(t)) return tip.classList.add('hidden');
      tip.textContent = t.dataset.tip; tip.classList.remove('hidden');
      const r = t.getBoundingClientRect(), w = tip.offsetWidth;
      tip.style.left = `${Math.min(window.innerWidth - w - 8, Math.max(8, r.left + r.width / 2 - w / 2))}px`; tip.style.top = `${Math.max(8, r.top - tip.offsetHeight - 6)}px`;
    };
    box.onmouseover = show; box.ontouchstart = show; box.onmouseleave = () => tip.classList.add('hidden');
  }

  async function loadStats() {
    const body = document.getElementById('stats-body');
    body.innerHTML = '<p class="text-xs text-ink py-6 text-center"><i class="ph-bold ph-spinner-gap ph-spin"></i> جاري تحميل الإحصائيات...</p>';
    let data = null, error = null;
    try { data = await api(`stats&days=${statsDays}`); } catch (e) { error = e; lastApiError = ''; }
    if (error || !data) {
      console.error(error);
      body.innerHTML = '<p class="text-xs text-ink py-6 text-center">الإحصائيات غير متاحة حالياً.</p>';
      document.getElementById('stats-export').disabled = true;
      return;
    }
    lastStats = data;
    document.getElementById('stats-export').disabled = false;
    renderStats(data);
  }

  function renderStats(data) {
    const body = document.getElementById('stats-body');
    const t = data.totals || {}, pv = data.prev || {};
    const views = Number(t.views) || 0, dishOpens = Number(t.dishes) || 0, orders = Number(t.orders) || 0;
    const dishes = data.dishes || [];

    if (views === 0) {
      body.innerHTML = `
        <div class="text-center py-8 space-y-3">
          <div class="w-12 h-12 mx-auto rounded-2xl bg-brand/5 border border-brand/15 flex items-center justify-center text-ink"><i class="ph-bold ph-chart-line-up"></i></div>
          <p class="text-sm font-bold text-ink">ما فيه زيارات خلال آخر ${data.days} يوم</p>
          <p class="text-[11px] text-ink max-w-sm mx-auto">اطبع بطاقة الـ QR وحطها في محلك، أو شارك رابط المنيو في حساباتك. الإحصائيات تبدأ تظهر هنا مع أول زيارة.</p>
          <button onclick="downloadQrCard()" class="bg-amber-400 hover:bg-amber-300 text-black px-4 py-2 rounded-xl text-[11px] font-black"><i class="ph-bold ph-printer"></i> تحميل بطاقة QR</button>
        </div>`;
      return;
    }

    // ── السلسلة اليومية (نملأ الأيام الفاضية بصفر)
    const dayMap = {};
    (data.daily || []).forEach(d => { dayMap[d.day] = Number(d.views) || 0; });
    const series = [];
    for (let i = data.days - 1; i >= 0; i--) {
      const dt = new Date(Date.now() - i * 86400000);
      series.push({
        v: dayMap[dt.toLocaleDateString('en-CA', { timeZone: 'Asia/Riyadh' })] || 0,
        label: dt.toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { weekday: 'short', day: 'numeric', month: 'numeric', timeZone: 'Asia/Riyadh' })
      });
    }
    // الأيام اللي قبل أول زيارة (محل جديد) ما نرسمها: تطلع خط فاضي طويل
    const firstDay = series.findIndex(d => d.v > 0);
    if (firstDay > 0) series.splice(0, Math.min(firstDay, series.length - 7));
    const maxDay = Math.max(1, ...series.map(d => d.v));
    const peakDayIdx = series.findIndex(d => d.v === maxDay);

    // ── الساعات وأيام الأسبوع
    const hours = Array(24).fill(0);
    (data.hours || []).forEach(x => { hours[x.h] = Number(x.c) || 0; });
    const maxHour = Math.max(1, ...hours);
    const peakHour = hours.indexOf(Math.max(...hours));
    const week = Array(7).fill(0);
    (data.weekdays || []).forEach(x => { week[x.d] = Number(x.c) || 0; });
    const maxWeek = Math.max(1, ...week);
    const peakDay = week.indexOf(Math.max(...week));

    // ── الأطباق والأقسام
    const viewed = dishes.filter(d => d.views > 0);
    const cold = dishes.filter(d => d.views === 0);
    const topDishes = viewed.slice(0, 8);
    const maxDish = Math.max(1, ...topDishes.map(d => d.views));
    const catTotals = loadedCategories.map(c => ({
      name: c.name,
      views: dishes.filter(d => d.category === c.key || d.category === c.name).reduce((sum, d) => sum + d.views, 0)
    })).filter(c => c.views > 0).sort((a, b) => b.views - a.views);
    const maxCat = Math.max(1, ...catTotals.map(c => c.views));

    // ── المصادر واللغة
    const qr = Number(t.qr) || 0, link = Number(t.link) || 0, known = qr + link;
    const qrPct = known ? Math.round((qr / known) * 100) : 0;
    const enPct = views ? Math.round(((Number(t.lang_en) || 0) / views) * 100) : 0;

    // ── ملاحظات تلقائية
    const insights = [];
    if (Math.max(...week) > 0) insights.push(`ذروة زوارك يوم <b>${WEEKDAYS[peakDay]}</b> ${hourRange(peakHour)}. أفضل وقت تنشر فيه عروضك قبلها بساعة.`);
    if (known >= 10) insights.push(`<b>${qrPct}%</b> من الزيارات جاءت من مسح رمز QR، و<b>${100 - qrPct}%</b> من الرابط المشارك.`);
    const noEn = loadedProducts.filter(p => !p.name_en).length;
    if (enPct >= 10 && noEn > 0) insights.push(`<b>${enPct}%</b> من زبائنك يتصفحون بالإنجليزي، و${noEn} طبق ما لها اسم إنجليزي. أضفها بدل الترجمة الآلية.`);
    const coldNoImg = cold.filter(d => !d.image_url).length;
    if (cold.length && dishes.length > 3) insights.push(`<b>${cold.length}</b> طبق ما فتحه أحد خلال الفترة${coldNoImg ? `، منها ${coldNoImg} بدون صورة. الصور ترفع المشاهدات بشكل واضح` : '. جرّب تميّزها أو تغيّر ترتيبها'}.`);

    const waEnabled = client.whatsapp_orders === true;
    body.innerHTML = `
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-3">
        ${kpiTile('زيارات المنيو', fmtNum(views), `${deltaBadge(views, pv.views)} <span class="text-[11px] text-ink">مقارنة بالفترة السابقة</span>`, 'ph-bold ph-eye', 'text-emerald-600')}
        ${kpiTile('مشاهدات الأطباق', fmtNum(dishOpens), deltaBadge(dishOpens, pv.dishes), 'ph-bold ph-fork-knife', 'text-blue-700')}
        ${kpiTile('طلبات واتساب', waEnabled || orders ? fmtNum(orders) : '—', waEnabled || orders ? deltaBadge(orders, pv.orders) : '<span class="text-[11px] text-amber-700">فعّلها من معلومات المنشأة</span>', 'ph-bold ph-whatsapp-logo', 'text-green-600')}
        ${kpiTile('أطباق لكل زيارة', (dishOpens / views).toFixed(1), '<span class="text-[11px] text-ink">متوسط الأطباق اللي يفتحها الزبون</span>', 'ph-bold ph-hand-pointing', 'text-amber-700')}
      </div>

      ${insights.length ? `
        <div class="bg-amber-400/5 border border-amber-400/20 rounded-xl p-3.5 space-y-1.5">
          ${insights.map(x => `<p class="text-[11px] text-ink/90 leading-relaxed"><i class="ph-bold ph-lightbulb text-amber-700 ml-1"></i> ${x}</p>`).join('')}
        </div>` : ''}

      <div>
        <div class="flex items-center justify-between mb-2">
          <p class="text-[11px] font-bold text-ink">الزيارات اليومية</p>
          <p class="text-[11px] text-ink">أعلى يوم: ${fmtNum(maxDay)} زيارة</p>
        </div>
        ${colChart(series.map(d => d.v), { h: 'h-32', tips: series.map(d => `${d.label}: ${fmtNum(d.v)} زيارة`), peak: peakDayIdx,
          axis: [series[0].label, series[Math.floor(series.length / 2)].label, series[series.length - 1].label] })}
      </div>

      <div class="grid md:grid-cols-2 gap-5">
        <div>
          <p class="text-[11px] font-bold text-ink mb-2">أوقات الذروة خلال اليوم</p>
          ${colChart(hours, { h: 'h-24', tips: hours.map((c, h) => `${hourLabel(h)}: ${fmtNum(c)} زيارة`), peak: peakHour, peakCls: 'bg-amber-400', baseCls: 'bg-brand/25',
            axis: ['12 ص', '6 ص', '12 م', '6 م', '11 م'] })}
        </div>
        <div>
          <p class="text-[11px] font-bold text-ink mb-2">أيام الأسبوع</p>
          <div class="space-y-1.5">
            ${[0, 1, 2, 3, 4, 5, 6].map(d => barRow(WEEKDAYS[d], week[d], maxWeek, d === peakDay && week[d] > 0 ? 'bg-amber-400' : 'bg-brand/30')).join('')}
          </div>
        </div>
      </div>

      <div>
        <p class="text-[11px] font-bold text-ink mb-2">أداء الأطباق</p>
        ${topDishes.length ? `
          <div class="overflow-x-auto">
            <table class="w-full text-[11px]">
              <thead class="text-ink">
                <tr><th class="text-right font-bold pb-2">الطبق</th><th class="text-right font-bold pb-2 w-2/5">المشاهدات</th><th class="font-bold pb-2 w-16">الطلبات</th></tr>
              </thead>
              <tbody class="divide-y divide-white/5">
                ${topDishes.map((d, i) => {
                  const img = safeUrl(d.image_url);
                  return `
                    <tr>
                      <td class="py-2 pl-4">
                        <div class="flex items-center gap-2 min-w-0">
                          <span class="w-4 text-ink">${i + 1}</span>
                          ${img ? `<img src="${esc(img)}" alt="" loading="lazy" class="w-8 h-8 rounded-lg object-cover shrink-0">` : '<div class="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center shrink-0"><i class="ph-bold ph-fork-knife text-[11px] text-ink"></i></div>'}
                          <span class="text-ink font-bold truncate max-w-[34vw] md:max-w-[280px]">${esc(d.name)}</span>
                        </div>
                      </td>
                      <td class="py-2">
                        <div class="flex items-center gap-2">
                          <div class="h-2.5 ${i === 0 ? 'bg-brand' : 'bg-brand/45'} rounded-full" style="width:${Math.max(2, (d.views / maxDish) * 80)}%" data-tip="${esc(d.name)}: ${fmtNum(d.views)} مشاهدة"></div>
                          <b class="text-ink tnum">${fmtNum(d.views)}</b>
                        </div>
                      </td>
                      <td class="py-2 text-center ${d.orders ? 'text-green-700 font-bold' : 'text-ink'}">${d.orders ? fmtNum(d.orders) : '—'}</td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
          </div>` : '<p class="text-[11px] text-ink">ما فتح أحد تفاصيل أي طبق خلال الفترة.</p>'}
      </div>

      <div class="grid md:grid-cols-2 gap-5">
        <div>
          <p class="text-[11px] font-bold text-ink mb-2">أكثر الأقسام اهتماماً</p>
          ${catTotals.length ? `<div class="space-y-1.5">${catTotals.slice(0, 6).map(c => barRow(esc(c.name), c.views, maxCat, 'bg-brand/50')).join('')}</div>`
            : '<p class="text-[11px] text-ink">لا توجد بيانات كافية بعد.</p>'}
        </div>
        <div class="space-y-4">
          <div>
            <p class="text-[11px] font-bold text-ink mb-2">من وين يجي زبائنك؟</p>
            ${known ? `
              <div class="flex h-3 rounded-full overflow-hidden bg-brand/5">
                <div class="bg-amber-400" style="width:${qrPct}%"></div>
                <div class="bg-brand/50" style="width:${100 - qrPct}%"></div>
              </div>
              <div class="flex justify-between text-[11px] mt-1.5">
                <span class="text-amber-700"><i class="ph-bold ph-qr-code"></i> مسح QR · ${qrPct}%</span>
                <span class="text-brand"><i class="ph-bold ph-link-simple"></i> رابط مشارك · ${100 - qrPct}%</span>
              </div>` : '<p class="text-[11px] text-ink">يظهر بعد أول زيارات من رمز QR الجديد.</p>'}
          </div>
          <div>
            <p class="text-[11px] font-bold text-ink mb-1">لغة التصفح</p>
            <p class="text-[11px] text-ink"><b class="text-ink">${enPct}%</b> من الزيارات تحوّلت للإنجليزي</p>
          </div>
        </div>
      </div>

      ${cold.length ? `
        <div>
          <p class="text-[11px] font-bold text-ink mb-2">أطباق ما فتحها أحد <span class="text-ink font-normal">(${cold.length})</span></p>
          <div class="flex flex-wrap gap-1.5">
            ${cold.slice(0, 12).map(d => `<button onclick="startEdit(${Number(d.id)})" class="bg-brand/5 hover:bg-brand/10 border border-brand/15 text-ink px-2.5 py-1 rounded-lg text-[11px] transition">${esc(d.name)}${d.image_url ? '' : ' <i class="ph-bold ph-image text-amber-600" title="بدون صورة"></i>'}</button>`).join('')}
            ${cold.length > 12 ? `<span class="text-[11px] text-ink self-center">و${cold.length - 12} غيرها</span>` : ''}
          </div>
        </div>` : ''}
    `;
    statsTips(body);
  }

  // تصدير ملف يفتح في Excel (مع دعم العربي)
  function exportStatsCsv() {
    if (!lastStats) return;
    const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const catNameOf = (key) => (loadedCategories.find(c => c.key === key || c.name === key) || {}).name || '';
    const rows = [
      [`إحصائيات منيو ${client.name || ''} — آخر ${lastStats.days} يوم`],
      [],
      ['المؤشر', 'القيمة'],
      ['زيارات المنيو', lastStats.totals.views],
      ['مشاهدات الأطباق', lastStats.totals.dishes],
      ['طلبات واتساب', lastStats.totals.orders],
      ['زيارات من QR', lastStats.totals.qr],
      ['زيارات من رابط', lastStats.totals.link],
      [],
      ['الطبق', 'القسم', 'المشاهدات', 'طلبات واتساب'],
      ...(lastStats.dishes || []).map(d => [d.name, catNameOf(d.category), d.views, d.orders]),
      [],
      ['اليوم', 'الزيارات'],
      ...(lastStats.daily || []).map(d => [d.day, d.views])
    ];
    const csv = '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = `stats-${client.client_slug}-${lastStats.days}d.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  }

  // ─── اسأل عن أرقامك ───
  // أكثر أسئلة الزبائن للمساعد
  async function loadChatTop() {
    const card = document.getElementById('chat-top-card');
    const on = client && client.menu_chat === true && !featureLocked('chat') && !DMPlans.isFree(client);
    card.classList.toggle('hidden', !on);
    if (!on) return;
    let r;
    try { r = await api('chat-top'); } catch { return card.classList.add('hidden'); }
    document.getElementById('chat-top-count').textContent = r.month_used ? `${r.month_used} سؤال هالشهر` : '';
    const list = document.getElementById('chat-top-list');
    list.innerHTML = r.questions.length ? r.questions.map(x => `
      <details class="group rounded-xl border border-brand/15 bg-white">
        <summary class="flex items-center justify-between gap-2 px-3 py-2.5 cursor-pointer list-none">
          <span class="text-[12.5px] font-bold text-ink min-w-0">${esc(x.q)}</span>
          <span class="shrink-0 flex items-center gap-2"><span class="text-[10.5px] font-bold text-violet-700 bg-violet-500/10 rounded-full px-2 py-0.5">${x.n === 1 ? 'مرة' : x.n === 2 ? 'مرتين' : `${x.n} مرات`}</span><i class="ph-bold ph-caret-down text-ink group-open:rotate-180 transition"></i></span>
        </summary>
        ${x.a ? `<p class="px-3 pb-3 text-[12px] text-ink leading-relaxed whitespace-pre-line">${esc(x.a)}</p>` : ''}
      </details>`).join('')
      : '<p class="text-[12px] text-ink py-2">لسا ما سأل أحد. أول ما يسألون المساعد تطلع أسئلتهم هنا.</p>';
  }
  function renderInsightChips() {
    document.getElementById('insights-card').style.display = DMPlans.isFree(client) ? 'none' : '';
    const qs = [];
    if (!featureLocked('pager')) qs.push('كم متوسط الانتظار اليوم؟', 'وش أزحم ساعة عندي؟', 'لخص لي آراء الزبائن');
    if (!featureLocked('menu')) qs.push('وش أكثر طبق ينشاف؟', 'وش الأطباق اللي محد يفتحها؟');
    document.getElementById('ins-chips').innerHTML = qs.slice(0, 5).map(q => `<button type="button" class="text-[11px] font-bold px-3 py-1.5 rounded-full bg-brand/10 border border-brand/45 hover:bg-brand/10 text-ink transition">${esc(q)}</button>`).join('');
    document.getElementById('ins-chips').onclick = (e) => { const b = e.target.closest('button'); if (b) { document.getElementById('ins-q').value = b.textContent; askInsights(); } };
  }
  async function askInsights(e) {
    if (e) e.preventDefault();
    const input = document.getElementById('ins-q'), q = input.value.trim(), out = document.getElementById('ins-out'), btn = document.getElementById('ins-send');
    if (!q) return input.focus();
    btn.disabled = true; out.classList.remove('hidden');
    out.innerHTML = '<i class="ph-bold ph-spinner-gap ph-spin"></i> أقرأ أرقامك…';
    try { const r = await api('insights', { question: q }); out.textContent = r.reply; }
    catch (err) { out.textContent = err.message || 'ما قدرت أجاوب الحين، جرّب مرة ثانية'; }
    finally { btn.disabled = false; }
  }

