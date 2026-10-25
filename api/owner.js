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
const { draftReviewReply } = require('./_lib/ai');
const { sendPush, pushPublicKey, cleanSubscription } = require('./_lib/push');
const google = require('./_lib/google');
const { syncStore } = require('./_lib/reviews');
const { topic, storeTopics, poke } = require('./_lib/live');
const { normalizeLoyalty, validPoint } = require('./_lib/loyalty');
const PLANS = require('./_lib/plans');
const wallet = require('./_lib/wallet');
const { pushWalletCards, pushWalletBatch, runAssistant, pagerReadyNotice, walletNotice } = require('./_lib/loyalty-assistant');
const { loyaltyMessages, loyaltyNearLines } = require('./_lib/ai');
const { purchaseStamp, newStampCode, parseMemberQr, cooldownLeft, leftText } = require('./_lib/loyalty-stamp');

const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
const COFFEE_TYPES = ['cafe', 'mixed'];
const SECTORS = require('./_lib/sectors');
const BUSINESS_TYPES = SECTORS.KEYS;
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

// هوية الضيف: البريد و/أو آخر 9 أرقام من الجوال (0501234567 و +966501234567 نفس الشخص)
const guestKeysOf = (e) => {
  const keys = [];
  const email = String(e.email || '').trim().toLowerCase();
  if (email) keys.push(`e:${email}`);
  const d = String(e.phone || '').replace(/\D/g, '');
  if (d.length >= 7) keys.push(`p:${d.slice(-9)}`);
  return keys;
};

// زيارات ضيوف اليوم السابقة عند المتجر: كم مرة سجّل، وكم مرة جلس، ولم يحضر، وآخر زيارة
async function guestHistory(storeId, entries, beforeIso) {
  const phones = new Set(), emails = new Set();
  entries.forEach(e => guestKeysOf(e).forEach(k => (k.startsWith('e:') ? emails : phones).add(k.slice(2))));
  const conds = [
    ...[...emails].slice(0, 80).map(m => `email.ilike.${m.replace(/[,()*]/g, '')}`),
    ...[...phones].slice(0, 80).map(d => `phone.like.*${d}`)
  ];
  const out = {};
  if (!conds.length) return out;
  const rows = [];
  for (let offset = 0; offset < 10000; offset += 1000) {
    const page = await rest(`waitlist_entries?client_id=eq.${storeId}&created_at=lt.${q(beforeIso)}&or=${q(`(${conds.join(',')})`)}&select=phone,email,status,created_at&order=created_at.desc&limit=1000&offset=${offset}`);
    rows.push(...page);
    if (page.length < 1000) break;
  }
  // كل تسجيل سابق ينحسب تحت بريده وجواله، فالضيف ينعرف بأي واحد منهم
  rows.forEach(r => guestKeysOf(r).forEach(k => {
    const g = out[k] || (out[k] = { visits: 0, seated: 0, no_show: 0, last: null });
    g.visits++;
    if (r.status === 'seated') g.seated++;
    if (r.status === 'no_show') g.no_show++;
    if (!g.last || r.created_at > g.last) g.last = r.created_at;
  }));
  return out;
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

// ─── البيجر: إرسال رنّة واحدة وتسجيلها ───
const PAGER_MAX_RINGS = 5;
async function ringTicket(store, t) {
  if (!t.push_sub) return 'off';
  const n = (t.ring_count || 0) + 1;
  const url = `https://${store.client_slug}.devmenu.digital/pager`;
  const payload = n === 1
    ? { title: `🔔 ${SECTORS.terms(store).ready} رقم ${t.number}`, body: `${SECTORS.terms(store).readyBody} من ${store.name}` }
    : { title: `🔔 تذكير: ${SECTORS.terms(store).ready} رقم ${t.number}`, body: `الموظف بانتظارك في ${store.name} (${n}/${PAGER_MAX_RINGS})` };
  // وسم مختلف لكل رنّة عشان الجوال يرن كل مرة (الآيفون ما يعيد التنبيه لنفس الوسم)
  const result = await sendPush(t.push_sub, { ...payload, url, tag: `pager-${t.id}-${n}` });
  console.log('PAGER_RING', store.id, t.id, n, result);
  const patch = result === 'gone' ? { push_sub: null } : { ring_count: n, last_ring_at: new Date().toISOString() };
  await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: patch }).catch(() => {});
  return result;
}

// المكافآت الجاهزة لعضو: مكافأة الأختام + هدايا الأصدقاء المستلمة
async function readyRewards(storeId, card, settings) {
  const out = [];
  if (card.stamps >= settings.needed) out.push({ type: 'stamps', label: settings.reward });
  const gifts = await rest(`loyalty_gifts?client_id=eq.${storeId}&to_card=eq.${card.id}&status=eq.claimed&expires_at=gt.${q(new Date().toISOString())}&select=code,reward`).catch(() => []);
  gifts.forEach(g => out.push({ type: 'gift', code: g.code, label: `${g.reward} (هدية)` }));
  return out;
}

async function main(req) {
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
    if (!name) throw new ApiError(400, 'اكتب اسم المنشأة', 'INVALID_NAME');
    let phone = '';
    try { phone = waNumber(b.phone); } catch { throw new ApiError(400, 'رقم الجوال غير صحيح', 'INVALID_PHONE'); }
    const type = BUSINESS_TYPES.includes(b.business_type) ? b.business_type : 'restaurant';
    try {
      const slug = await rpc('server_register_client', { p_email: user.email, p_name: name, p_phone: phone, p_type: type });
      // الأنواع الجديدة (عيادة، صالون...) تنحفظ بعد الإنشاء، ومعها اسم النشاط لو اختار "أخرى"
      const label = type === 'other' ? str(b.business_label, 60, 'اسم النشاط') : null;
      if (!['restaurant', 'cafe', 'mixed', 'bakery'].includes(type) || label) {
        await rest(`clients?client_slug=eq.${q(slug)}`, { method: 'PATCH', body: { business_type: type, business_label: label || null } }).catch(e => console.error('REGISTER_TYPE', e.message));
      }
      // الباقة اللي اختارها قبل التسجيل: تنحفظ كطلب اشتراك، يبدأ التجربة المجانية، ونتواصل معه للدفع
      const plan = ['month', 'year'].includes(b.plan) ? b.plan : null;
      const features = PLANS.clean(Array.isArray(b.features) ? b.features : []);
      if (plan && features.length) {
        // الخدمات اللي اختارها تشتغل على طول في التجربة، والإدارة يوصلها إشعار بس
        const main = (await rest(`clients?client_slug=eq.${q(slug)}`, { method: 'PATCH', prefer: 'return=representation',
          body: { plan_features: features, waitlist_enabled: features.includes('waitlist'), loyalty_enabled: features.includes('loyalty'),
                  requested_plan: plan, requested_features: features, plan_requested_at: new Date().toISOString() } }).catch(() => []))[0];
        if (main && mailConfigured()) {
          await sendMail({
            to: process.env.ADMIN_EMAIL || 'dmenu950@gmail.com', fromName: 'DEV MENU',
            subject: `متجر جديد مع طلب اشتراك: ${main.name}`,
            text: `${main.name} (${main.client_slug}) سجّل وبدأ التجربة المجانية.\nاختار ${plan === 'month' ? 'الشهري' : 'السنوي'}: ${features.map(k => PLANS.FEATURES[k].name).join('، ')} = ${PLANS.price(features, plan).total} ر.س.\nجوال: ${main.phone || '-'}\nبريد: ${main.email || '-'}\nلوحة المشتركين: https://www.devmenu.digital/super-admin.html`
          }).catch(e => console.error('REGISTER_PLAN_MAIL', e.message));
        }
      }
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
    return { email: user.email, is_admin: admin, store, branches, categories: categories.sort(bySort), products: products.sort(bySort), live: storeTopics(store.id) };
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
    const dayStart = riyadhDayStart();
    const entries = await rest(`waitlist_entries?client_id=eq.${store.id}&created_at=gte.${q(dayStart)}&select=*&order=id.asc`);
    entries.forEach(e => Object.assign(e, positionOf(e, entries, settings)));
    // كم مرة جاء كل ضيف قبل (الأيام السابقة + تسجيلاته الأقدم اليوم)
    let past = {};
    try { past = await guestHistory(store.id, entries, dayStart); } catch (err) { console.warn('guest history', err.message); }
    entries.forEach((e, i) => {
      const keys = guestKeysOf(e);
      // نختار المفتاح اللي له سجل أكبر (البريد أو الجوال)
      const best = keys.map(k => past[k]).filter(Boolean).sort((a, b) => b.visits - a.visits)[0];
      const h = { ...(best || { visits: 0, seated: 0, no_show: 0, last: null }) };
      const same = (x) => guestKeysOf(x).some(k => keys.includes(k));
      if (keys.length) entries.slice(0, i).filter(same).forEach(x => {
        h.visits++; if (x.status === 'seated') h.seated++; if (x.status === 'no_show') h.no_show++;
        if (!h.last || x.created_at > h.last) h.last = x.created_at;
      });
      e.history = keys.length ? h : null;
    });
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
    // شاشة الكاشير تخدم البيجر والولاء: مشترك الولاء لحاله يستخدمها لمسح بطاقات الزبائن
    const hasPager = PLANS.has(store, 'pager');
    if (!hasPager && !PLANS.has(store, 'loyalty')) throw new ApiError(403, 'البيجر مو ضمن باقتك، أضفه من "اشتراكك" في لوحة التحكم', 'ADDON_OFF');
    const base = `pager_tickets?client_id=eq.${store.id}&created_at=gte.${q(riyadhDayStart())}&order=number.asc&select=id,number,status,created_at,ready_at,closed_at,push_sub`;
    // أعمدة التكرار من 21-pager-repeat.sql — لو ما انضافت نكمل بدونها
    const tickets = !hasPager ? [] : await rest(`${base},ring_count,acked_at,invoice_no,loyalty_card_id`).catch(() => rest(`${base},ring_count,acked_at,invoice_no`)).catch(() => rest(`${base},ring_count,acked_at`)).catch(() => rest(base));
    const lx = (await rest(`clients?id=eq.${store.id}&select=loyalty_enabled`).catch(() => []))[0] || {};
    lx.loyalty_enabled = lx.loyalty_enabled && PLANS.has(store, 'loyalty');
    // أرقام مربوطة ببطاقات ولاء فيها مكافأة جاهزة
    const rewardsBy = {};
    const linked = [...new Set(tickets.filter(t => t.loyalty_card_id && t.status !== 'done').map(t => t.loyalty_card_id))];
    if (linked.length && lx.loyalty_enabled) {
      const st = normalizeLoyalty((await rest(`clients?id=eq.${store.id}&select=loyalty_settings`).catch(() => []))[0]?.loyalty_settings);
      const cards = await rest(`loyalty_cards?id=in.(${linked.join(',')})&select=id,member_no,name,stamps`).catch(() => []);
      for (const c of cards) { const r = await readyRewards(store.id, c, st); if (r.length) rewardsBy[c.id] = { card_id: c.id, name: c.name || `عضو #${c.member_no}`, rewards: r }; }
    }
    return { tickets: tickets.map(({ push_sub, ...t }) => ({ ...t, has_push: !!push_sub, reward: t.loyalty_card_id ? rewardsBy[t.loyalty_card_id] || null : null })), slug: store.client_slug, name: store.name, business_type: store.business_type, max_rings: PAGER_MAX_RINGS, live: topic('pager', store.id), loyalty: lx.loyalty_enabled === true, pager: hasPager, loyalty_entitled: PLANS.has(store, 'loyalty') };
  }

  // ─── إحصائيات البيجر: وقت الانتظار، الإنجاز، أوقات الذروة، والتقييم (آخر 30 يوم) ───
  if (action === 'pager-stats' && req.method === 'GET') {
    const { store } = await context(req);
    if (!PLANS.has(store, 'pager')) throw new ApiError(403, 'البيجر مو ضمن باقتك', 'ADDON_OFF');
    const days = Math.min(90, Math.max(7, int(req.query.days) || 30));
    const since = new Date(Date.now() - days * 864e5).toISOString();
    const base = `pager_tickets?client_id=eq.${store.id}&created_at=gte.${q(since)}&order=id.asc&limit=20000&select=created_at,ready_at,closed_at,status`;
    const rows = await rest(`${base},rating,rating_note`).catch(() => rest(base));
    const min = (a, b) => (Date.parse(b) - Date.parse(a)) / 6e4;
    const waits = rows.filter(t => t.ready_at).map(t => min(t.created_at, t.ready_at)).filter(m => m >= 0 && m < 240);
    const services = rows.filter(t => t.status === 'done' && t.closed_at).map(t => min(t.created_at, t.closed_at)).filter(m => m >= 0 && m < 300);
    const avg = (l) => l.length ? Math.round(l.reduce((a, x) => a + x, 0) / l.length * 10) / 10 : null;
    const hour = (iso) => (new Date(Date.parse(iso) + 3 * 3600e3)).getUTCHours();   // الرياض
    const byHour = Array.from({ length: 24 }, () => ({ n: 0, w: [] }));
    rows.forEach(t => { const h = byHour[hour(t.created_at)]; h.n++; if (t.ready_at) { const m = min(t.created_at, t.ready_at); if (m >= 0 && m < 240) h.w.push(m); } });
    const dayKey = (iso) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10);
    const byDay = {}; rows.forEach(t => { byDay[dayKey(t.created_at)] = (byDay[dayKey(t.created_at)] || 0) + 1; });
    const rated = rows.filter(t => t.rating);
    const dist = [1, 2, 3, 4, 5].map(r => rated.filter(t => t.rating === r).length);
    return {
      days, total: rows.length,
      done: rows.filter(t => t.status === 'done').length,
      cancelled: rows.filter(t => t.status === 'cancelled').length,
      wait: { avg: avg(waits), max: waits.length ? Math.round(Math.max(...waits)) : null, min: waits.length ? Math.round(Math.min(...waits)) : null, n: waits.length },
      service: { avg: avg(services) },
      hours: byHour.map((h, i) => ({ h: i, n: h.n, wait: avg(h.w) })),
      daily: Object.entries(byDay).map(([d, n]) => ({ d, n })),
      rating: { avg: avg(rated.map(t => t.rating)), n: rated.length, dist, notes: rated.filter(t => t.rating_note).slice(-8).reverse().map(t => ({ r: t.rating, note: t.rating_note, at: t.created_at })) }
    };
  }

  // ─── بطاقة الولاء: الإعدادات والإحصائيات وآخر البطاقات ───
  if (action === 'loyalty' && req.method === 'GET') {
    const { store } = await context(req);
    const extra = (await rest(`clients?id=eq.${store.id}&select=loyalty_enabled,loyalty_settings,loyalty_lat,loyalty_lng,loyalty_ai,loyalty_near_lines`))[0] || {};
    const day = 864e5, iso = (n) => q(new Date(Date.now() - n * day).toISOString());
    const [cards, stamps7, redeemed, messages, feedback, gifts] = await Promise.all([
      rest(`loyalty_cards?client_id=eq.${store.id}&select=id,member_no,name,phone,stamps,visits,rewards,last_stamp_at,created_at&order=last_stamp_at.desc.nullslast&limit=500`),
      rest(`loyalty_events?client_id=eq.${store.id}&kind=eq.stamp&created_at=gte.${iso(7)}&select=id,card_id,created_at&order=id.desc&limit=5000`),
      rest(`loyalty_events?client_id=eq.${store.id}&kind=eq.redeem&select=id`),
      rest(`loyalty_messages?client_id=eq.${store.id}&or=${q('(kind.is.null,kind.neq.pager)')}&select=id,card_id,body,wallet_sent,created_at,source,kind&order=id.desc&limit=15`).catch(() => []),
      rest(`loyalty_feedback?client_id=eq.${store.id}&created_at=gte.${iso(90)}&select=reason,note,created_at,card_id&order=id.desc&limit=500`).catch(() => []),
      rest(`loyalty_gifts?client_id=eq.${store.id}&select=status,new_member,created_at&limit=5000`).catch(() => [])
    ]);
    const active = cards.filter(c => c.last_stamp_at && Date.parse(c.last_stamp_at) > Date.now() - 30 * day).length;
    // آخر 7 أيام (بتوقيت الرياض): زيارات كل يوم، والعملاء العائدين، وآخر الزيارات
    const dayKey = (t) => new Date(Date.parse(t) + 3 * 3600e3).toISOString().slice(0, 10);
    const week = Array.from({ length: 7 }, (_, i) => ({ d: dayKey(new Date(Date.now() - (6 - i) * day).toISOString()), n: 0 }));
    stamps7.forEach(e => { const w = week.find(x => x.d === dayKey(e.created_at)); if (w) w.n++; });
    const byId = Object.fromEntries(cards.map(c => [c.id, c]));
    const returning = new Set(stamps7.filter(e => byId[e.card_id] && byId[e.card_id].visits > 1).map(e => e.card_id)).size;
    const recent = stamps7.slice(0, 8).map(e => ({ id: e.card_id, at: e.created_at, name: (byId[e.card_id] || {}).name || null, no: (byId[e.card_id] || {}).member_no, stamps: (byId[e.card_id] || {}).stamps }));
    return {
      enabled: extra.loyalty_enabled === true, settings: normalizeLoyalty(extra.loyalty_settings),
      location_set: validPoint(extra.loyalty_lat, extra.loyalty_lng), slug: store.client_slug,
      stats: { members: cards.length, active30: active, stamps7: stamps7.length, redeemed: redeemed.length, returning7: returning }, week, recent,
      cards: cards.slice(0, 50), messages, wallet: wallet.configured(),
      entitled: PLANS.has(store, 'loyalty'),
      ai: extra.loyalty_ai === true, near_lines: Array.isArray(extra.loyalty_near_lines) ? extra.loyalty_near_lines : [],
      feedback: {
        total: feedback.length,
        reasons: feedback.reduce((a, f) => (a[f.reason] = (a[f.reason] || 0) + 1, a), {}),
        notes: feedback.filter(f => f.note).slice(0, 10).map(f => ({ note: f.note, reason: f.reason, created_at: f.created_at }))
      },
      gifts: {
        sent: gifts.length, claimed: gifts.filter(g => g.status !== 'sent').length,
        redeemed: gifts.filter(g => g.status === 'redeemed').length, new_members: gifts.filter(g => g.new_member).length
      }
    };
  }

  // ─── كود الختم: انستخدم؟ ولمين؟ (شاشة الكاشير تسأل كل ثانيتين) ───
  if (action === 'loyalty-stamp-code' && req.method === 'GET') {
    const { store } = await context(req);
    const row = (await rest(`loyalty_stamp_codes?code=eq.${q(String(req.query.code || ''))}&client_id=eq.${store.id}&select=used_at,expires_at,card_id,note`))[0];
    if (!row) throw new ApiError(404, 'الكود غير موجود');
    let who = null;
    if (row.card_id) { const c = (await rest(`loyalty_cards?id=eq.${row.card_id}&select=member_no,name,stamps`))[0] || {}; who = { name: c.name || `عضو #${c.member_no}`, stamps: c.stamps }; }
    return { used: !!row.used_at, expired: !row.used_at && Date.parse(row.expires_at) < Date.now(), who, note: row.used_at ? null : row.note || null };
  }

  // ─── بطاقة الولاء: كل الأعضاء (للقائمة والداشبورد وملف CSV) ───
  if (action === 'loyalty-members' && req.method === 'GET') {
    const { store } = await context(req);
    const cards = await rest(`loyalty_cards?client_id=eq.${store.id}&select=id,member_no,name,phone,gender,stamps,visits,rewards,last_stamp_at,created_at,wallet_serial,ai_last_at&order=last_stamp_at.desc.nullslast&limit=5000`);
    return { members: cards.map(({ wallet_serial, ...c }) => ({ ...c, in_wallet: !!wallet_serial })) };
  }

  // ─── بطاقة الولاء: تفاصيل عضو (زياراته ورسائله) ───
  if (action === 'loyalty-member' && req.method === 'GET') {
    const { store } = await context(req);
    const id = int(req.query.id);
    const card = (await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${store.id}&select=id,member_no,name,phone,gender,stamps,visits,rewards,last_stamp_at,created_at,wallet_serial,ai_last_at,transferred,transferred_at`))[0];
    if (!card) throw new ApiError(404, 'العضو غير موجود');
    const [events, messages] = await Promise.all([
      rest(`loyalty_events?card_id=eq.${id}&select=kind,created_at,distance_m&order=id.desc&limit=200`),
      rest(`loyalty_messages?client_id=eq.${store.id}&card_id=eq.${id}&or=${q('(kind.is.null,kind.neq.pager)')}&select=id,body,source,kind,created_at&order=id.desc&limit=30`).catch(() => [])
    ]);
    const { wallet_serial, ...rest_ } = card;
    return { member: { ...rest_, in_wallet: !!wallet_serial }, events, messages };
  }

  // ─── ردود التقييمات: آخر الردود المكتوبة ───
  if (action === 'review-drafts' && req.method === 'GET') {
    const { store, admin } = await context(req);
    if (!store.reviews_enabled && !admin) throw new ApiError(403, 'ردود التقييمات غير مفعّلة لمتجرك', 'ADDON_OFF');
    const base = `review_drafts?client_id=eq.${store.id}&order=id.desc&limit=30&select=id,reviewer,rating,review,reply,created_at`;
    // أعمدة الحالة من 26-google-reviews.sql — لو ما انضافت نكمل بالسجل اليدوي
    const drafts = await rest(`${base},source,status,reviewed_at,posted_at,error`).catch(() => rest(base).catch(() => []));
    return { drafts };
  }

  // ─── ربط قوقل ماب: الحالة ───
  if (action === 'google-status' && req.method === 'GET') {
    const { store, admin } = await context(req);
    if (!store.reviews_enabled && !admin) throw new ApiError(403, 'ردود التقييمات غير مفعّلة لمتجرك', 'ADDON_OFF');
    let conn = null;
    try { conn = (await rest(`google_connections?client_id=eq.${store.id}&select=google_email,location_title,location_name,last_sync_at,sync_error,connected_at`))[0] || null; }
    catch { return { configured: google.configured(), ready: false }; }   // 26-google-reviews.sql ما انشغّل
    return {
      configured: google.configured(), ready: true, push_key: pushPublicKey(),
      connected: !!conn, google_email: conn && conn.google_email, location_title: conn && conn.location_title,
      has_location: !!(conn && conn.location_name), last_sync_at: conn && conn.last_sync_at, sync_error: conn && conn.sync_error
    };
  }

  // فروع حساب قوقل (لو عنده أكثر من فرع يختار واحد)
  if (action === 'google-locations' && req.method === 'GET') {
    const { store } = await context(req);
    const conn = (await rest(`google_connections?client_id=eq.${store.id}&select=refresh_token_enc`))[0];
    if (!conn) throw new ApiError(400, 'اربط حساب قوقل أولاً');
    return { locations: await google.listLocations(await google.accessToken(conn.refresh_token_enc)) };
  }

  if (req.method !== 'POST') throw new ApiError(404, 'Unknown action');
  const { store, admin } = await context(req);
  const sid = store.id;
  req._sid = sid;
  // المميزات حسب باقة المحل
  if (['pager-update', 'pager-invoice', 'pager-ring'].includes(action) && !PLANS.has(store, 'pager')) throw new ApiError(403, 'البيجر مو ضمن باقتك', 'ADDON_OFF');
  if (['loyalty-stamp-code', 'loyalty-scan', 'loyalty-transfer', 'loyalty-give-stamp', 'loyalty-member-delete', 'loyalty-redeem', 'loyalty-message', 'loyalty-message-push', 'loyalty-ai-run'].includes(action) && !PLANS.has(store, 'loyalty')) throw new ApiError(403, 'بطاقة الولاء مو ضمن باقتك، أضفها من "اشتراكك" في لوحة التحكم', 'ADDON_OFF');


  // ─── ربط قوقل ماب ───
  const reviewsGate = () => { if (!store.reviews_enabled && !admin) throw new ApiError(403, 'ردود التقييمات غير مفعّلة لمتجرك', 'ADDON_OFF'); };
  const googleConn = async () => {
    const c = (await rest(`google_connections?client_id=eq.${sid}&select=*`))[0];
    if (!c) throw new ApiError(400, 'اربط حساب قوقل أولاً', 'GOOGLE_NOT_CONNECTED');
    return c;
  };
  if (action === 'google-connect') {
    reviewsGate();
    return { url: google.authUrl(sid, String(b.back || '')) };
  }
  if (action === 'google-select') {
    reviewsGate();
    const conn = await googleConn();
    // نتأكد إن الفرع فعلاً تابع لحسابه في قوقل
    const all = await google.listLocations(await google.accessToken(conn.refresh_token_enc));
    const l = all.find(x => x.location === b.location && x.account === b.account);
    if (!l) throw new ApiError(400, 'الفرع غير موجود في حسابك');
    await rest(`google_connections?client_id=eq.${sid}`, { method: 'PATCH', body: { account_name: l.account, location_name: l.location, location_title: l.title, last_sync_at: null } });
    return { ok: true, location_title: l.title };
  }
  if (action === 'google-disconnect') {
    await rest(`google_connections?client_id=eq.${sid}`, { method: 'DELETE' });
    return { ok: true };
  }
  if (action === 'google-sync') {
    reviewsGate();
    const conn = await googleConn();
    if (conn.last_sync_at && Date.now() - Date.parse(conn.last_sync_at) < 60e3) return { added: 0, recent: true };
    return await syncStore(store, conn);
  }
  // الموافقة: ينشر الرد في قوقل ماب باسم المطعم (بعد تعديل صاحب المطعم لو عدّل)
  if (action === 'review-approve') {
    reviewsGate();
    const id = int(b.id);
    const reply = str(b.reply, 4000, 'الرد');
    if (!reply) throw new ApiError(400, 'الرد فاضي');
    const d = (await rest(`review_drafts?id=eq.${id}&client_id=eq.${sid}&select=*`))[0];
    if (!d || d.source !== 'google' || !d.google_name) throw new ApiError(404, 'التعليق غير موجود');
    if (d.status === 'posted') return { ok: true, already: true };
    const conn = await googleConn();
    try {
      await google.postReply(await google.accessToken(conn.refresh_token_enc), d.google_name, reply);
    } catch (e) {
      await rest(`review_drafts?id=eq.${id}`, { method: 'PATCH', body: { status: 'failed', reply, error: e.message } }).catch(() => {});
      throw e;
    }
    await rest(`review_drafts?id=eq.${id}`, { method: 'PATCH', body: { status: 'posted', reply, posted_at: new Date().toISOString(), error: null } });
    return { ok: true };
  }
  if (action === 'review-dismiss') {
    const id = int(b.id);
    await rest(`review_drafts?id=eq.${id}&client_id=eq.${sid}&status=in.(pending,failed)`, { method: 'PATCH', body: { status: 'dismissed' } });
    return { ok: true };
  }
  // إشعارات "تعليق جديد" على جهاز صاحب المطعم
  // ─── بطاقة الولاء: تشغيل وإعدادات ───
  if (action === 'loyalty-settings') {
    const extra = (await rest(`clients?id=eq.${sid}&select=loyalty_settings`))[0] || {};
    const current = normalizeLoyalty(extra.loyalty_settings);
    const design = { ...current.design, ...((b.settings && b.settings.design) || {}) };
    if (design.stamp_image && !ownsMediaUrl(design.stamp_image, sid)) throw new ApiError(400, 'صورة الختم غير تابعة لمتجرك');
    const settings = normalizeLoyalty({ ...current, ...(b.settings || {}), design });
    const body = { loyalty_settings: settings };
    // الشروط تغيّرت: رسائل الذكاء القديمة (مثلاً "باقي لك 5 من 8") تختفي، وجمل القرب تنكتب من جديد
    const rulesChanged = settings.needed !== current.needed || settings.reward !== current.reward || JSON.stringify(settings.happy) !== JSON.stringify(current.happy);
    if (rulesChanged) {
      settings.rules_at = new Date().toISOString();
      body.loyalty_near_lines = []; body.loyalty_near_at = null;
    }
    if (typeof b.enabled === 'boolean') body.loyalty_enabled = b.enabled;
    let row = (await rest(`clients?id=eq.${sid}`, { method: 'PATCH', body, prefer: 'return=representation' }))[0];
    if (rulesChanged && row.loyalty_ai) {
      const lines = await loyaltyNearLines({ storeName: row.name, businessType: SECTORS.label(row), reward: settings.reward }).catch(() => []);
      if (lines.length) await rest(`clients?id=eq.${sid}`, { method: 'PATCH', body: { loyalty_near_lines: lines, loyalty_near_at: new Date().toISOString() } }).catch(() => {});
    }
    // الشكل أو المكافأة تغيّرت ← نحدّث البطاقات اللي في المحفظة
    const wallet_updated = await pushWalletCards(sid);
    return { enabled: row.loyalty_enabled === true, settings: normalizeLoyalty(row.loyalty_settings), wallet_updated };
  }

  // ─── بطاقة الولاء: رسالة للكل أو لعضو واحد ───
  // توصل إشعار لمحفظة الجوال للي حافظين البطاقة، وتطلع في صفحة البطاقة لما يفتحها
  if (action === 'loyalty-message') {
    const body = str(b.body, 200, 'الرسالة');
    if (body.length < 2) throw new ApiError(400, 'اكتب الرسالة');
    // بدون حد يومي، بس نفس الرسالة ما تنرسل مرتين ورا بعض بالغلط
    const since = new Date(Date.now() - 60e3).toISOString();
    const dup = await rest(`loyalty_messages?client_id=eq.${sid}&created_at=gte.${q(since)}&body=eq.${q(body)}&select=id&limit=1`).catch(() => []);
    if (dup.length) throw new ApiError(429, 'انرسلت هالرسالة قبل شوي');
    let cardId = null;
    if (b.card_id != null && b.card_id !== '') {
      cardId = int(b.card_id);
      const own = (await rest(`loyalty_cards?id=eq.${cardId}&client_id=eq.${sid}&select=id`))[0];
      if (!own) throw new ApiError(404, 'العضو غير موجود');
    }
    const msg = (await rest('loyalty_messages', { method: 'POST', prefer: 'return=representation', body: { client_id: sid, card_id: cardId, body } }))[0];
    // المحفظة: لعضو واحد على طول، وللكل على دفعات (لوحة التحكم تكمّل الباقي بـ loyalty-message-push)
    if (cardId) {
      const sent = await pushWalletCards(sid, { cardIds: [cardId], notice: body });
      await rest(`loyalty_messages?id=eq.${msg.id}`, { method: 'PATCH', body: { wallet_sent: sent } }).catch(() => {});
      return { message: { ...msg, wallet_sent: sent }, progress: { done: true, sent, total: 1 } };
    }
    const p = await pushWalletBatch(sid, { notice: body });
    await rest(`loyalty_messages?id=eq.${msg.id}`, { method: 'PATCH', body: { wallet_sent: p.sent } }).catch(() => {});
    return { message: { ...msg, wallet_sent: p.sent }, progress: p };
  }
  if (action === 'loyalty-message-push') {
    const msg = (await rest(`loyalty_messages?id=eq.${int(b.message_id)}&client_id=eq.${sid}&card_id=is.null&select=id,body,wallet_sent`))[0];
    if (!msg) throw new ApiError(404, 'الرسالة غير موجودة');
    const p = await pushWalletBatch(sid, { notice: msg.body, afterId: int(b.after) || 0 });
    await rest(`loyalty_messages?id=eq.${msg.id}`, { method: 'PATCH', body: { wallet_sent: (msg.wallet_sent || 0) + p.sent } }).catch(() => {});
    return { progress: p };
  }

  // ─── كود ختم جديد من شاشة الكاشير (بعد الدفع) ───
  if (action === 'loyalty-stamp-code') {
    const x = (await rest(`clients?id=eq.${sid}&select=loyalty_enabled`))[0] || {};
    if (!x.loyalty_enabled) throw new ApiError(409, 'شغّل بطاقة الولاء أول من لوحة التحكم');
    const row = await newStampCode(sid);
    const url = `${wallet.cardUrl(store.client_slug)}${wallet.cardUrl(store.client_slug).includes('?') ? '&' : '?'}c=${row.code}`;
    return { code: row.code, url, expires_at: row.expires_at };
  }

  // ─── الكاشير يمسح كود عضوية الزبون (أو يكتب رقمه) ويختمه بعد الدفع ───
  if (action === 'loyalty-scan') {
    const x = (await rest(`clients?id=eq.${sid}&select=loyalty_enabled,loyalty_settings`))[0] || {};
    if (!x.loyalty_enabled) throw new ApiError(409, 'شغّل بطاقة الولاء أول من لوحة التحكم');
    const settings = normalizeLoyalty(x.loyalty_settings);
    let id = null;
    if (b.qr) { id = parseMemberQr(sid, b.qr); if (!id) throw new ApiError(400, 'هذا مو كود عضوية من بطاقتنا', 'BAD_QR'); }
    const no = b.qr ? null : parseInt(String(b.member_id || '').replace(/[^\d]/g, ''), 10);
    const card = b.qr ? (await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${sid}&select=*`))[0]
      : Number.isInteger(no) ? (await rest(`loyalty_cards?member_no=eq.${no}&client_id=eq.${sid}&select=*`))[0] : null;
    if (!card) throw new ApiError(404, 'ما لقينا عضو بهذا الرقم', 'NO_MEMBER');
    const who = { id: card.id, no: card.member_no, name: card.name || `عضو #${card.member_no}`, transferred: card.transferred_at ? card.transferred : null };
    const rewards = await readyRewards(sid, card, settings);
    if (card.stamps >= settings.needed) return { stamped: false, rewards, who, reason: 'FULL', note: 'بطاقته مكتملة، يستخدم مكافأته أول', stamps: card.stamps, needed: settings.needed };
    const next = cooldownLeft(card, settings);
    if (next) return { stamped: false, who, reason: 'COOLDOWN', note: `انختم قبل شوي، الختم الجاي بعد ${leftText(next)}`, stamps: card.stamps, needed: settings.needed };
    const r = await purchaseStamp(sid, card.id, settings);
    const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=stamps`))[0] || {};
    return { stamped: r.stamped, count: r.count, who, reason: r.reason, stamps: fresh.stamps, needed: settings.needed, rewards: await readyRewards(sid, { ...card, stamps: fresh.stamps }, settings) };
  }

  // ─── صرف المكافأة (أو هدية صديق) عند الموظف: من مسح كود العضو أو من رقم البيجر ───
  if (action === 'loyalty-redeem') {
    const x = (await rest(`clients?id=eq.${sid}&select=loyalty_settings`))[0] || {};
    const settings = normalizeLoyalty(x.loyalty_settings);
    const card = (await rest(`loyalty_cards?id=eq.${int(b.card_id)}&client_id=eq.${sid}&select=*`))[0];
    if (!card) throw new ApiError(404, 'العضو غير موجود');
    let reward = settings.reward;
    if (b.gift) {
      const rows = await rest(`loyalty_gifts?code=eq.${q(String(b.gift))}&to_card=eq.${card.id}&status=eq.claimed&expires_at=gt.${q(new Date().toISOString())}`,
        { method: 'PATCH', prefer: 'return=representation', body: { status: 'redeemed', redeemed_at: new Date().toISOString() } });
      if (!rows.length) throw new ApiError(409, 'الهدية مستخدمة أو منتهية', 'GIFT_USED');
      await rest('loyalty_events', { method: 'POST', body: { client_id: sid, card_id: card.id, kind: 'gift_redeem' } }).catch(() => {});
      reward = rows[0].reward;
    } else {
      const r = await rpc('server_loyalty_redeem', { p_card: card.id, p_needed: settings.needed, p_distance: null });
      if (!r.ok) throw new ApiError(409, 'أختامه ما كملت', 'NOT_ENOUGH');
    }
    // رسالة تهنئة على بطاقة العميل مع الصرف (والتحديث نفسه يصفّر أختامه)
    const first = String(card.name || '').trim().split(/\s+/)[0];
    const sent = await walletNotice(sid, card.id, `🎁 ${first ? `مبروك يا ${first}!` : 'مبروك!'} استلمت مكافأتك: ${reward}. شكراً لوفائك لـ ${store.name}، ننتظرك مرة ثانية`).catch(() => 'error');
    if (sent !== 'sent') await pushWalletCards(sid, { cardIds: [card.id] }).catch(() => 0);
    const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0];
    await poke(topic('pager', sid)).catch(() => {});
    return { ok: true, reward, who: { id: card.id, no: card.member_no, name: card.name || `عضو #${card.member_no}` }, stamps: fresh.stamps, needed: settings.needed, rewards: await readyRewards(sid, fresh, settings) };
  }

  // ─── نقل رصيد من بطاقة قديمة: الكاشير يشوف البطاقة القديمة ويضيف أختامها (مرة وحدة لكل عضو) ───
  if (action === 'loyalty-transfer') {
    const x = (await rest(`clients?id=eq.${sid}&select=loyalty_settings`))[0] || {};
    const settings = normalizeLoyalty(x.loyalty_settings);
    const no = parseInt(String(b.member_no || '').replace(/[^\d]/g, ''), 10);
    const card = Number.isInteger(no) ? (await rest(`loyalty_cards?member_no=eq.${no}&client_id=eq.${sid}&select=id,name,member_no,stamps,transferred_at`))[0] : null;
    if (!card) throw new ApiError(404, 'ما لقينا العضو', 'NO_MEMBER');
    if (card.transferred_at) throw new ApiError(409, 'هذا العضو نقل رصيده القديم من قبل', 'ALREADY');
    const count = int(b.count);
    if (!Number.isInteger(count) || count < 1 || count > settings.needed) throw new ApiError(400, `عدد الأختام من 1 إلى ${settings.needed}`);
    const stamps = Math.min(settings.needed, card.stamps + count);
    const row = (await rest(`loyalty_cards?id=eq.${card.id}&transferred_at=is.null`, { method: 'PATCH', prefer: 'return=representation', body: { stamps, transferred: count, transferred_at: new Date().toISOString() } }))[0];
    if (!row) throw new ApiError(409, 'هذا العضو نقل رصيده القديم من قبل', 'ALREADY');
    await pushWalletCards(sid, { cardIds: [card.id] }).catch(() => 0);
    return { ok: true, who: { no: card.member_no, name: card.name || `عضو #${card.member_no}` }, stamps: row.stamps, needed: settings.needed, count };
  }

  // ─── حذف عضو من بطاقة الولاء (وأختامه ورسائله تنحذف معه) ───
  if (action === 'loyalty-member-delete') {
    const id = int(b.card_id);
    const card = (await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${sid}&select=id,wallet_serial`))[0];
    if (!card) throw new ApiError(404, 'العضو غير موجود');
    await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${sid}`, { method: 'DELETE' });
    return { ok: true };
  }

  // ─── بطاقة الولاء: صاحب المحل يعطي ختم لعضو بنفسه ───
  if (action === 'loyalty-give-stamp') {
    const id = int(b.card_id);
    const card = (await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${sid}&select=id`))[0];
    if (!card) throw new ApiError(404, 'العضو غير موجود');
    const extra = (await rest(`clients?id=eq.${sid}&select=loyalty_settings`))[0] || {};
    const settings = normalizeLoyalty(extra.loyalty_settings);
    const r = await rpc('server_loyalty_stamp', { p_card: id, p_cooldown_hours: 0, p_needed: settings.needed, p_distance: null });
    if (!r.ok && r.reason === 'FULL') throw new ApiError(409, 'بطاقته مكتملة، لازم يستخدم المكافأة أول');
    await pushWalletCards(sid, { cardIds: [id] });
    const fresh = (await rest(`loyalty_cards?id=eq.${id}&select=id,stamps,visits,rewards,last_stamp_at`))[0];
    return { ok: !!r.ok, member: fresh };
  }

  // ─── المساعد الذكي: تشغيل وإيقاف ───
  if (action === 'loyalty-ai') {
    const row = (await rest(`clients?id=eq.${sid}`, { method: 'PATCH', body: { loyalty_ai: b.enabled === true }, prefer: 'return=representation' }))[0];
    return { ai: row.loyalty_ai === true };
  }

  // ─── المساعد الذكي: شغّله الحين (بدل ما ننتظر موعده اليومي) ───
  if (action === 'loyalty-ai-run') {
    const recent = await rest(`loyalty_messages?client_id=eq.${sid}&source=eq.ai&created_at=gte.${q(new Date(Date.now() - 10 * 60e3).toISOString())}&select=id&limit=1`).catch(() => []);
    if (recent.length) throw new ApiError(429, 'المساعد اشتغل قبل شوي، جرّب بعد 10 دقايق');
    return await runAssistant(sid);
  }

  // ─── المساعد الذكي: أمثلة على أسلوبه (ما تنرسل لأحد) ───
  if (action === 'loyalty-ai-preview') {
    const extra = (await rest(`clients?id=eq.${sid}&select=loyalty_settings`))[0] || {};
    const settings = normalizeLoyalty(extra.loyalty_settings);
    const n = settings.needed;
    const guests = [
      { ref: 'welcome', kind: 'welcome', name: 'سارة', gender: 'f', visits: 1, stamps: 1, days_since: 0 },
      { ref: 'miss', kind: 'miss', name: 'فهد', gender: 'm', visits: 6, stamps: Math.min(3, n - 2), days_since: 19, usual_gap: 5 },
      { ref: 'second', kind: 'second', visits: 1, stamps: 1, days_since: 8 },
      { ref: 'almost', kind: 'almost', visits: n - 1, stamps: n - 1, days_since: 6, usual_gap: 4 },
      { ref: 'ready', kind: 'ready', visits: n, stamps: n, days_since: 4, usual_gap: 6 },
      { ref: 'near', kind: 'near', visits: 3, stamps: 3, days_since: 2 }
    ];
    return { examples: await loyaltyMessages({ storeName: store.name, businessType: SECTORS.label(store), reward: settings.reward, needed: n, guests }) };
  }

  // ─── بطاقة الولاء: موقع المحل (صاحب المحل يحدده وهو داخل المحل) ───
  if (action === 'loyalty-location') {
    const lat = Number(b.lat), lng = Number(b.lng), acc = Number(b.acc);
    if (!validPoint(lat, lng)) throw new ApiError(400, 'ما وصلنا موقعك، فعّل الموقع وحاول مرة ثانية');
    if (!Number.isFinite(acc) || acc > 100) throw new ApiError(409, `الموقع مو دقيق كفاية (${Math.round(acc) || '؟'} متر). قرّب من الشباك أو الباب وحاول مرة ثانية`, 'WEAK_GPS');
    await rest(`clients?id=eq.${sid}`, { method: 'PATCH', body: { loyalty_lat: lat, loyalty_lng: lng } });
    return { ok: true, accuracy: Math.round(acc) };
  }

  // ─── اختيار الباقة: صاحب المتجر يختار شهري أو سنوي، ويظهر الطلب في لوحة المشتركين ───
  if (action === 'plan-request') {
    const plan = ['month', 'year'].includes(b.plan) ? b.plan : null;
    if (!plan) throw new ApiError(400, 'اختر الباقة: شهري أو سنوي');
    const features = PLANS.clean(b.features && b.features.length ? b.features : PLANS.LEGACY);
    if (!features.length) throw new ApiError(400, 'اختر ميزة وحدة على الأقل');
    const mainId = store.parent_id || sid;   // اشتراك الفروع تابع للمتجر الرئيسي
    // في التجربة: الخدمات الجديدة تشتغل على طول (والمشترك يتعدل بعد الدفع من لوحة المشتركين)
    const cur = (await rest(`clients?id=eq.${mainId}&select=subscription_status`))[0] || {};
    const live = cur.subscription_status === 'trial' ? { plan_features: features, waitlist_enabled: features.includes('waitlist') } : {};
    const main = (await rest(`clients?id=eq.${mainId}`, {
      method: 'PATCH', body: { ...live, requested_plan: plan, requested_features: features, plan_requested_at: new Date().toISOString() }, prefer: 'return=representation'
    }))[0];
    if (live.plan_features) await rest(`clients?parent_id=eq.${mainId}`, { method: 'PATCH', body: live }).catch(() => {});
    if (!main) throw new ApiError(404, 'المتجر غير موجود');
    console.log('PLAN_REQUEST', mainId, plan);
    // تنبيه للإدارة بالبريد
    const to = process.env.ADMIN_EMAIL || 'dmenu950@gmail.com';
    if (mailConfigured()) {
      const label = plan === 'month' ? 'الشهرية' : 'السنوية';
      await sendMail({
        to, fromName: 'DEV MENU',
        subject: `طلب اشتراك: ${main.name} (الباقة ${label})`,
        text: `${main.name} (${main.client_slug}) اختار الباقة ${label}: ${features.map(k => PLANS.FEATURES[k].name).join('، ')} = ${PLANS.price(features, plan).total} ر.س.\nجوال: ${main.phone || '-'}\nبريد: ${main.email || '-'}\nفعّلها من لوحة المشتركين: https://www.devmenu.digital/super-admin.html`
      }).catch(e => console.error('PLAN_MAIL', e.message));
    }
    return { requested_plan: plan, requested_features: features, plan_requested_at: main.plan_requested_at };
  }

  if (action === 'owner-push') {
    const sub = cleanSubscription(b.sub);
    if (!sub) throw new ApiError(400, 'اشتراك الإشعارات غير صالح');
    await rest('owner_push?on_conflict=endpoint', { method: 'POST', body: { client_id: sid, endpoint: sub.endpoint, sub }, prefer: 'resolution=merge-duplicates' });
    return { ok: true };
  }

  // ─── ردود التقييمات: الذكاء الاصطناعي يكتب رد على تعليق قوقل ماب (إضافة مدفوعة) ───
  if (action === 'review-draft') {
    if (!store.reviews_enabled && !admin) throw new ApiError(403, 'ردود التقييمات غير مفعّلة لمتجرك', 'ADDON_OFF');
    const review = str(b.review, 4000, 'التعليق');
    if (!review || review.length < 2) throw new ApiError(400, 'الصق نص التعليق');
    const rating = int(b.rating);
    if (!(rating >= 1 && rating <= 5)) throw new ApiError(400, 'اختر عدد النجوم');
    const reviewer = str(b.reviewer, 60, 'اسم صاحب التعليق');
    const note = str(b.note, 500, 'الملاحظة');
    const tone = b.tone === 'formal' ? 'formal' : 'friendly';
    // حد يومي يحمي من الاستخدام الزائد
    const since = new Date(Date.now() - 864e5).toISOString();
    const used = await rest(`review_drafts?client_id=eq.${sid}&created_at=gte.${q(since)}&select=id`).catch(() => []);
    if (used.length >= 60) throw new ApiError(429, 'وصلت حد 60 رد في اليوم، جرّب بكرة');
    const reply = await draftReviewReply({ storeName: store.name, businessType: store.business_type, review, rating, reviewer, note, tone });
    const row = (await rest('review_drafts', {
      method: 'POST', prefer: 'return=representation',
      body: { client_id: sid, reviewer: reviewer || null, rating, review, note: note || null, tone, reply }
    }).catch(() => []))[0];
    return { reply, id: row ? row.id : null };
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
    // بطاقة ولاء مربوطة بالرقم: ختم أول ما يجهز الطلب (مرة وحدة)
    if (status === 'ready' && t.loyalty_card_id && !t.loyalty_stamped) {
      try {
        const x = (await rest(`clients?id=eq.${sid}&select=loyalty_enabled,loyalty_settings`))[0] || {};
        const ls = normalizeLoyalty(x.loyalty_settings);
        if (x.loyalty_enabled && ls.pager_stamp) {
          await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { loyalty_stamped: true } });
          await purchaseStamp(sid, t.loyalty_card_id, ls);
        }
      } catch (e) { console.error('PAGER_STAMP', e.message); }
    }
    // بطاقة ولاء مربوطة وفي المحفظة: إشعار "طلبك جاهز" من البطاقة (يوصل الآيفون حتى لو المتصفح مسكّر)
    if (status === 'ready' && t.loyalty_card_id && PLANS.has(store, 'loyalty')) {
      const wr = await pagerReadyNotice(sid, t.loyalty_card_id, t.number, store.name, SECTORS.terms(store));
      console.log('PAGER_WALLET', sid, t.id, wr);
    }
    await poke([topic('pager', sid), topic('ticket', t.token)]);
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
    await poke([topic('pager', sid), topic('ticket', rows[0].token)]);
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
    await poke(topic('wl', sid));
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
    // مربوط ببطاقة ولاء في المحفظة: إشعار "جاء دورك/طاولتك جاهزة" من البطاقة
    if (status === 'notified' && updated.loyalty_card_id && PLANS.has(store, 'loyalty')) {
      const T = SECTORS.terms(store);
      await walletNotice(sid, updated.loyalty_card_id, `🔔 ${T.wlReady} دور #${updated.ticket}. تفضّل للاستقبال في ${store.name}`).catch(() => {});
    }
    await poke(topic('wl', sid));
    return { entry: updated, email_sent };
  }

  // ─── تعديل بيانات المتجر (حقول محددة فقط) ───
  if (action === 'update-store') {
    const p = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    if (has('name')) { p.name = str(b.name, 80, 'الاسم'); if (!p.name) throw new ApiError(400, 'اكتب اسم المنشأة'); }
    if (has('promo_message')) p.promo_message = str(b.promo_message, 120, 'العرض');
    for (const k of ['website_url', 'tiktok_url', 'instagram_url', 'snapchat_url', 'location_url']) if (has(k)) p[k] = httpUrl(b[k], k);
    if (has('whatsapp_number')) p.whatsapp_number = waNumber(b.whatsapp_number);
    if (has('opening_hours')) p.opening_hours = str(b.opening_hours, 80, 'ساعات العمل');
    if (has('whatsapp_orders')) p.whatsapp_orders = b.whatsapp_orders === true;
    if (has('show_calories')) p.show_calories = b.show_calories !== false;
    if (has('menu_layout')) p.menu_layout = b.menu_layout === 'photos' ? 'photos' : 'list';
    if (has('google_review_url')) {
      const u = String(b.google_review_url || '').trim();
      if (u && !/^https:\/\/(g\.page|search\.google\.com|www\.google\.com|maps\.app\.goo\.gl|goo\.gl|maps\.google\.com|g\.co)\//i.test(u)) throw new ApiError(400, 'رابط تقييم قوقل لازم يكون من قوقل (مثل g.page/r/... أو maps.app.goo.gl)');
      p.google_review_url = u.slice(0, 500) || null;
    }
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
      if (has('business_label') || b.business_type !== 'other') p.business_label = b.business_type === 'other' ? (str(b.business_label, 60, 'اسم النشاط') || null) : null;
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
    if (!['logo', 'bg_image', 'bg_video', 'prod', 'sticker', 'stamp', 'card_bg'].includes(kind)) throw new ApiError(400, 'نوع ملف غير صحيح');
    const isVideo = kind === 'bg_video';
    const ext = (isVideo ? VIDEO_TYPES : IMAGE_TYPES)[b.type];
    if (!ext) throw new ApiError(400, isVideo ? 'الملف لازم يكون فيديو MP4' : 'صيغة الصورة غير مدعومة، استخدم JPG أو PNG أو WebP');
    const size = int(b.size);
    const maxMb = isVideo ? 30 : kind === 'sticker' || kind === 'stamp' ? 2 : 5;
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
}

// أي تعديل يغيّر اللي يشوفه الزبون في المنيو ← تنبيه لحظي للمنيوهات المفتوحة
const MENU_ACTIONS = new Set([
  'update-store', 'occasions-save', 'branch-rename', 'coupon-save', 'coupon-toggle', 'coupon-delete', 'update-slug',
  'category-add', 'category-group', 'category-rename', 'category-delete', 'reorder',
  'product-save', 'product-toggle', 'product-delete', 'waitlist-settings'
]);

module.exports = handler(['GET', 'POST'], async (req) => {
  const out = await main(req);
  if (req.method === 'POST' && req._sid && MENU_ACTIONS.has(req.query.action)) await poke(topic('menu', req._sid));
  return out;
});

module.exports.config = { maxDuration: 60 };
