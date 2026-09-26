// =====================================================================
// DEV MENU — نقاط API العامة (بدون تسجيل دخول)
//   GET  /api/public?action=menu&slug=xxx   منيو متجر (فقط لو اشتراكه ساري)
//   GET  /api/public?action=links&slug=xxx  بيانات صفحة الروابط السريعة (بدون الأطباق)
//   GET  /api/public?action=featured        الأمثلة الحقيقية للصفحة الرئيسية
//   POST /api/public?action=coupon          فحص كوبون خصم على سلة الطلب وحساب الخصم
//   POST /api/public?action=coupon-redeem   تسجيل استخدام الكوبون عند إرسال الطلب
//   POST /api/public?action=track           تسجيل زيارة/مشاهدة (مجهولة)
// =====================================================================
const { handler, rest, rpc, q, ApiError, readBody, int, findPublicStore } = require('./_lib/core');

const STORE_FIELDS = 'id,name,client_slug,logo_url,bg_image_url,bg_video_url,promo_message,website_url,tiktok_url,instagram_url,whatsapp_number,snapchat_url,opening_hours,location_url,whatsapp_orders,business_type,show_calories,delivery_apps,theme,accent_color,order_numbers,custom_links';
const PRODUCT_FIELDS = 'id,name,name_en,description,description_en,extra_info,note,price,category,image_url,is_available,is_bestseller,calories,allergens,coffee,sort_order,sizes';
const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;

async function findStore(rawSlug) {
  // public_clients تعرض المتاجر السارية فقط: المنتهي أو الموقوف ما يرجع منه شي
  const { store, bad } = await findPublicStore(rawSlug, STORE_FIELDS);
  if (bad) throw new ApiError(400, 'رابط المنيو غير صحيح', 'BAD_SLUG');
  if (!store) throw new ApiError(404, 'المنيو غير متاح حالياً', 'NOT_AVAILABLE');
  return store;
}

const round2 = (n) => Math.round(n * 100) / 100;
const money = (n) => `${round2(n)} ر.س`;

// هل عند المتجر كوبونات فعّالة؟ (نعرض خانة الكوبون في السلة فقط لو فيه)
async function hasCoupons(storeId) {
  try { return (await rest(`coupons?client_id=eq.${storeId}&is_active=is.true&select=id&limit=1`)).length > 0; }
  catch { return false; }
}

// يجيب الكوبون ويتأكد إنه صالح الحين (فعّال، ضمن التاريخ، وما خلص عدده)
async function loadCoupon(storeId, rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,20}$/.test(code)) throw new ApiError(400, 'رمز الكوبون غير صحيح', 'BAD_COUPON');
  const c = (await rest(`coupons?client_id=eq.${storeId}&code=eq.${q(code)}&select=*&limit=1`))[0];
  if (!c || !c.is_active) throw new ApiError(404, 'رمز الكوبون غير صحيح', 'BAD_COUPON');
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
  const [products, categories] = await Promise.all([
    rest(`products?client_id=eq.${store.id}&id=in.(${ids.join(',')})&is_hidden=is.false&select=id,price,category,sizes,is_available`),
    rest(`categories?client_id=eq.${store.id}&select=key,name`)
  ]);
  const byId = new Map(products.map(p => [p.id, p]));
  const selectedCats = new Set(coupon.category_keys || []);
  // المنتج ممكن يكون مربوط بمفتاح القسم أو اسمه (بيانات قديمة)
  categories.forEach(c => { if (selectedCats.has(c.key)) selectedCats.add(c.name); });
  const selectedProducts = new Set((coupon.product_ids || []).map(Number));
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
    const line = unit * i.qty;
    subtotal += line;
    if (coupon.scope === 'all' || selectedProducts.has(p.id) || selectedCats.has(p.category)) eligible += line;
  }
  subtotal = round2(subtotal); eligible = round2(eligible);
  if (coupon.min_order != null && subtotal < Number(coupon.min_order)) {
    throw new ApiError(400, `الكوبون يحتاج طلب بقيمة ${money(coupon.min_order)} أو أكثر`, 'COUPON_MIN_ORDER');
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

module.exports = handler(['GET', 'POST'], async (req) => {
  const action = req.query.action;

  if (action === 'menu' && req.method === 'GET') {
    const store = await findStore(req.query.slug);
    const [categories, products, waitlist_open, has_coupons] = await Promise.all([
      rest(`categories?client_id=eq.${store.id}&select=id,key,name,name_en,sort_order,group_name`),
      // المنتجات المخفية ما توصل للزبون أصلاً
      rest(`products?client_id=eq.${store.id}&is_hidden=is.false&select=${PRODUCT_FIELDS}`),
      waitlistOpen(store.id),
      hasCoupons(store.id)
    ]);
    return { store: { ...store, waitlist_open, has_coupons }, categories: categories.sort(bySort), products: products.sort(bySort) };
  }

  // صفحة الروابط السريعة: نفس بيانات المتجر بدون الأقسام والأطباق
  if (action === 'links' && req.method === 'GET') {
    const store = await findStore(req.query.slug);
    return { store: { ...store, waitlist_open: await waitlistOpen(store.id) } };
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
