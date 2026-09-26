// =====================================================================
// DEV MENU — قائمة الانتظار (صفحة العميل، بدون تسجيل دخول)
//   GET  /api/waitlist?action=info&slug=      بيانات النموذج + عدد المنتظرين
//   POST /api/waitlist?action=join            تسجيل جديد + بريد تأكيد
//   GET  /api/waitlist?action=status&slug=&t= حالة التسجيل (رقم الدور، الترتيب، الوقت)
//   POST /api/waitlist?action=cancel          إلغاء التسجيل
// =====================================================================
const crypto = require('crypto');
const { handler, rest, rpc, q, ApiError, readBody, str, int } = require('./_lib/core');
const { SEATING, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor } = require('./_lib/waitlist');
const { sendMail } = require('./_lib/mail');

// المتجر لازم يكون ساري + مفعّل عنده قائمة الانتظار
async function loadStore(slug) {
  slug = String(slug || '').trim().toLowerCase();
  if (!/^[a-z0-9_-]{2,60}$/.test(slug)) throw new ApiError(400, 'الرابط غير صحيح');
  const live = (await rest(`public_clients?client_slug=eq.${q(slug)}&select=id,name,client_slug,logo_url,bg_image_url&limit=1`))[0];
  if (!live) throw new ApiError(404, 'قائمة الانتظار غير متاحة حالياً', 'NOT_AVAILABLE');
  const extra = (await rest(`clients?id=eq.${live.id}&select=waitlist_enabled,waitlist_settings`))[0] || {};
  if (!extra.waitlist_enabled) throw new ApiError(404, 'قائمة الانتظار غير متاحة حالياً', 'NOT_AVAILABLE');
  return { store: live, settings: normalizeSettings(extra.waitlist_settings) };
}

const todayEntries = (clientId) =>
  rest(`waitlist_entries?client_id=eq.${clientId}&created_at=gte.${q(riyadhDayStart())}&select=id,status&order=id.asc`);

module.exports = handler(['GET', 'POST'], async (req) => {
  const action = req.query.action;
  const b = req.method === 'POST' ? readBody(req) : {};

  if (action === 'info' && req.method === 'GET') {
    const { store, settings } = await loadStore(req.query.slug);
    const waiting = (await todayEntries(store.id)).filter(e => e.status === 'waiting').length;
    return {
      store,
      settings: { open: settings.open, fields: settings.fields, message: settings.message, max_party: settings.max_party },
      waiting,
      eta: (waiting + 1) * settings.minutes_per_party
    };
  }

  if (action === 'join' && req.method === 'POST') {
    const { store, settings } = await loadStore(b.slug);
    if (!settings.open) throw new ApiError(409, 'قائمة الانتظار مغلقة حالياً', 'CLOSED');
    const F = settings.fields;

    const val = {
      name: str(b.name, 60, 'الاسم'),
      phone: String(b.phone || '').replace(/[^\d+]/g, '').slice(0, 16),
      email: str(b.email, 120, 'البريد').toLowerCase(),
      party_size: b.party_size === '' || b.party_size == null ? null : int(b.party_size),
      seating: SEATING[b.seating] ? b.seating : '',
      notes: str(b.notes, 200, 'الملاحظات')
    };
    // الحقول المخفية ما نحفظها، والإلزامية لازم تكون موجودة
    for (const f of Object.keys(val)) if (!F[f].on) val[f] = f === 'party_size' ? null : '';
    const missing = { name: 'الاسم', phone: 'رقم الجوال', email: 'البريد الإلكتروني', party_size: 'عدد الأشخاص', seating: 'تفضيل الجلسة', notes: 'الملاحظات' };
    for (const f of Object.keys(missing)) {
      if (F[f].req && (val[f] === '' || val[f] === null)) throw new ApiError(400, `${missing[f]} مطلوب`);
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val.email)) throw new ApiError(400, 'البريد الإلكتروني غير صحيح');
    if (val.phone && !/^\+?\d{9,15}$/.test(val.phone)) throw new ApiError(400, 'رقم الجوال غير صحيح');
    if (val.party_size !== null && (!Number.isInteger(val.party_size) || val.party_size < 1 || val.party_size > settings.max_party)) {
      throw new ApiError(400, `عدد الأشخاص من 1 إلى ${settings.max_party}`);
    }

    const token = crypto.randomBytes(18).toString('base64url');
    let res;
    try {
      res = await rpc('server_waitlist_join', {
        p_client_id: store.id, p_token: token, p_name: val.name, p_phone: val.phone, p_email: val.email,
        p_party: val.party_size, p_seating: val.seating, p_notes: val.notes
      });
    } catch (e) {
      if (String(e.dbMessage || e.message).includes('WAITLIST_FULL')) throw new ApiError(409, 'قائمة الانتظار ممتلئة حالياً', 'FULL');
      throw e;
    }
    if (res.duplicate) return { token: res.token, ticket: res.ticket, duplicate: true };

    // الترتيب والوقت ثم بريد التأكيد
    const entries = await todayEntries(store.id);
    const me = (await rest(`waitlist_entries?token=eq.${q(res.token)}&select=*`))[0];
    const { position, eta } = positionOf(me, entries, settings);
    const email_sent = await sendMail({
      to: me.email, fromName: store.name,
      ...emailTemplate('confirm', { store, entry: me, statusUrl: statusUrlFor(req, store.client_slug, me.token), eta })
    });
    return { token: me.token, ticket: me.ticket, position, eta, email_sent };
  }

  if (action === 'status' && req.method === 'GET') {
    const { store, settings } = await loadStore(req.query.slug);
    const token = String(req.query.t || '');
    if (!/^[A-Za-z0-9_-]{10,64}$/.test(token)) throw new ApiError(404, 'التسجيل غير موجود', 'NOT_FOUND');
    const me = (await rest(`waitlist_entries?token=eq.${q(token)}&client_id=eq.${store.id}&select=id,ticket,name,party_size,status,created_at,notified_at`))[0];
    if (!me) throw new ApiError(404, 'التسجيل غير موجود', 'NOT_FOUND');
    const entries = await todayEntries(store.id);
    const expired = me.status === 'waiting' && !entries.some(e => e.id === me.id);   // تسجيل من يوم سابق
    const { position, eta } = positionOf(me, entries, settings);
    return {
      store: { name: store.name, logo_url: store.logo_url },
      entry: { ticket: me.ticket, name: me.name, party_size: me.party_size, status: expired ? 'expired' : me.status, created_at: me.created_at, notified_at: me.notified_at },
      position, eta, hold_minutes: settings.hold_minutes
    };
  }

  if (action === 'cancel' && req.method === 'POST') {
    const { store } = await loadStore(b.slug);
    const token = String(b.t || '');
    const rows = await rest(`waitlist_entries?token=eq.${q(token)}&client_id=eq.${store.id}&status=in.(waiting,notified)`,
      { method: 'PATCH', body: { status: 'cancelled', closed_at: new Date().toISOString() }, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'التسجيل غير موجود أو انتهى', 'NOT_FOUND');
    return { ok: true };
  }

  throw new ApiError(404, 'Unknown action');
});
