// =====================================================================
// DEV MENU — نقاط API العامة (بدون تسجيل دخول)
//   GET  /api/public?action=menu&slug=xxx   منيو متجر (فقط لو اشتراكه ساري)
//   GET  /api/public?action=menu-version&slug=xxx  بصمة المنيو (للتحديث التلقائي، مخزنة 5 ثواني في CDN)
//   GET  /api/public?action=links&slug=xxx  بيانات صفحة الروابط السريعة (بدون الأطباق)
//   GET  /api/public?action=featured        الأمثلة الحقيقية للصفحة الرئيسية
//   POST /api/public?action=coupon          فحص كوبون خصم على سلة الطلب وحساب الخصم
//   POST /api/public?action=coupon-redeem   تسجيل استخدام الكوبون عند إرسال الطلب
//   POST /api/public?action=track           تسجيل زيارة/مشاهدة (مجهولة)
// =====================================================================
const crypto = require('crypto');
const { handler, rest, rpc, q, ApiError, readBody, int, findPublicStore, CURRENCIES } = require('./_lib/core');

const STORE_FIELDS = 'id,name,client_slug,logo_url,bg_image_url,bg_video_url,promo_message,website_url,tiktok_url,instagram_url,whatsapp_number,snapchat_url,opening_hours,location_url,whatsapp_orders,business_type,show_calories,delivery_apps,theme,accent_color,order_numbers,custom_links';
const PRODUCT_FIELDS = 'id,name,name_en,description,description_en,extra_info,note,price,category,image_url,is_available,is_bestseller,calories,allergens,coffee,sort_order,sizes';
const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;

async function findStore(rawSlug) {
  // public_clients تعرض المتاجر السارية فقط: المنتهي أو الموقوف ما يرجع منه شي
  // عمود العملة من 23-currency.sql — لو ما انضاف للحين نكمل بدونه (الريال افتراضياً)
  let found;
  try { found = await findPublicStore(rawSlug, `${STORE_FIELDS},currency`); }
  catch { found = await findPublicStore(rawSlug, STORE_FIELDS); }
  const { store, bad } = found;
  if (bad) throw new ApiError(400, 'رابط المنيو غير صحيح', 'BAD_SLUG');
  if (!store) throw new ApiError(404, 'المنيو غير متاح حالياً', 'NOT_AVAILABLE');
  return store;
}

const round2 = (n) => Math.round(n * 100) / 100;
const money = (n, cur) => `${round2(n)} ${CURRENCIES[cur] || CURRENCIES.SAR}`;

// المناسبة الجارية اليوم (بتوقيت الرياض). لو فيه أكثر من وحدة نختار الأحدث بداية
// نرسل الجارية فقط، فمناسبات المتجر القادمة ما تنكشف
async function activeOccasion(storeId) {
  try {
    const row = (await rest(`clients?id=eq.${storeId}&select=occasions`))[0];
    const list = Array.isArray(row && row.occasions) ? row.occasions : [];
    const today = new Date(Date.now() + 3 * 3600000).toISOString().slice(0, 10);
    const now = list.filter(o => o && o.enabled !== false && o.starts_on <= today && today <= o.ends_on)
      .sort((a, b) => (b.starts_on > a.starts_on ? 1 : -1))[0];
    if (!now) return null;
    const { preset, title, greeting, stickers } = now;
    return { preset, title, greeting, stickers: Array.isArray(stickers) ? stickers : [] };
  } catch { return null; }   // قبل تشغيل ملف SQL الخاص بالمناسبات
}

// هل عند المتجر كوبونات بكود فعّالة؟ (نعرض خانة الكوبون في السلة فقط لو فيه)
async function hasCoupons(storeId) {
  try { return (await rest(`coupons?client_id=eq.${storeId}&is_active=is.true&auto_apply=is.false&select=id&limit=1`)).length > 0; }
  catch { return false; }
}

const liveNow = (c) => {
  const now = Date.now();
  return (!c.starts_at || Date.parse(c.starts_at) <= now) && (!c.ends_at || Date.parse(c.ends_at) >= now)
    && (c.max_uses == null || c.uses < c.max_uses);
};
const PROMO_FIELDS = 'code,type,value,scope,category_keys,product_ids,min_order,starts_at,ends_at,max_uses,uses,auto_apply';

// العروض الظاهرة في المنيو: الخصم التلقائي + الكوبونات اللي صاحب المتجر اختار يعرضها
async function menuPromos(storeId) {
  try {
    const rows = await rest(`coupons?client_id=eq.${storeId}&is_active=is.true&show_in_menu=is.true&select=${PROMO_FIELDS}&order=id.asc`);
    return rows.filter(liveNow).map(c => ({
      auto: c.auto_apply === true, code: c.auto_apply ? null : c.code, type: c.type, value: Number(c.value),
      scope: c.scope, category_keys: c.category_keys || [], product_ids: (c.product_ids || []).map(Number),
      min_order: c.min_order == null ? null : Number(c.min_order), ends_at: c.ends_at
    }));
  } catch { return []; }
}

// هل العرض يشمل الطبق؟ (المنتج ممكن يكون مربوط بمفتاح القسم أو اسمه)
function promoCovers(promo, product, catKeyOf) {
  if (promo.scope === 'all') return true;
  if ((promo.product_ids || []).map(Number).includes(Number(product.id))) return true;
  return (promo.category_keys || []).includes(catKeyOf(product.category));
}
// سعر الوحدة بعد أفضل خصم تلقائي
function autoPrice(unit, product, autos, catKeyOf) {
  let best = unit;
  autos.forEach(a => {
    if (!promoCovers(a, product, catKeyOf)) return;
    const after = a.type === 'percent' ? unit * (1 - a.value / 100) : Math.max(0, unit - a.value);
    if (after < best) best = after;
  });
  return round2(best);
}

// يجيب الكوبون ويتأكد إنه صالح الحين (فعّال، ضمن التاريخ، وما خلص عدده)
async function loadCoupon(storeId, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) throw new ApiError(400, 'رمز الكوبون غير صحيح', 'BAD_COUPON');
  const c = (await rest(`coupons?client_id=eq.${storeId}&code=eq.${q(code)}&select=*&limit=1`))[0];
  if (!c || !c.is_active || c.auto_apply === true) throw new ApiError(404, 'رمز الكوبون غير صحيح', 'BAD_COUPON');
  const now = Date.now();
  if (c.starts_at && Date.parse(c.starts_at) > now) throw new ApiError(400, 'الكوبون ما بدأ للحين', 'COUPON_NOT_STARTED');
  if (c.ends_at && Date.parse(c.ends_at) < now) throw new ApiError(400, 'انتهت صلاحية الكوبون', 'COUPON_EXPIRED');
  if (c.max_uses != null && c.uses >= c.max_uses) throw new ApiError(400, 'انتهى عدد استخدامات الكوبون', 'COUPON_USED_UP');
  return c;
}

// الخصم يُحسب هنا بأسعار قاعدة البيانات، مو بالأسعار اللي يرسلها المتصفح
async function priceCart(store, coupon, rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > 100) throw new ApiError(400, 'السلة فاضية');
  const items = rawItems.map(i => ({ id: int(i && i.id), qty: int(i && i.qty), size: i && i.size != null ? String(i.size) : null }))
    .filter(i => Number.isInteger(i.id) && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 99);
  if (!items.length) throw new ApiError(400, 'السلة فاضية');
  const ids = [...new Set(items.map(i => i.id))];
  const [products, categories, promos] = await Promise.all([
    rest(`products?client_id=eq.${store.id}&id=in.(${ids.join(',')})&is_hidden=is.false&select=id,price,category,sizes,is_available`),
    rest(`categories?client_id=eq.${store.id}&select=key,name`),
    menuPromos(store.id)
  ]);
  const byId = new Map(products.map(p => [p.id, p]));
  const nameToKey = new Map(categories.map(c => [c.name, c.key]));
  const catKeyOf = (cat) => nameToKey.get(cat) || cat;
  const autos = promos.filter(x => x.auto);
  let subtotal = 0, eligible = 0;
  for (const i of items) {
    const p = byId.get(i.id);
    if (!p || p.is_available === false) continue;
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    let unit = Number(p.price);
    if (sizes.length) {
      const z = sizes.find(s => s.name === i.size);
      if (!z) continue;
      unit = Number(z.price);
    }
    // الخصم التلقائي أولاً، ثم الكوبون على السعر بعد الخصم
    const line = autoPrice(unit, p, autos, catKeyOf) * i.qty;
    subtotal += line;
    if (promoCovers(coupon, p, catKeyOf)) eligible += line;
  }
  subtotal = round2(subtotal); eligible = round2(eligible);
  if (coupon.min_order != null && subtotal < Number(coupon.min_order)) {
    throw new ApiError(400, `الكوبون يحتاج طلب بقيمة ${money(coupon.min_order, store.currency)} أو أكثر`, 'COUPON_MIN_ORDER');
  }
  if (eligible <= 0) throw new ApiError(400, 'الكوبون ما يشمل الأصناف اللي في طلبك', 'COUPON_NOT_ELIGIBLE');
  const discount = round2(coupon.type === 'percent' ? eligible * Number(coupon.value) / 100 : Math.min(Number(coupon.value), eligible));
  return { subtotal, eligible, discount, total: round2(subtotal - discount) };
}

// زر "قائمة الانتظار": الإضافة مفعّلة + القائمة مفتوحة + صاحب المتجر مختار يظهر الزر
async function waitlistOpen(storeId) {
  const wl = (await rest(`clients?id=eq.${storeId}&select=waitlist_enabled,waitlist_settings`))[0] || {};
  const ws = wl.waitlist_settings || {};
  return wl.waitlist_enabled === true && ws.open !== false && ws.show_in_menu !== false;
}

// كل بيانات المنيو العام لمتجر
async function menuPayload(slug) {
  const store = await findStore(slug);
  const [categories, products, waitlist_open, has_coupons, occasion, promos] = await Promise.all([
    rest(`categories?client_id=eq.${store.id}&select=id,key,name,name_en,sort_order,group_name`),
    // المنتجات المخفية ما توصل للزبون أصلاً
    rest(`products?client_id=eq.${store.id}&is_hidden=is.false&select=${PRODUCT_FIELDS}`),
    waitlistOpen(store.id),
    hasCoupons(store.id),
    activeOccasion(store.id),
    menuPromos(store.id)
  ]);
  return { store: { ...store, waitlist_open, has_coupons, occasion, promos }, categories: categories.sort(bySort), products: products.sort(bySort) };
}
const versionOf = (data) => crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 16);

module.exports = handler(['GET', 'POST'], async (req, res) => {
  const action = req.query.action;

  if (action === 'menu' && req.method === 'GET') {
    const data = await menuPayload(req.query.slug);
    return { ...data, version: versionOf(data) };
  }

  // المنيو المفتوح عند الزبون يسأل هنا كل كم ثانية: لو تغيّرت البصمة يجيب المنيو من جديد.
  // الرد يتخزن 5 ثواني في CDN، فمهما كثر الزبائن ما ينفذ الخادم إلا مرة كل 5 ثواني لكل متجر
  if (action === 'menu-version' && req.method === 'GET') {
    let v;
    try { v = versionOf(await menuPayload(req.query.slug)); }
    catch (e) { if (e.status === 404 || e.status === 400) v = 'off'; else throw e; }
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=10');
    return { v };
  }

  // صفحة الروابط السريعة: نفس بيانات المتجر بدون الأقسام والأطباق
  if (action === 'links' && req.method === 'GET') {
    const store = await findStore(req.query.slug);
    const [waitlist_open, occasion] = await Promise.all([waitlistOpen(store.id), activeOccasion(store.id)]);
    return { store: { ...store, waitlist_open, occasion } };
  }

  if (action === 'featured' && req.method === 'GET') {
    // أمثلة الصفحة الرئيسية: شعار واسم ورابط كل منشأة مختارة (والسارية فقط)
    const stores = await rest('public_clients?is_featured=eq.true&logo_url=not.is.null&select=name,client_slug,logo_url&order=id.desc&limit=12');
    return { stores };
  }

  if (action === 'coupon' && req.method === 'POST') {
    const b = readBody(req);
    const store = await findStore(b.slug);
    const coupon = await loadCoupon(store.id, b.code);
    const totals = await priceCart(store, coupon, b.items);
    return { coupon: { code: coupon.code, type: coupon.type, value: Number(coupon.value) }, ...totals };
  }

  // عند إرسال الطلب لواتساب: نزيد عداد الاستخدام (إذا خلص الحد ما يزيد)
  if (action === 'coupon-redeem' && req.method === 'POST') {
    const b = readBody(req);
    try {
      const store = await findStore(b.slug);
      const coupon = await loadCoupon(store.id, b.code);
      await rpc('redeem_coupon', { p_coupon_id: coupon.id });
    } catch {}
    return { ok: true };
  }

  if (action === 'track' && req.method === 'POST') {
    const b = readBody(req);
    const clientId = int(b.client_id);
    const productId = b.product_id == null ? null : int(b.product_id);
    if (!Number.isInteger(clientId) || (productId !== null && !Number.isInteger(productId))) return { ok: true };
    if (!['view', 'dish', 'order', 'lang'].includes(b.kind)) return { ok: true };
    // track_event تتأكد بنفسها إن المتجر ساري والطبق تابع له
    await rpc('track_event', {
      p_client_id: clientId, p_kind: b.kind, p_product_id: productId,
      p_source: ['qr', 'link'].includes(b.source) ? b.source : null
    });
    return { ok: true };
  }

  throw new ApiError(404, 'Unknown action');
});
