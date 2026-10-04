// =====================================================================
// DEV MENU — API صاحب المتجر (يتطلب تسجيل دخول)
// كل طلب: نتحقق من الجلسة ← نحدد متجر المستخدم من بريده ← ننفذ
// المدير العام يقدر يدير أي متجر عبر ?client=slug
// =====================================================================
const {
  handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET,
  ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, SLUG_RE, RESERVED_SLUGS, CURRENCIES
} = require('./_lib/core');
const { FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor } = require('./_lib/waitlist');
const { sendMail, mailConfigured } = require('./_lib/mail');
const { sendPush } = require('./_lib/push');
const { encrypt, SECRET_RE, paySettings, moyasar } = require('./_lib/payments');

const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
const COFFEE_TYPES = ['cafe', 'mixed'];
const BUSINESS_TYPES = ['restaurant', 'cafe', 'mixed', 'bakery'];
const ALLERGENS = ['gluten', 'milk', 'egg', 'nuts', 'peanut', 'sesame', 'fish', 'shellfish', 'soy'];
const PROCESS = ['washed', 'natural', 'honey', 'anaerobic', 'carbonic', 'other'];
const ROAST = ['light', 'medium', 'dark'];
const METHODS = ['v60', 'chemex', 'aeropress', 'frenchpress', 'espresso', 'coldbrew'];
const DELIVERY = ['hungerstation', 'jahez', 'keeta', 'toyou', 'mrsool', 'thechefz', 'careem', 'shgardi', 'other'];
const THEMES = ['dark', 'light', 'sand', 'forest'];
const MAX_SIZES = 6, MAX_COUPONS = 100;
const OCCASION_PRESETS = ['ramadan', 'eid_fitr', 'eid_adha', 'national_day', 'founding_day', 'hijri_new_year', 'winter', 'custom'];
const STICKER_POSITIONS = ['logo-right', 'logo-left', 'float'];
const STICKER_SIZES = ['s', 'm', 'l'];
const STICKER_ANIMS = ['float', 'swing', 'bounce', 'pulse', 'none'];
const MAX_OCCASIONS = 20, MAX_STICKERS = 3;
const isDay = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v));

// مناسبات المتجر: [{id, preset, title, greeting, starts_on, ends_on, enabled, stickers}]
function cleanOccasions(list, sid, ownerIds = [sid], max = MAX_OCCASIONS) {
  if (!Array.isArray(list) || list.length > max) throw new ApiError(400, `المناسبات حدها ${max}`);
  const ids = new Set();
  return list.map((o) => {
    if (!o || typeof o !== 'object') throw new ApiError(400, 'مناسبة غير صحيحة');
    const id = String(o.id || '');
    if (!/^[a-z0-9]{6,16}$/.test(id) || ids.has(id)) throw new ApiError(400, 'معرّف المناسبة غير صحيح');
    ids.add(id);
    if (!OCCASION_PRESETS.includes(o.preset)) throw new ApiError(400, 'نوع المناسبة غير معروف');
    const title = str(o.title, 40, 'اسم المناسبة');
    if (!title) throw new ApiError(400, 'اكتب اسم كل مناسبة');
    if (!isDay(o.starts_on) || !isDay(o.ends_on)) throw new ApiError(400, `حدد تاريخ البداية والنهاية لـ "${title}"`);
    if (o.ends_on < o.starts_on) throw new ApiError(400, `تاريخ النهاية قبل البداية في "${title}"`);
    if ((Date.parse(o.ends_on) - Date.parse(o.starts_on)) / 86400000 > 180) throw new ApiError(400, `مدة "${title}" أطول من 180 يوم`);
    if (o.stickers !== undefined && (!Array.isArray(o.stickers) || o.stickers.length > MAX_STICKERS)) throw new ApiError(400, `الملصقات حدها ${MAX_STICKERS} لكل مناسبة`);
    const stickers = (o.stickers || []).map((k) => {
      if (!k || !ownerIds.some(id => ownsMediaUrl(k.url, id))) throw new ApiError(400, 'ملصق غير تابع لمتجرك');
      return {
        url: k.url,
        position: STICKER_POSITIONS.includes(k.position) ? k.position : 'logo-right',
        size: STICKER_SIZES.includes(k.size) ? k.size : 'm',
        animation: STICKER_ANIMS.includes(k.animation) ? k.animation : 'float'
      };
    });
    const out = { id, preset: o.preset, title, greeting: str(o.greeting, 60, 'نص التهنئة'), starts_on: o.starts_on, ends_on: o.ends_on, enabled: o.enabled !== false, stickers };
    if (typeof o.origin === 'string' && /^[a-z0-9]{6,16}$/.test(o.origin)) out.origin = o.origin;
    return out;
  });
}
const validPrice = (n) => Number.isFinite(n) && n >= 0 && n <= 100000;
const round2 = (n) => Math.round(n * 100) / 100;

// أحجام الطبق: [{name, name_en, price}] بأسماء غير مكررة
function cleanSizes(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > MAX_SIZES) throw new ApiError(400, `الأحجام حدها ${MAX_SIZES}`);
  const seen = new Set();
  return list.map((z) => {
    if (!z || typeof z !== 'object') throw new ApiError(400, 'حجم غير صحيح');
    const name = str(z.name, 30, 'اسم الحجم');
    if (!name) throw new ApiError(400, 'اكتب اسم كل حجم');
    if (seen.has(name)) throw new ApiError(400, `الحجم "${name}" مكرر`);
    seen.add(name);
    const price = Number(z.price);
    if (!validPrice(price)) throw new ApiError(400, `اكتب سعراً صحيحاً للحجم "${name}"`);
    const item = { name, price: round2(price) };
    const en = str(z.name_en, 30, 'اسم الحجم بالإنجليزي');
    if (en) item.name_en = en;
    return item;
  });
}

// تاريخ YYYY-MM-DD بتوقيت الرياض: بداية اليوم أو نهايته
function riyadhDate(v, endOfDay, field) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v) || isNaN(Date.parse(v))) throw new ApiError(400, `تاريخ غير صحيح: ${field}`);
  return `${v}T${endOfDay ? '23:59:59.999' : '00:00:00'}+03:00`;
}
const MAX_ORDER_NUMBERS = 5, MAX_CUSTOM_LINKS = 30;

// رقم اتصال: أرقام فقط (9 إلى 15) مع + اختيارية في البداية. المسافات والشرطات تنشال
function phoneNumber(v) {
  const s = str(v, 30, 'رقم الطلبات').replace(/[\s\-()]/g, '');
  if (!/^\+?\d{9,15}$/.test(s)) throw new ApiError(400, 'رقم الطلبات غير صحيح: أرقام فقط من 9 إلى 15 رقم');
  return s;
}

async function context(req, { needStore = true } = {}) {
  const user = await getUser(req);
  const admin = await isSuperAdmin(user.email);
  const slug = String(req.query.client || '').trim().toLowerCase();
  let store = null;
  if (admin && slug) {
    store = (await rest(`clients?client_slug=eq.${q(slug)}&select=*&limit=1`))[0] || null;
  } else {
    store = (await rpc('server_client_by_email', { p_email: user.email }))[0] || null;
  }
  if (!store && needStore) throw new ApiError(404, 'لا يوجد متجر مرتبط بحسابك', 'NO_STORE');
  // الفروع: صاحب المتجر الرئيسي يدير فروعه عبر ?branch=id
  const bid = int(req.query.branch);
  if (store && Number.isInteger(bid) && bid !== store.id) {
    const branch = (await rest(`clients?id=eq.${bid}&select=*&limit=1`))[0];
    const root = store.parent_id || store.id;
    if (!branch || (branch.parent_id !== root && branch.id !== root)) throw new ApiError(404, 'الفرع غير موجود', 'NO_BRANCH');
    store = branch;
  }
  return { user, admin, store };
}

// المتجر الرئيسي وكل فروعه
async function familyOf(store, fields = 'id,name,client_slug,parent_id') {
  const root = store.parent_id || store.id;
  return rest(`clients?or=${q(`(id.eq.${root},parent_id.eq.${root})`)}&select=${fields}&order=id.asc`);
}

// قسم بنفس الاسم في متجر/فرع ثاني، وينشأ لو ما هو موجود
async function categoryIn(clientId, src) {
  const cats = await rest(`categories?client_id=eq.${clientId}&select=key,name,sort_order`);
  const found = cats.find(c => c.name === src.name);
  if (found) return found;
  return (await rest('categories', { method: 'POST', prefer: 'return=representation', body: {
    client_id: clientId, name: src.name, name_en: src.name_en || null, group_name: src.group_name || null,
    key: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
    sort_order: Math.max(0, ...cats.map(c => c.sort_order || 0)) + 1
  } }))[0];
}
const nextOrderIn = async (clientId, category) => {
  const same = await rest(`products?client_id=eq.${clientId}&category=eq.${q(category)}&select=sort_order`);
  return Math.max(0, ...same.map(x => x.sort_order || 0)) + 1;
};
// حقول الطبق المشتركة بين الفروع (السعر والإخفاء والتوفر والتمييز والترتيب لكل فرع لحاله)
const SHARED_PRODUCT_FIELDS = ['name', 'name_en', 'description', 'description_en', 'extra_info', 'note', 'image_url', 'calories', 'allergens', 'coffee'];

async function patchStore(id, payload) {
  const rows = await rest(`clients?id=eq.${id}`, { method: 'PATCH', body: payload, prefer: 'return=representation' });
  return rows[0];
}

function cleanCoffee(c) {
  if (!c || typeof c !== 'object') return null;
  const s = (v, n) => str(typeof v === 'string' ? v : '', n, 'القهوة');
  const out = {
    origin: s(c.origin, 60), region: s(c.region, 60), variety: s(c.variety, 60),
    process: PROCESS.includes(c.process) ? c.process : '',
    process_other: c.process === 'other' ? s(c.process_other, 40) : '',
    roast: ROAST.includes(c.roast) ? c.roast : '',
    altitude: Number.isInteger(int(c.altitude)) && int(c.altitude) > 0 && int(c.altitude) < 5000 ? int(c.altitude) : null,
    notes: Array.isArray(c.notes) ? [...new Set(c.notes.map(n => String(n).trim().slice(0, 25)).filter(Boolean))].slice(0, 8) : [],
    methods: Array.isArray(c.methods) ? c.methods.filter(m => METHODS.includes(m)) : []
  };
  if (out.process === 'other' && !out.process_other) out.process = '';
  const empty = !out.origin && !out.region && !out.variety && !out.process && !out.roast && !out.altitude && !out.notes.length && !out.methods.length;
  return empty ? null : out;
}

const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };
const VIDEO_TYPES = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' };

// ─── البيجر: إرسال رنّة واحدة وتسجيلها ───
const PAGER_MAX_RINGS = 5;
async function ringTicket(store, t) {
  if (!t.push_sub) return 'off';
  const n = (t.ring_count || 0) + 1;
  const url = `https://${store.client_slug}.devmenu.digital/pager`;
  const payload = n === 1
    ? { title: `🔔 طلبك جاهز! رقم ${t.number}`, body: `تفضّل استلمه من ${store.name}` }
    : { title: `🔔 تذكير: طلبك جاهز! رقم ${t.number}`, body: `طلبك ينتظرك عند الكاشير (${n}/${PAGER_MAX_RINGS})` };
  // وسم مختلف لكل رنّة عشان الجوال يرن كل مرة (الآيفون ما يعيد التنبيه لنفس الوسم)
  const result = await sendPush(t.push_sub, { ...payload, url, tag: `pager-${t.id}-${n}` });
  console.log('PAGER_RING', store.id, t.id, n, result);
  const patch = result === 'gone' ? { push_sub: null } : { ring_count: n, last_ring_at: new Date().toISOString() };
  await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: patch }).catch(() => {});
  return result;
}

module.exports = handler(['GET', 'POST'], async (req) => {
  const action = req.query.action;
  const b = req.method === 'POST' ? readBody(req) : {};

  // ─── من أنا؟ (لتوجيه المستخدم بعد الدخول) ───
  if (action === 'whoami') {
    const { user, admin, store } = await context(req, { needStore: false });
    return { email: user.email, is_admin: admin, has_store: !!store, slug: store && store.client_slug };
  }

  // ─── إنشاء متجر جديد بعد التحقق من البريد ───
  if (action === 'register' && req.method === 'POST') {
    const user = await getUser(req);
    const name = str(b.name, 80, 'اسم المتجر');
    if (!name) throw new ApiError(400, 'اكتب اسم المطعم أو الكافيه', 'INVALID_NAME');
    let phone = '';
    try { phone = waNumber(b.phone); } catch { throw new ApiError(400, 'رقم الجوال غير صحيح', 'INVALID_PHONE'); }
    const type = BUSINESS_TYPES.includes(b.business_type) ? b.business_type : 'restaurant';
    try {
      const slug = await rpc('server_register_client', { p_email: user.email, p_name: name, p_phone: phone, p_type: type });
      return { slug };
    } catch (e) {
      if (String(e.dbMessage || e.message).includes('EMAIL_TAKEN')) throw new ApiError(409, 'هذا البريد مرتبط بمتجر مسجل مسبقاً', 'EMAIL_TAKEN');
      throw e;
    }
  }

  // ─── تحميل لوحة التحكم ───
  if (action === 'load') {
    const { user, admin, store } = await context(req, { needStore: false });
    if (!store) return { email: user.email, is_admin: admin, store: null };
    store.waitlist_settings = normalizeSettings(store.waitlist_settings);
    const root = store.parent_id || store.id;
    const [categories, products, branches] = await Promise.all([
      rest(`categories?client_id=eq.${store.id}&select=*`),
      rest(`products?client_id=eq.${store.id}&select=*`),
      // المتجر الرئيسي وفروعه (لقائمة التبديل بين الفروع)
      familyOf(store, 'id,name,client_slug,parent_id,occasions').catch(() => [])
    ]);
    return { email: user.email, is_admin: admin, store, branches, categories: categories.sort(bySort), products: products.sort(bySort) };
  }

  // ─── الإحصائيات ───
  if (action === 'stats') {
    const { store } = await context(req);
    const days = Math.min(365, Math.max(1, int(req.query.days) || 30));
    return await rpc('server_menu_stats', { p_client_id: store.id, p_days: days });
  }

  // ─── قائمة الانتظار: تسجيلات اليوم ───
  if (action === 'waitlist' && req.method === 'GET') {
    const { store } = await context(req);
    if (!store.waitlist_enabled) throw new ApiError(403, 'قائمة الانتظار غير مفعّلة لمتجرك', 'ADDON_OFF');
    const settings = normalizeSettings(store.waitlist_settings);
    const entries = await rest(`waitlist_entries?client_id=eq.${store.id}&created_at=gte.${q(riyadhDayStart())}&select=*&order=id.asc`);
    entries.forEach(e => Object.assign(e, positionOf(e, entries, settings)));
    return { settings, entries, mail_ready: mailConfigured() };
  }

  // ─── قائمة الانتظار: سجل الضيوف (للعرض والتصدير) ───
  if (action === 'waitlist-history' && req.method === 'GET') {
    const { store } = await context(req);
    const days = req.query.days === 'all' ? null : Math.min(3650, Math.max(1, int(req.query.days) || 30));
    const from = days === null ? null : new Date(Date.now() - days * 86400000).toISOString();
    const fields = 'ticket,name,phone,email,party_size,seating,notes,status,created_at,notified_at,closed_at';
    // Supabase يرجّع 1000 صف كحد أقصى في الطلب، فنجيبها على دفعات
    const entries = [];
    for (let offset = 0; offset < 20000; offset += 1000) {
      const page = await rest(`waitlist_entries?client_id=eq.${store.id}${from ? `&created_at=gte.${q(from)}` : ''}&select=${fields}&order=created_at.desc&limit=1000&offset=${offset}`);
      entries.push(...page);
      if (page.length < 1000) break;
    }
    return { entries, from, store_name: store.name, slug: store.client_slug };
  }

  // ─── كوبونات الخصم: القائمة ───
  if (action === 'coupons' && req.method === 'GET') {
    const { store } = await context(req);
    return { coupons: await rest(`coupons?client_id=eq.${store.id}&select=*&order=id.desc`) };
  }

  // ─── البيجر: أرقام اليوم ───
  if (action === 'pager' && req.method === 'GET') {
    const { store } = await context(req);
    const base = `pager_tickets?client_id=eq.${store.id}&created_at=gte.${q(riyadhDayStart())}&order=number.asc&select=id,number,status,created_at,ready_at,closed_at,push_sub`;
    // أعمدة التكرار من 21-pager-repeat.sql — لو ما انضافت نكمل بدونها
    const tickets = await rest(`${base},ring_count,acked_at,invoice_no,order_id`)
      .catch(() => rest(`${base},ring_count,acked_at,invoice_no`)).catch(() => rest(`${base},ring_count,acked_at`)).catch(() => rest(base));
    // الطلبات المدفوعة من المنيو: الأصناف والمبلغ تظهر على رقمها
    const orderIds = tickets.map(t => t.order_id).filter(Boolean);
    const orders = orderIds.length
      ? await rest(`orders?id=in.(${orderIds.join(',')})&client_id=eq.${store.id}&select=id,items,total,currency,customer_name,note,status`).catch(() => [])
      : [];
    const byId = new Map(orders.map(o => [o.id, { ...o, total: Number(o.total) }]));
    return {
      tickets: tickets.map(({ push_sub, order_id, ...t }) => ({ ...t, has_push: !!push_sub, order: order_id ? byId.get(order_id) || null : null })),
      slug: store.client_slug, name: store.name, max_rings: PAGER_MAX_RINGS, currency: store.currency || 'SAR'
    };
  }

  // ─── الدفع الإلكتروني (Moyasar): حالة الربط بدون كشف المفتاح ───
  if (action === 'payment-settings' && req.method === 'GET') {
    const { store } = await context(req);
    const pay = await paySettings(store.id);
    return { enabled: !!(pay && pay.enabled), connected: !!(pay && pay.hasSecret), live: !!(pay && pay.live) };
  }

  if (req.method !== 'POST') throw new ApiError(404, 'Unknown action');
  const { store } = await context(req);
  const sid = store.id;

  // ربط حساب Moyasar / تفعيل وإيقاف الدفع. المفتاح يتجرّب على Moyasar قبل الحفظ
  if (action === 'payment-settings-save') {
    const current = await paySettings(sid);
    const row = { client_id: sid, provider: 'moyasar', updated_at: new Date().toISOString() };
    const key = String(b.secret_key || '').trim();
    if (key) {
      if (!SECRET_RE.test(key)) throw new ApiError(400, 'المفتاح السري يبدأ بـ sk_live_ أو sk_test_');
      await moyasar(key, 'GET', 'invoices?page=1');   // يرمي "مفتاح Moyasar غير صحيح" لو مرفوض
      row.secret_key_enc = encrypt(key);
      row.live = key.startsWith('sk_live_');
    }
    if (b.disconnect === true) { row.secret_key_enc = null; row.live = false; row.enabled = false; }
    else if (Object.prototype.hasOwnProperty.call(b, 'enabled')) {
      if (b.enabled === true && !key && !(current && current.hasSecret)) throw new ApiError(400, 'اربط حساب Moyasar أولاً');
      row.enabled = b.enabled === true;
    }
    try {
      await rest('payment_settings?on_conflict=client_id', { method: 'POST', body: row, prefer: 'resolution=merge-duplicates' });
    } catch (e) {
      if (/payment_settings/.test(e.dbMessage || '')) throw new ApiError(400, 'شغّل ملف 24-online-orders.sql في Supabase أولاً');
      throw e;
    }
    const pay = await paySettings(sid);
    return { enabled: !!(pay && pay.enabled), connected: !!(pay && pay.hasSecret), live: !!(pay && pay.live) };
  }

  // ─── البيجر: الطلب جاهز (يرن جوال العميل) / تم التسليم / إلغاء / إرجاع للانتظار ───
  if (action === 'pager-update') {
    const id = int(b.id);
    const status = b.status;
    if (!['waiting', 'ready', 'done', 'cancelled'].includes(status)) throw new ApiError(400, 'حالة غير صحيحة');
    const now = new Date().toISOString();
    const patch = { status };
    if (status === 'ready') { patch.ready_at = now; patch.closed_at = null; }
    else if (status === 'waiting') { patch.ready_at = null; patch.closed_at = null; }
    else patch.closed_at = now;
    if (status === 'done' || status === 'cancelled') patch.push_sub = null;
    const rows = await rest(`pager_tickets?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الرقم غير موجود');
    let t = rows[0];
    // "جاهز" = أول رنّة، والعدّاد يبدأ من جديد (لو رجع للتجهيز ثم جاهز مرة ثانية)
    let push = 'off';
    if (status === 'ready' && !t.push_sub) console.log('PAGER_READY_NO_SUB', sid, t.id);
    if (status === 'ready') {
      await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { ring_count: 0, last_ring_at: null, acked_at: null } }).catch(() => {});
      t = { ...t, ring_count: 0, acked_at: null };
      push = await ringTicket(store, t);
    }
    return { ticket: { id: t.id, number: t.number, status: t.status, created_at: t.created_at, ready_at: t.ready_at, closed_at: t.closed_at, has_push: !!t.push_sub, ring_count: t.ring_count || 0, acked_at: t.acked_at || null }, push };
  }

  // ─── البيجر: الكاشير يربط رقم البيجر برقم الفاتورة ───
  if (action === 'pager-invoice') {
    const id = int(b.id);
    // الأرقام العربية (١٢٣) والفارسية تتحول لأرقام عادية
    const invoice = String(b.invoice ?? '').trim().replace(/\s+/g, '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) & 15));
    if (invoice && !/^[A-Za-z0-9#\-_/]{1,20}$/.test(invoice)) throw new ApiError(400, 'رقم الفاتورة: أرقام وحروف إنجليزية فقط (حتى 20)');
    if (invoice) {
      // نفس الفاتورة ما تنربط برقمين بيجر في نفس اليوم
      const dup = await rest(`pager_tickets?client_id=eq.${sid}&invoice_no=eq.${q(invoice)}&id=neq.${id}&created_at=gte.${q(riyadhDayStart())}&status=in.(waiting,ready)&select=number&limit=1`);
      if (dup.length) throw new ApiError(409, `الفاتورة ${invoice} مربوطة برقم البيجر ${dup[0].number}`, 'DUPLICATE');
    }
    const rows = await rest(`pager_tickets?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: { invoice_no: invoice || null }, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الرقم غير موجود');
    return { ticket: { id: rows[0].id, number: rows[0].number, invoice_no: rows[0].invoice_no } };
  }

  // ─── البيجر: إعادة الرنين — شاشة الكاشير تطلبه كل 30 ثانية ───
  // يرن لكل رقم جاهز ما شافه العميل، بعد 25 ثانية على الأقل من آخر رنّة، بحد أقصى PAGER_MAX_RINGS
  if (action === 'pager-ring') {
    const before = new Date(Date.now() - 25e3).toISOString();
    let due = [];
    try {
      due = await rest(`pager_tickets?client_id=eq.${sid}&status=eq.ready&acked_at=is.null&push_sub=not.is.null&ring_count=lt.${PAGER_MAX_RINGS}&or=${q(`(last_ring_at.is.null,last_ring_at.lt."${before}")`)}&select=id,number,push_sub,ring_count`);
    } catch { return { rang: 0 }; }   // أعمدة التكرار ما انضافت بعد
    const results = await Promise.all(due.map(t => ringTicket(store, t)));
    return { rang: results.filter(r => r === 'sent').length };
  }

  // ─── قائمة الانتظار: الإعدادات ───
  if (action === 'waitlist-settings') {
    if (!store.waitlist_enabled) throw new ApiError(403, 'قائمة الانتظار غير مفعّلة لمتجرك', 'ADDON_OFF');
    const current = normalizeSettings(store.waitlist_settings);
    const next = normalizeSettings({ ...current, ...b, fields: { ...current.fields, ...(b.fields || {}) } });
    const saved = await patchStore(sid, { waitlist_settings: next });
    return { settings: normalizeSettings(saved.waitlist_settings) };
  }

  // ─── قائمة الانتظار: تغيير حالة عميل (الطاولة جاهزة / جلس / لم يحضر / إلغاء) ───
  if (action === 'waitlist-update') {
    if (!store.waitlist_enabled) throw new ApiError(403, 'قائمة الانتظار غير مفعّلة لمتجرك', 'ADDON_OFF');
    const id = int(b.id);
    const status = b.status;
    if (!['waiting', 'notified', 'seated', 'no_show', 'cancelled'].includes(status)) throw new ApiError(400, 'حالة غير صحيحة');
    const entry = (await rest(`waitlist_entries?id=eq.${id}&client_id=eq.${sid}&select=*`))[0];
    if (!entry) throw new ApiError(404, 'التسجيل غير موجود');
    const now = new Date().toISOString();
    const patch = { status };
    if (status === 'notified') { patch.notified_at = now; patch.closed_at = null; }
    else if (status === 'waiting') { patch.notified_at = null; patch.closed_at = null; }
    else patch.closed_at = now;
    const updated = (await rest(`waitlist_entries?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: patch, prefer: 'return=representation' }))[0];

    let email_sent = null;
    if (status === 'notified' && updated.email) {
      const settings = normalizeSettings(store.waitlist_settings);
      email_sent = await sendMail({
        to: updated.email, fromName: store.name,
        ...emailTemplate('ready', { store, entry: updated, statusUrl: statusUrlFor(req, store.client_slug, updated.token), hold: settings.hold_minutes })
      });
    }
    return { entry: updated, email_sent };
  }

  // ─── تعديل بيانات المتجر (حقول محددة فقط) ───
  if (action === 'update-store') {
    const p = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    if (has('name')) { p.name = str(b.name, 80, 'الاسم'); if (!p.name) throw new ApiError(400, 'اكتب اسم المطعم'); }
    if (has('promo_message')) p.promo_message = str(b.promo_message, 120, 'العرض');
    for (const k of ['website_url', 'tiktok_url', 'instagram_url', 'snapchat_url', 'location_url']) if (has(k)) p[k] = httpUrl(b[k], k);
    if (has('whatsapp_number')) p.whatsapp_number = waNumber(b.whatsapp_number);
    if (has('opening_hours')) p.opening_hours = str(b.opening_hours, 80, 'ساعات العمل');
    if (has('whatsapp_orders')) p.whatsapp_orders = b.whatsapp_orders === true;
    if (has('show_calories')) p.show_calories = b.show_calories !== false;
    if (has('currency')) {
      if (!Object.prototype.hasOwnProperty.call(CURRENCIES, b.currency)) throw new ApiError(400, 'العملة غير مدعومة');
      p.currency = b.currency;
    }
    if (has('delivery_apps')) {
      // كل تطبيق: نوعه من القائمة + رابط صفحة المطعم فيه (و"أخرى" يحتاج اسم)
      if (!Array.isArray(b.delivery_apps) || b.delivery_apps.length > 12) throw new ApiError(400, 'قائمة تطبيقات التوصيل غير صحيحة');
      const seen = new Set();
      p.delivery_apps = b.delivery_apps.map((d) => {
        if (!d || !DELIVERY.includes(d.app)) throw new ApiError(400, 'تطبيق توصيل غير معروف');
        const url = httpUrl(d.url, 'رابط التطبيق');
        if (!url) throw new ApiError(400, 'أضف رابط صفحتك في كل تطبيق توصيل مختار');
        const item = { app: d.app, url };
        if (d.app === 'other') {
          item.name = str(d.name, 30, 'اسم التطبيق');
          if (!item.name) throw new ApiError(400, 'اكتب اسم تطبيق التوصيل');
        } else if (seen.has(d.app)) {
          throw new ApiError(400, 'تطبيق التوصيل مكرر');
        }
        seen.add(d.app);
        return item;
      });
    }
    if (has('theme')) {
      if (!THEMES.includes(b.theme)) throw new ApiError(400, 'ثيم غير معروف');
      p.theme = b.theme;
    }
    if (has('accent_color')) {
      // null أو فاضي = بدون لون مخصص (يرجع للون الثيم)
      if (b.accent_color === null || b.accent_color === '') p.accent_color = null;
      else if (typeof b.accent_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.accent_color)) p.accent_color = b.accent_color.toLowerCase();
      else throw new ApiError(400, 'اللون لازم يكون بصيغة #RRGGBB');
    }
    if (has('order_numbers')) {
      if (!Array.isArray(b.order_numbers) || b.order_numbers.length > MAX_ORDER_NUMBERS) throw new ApiError(400, `أرقام الطلبات حدها ${MAX_ORDER_NUMBERS}`);
      p.order_numbers = b.order_numbers.map((n) => {
        if (!n || typeof n !== 'object') throw new ApiError(400, 'رقم طلبات غير صحيح');
        return { label: str(n.label, 40, 'عنوان الرقم'), phone: phoneNumber(n.phone) };
      });
    }
    if (has('custom_links')) {
      if (!Array.isArray(b.custom_links) || b.custom_links.length > MAX_CUSTOM_LINKS) throw new ApiError(400, `الروابط حدها ${MAX_CUSTOM_LINKS}`);
      p.custom_links = b.custom_links.map((l) => {
        if (!l || typeof l !== 'object') throw new ApiError(400, 'رابط غير صحيح');
        const title = str(l.title, 40, 'عنوان الرابط');
        if (!title) throw new ApiError(400, 'اكتب عنوان لكل رابط');
        const url = httpUrl(l.url, 'الرابط');
        if (!url) throw new ApiError(400, `أضف رابط صحيح لـ "${title}"`);
        return { title, url };
      });
    }
    if (has('occasions')) p.occasions = cleanOccasions(b.occasions, sid);
    if (has('business_type')) {
      if (!BUSINESS_TYPES.includes(b.business_type)) throw new ApiError(400, 'نوع نشاط غير صحيح');
      p.business_type = b.business_type;
    }
    for (const k of ['logo_url', 'bg_image_url', 'bg_video_url']) {
      if (!has(k)) continue;
      if (b[k] === null || b[k] === '') { p[k] = null; continue; }
      if (!ownsMediaUrl(b[k], sid)) throw new ApiError(400, 'ملف غير تابع لمتجرك');
      p[k] = b[k];
    }
    // طلبات واتساب ما تشتغل بدون رقم صالح
    const finalWa = has('whatsapp_number') ? p.whatsapp_number : store.whatsapp_number;
    if ((has('whatsapp_orders') ? p.whatsapp_orders : store.whatsapp_orders) && !finalWa) p.whatsapp_orders = false;
    if (!Object.keys(p).length) return { store };
    return { store: await patchStore(sid, p) };
  }

  // ─── المناسبات: كل فرع له مناسباته، ونقدر ننسخ مناسبة لفروع ثانية ───
  // النسخة مستقلة (تتعدل في فرعها لحاله). النسخ مرة ثانية يستبدل النسخة السابقة من نفس المصدر
  if (action === 'occasions-save') {
    const family = await familyOf(store, 'id,occasions');
    const ids = family.map(f => f.id);
    const mine = cleanOccasions(b.occasions, sid, ids);
    await patchStore(sid, { occasions: mine });
    const newId = () => (Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/[^a-z0-9]/g, '').slice(0, 12);
    const copiedTo = new Set();
    for (const c of (Array.isArray(b.copies) ? b.copies : []).slice(0, 20)) {
      const src = mine.find(o => o.id === c.id); if (!src) continue;
      for (const bid of [...new Set((Array.isArray(c.branch_ids) ? c.branch_ids : []).map(int))]) {
        const f = family.find(x => x.id === bid); if (!f || bid === sid) continue;
        const originId = src.origin || src.id;
        const list = (Array.isArray(f.occasions) ? f.occasions : []).filter(o => o.origin !== originId && o.id !== originId);
        if (list.length >= MAX_OCCASIONS) throw new ApiError(400, `الفرع وصل حد ${MAX_OCCASIONS} مناسبة`);
        f.occasions = [...list, { ...src, id: newId(), origin: originId }];
        copiedTo.add(bid);
      }
    }
    for (const bid of copiedTo) await patchStore(bid, { occasions: family.find(x => x.id === bid).occasions });
    return { occasions: mine, copied_to: [...copiedTo], family: await familyOf(store, 'id,name,client_slug,parent_id,occasions') };
  }

  // ─── إخفاء تنبيه الإدارة بعد قراءته ───
  if (action === 'notice-dismiss') {
    await patchStore(sid, { admin_notification: null });
    return { ok: true };
  }

  // ─── اسم فرع (من لوحة صاحب المتجر) ───
  if (action === 'branch-rename') {
    const id = int(b.id);
    const family = await familyOf(store);
    if (!family.some(f => f.id === id)) throw new ApiError(404, 'الفرع غير موجود');
    const name = str(b.name, 80, 'اسم الفرع');
    if (!name) throw new ApiError(400, 'اكتب اسم الفرع');
    await patchStore(id, { name });
    return { family: await familyOf(store) };
  }

  // ─── كوبونات الخصم ───
  if (action === 'coupon-save') {
    const id = b.id == null ? null : int(b.id);
    // خصم تلقائي: بدون كود، يظهر في المنيو على الأصناف مباشرة (نولّد له رمز داخلي)
    const auto = b.auto_apply === true;
    let code = String(b.code || '').trim().toUpperCase();
    if (auto && !/^AUTO-[A-Z0-9]{6}$/.test(code)) code = 'AUTO-' + Math.random().toString(36).slice(2, 8).toUpperCase().padEnd(6, 'X');
    if (!/^[A-Z0-9-]{3,20}$/.test(code)) throw new ApiError(400, 'رمز الكوبون من 3 إلى 20 حرف: حروف إنجليزية وأرقام وشرطة', 'BAD_CODE');
    if (!auto && code.startsWith('AUTO-')) throw new ApiError(400, 'الرموز اللي تبدأ بـ AUTO- محجوزة للخصم التلقائي', 'BAD_CODE');
    if (!['percent', 'fixed'].includes(b.type)) throw new ApiError(400, 'نوع الخصم غير صحيح');
    const value = round2(Number(b.value));
    if (!Number.isFinite(value) || value <= 0 || value > (b.type === 'percent' ? 100 : 100000)) {
      throw new ApiError(400, b.type === 'percent' ? 'نسبة الخصم من 1 إلى 100' : 'اكتب مبلغ خصم صحيح');
    }
    const scope = b.scope === 'selected' ? 'selected' : 'all';
    let category_keys = [], product_ids = [];
    if (scope === 'selected') {
      const [cats, prods] = await Promise.all([
        rest(`categories?client_id=eq.${sid}&select=key`),
        rest(`products?client_id=eq.${sid}&select=id`)
      ]);
      const catKeys = new Set(cats.map(c => c.key)), prodIds = new Set(prods.map(p => p.id));
      category_keys = [...new Set(Array.isArray(b.category_keys) ? b.category_keys : [])].filter(k => catKeys.has(k));
      product_ids = [...new Set((Array.isArray(b.product_ids) ? b.product_ids : []).map(int))].filter(i => prodIds.has(i));
      if (!category_keys.length && !product_ids.length) throw new ApiError(400, 'اختر قسم أو صنف واحد على الأقل');
    }
    let min_order = null;
    if (b.min_order !== null && b.min_order !== undefined && b.min_order !== '') {
      min_order = round2(Number(b.min_order));
      if (!validPrice(min_order)) throw new ApiError(400, 'الحد الأدنى للطلب غير صحيح');
    }
    let max_uses = null;
    if (b.max_uses !== null && b.max_uses !== undefined && b.max_uses !== '') {
      max_uses = int(b.max_uses);
      if (!Number.isInteger(max_uses) || max_uses < 1 || max_uses > 1000000) throw new ApiError(400, 'عدد مرات الاستخدام غير صحيح');
    }
    const starts_at = riyadhDate(b.starts_at, false, 'تاريخ البداية');
    const ends_at = riyadhDate(b.ends_at, true, 'تاريخ النهاية');
    if (starts_at && ends_at && Date.parse(ends_at) < Date.parse(starts_at)) throw new ApiError(400, 'تاريخ النهاية قبل تاريخ البداية');
    if (auto) { min_order = null; max_uses = null; }
    const row = {
      code, type: b.type, value, scope, category_keys, product_ids, min_order, max_uses, starts_at, ends_at, is_active: b.is_active !== false,
      auto_apply: auto, show_in_menu: auto || b.show_in_menu === true
    };
    try {
      if (id) {
        const rows = await rest(`coupons?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: row, prefer: 'return=representation' });
        if (!rows.length) throw new ApiError(404, 'الكوبون غير موجود');
        return { coupon: rows[0] };
      }
      const count = await rest(`coupons?client_id=eq.${sid}&select=id`);
      if (count.length >= MAX_COUPONS) throw new ApiError(400, `الكوبونات حدها ${MAX_COUPONS}، احذف القديمة أولاً`);
      return { coupon: (await rest('coupons', { method: 'POST', body: { ...row, client_id: sid }, prefer: 'return=representation' }))[0] };
    } catch (e) {
      if (e.code === '23505') throw new ApiError(409, 'فيه كوبون بنفس الرمز', 'CODE_TAKEN');
      throw e;
    }
  }

  if (action === 'coupon-toggle') {
    const rows = await rest(`coupons?id=eq.${int(b.id)}&client_id=eq.${sid}`, { method: 'PATCH', body: { is_active: b.value === true }, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الكوبون غير موجود');
    return { coupon: rows[0] };
  }

  if (action === 'coupon-delete') {
    const rows = await rest(`coupons?id=eq.${int(b.id)}&client_id=eq.${sid}`, { method: 'DELETE', prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الكوبون غير موجود');
    return { ok: true };
  }

  // ─── تغيير رابط المتجر (يصير النطاق الفرعي: slug.devmenu.digital) ───
  // الرابط القديم ينحفظ في old_slugs: المنيو يفتح منه، وما يقدر متجر ثاني ياخذه
  if (action === 'update-slug') {
    const slug = String(b.slug || '').trim().toLowerCase();
    if (!SLUG_RE.test(slug) || slug.includes('--')) {
      throw new ApiError(400, 'الرابط لازم يكون من 3 إلى 30 حرف: حروف إنجليزية صغيرة وأرقام وشرطة (-) في الوسط فقط', 'BAD_SLUG');
    }
    if (RESERVED_SLUGS.has(slug)) throw new ApiError(400, 'هذا الرابط محجوز، اختر اسم ثاني', 'RESERVED_SLUG');
    if (slug === store.client_slug) return { store };
    const taken = await rest(`clients?or=${q(`(client_slug.eq.${slug},old_slugs.cs.{${slug}})`)}&id=neq.${sid}&select=id&limit=1`);
    if (taken.length) throw new ApiError(409, 'هذا الرابط مستخدم لمتجر ثاني، اختر اسم ثاني', 'SLUG_TAKEN');
    const old = (Array.isArray(store.old_slugs) ? store.old_slugs : []).filter(s => s !== slug && s !== store.client_slug);
    if (old.length >= 20) throw new ApiError(400, 'غيّرت رابط متجرك مرات كثيرة. تواصل مع الدعم', 'SLUG_LIMIT');
    try {
      return { store: await patchStore(sid, { client_slug: slug, old_slugs: [...old, store.client_slug] }) };
    } catch (e) {
      if (e.code === '23505') throw new ApiError(409, 'هذا الرابط مستخدم لمتجر ثاني، اختر اسم ثاني', 'SLUG_TAKEN');
      throw e;
    }
  }

  // ─── رابط رفع ملف (الرفع يتم مباشرة للتخزين برابط موقّع صالح لملف واحد) ───
  if (action === 'upload-url') {
    const kind = b.kind;
    if (!['logo', 'bg_image', 'bg_video', 'prod', 'sticker'].includes(kind)) throw new ApiError(400, 'نوع ملف غير صحيح');
    const isVideo = kind === 'bg_video';
    const ext = (isVideo ? VIDEO_TYPES : IMAGE_TYPES)[b.type];
    if (!ext) throw new ApiError(400, isVideo ? 'الملف لازم يكون فيديو MP4' : 'صيغة الصورة غير مدعومة، استخدم JPG أو PNG أو WebP');
    const size = int(b.size);
    const maxMb = isVideo ? 30 : kind === 'sticker' ? 2 : 5;
    if (!Number.isInteger(size) || size <= 0 || size > maxMb * 1024 * 1024) throw new ApiError(400, `حجم الملف أكبر من المسموح (${maxMb} ميجا)`);
    const path = `${sid}/${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const signed = await storage(`object/upload/sign/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, { body: {} });
    return { upload_url: `${SUPABASE_URL}/storage/v1${signed.url}`, public_url: publicUrl(path) };
  }

  // ─── الأقسام ───
  if (action === 'category-add') {
    const name = str(b.name, 60, 'اسم القسم');
    const nameEn = str(b.name_en, 60, 'الاسم الإنجليزي');
    if (!name) throw new ApiError(400, 'اكتب اسم القسم');
    const cats = await rest(`categories?client_id=eq.${sid}&select=name,sort_order`);
    if (cats.some(c => c.name === name)) throw new ApiError(400, 'يوجد قسم بنفس الاسم');
    const row = {
      client_id: sid, name, name_en: nameEn || null,
      group_name: str(b.group_name, 40, 'الفئة الرئيسية') || null,
      key: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      sort_order: Math.max(0, ...cats.map(c => c.sort_order || 0)) + 1
    };
    return { category: (await rest('categories', { method: 'POST', body: row, prefer: 'return=representation' }))[0] };
  }

  // تعديل الفئة الرئيسية لقسم (فطور، غداء، عشاء...)
  if (action === 'category-group') {
    const id = int(b.id);
    const rows = await rest(`categories?id=eq.${id}&client_id=eq.${sid}`, {
      method: 'PATCH', body: { group_name: str(b.group_name, 40, 'الفئة الرئيسية') || null }, prefer: 'return=representation'
    });
    if (!rows.length) throw new ApiError(404, 'القسم غير موجود');
    return { category: rows[0] };
  }

  if (action === 'category-rename') {
    const id = int(b.id);
    const cat = (await rest(`categories?id=eq.${id}&client_id=eq.${sid}&select=id,name`))[0];
    if (!cat) throw new ApiError(404, 'القسم غير موجود');
    const name = str(b.name, 60, 'اسم القسم');
    if (!name) throw new ApiError(400, 'اكتب اسم القسم');
    const dup = await rest(`categories?client_id=eq.${sid}&name=eq.${q(name)}&id=neq.${id}&select=id&limit=1`);
    if (dup.length) throw new ApiError(400, 'يوجد قسم بنفس الاسم');
    const rows = await rest(`categories?id=eq.${id}&client_id=eq.${sid}`, {
      method: 'PATCH', body: { name, name_en: str(b.name_en, 60, 'الاسم الإنجليزي') || null }, prefer: 'return=representation'
    });
    const name_en = str(b.name_en, 60, 'الاسم الإنجليزي') || null;
    // أطباق قديمة مربوطة باسم القسم بدل مفتاحه: نحدّثها للاسم الجديد
    const renameIn = async (clientId) => {
      if (cat.name !== name) await rest(`products?client_id=eq.${clientId}&category=eq.${q(cat.name)}`, { method: 'PATCH', body: { category: name } });
    };
    await renameIn(sid);
    // نفس القسم (بنفس الاسم) في الفروع الثانية ياخذ الاسم الجديد
    if (cat.name !== name) {
      for (const f of (await familyOf(store)).filter(f => f.id !== sid)) {
        const taken = await rest(`categories?client_id=eq.${f.id}&name=eq.${q(name)}&select=id&limit=1`);
        if (taken.length) continue;
        const moved = await rest(`categories?client_id=eq.${f.id}&name=eq.${q(cat.name)}`, { method: 'PATCH', body: { name, name_en }, prefer: 'return=representation' });
        if (moved.length) await renameIn(f.id);
      }
    }
    return { category: rows[0] };
  }

  if (action === 'category-delete') {
    const id = int(b.id);
    const cat = (await rest(`categories?id=eq.${id}&client_id=eq.${sid}&select=key,name`))[0];
    if (!cat) throw new ApiError(404, 'القسم غير موجود');
    const used = await rest(`products?client_id=eq.${sid}&or=(category.eq.${q(cat.key)},category.eq.${q(cat.name)})&select=id&limit=1`);
    if (used.length) throw new ApiError(400, 'القسم فيه أطباق. انقلها لقسم آخر أو احذفها أولاً');
    await rest(`categories?id=eq.${id}&client_id=eq.${sid}`, { method: 'DELETE' });
    return { ok: true };
  }

  if (action === 'reorder') {
    const table = b.table;
    if (!['categories', 'products'].includes(table)) throw new ApiError(400, 'جدول غير صحيح');
    const ids = Array.isArray(b.ids) ? b.ids.map(int).filter(Number.isInteger).slice(0, 1000) : [];
    if (!ids.length) throw new ApiError(400, 'لا يوجد ترتيب');
    await rpc('server_reorder', { p_table: table, p_client_id: sid, p_ids: ids });
    return { ok: true };
  }

  // ─── الأطباق ───
  if (action === 'product-save') {
    const id = b.id == null ? null : int(b.id);
    const name = str(b.name, 100, 'اسم الطبق');
    if (!name) throw new ApiError(400, 'اكتب اسم الطبق');
    // مع الأحجام: سعر الطبق = أقل سعر حجم (للترتيب وعرض "من ...")
    const sizes = cleanSizes(b.sizes);
    const price = sizes.length ? Math.min(...sizes.map(z => z.price)) : Number(b.price);
    if (!validPrice(price)) throw new ApiError(400, 'اكتب سعراً صحيحاً');
    const category = str(b.category, 80, 'القسم');
    const cats = await rest(`categories?client_id=eq.${sid}&select=key,name`);
    if (!cats.some(c => c.key === category || c.name === category)) throw new ApiError(400, 'القسم غير موجود');
    let calories = null;
    const sendCalories = Object.prototype.hasOwnProperty.call(b, 'calories') && store.show_calories !== false;
    if (sendCalories && b.calories !== null && b.calories !== '') {
      calories = int(b.calories);
      if (!Number.isInteger(calories) || calories < 0 || calories > 10000) throw new ApiError(400, 'عدد السعرات غير صحيح');
    }
    const payload = {
      name, price, category, sizes,
      description: str(b.description, 500, 'الوصف'),
      extra_info: str(b.extra_info, 200, 'معلومات إضافية') || null,
      note: str(b.note, 200, 'الملاحظة') || null,
      name_en: str(b.name_en, 100, 'الاسم الإنجليزي') || null,
      description_en: str(b.description_en, 500, 'الوصف الإنجليزي') || null,
      is_bestseller: b.is_bestseller === true,
      allergens: (Array.isArray(b.allergens) ? b.allergens : String(b.allergens || '').split(',')).filter(a => ALLERGENS.includes(a)).join(',') || null
    };
    // السعرات تتحدث فقط إذا كان المتجر مفعّلها (حتى ما تنمسح القيم المحفوظة)
    if (sendCalories) payload.calories = calories;
    if (COFFEE_TYPES.includes(store.business_type)) payload.coffee = cleanCoffee(b.coffee);
    if (b.image_url !== undefined) {
      if (b.image_url && !ownsMediaUrl(b.image_url, sid)) throw new ApiError(400, 'الصورة غير تابعة لمتجرك');
      payload.image_url = b.image_url || '';
    }

    const nextOrder = async () => {
      const same = await rest(`products?client_id=eq.${sid}&category=eq.${q(category)}&select=sort_order`);
      return Math.max(0, ...same.map(x => x.sort_order || 0)) + 1;
    };

    const srcCat = cats.find(c => c.key === category || c.name === category);
    const srcCatFull = () => rest(`categories?client_id=eq.${sid}&key=eq.${q(srcCat.key)}&select=name,name_en,group_name`).then(r => r[0] || srcCat);

    if (id) {
      const old = (await rest(`products?id=eq.${id}&client_id=eq.${sid}&select=*`))[0];
      if (!old) throw new ApiError(404, 'الطبق غير موجود');
      if (old.category !== category) payload.sort_order = await nextOrder();
      const rows = await rest(`products?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: payload, prefer: 'return=representation' });

      // الطبق مربوط بنفس الطبق في الفروع الثانية: نحدّث الحقول المشتركة، والسعر يبقى لكل فرع
      let synced = 0;
      if (old.link_id) {
        const others = (await familyOf(store)).map(f => f.id).filter(x => x !== sid);
        const linked = others.length ? await rest(`products?link_id=eq.${q(old.link_id)}&client_id=in.(${others.join(',')})&select=id,client_id,category,sizes`) : [];
        const src = linked.length ? await srcCatFull() : null;
        for (const t of linked) {
          const patch = {};
          SHARED_PRODUCT_FIELDS.forEach(k => { if (Object.prototype.hasOwnProperty.call(payload, k)) patch[k] = payload[k]; });
          const tc = await categoryIn(t.client_id, src);
          if (t.category !== tc.key) { patch.category = tc.key; patch.sort_order = await nextOrderIn(t.client_id, tc.key); }
          // الأحجام: نفس الأسماء في كل الفروع، وسعر كل حجم يبقى حسب الفرع
          const theirs = new Map((Array.isArray(t.sizes) ? t.sizes : []).map(z => [z.name, z.price]));
          if (sizes.length) {
            patch.sizes = sizes.map(z => ({ ...z, price: theirs.has(z.name) ? theirs.get(z.name) : z.price }));
            patch.price = Math.min(...patch.sizes.map(z => z.price));
          } else if (theirs.size) patch.sizes = [];
          await rest(`products?id=eq.${t.id}`, { method: 'PATCH', body: patch });
          synced++;
        }
      }
      return { product: rows[0], synced };
    }
    const row = { ...payload, client_id: sid, is_available: true, image_url: payload.image_url || '', sort_order: await nextOrder() };
    const created = (await rest('products', { method: 'POST', body: row, prefer: 'return=representation' }))[0];

    // "أضف أيضاً في الفروع": نفس الطبق (مربوط بنفس link_id) تحت قسم بنفس الاسم في كل فرع مختار
    const also = [...new Set((Array.isArray(b.also_branch_ids) ? b.also_branch_ids : []).map(int))].filter(x => x !== sid);
    const copied = [];
    if (also.length) {
      const family = (await familyOf(store)).map(f => f.id);
      const src = await srcCatFull();
      for (const bid of also.filter(x => family.includes(x))) {
        const target = await categoryIn(bid, src);
        const copy = { ...row, client_id: bid, category: target.key, sort_order: await nextOrderIn(bid, target.key) };
        if (created.link_id) copy.link_id = created.link_id;
        await rest('products', { method: 'POST', body: copy });
        copied.push(bid);
      }
    }
    return { product: created, copied_to: copied };
  }

  if (action === 'product-toggle') {
    const id = int(b.id);
    if (!['is_available', 'is_bestseller', 'is_hidden'].includes(b.field)) throw new ApiError(400, 'حقل غير صحيح');
    const rows = await rest(`products?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: { [b.field]: b.value === true }, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الطبق غير موجود');
    return { product: rows[0] };
  }

  if (action === 'product-delete') {
    const id = int(b.id);
    const rows = await rest(`products?id=eq.${id}&client_id=eq.${sid}`, { method: 'DELETE', prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الطبق غير موجود');
    return { ok: true };
  }

  throw new ApiError(404, 'Unknown action');
});
