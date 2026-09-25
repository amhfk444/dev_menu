// =====================================================================
// DEV MENU — API صاحب المتجر (يتطلب تسجيل دخول)
// كل طلب: نتحقق من الجلسة ← نحدد متجر المستخدم من بريده ← ننفذ
// المدير العام يقدر يدير أي متجر عبر ?client=slug
// =====================================================================
const {
  handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET,
  ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody
} = require('./_lib/core');
const { FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor } = require('./_lib/waitlist');
const { sendMail, mailConfigured } = require('./_lib/mail');

const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
const COFFEE_TYPES = ['cafe', 'mixed'];
const BUSINESS_TYPES = ['restaurant', 'cafe', 'mixed', 'bakery'];
const ALLERGENS = ['gluten', 'milk', 'egg', 'nuts', 'peanut', 'sesame', 'fish', 'shellfish', 'soy'];
const PROCESS = ['washed', 'natural', 'honey', 'anaerobic', 'carbonic', 'other'];
const ROAST = ['light', 'medium', 'dark'];
const METHODS = ['v60', 'chemex', 'aeropress', 'frenchpress', 'espresso', 'coldbrew'];
const DELIVERY = ['hungerstation', 'jahez', 'keeta', 'toyou', 'mrsool', 'thechefz', 'careem', 'shgardi', 'other'];

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
  return { user, admin, store };
}

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
    const [categories, products] = await Promise.all([
      rest(`categories?client_id=eq.${store.id}&select=*`),
      rest(`products?client_id=eq.${store.id}&select=*`)
    ]);
    return { email: user.email, is_admin: admin, store, categories: categories.sort(bySort), products: products.sort(bySort) };
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

  if (req.method !== 'POST') throw new ApiError(404, 'Unknown action');
  const { store } = await context(req);
  const sid = store.id;

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

  // ─── رابط رفع ملف (الرفع يتم مباشرة للتخزين برابط موقّع صالح لملف واحد) ───
  if (action === 'upload-url') {
    const kind = b.kind;
    if (!['logo', 'bg_image', 'bg_video', 'prod'].includes(kind)) throw new ApiError(400, 'نوع ملف غير صحيح');
    const isVideo = kind === 'bg_video';
    const ext = (isVideo ? VIDEO_TYPES : IMAGE_TYPES)[b.type];
    if (!ext) throw new ApiError(400, isVideo ? 'الملف لازم يكون فيديو MP4' : 'صيغة الصورة غير مدعومة، استخدم JPG أو PNG أو WebP');
    const size = int(b.size);
    const max = (isVideo ? 30 : 5) * 1024 * 1024;
    if (!Number.isInteger(size) || size <= 0 || size > max) throw new ApiError(400, `حجم الملف أكبر من المسموح (${isVideo ? 30 : 5} ميجا)`);
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
      key: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      sort_order: Math.max(0, ...cats.map(c => c.sort_order || 0)) + 1
    };
    return { category: (await rest('categories', { method: 'POST', body: row, prefer: 'return=representation' }))[0] };
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
    const price = Number(b.price);
    if (!Number.isFinite(price) || price < 0 || price > 100000) throw new ApiError(400, 'اكتب سعراً صحيحاً');
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
      name, price, category,
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

    if (id) {
      const old = (await rest(`products?id=eq.${id}&client_id=eq.${sid}&select=category`))[0];
      if (!old) throw new ApiError(404, 'الطبق غير موجود');
      if (old.category !== category) payload.sort_order = await nextOrder();
      const rows = await rest(`products?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: payload, prefer: 'return=representation' });
      return { product: rows[0] };
    }
    const row = { ...payload, client_id: sid, is_available: true, image_url: payload.image_url || '', sort_order: await nextOrder() };
    return { product: (await rest('products', { method: 'POST', body: row, prefer: 'return=representation' }))[0] };
  }

  if (action === 'product-toggle') {
    const id = int(b.id);
    if (!['is_available', 'is_bestseller'].includes(b.field)) throw new ApiError(400, 'حقل غير صحيح');
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
