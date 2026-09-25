// =====================================================================
// DEV MENU — منطق قائمة الانتظار المشترك (الإعدادات، الدور، الوقت، رسائل البريد)
// =====================================================================
const FIELDS = ['name', 'phone', 'email', 'party_size', 'seating', 'notes'];
const SEATING = { indoor: 'داخلي', outdoor: 'خارجي', any: 'بدون تفضيل' };

// الإعدادات الافتراضية؛ البريد إلزامي دائماً لأن الإشعارات تصل عليه
const DEFAULTS = {
  open: true,
  minutes_per_party: 10,
  hold_minutes: 10,
  max_party: 20,
  message: '',
  fields: {
    name:       { on: true,  req: true },
    phone:      { on: true,  req: true },
    email:      { on: true,  req: true },
    party_size: { on: true,  req: true },
    seating:    { on: false, req: false },
    notes:      { on: true,  req: false }
  }
};

function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const num = (v, def, min, max) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : def; };
  const out = {
    open: s.open !== false,
    minutes_per_party: num(s.minutes_per_party, DEFAULTS.minutes_per_party, 1, 120),
    hold_minutes: num(s.hold_minutes, DEFAULTS.hold_minutes, 2, 60),
    max_party: num(s.max_party, DEFAULTS.max_party, 1, 100),
    message: typeof s.message === 'string' ? s.message.trim().slice(0, 200) : '',
    fields: {}
  };
  for (const f of FIELDS) {
    const src = (s.fields && s.fields[f]) || DEFAULTS.fields[f];
    const on = src.on === true, req = on && src.req === true;
    out.fields[f] = { on, req };
  }
  out.fields.email = { on: true, req: true };
  return out;
}

// بداية اليوم بتوقيت الرياض (القائمة تبدأ من جديد كل يوم)
function riyadhDayStart() {
  const now = new Date(Date.now() + 3 * 3600e3);
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 3 * 3600e3).toISOString();
}

// الترتيب الحالي والوقت التقريبي لتسجيل معيّن
function positionOf(entry, todayEntries, settings) {
  if (entry.status !== 'waiting') return { position: 0, eta: 0 };
  const ahead = todayEntries.filter(e => e.status === 'waiting' && e.id < entry.id).length;
  return { position: ahead + 1, eta: (ahead + 1) * settings.minutes_per_party };
}

const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// قالب البريد (عربي + سطر إنجليزي مختصر)
function emailTemplate(kind, { store, entry, statusUrl, eta, hold }) {
  const logo = store.logo_url ? `<img src="${esc(store.logo_url)}" alt="" width="64" height="64" style="border-radius:16px;object-fit:cover;display:block;margin:0 auto 10px">` : '';
  const isReady = kind === 'ready';
  const title = isReady ? 'طاولتك جاهزة! 🎉' : 'تم تأكيد تسجيلك في قائمة الانتظار ✅';
  const lines = isReady
    ? `<p style="margin:0 0 8px">أهلاً ${esc(entry.name || '')}، طاولتك في <b>${esc(store.name)}</b> جاهزة الآن.</p>
       <p style="margin:0">توجّه للاستقبال خلال <b>${hold} دقائق</b> وأخبرهم برقم دورك.</p>`
    : `<p style="margin:0 0 8px">أهلاً ${esc(entry.name || '')}، سجّلناك في قائمة الانتظار لدى <b>${esc(store.name)}</b>.</p>
       <p style="margin:0">وقت الانتظار التقريبي: <b>${eta} دقيقة</b>. راح يوصلك بريد ثاني أول ما تجهز طاولتك.</p>`;
  const color = isReady ? '#15803d' : '#384f3d';
  const html = `
<div dir="rtl" style="background:#efe5dc;padding:28px 12px;font-family:Tahoma,Arial,sans-serif;color:#22362a">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;margin:0 auto;background:#faf6f1;border-radius:20px;border:1px solid #e0d6c8">
    <tr><td style="padding:26px 26px 8px;text-align:center">
      ${logo}
      <div style="font-size:15px;font-weight:bold">${esc(store.name)}</div>
    </td></tr>
    <tr><td style="padding:8px 26px;text-align:center">
      <div style="font-size:19px;font-weight:bold;color:${color};margin-bottom:14px">${title}</div>
      <div style="display:inline-block;background:${color};color:#faf6f1;border-radius:16px;padding:12px 26px;margin-bottom:16px">
        <div style="font-size:11px;opacity:.8">رقم دورك</div>
        <div style="font-size:34px;font-weight:bold;line-height:1.1">#${entry.ticket}</div>
      </div>
      <div style="font-size:14px;line-height:1.9;text-align:right">${lines}</div>
      ${entry.party_size ? `<p style="font-size:12px;color:#5b6b60;margin:12px 0 0">عدد الأشخاص: ${esc(entry.party_size)}</p>` : ''}
    </td></tr>
    ${statusUrl ? `<tr><td style="padding:16px 26px;text-align:center">
      <a href="${esc(statusUrl)}" style="display:inline-block;background:#22362a;color:#faf6f1;text-decoration:none;font-weight:bold;font-size:13px;padding:12px 22px;border-radius:12px">${isReady ? 'عرض التفاصيل' : 'تابع دورك مباشرة'}</a>
    </td></tr>` : ''}
    <tr><td style="padding:10px 26px 22px;text-align:center;font-size:11px;color:#8a8f86;line-height:1.8">
      <span dir="ltr">${isReady ? 'Your table is ready — please come to the host stand.' : "You're on the waitlist. We'll email you when your table is ready."}</span><br>
      إذا غيّرت رأيك، تقدر تلغي تسجيلك من رابط المتابعة.<br>DEV MENU
    </td></tr>
  </table>
</div>`;
  const subject = isReady ? `طاولتك جاهزة في ${store.name} — دور #${entry.ticket}` : `تم تسجيلك في قائمة انتظار ${store.name} — دور #${entry.ticket}`;
  const text = isReady
    ? `طاولتك في ${store.name} جاهزة. رقم دورك #${entry.ticket}. توجّه للاستقبال خلال ${hold} دقائق.${statusUrl ? `\n${statusUrl}` : ''}`
    : `تم تسجيلك في قائمة انتظار ${store.name}. رقم دورك #${entry.ticket}. الوقت التقريبي ${eta} دقيقة.${statusUrl ? `\nتابع دورك: ${statusUrl}` : ''}`;
  return { subject, html, text };
}

function siteOrigin(req) {
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  const proto = req.headers['x-forwarded-proto'] || 'https';
  return host ? `${proto}://${host}` : '';
}
const statusUrlFor = (req, slug, token) => {
  const origin = siteOrigin(req);
  return origin ? `${origin}/waitlist.html?client=${encodeURIComponent(slug)}&t=${encodeURIComponent(token)}` : '';
};

module.exports = { FIELDS, SEATING, DEFAULTS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor };
