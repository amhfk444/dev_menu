// =====================================================================
// DEV MENU — API صاحب المتجر: المساعدات والثوابت المشتركة بين ملفات الميزات
// (انتقلت من api/owner.js كما هي)
// =====================================================================
const crypto = require('crypto');
const {
  handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET,
  ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, SLUG_RE, RESERVED_SLUGS, CURRENCIES, SITE, storeLink, loyaltyHome, later
} = require('../core');
const { followParentFeatures } = require('../branch-features');
const { FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor } = require('../waitlist');
const { sendMail, mailConfigured } = require('../mail');
const { sendPush, pushPublicKey, cleanSubscription } = require('../push');
const { topic, storeTopics, poke } = require('../live');
const { normalizeLoyalty, validPoint } = require('../loyalty');
const PLANS = require('../plans');
const { tr } = require('../i18n');
const wallet = require('../wallet');
const queue = require('../notify-queue');
const { pushWalletCards, runAssistant, pagerReadyNotice, walletNotice } = require('../loyalty-assistant');
const { loyaltyMessages, loyaltyNearLines } = require('../ai');
const { stampPagerTicket, purchaseStamp, tagBranch, newStampCode, parseMemberQr, cooldownLeft, leftText } = require('../loyalty-stamp');

const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;
const COFFEE_TYPES = ['cafe', 'mixed'];
const SECTORS = require('../sectors');
// أقسام صفحة الروابط السريعة (للترتيب والإخفاء)
const LINKS_SECTIONS = ['services', 'contact', 'delivery', 'social', 'custom', 'location'];
const BUSINESS_TYPES = SECTORS.KEYS;
const ALLERGENS = ['gluten', 'milk', 'egg', 'nuts', 'peanut', 'sesame', 'fish', 'shellfish', 'soy'];
const PROCESS = ['washed', 'natural', 'honey', 'anaerobic', 'carbonic', 'other'];
const ROAST = ['light', 'medium', 'dark'];
const METHODS = ['v60', 'chemex', 'aeropress', 'frenchpress', 'espresso', 'coldbrew'];
const DELIVERY = ['hungerstation', 'jahez', 'keeta', 'toyou', 'mrsool', 'thechefz', 'careem', 'shgardi', 'other'];
const THEMES = ['dark', 'light', 'sand', 'forest'];
const MAX_SIZES = 6, MAX_COUPONS = 100;
const OCCASION_PRESETS = ['ramadan', 'eid_fitr', 'eid_adha', 'national_day', 'founding_day', 'hijri_new_year', 'winter', 'custom'];
const STICKER_POSITIONS = ['logo-right', 'logo-left', 'under-right', 'under-left', 'float'];
// ملصقات المكتبة الجاهزة (js/occasions.js LIBRARY)
const STICKER_LIB = ['lantern', 'crescent', 'dates', 'samosa', 'drum', 'snowman', 'cocoa', 'cookie', 'gift', 'scarf'];
const STICKER_SIZES = ['s', 'm', 'l'];
const STICKER_ANIMS = ['float', 'swing', 'bounce', 'pulse', 'none'];
const MAX_OCCASIONS = 20, MAX_STICKERS = 6;
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
      const lib = k && STICKER_LIB.includes(k.lib) ? k.lib : null;
      if (!k || (!lib && !ownerIds.some(id => ownsMediaUrl(k.url, id)))) throw new ApiError(400, 'ملصق غير تابع لمتجرك');
      return {
        ...(lib ? { lib } : { url: k.url }),
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
// إضافات الطبق: مجموعات (حدها 6)، كل مجموعة فيها خيارات (حدها 15) بأسعار (0 = مجاني)
// required = لازم يختار وحدة على الأقل، max = أقصى عدد يختاره من المجموعة
function cleanExtras(list) {
  if (list === undefined || list === null) return [];
  if (!Array.isArray(list) || list.length > 6) throw new ApiError(400, 'الإضافات حدها 6 مجموعات');
  const groups = new Set();
  return list.map((g) => {
    if (!g || typeof g !== 'object') throw new ApiError(400, 'مجموعة إضافات غير صحيحة');
    const name = str(g.name, 40, 'اسم المجموعة');
    if (!name) throw new ApiError(400, 'اكتب اسم كل مجموعة إضافات (مثل: الصوصات)');
    if (groups.has(name)) throw new ApiError(400, `المجموعة "${name}" مكررة`);
    groups.add(name);
    const opts = Array.isArray(g.options) ? g.options : [];
    if (!opts.length) throw new ApiError(400, `أضف خيار واحد على الأقل في "${name}"`);
    if (opts.length > 15) throw new ApiError(400, `"${name}": الخيارات حدها 15`);
    const seen = new Set();
    const options = opts.map((o) => {
      const on = str(o && o.name, 40, 'اسم الإضافة');
      if (!on) throw new ApiError(400, `اكتب اسم كل خيار في "${name}"`);
      if (seen.has(on)) throw new ApiError(400, `"${on}" مكرر في "${name}"`);
      seen.add(on);
      const price = Number(o.price || 0);
      if (!validPrice(price)) throw new ApiError(400, `اكتب سعراً صحيحاً لـ "${on}"`);
      const item = { name: on, price: round2(price) };
      const en = str(o.name_en, 40, 'اسم الإضافة بالإنجليزي'); if (en) item.name_en = en;
      // مربوط بصنف في المنيو (قسم الإضافات): الاسم والسعر والتوفر منه وقت العرض والطلب
      const pid = int(o.pid); if (Number.isInteger(pid) && pid > 0) item.pid = pid;
      return item;
    });
    const required = g.required === true;
    // الإجبارية = يختار واحد (مثل نوع الخبز)، والاختيارية بدون حد (كل ما زاد استفاد المحل)
    const max = required ? 1 : options.length;
    const out = { name, required, max, options };
    const en = str(g.name_en, 40, 'اسم المجموعة بالإنجليزي'); if (en) out.name_en = en;
    return out;
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

// رابط الكاشير: مفتاح الفرع يفتح شاشة البيجر وشاشة الختم بس (بدون حساب المالك)
const DESK_ACTIONS = ['pager', 'order-update', 'pager-update', 'pager-invoice', 'pager-ring', 'pager-eta', 'pager-addons-seen', 'loyalty-stamp-code', 'loyalty-scan', 'loyalty-redeem', 'loyalty-transfer', 'kiosk'];
const DESK_KEY_RE = /^[A-Za-z0-9_-]{24,64}$/;
// الولاء وحدة للمحل بكل فروعه: أي طلب ولاء من فرع يشتغل على بيانات المحل الرئيسي وإعداداته
// (ما عدا موقع الختم: لكل فرع موقعه). here = الفرع اللي جاي منه الطلب
// عمليات المنيو (الأطباق والأقسام والكوبونات والمناسبات): لمشتركي المنيو بس
const MENU_ONLY = ['extras-copy', 'category-add', 'category-group', 'category-rename', 'category-delete', 'reorder', 'menu-from-photo', 'products-import',
  'product-save', 'product-image', 'product-toggle', 'product-delete', 'coupon-save', 'coupon-toggle', 'coupon-delete', 'occasions-save'];
async function context(req, opts) {
  const ctx = await storeContext(req, opts);
  const action = String(req.query.action || '');
  ctx.here = ctx.store;
  if (ctx.store && ctx.store.parent_id && (action.startsWith('loyalty') || action === 'kiosk') && action !== 'loyalty-location') {
    ctx.store = (await rest(`clients?id=eq.${ctx.store.parent_id}&select=*&limit=1`))[0] || ctx.store;
  }
  return ctx;
}
// كل فروع المحل (عشان كود العضوية القديم الموقّع برقم فرع يمشي)
async function familyIds(store) {
  const root = store.parent_id || store.id;
  return (await rest(`clients?or=${q(`(id.eq.${root},parent_id.eq.${root})`)}&select=id`).catch(() => [])).map(r => r.id).concat(root);
}
async function storeContext(req, { needStore = true } = {}) {
  const deskKey = String(req.headers['x-dm-desk'] || '');
  if (deskKey) {
    if (!DESK_ACTIONS.includes(String(req.query.action))) throw new ApiError(403, 'رابط الكاشير يفتح شاشة الكاشير بس', 'DESK_ONLY');
    const store = DESK_KEY_RE.test(deskKey) ? (await rest(`clients?desk_key=eq.${q(deskKey)}&select=*&limit=1`))[0] : null;
    if (!store) throw new ApiError(401, 'رابط الكاشير تغيّر. اطلب الرابط الجديد من صاحب المحل', 'DESK_KEY');
    return { user: null, admin: false, store, desk: true };
  }
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
const SHARED_PRODUCT_FIELDS = ['name', 'name_en', 'description', 'description_en', 'extra_info', 'note', 'image_url', 'calories', 'allergens', 'coffee', 'extras'];

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
  const url = storeLink(store.client_slug, 'pager');
  const L = (s) => tr(t.lang, s);   // لغة الزبون اللي أخذ الرقم
  const payload = n === 1
    ? { title: L(`🔔 ${SECTORS.terms(store).ready} رقم ${t.number}`), body: L(`${SECTORS.terms(store).readyBody} من ${store.name}`) }
    : { title: L(`🔔 تذكير: ${SECTORS.terms(store).ready} رقم ${t.number}`), body: L(`الموظف بانتظارك في ${store.name} (${n}/${PAGER_MAX_RINGS})`) };
  // وسم مختلف لكل رنّة عشان الجوال يرن كل مرة (الآيفون ما يعيد التنبيه لنفس الوسم)
  const result = await sendPush(t.push_sub, { ...payload, url, tag: `pager-${t.id}-${n}` });
  console.log('PAGER_RING', store.id, t.id, n, result);
  const patch = result === 'gone' ? { push_sub: null } : { ring_count: n, last_ring_at: new Date().toISOString() };
  await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: patch }).catch(() => {});
  return result;
}

// هوية المحل تغيّرت: نحدّث بطاقات المحفظة. البطاقات على المحل الرئيسي، فتغيير شعار فرع يبان في بطاقة النداء مع رقمه الجاي من الفرع
async function refreshWalletCards(store) {
  if (store.parent_id) return;
  const loyalty = await pushWalletCards(store.id).catch(e => `error ${e.message}`);
  // بطاقات النداء اللي ما عندها طلب شغّال الحين ترجع "بالعافية" بالشكل الجديد (اللي عندها طلب تتحدث مع "جاهز")
  const cards = await rest(`pager_cards?client_id=eq.${store.id}&wallet_serial=not.is.null&select=wallet_serial,lang&limit=2000`).catch(() => []);
  const family = (await familyOf(store, 'id').catch(() => [store])).map(f => f.id).join(',');   // الأرقام من كل الفروع
  const busy = new Set((await rest(`pager_tickets?client_id=in.(${family})&status=in.(waiting,ready)&created_at=gte.${q(riyadhDayStart())}&wallet_serial=not.is.null&select=wallet_serial`).catch(() => [])).map(t => t.wallet_serial));
  let pager = 0;
  for (const c of cards.filter(c => !busy.has(c.wallet_serial))) {
    if ((await wallet.updatePagerPass(c.wallet_serial, wallet.pagerStep({ store, step: 'idle', lang: c.lang }))).startsWith('ok')) pager++;
  }
  console.log('WALLET_REFRESH', store.id, 'loyalty', loyalty, 'pager', pager);
}

// "رسائل لزبائنك": رسالتين بالأسبوع بالكثير (الإزعاج يخلي الزبون يحذف البطاقة، وبعدها ما يوصله حتى "طلبك جاهز")
// رسائل لزبائنك بدون حد: صاحب المحل يقرر. بس دقيقتين بين كل رسالة والثانية (عشان ضغطة مكررة ما ترسلها مرتين)
const PAGER_MSG_GAP = 2 * 60e3;
const { winbackSettings } = require('../winback');
// المكافآت الجاهزة لعضو: مكافأة الأختام + هدايا الأصدقاء المستلمة
// رسالة تسليم المكافأة: نص صاحب المحل، أو يكتبها المساعد لهالعميل، أو بدون
async function redeemMessage(store, settings, card, reward) {
  const m = settings.redeem_msg;
  if (m.mode === 'off') return '';
  if (m.mode === 'custom' && m.text) return m.text;
  const first = String(card.name || '').trim().split(/\s+/)[0];
  try {
    const out = await Promise.race([
      loyaltyMessages({ storeName: store.name, businessType: SECTORS.label(store), reward, needed: settings.needed,
        guests: [{ ref: 'r', kind: 'redeemed', name: card.name, gender: card.gender, lang: card.lang, visits: card.visits || 0, stamps: 0, days_since: 0 }] }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000))
    ]);
    if (out.r) return `🎁 ${out.r}`;
  } catch (e) { console.error('REDEEM_AI', e.message); }
  return `🎁 ${first ? `مبروك يا ${first}!` : 'مبروك!'} استلمت مكافأتك: ${reward}. شكراً لوفائك لـ ${store.name}، ننتظرك مرة ثانية`;
}

// "ليش ما رجعت؟" في شاشة الختم: غاب المدة المحددة وما جاوب خلال آخر شهرين
const FEEDBACK_REASONS = ['wait', 'price', 'quality', 'far', 'busy', 'other'];
async function absenceDue(storeId, card, settings) {
  if (!card.last_stamp_at || Date.now() - Date.parse(card.last_stamp_at) < settings.feedback.days * 864e5) return false;
  const last = await rest(`loyalty_feedback?client_id=eq.${storeId}&card_id=eq.${card.id}&created_at=gte.${q(new Date(Date.now() - 60 * 864e5).toISOString())}&select=id&limit=1`).catch(() => [1]);
  return !last.length;
}

async function readyRewards(storeId, card, settings) {
  const out = [];
  if (card.stamps >= settings.needed) out.push({ type: 'stamps', label: settings.reward });
  const gifts = await rest(`loyalty_gifts?client_id=eq.${storeId}&to_card=eq.${card.id}&status=eq.claimed&expires_at=gt.${q(new Date().toISOString())}&select=code,reward`).catch(() => []);
  gifts.forEach(g => out.push({ type: 'gift', code: g.code, label: `${g.reward} (هدية)` }));
  return out;
}

module.exports = { crypto, handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET, ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, SLUG_RE, RESERVED_SLUGS, CURRENCIES, SITE, storeLink, loyaltyHome, later, followParentFeatures, FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor, sendMail, mailConfigured, sendPush, pushPublicKey, cleanSubscription, topic, storeTopics, poke, normalizeLoyalty, validPoint, PLANS, tr, wallet, queue, pushWalletCards, runAssistant, pagerReadyNotice, walletNotice, loyaltyMessages, loyaltyNearLines, stampPagerTicket, purchaseStamp, tagBranch, newStampCode, parseMemberQr, cooldownLeft, leftText, bySort, COFFEE_TYPES, SECTORS, LINKS_SECTIONS, BUSINESS_TYPES, ALLERGENS, PROCESS, ROAST, METHODS, DELIVERY, THEMES, MAX_SIZES, MAX_COUPONS, OCCASION_PRESETS, STICKER_POSITIONS, STICKER_LIB, STICKER_SIZES, STICKER_ANIMS, MAX_OCCASIONS, MAX_STICKERS, isDay, cleanOccasions, validPrice, round2, cleanSizes, cleanExtras, riyadhDate, MAX_ORDER_NUMBERS, MAX_CUSTOM_LINKS, phoneNumber, DESK_ACTIONS, DESK_KEY_RE, MENU_ONLY, context, familyIds, storeContext, familyOf, categoryIn, nextOrderIn, SHARED_PRODUCT_FIELDS, guestKeysOf, guestHistory, patchStore, cleanCoffee, IMAGE_TYPES, VIDEO_TYPES, PAGER_MAX_RINGS, ringTicket, refreshWalletCards, PAGER_MSG_GAP, winbackSettings, redeemMessage, FEEDBACK_REASONS, absenceDue, readyRewards };
