// =====================================================================
// DEV MENU — نقاط API العامة (بدون تسجيل دخول)
//   GET  /api/public?action=menu&slug=xxx   منيو متجر (فقط لو اشتراكه ساري)
//   GET  /api/public?action=featured        الأمثلة الحقيقية للصفحة الرئيسية
//   POST /api/public?action=track           تسجيل زيارة/مشاهدة (مجهولة)
// =====================================================================
const { handler, rest, rpc, q, ApiError, readBody, int } = require('./_lib/core');

const STORE_FIELDS = 'id,name,client_slug,logo_url,bg_image_url,bg_video_url,promo_message,website_url,tiktok_url,instagram_url,whatsapp_number,snapchat_url,opening_hours,location_url,whatsapp_orders,business_type,show_calories,delivery_apps';
const PRODUCT_FIELDS = 'id,name,name_en,description,description_en,extra_info,note,price,category,image_url,is_available,is_bestseller,calories,allergens,coffee,sort_order';
const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;

module.exports = handler(['GET', 'POST'], async (req) => {
  const action = req.query.action;

  if (action === 'menu' && req.method === 'GET') {
    const slug = String(req.query.slug || '').trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,60}$/.test(slug)) throw new ApiError(400, 'رابط المنيو غير صحيح', 'BAD_SLUG');
    // public_clients تعرض المتاجر السارية فقط: المنتهي أو الموقوف ما يرجع منه شي
    const stores = await rest(`public_clients?client_slug=eq.${q(slug)}&select=${STORE_FIELDS}&limit=1`);
    const store = stores[0];
    if (!store) throw new ApiError(404, 'المنيو غير متاح حالياً', 'NOT_AVAILABLE');
    const [categories, products] = await Promise.all([
      rest(`categories?client_id=eq.${store.id}&select=id,key,name,name_en,sort_order`),
      rest(`products?client_id=eq.${store.id}&select=${PRODUCT_FIELDS}`)
    ]);
    // زر "قائمة الانتظار" في المنيو: فقط لو الإضافة مفعّلة والقائمة مفتوحة
    const wl = (await rest(`clients?id=eq.${store.id}&select=waitlist_enabled,waitlist_settings`))[0] || {};
    const waitlist_open = wl.waitlist_enabled === true && !(wl.waitlist_settings && wl.waitlist_settings.open === false);
    return { store: { ...store, waitlist_open }, categories: categories.sort(bySort), products: products.sort(bySort) };
  }

  if (action === 'featured' && req.method === 'GET') {
    // أمثلة الصفحة الرئيسية: شعار واسم ورابط كل منشأة مختارة (والسارية فقط)
    const stores = await rest('public_clients?is_featured=eq.true&logo_url=not.is.null&select=name,client_slug,logo_url&order=id.desc&limit=12');
    return { stores };
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
