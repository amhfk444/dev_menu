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
const PLANS = require('./_lib/plans');
const { handler, rest, rpc, q, ApiError, readBody, int, findPublicStore, CURRENCIES, storeHasFeature, storeFeatures } = require('./_lib/core');
const { topic } = require('./_lib/live');

const STORE_FIELDS = 'id,name,client_slug,logo_url,bg_image_url,bg_video_url,promo_message,website_url,tiktok_url,instagram_url,whatsapp_number,snapchat_url,opening_hours,location_url,whatsapp_orders,business_type,show_calories,menu_layout,delivery_apps,theme,accent_color,order_numbers,custom_links';
const PRODUCT_FIELDS = 'id,name,name_en,description,description_en,extra_info,note,price,category,image_url,is_available,is_bestseller,calories,allergens,coffee,sort_order,sizes';
const bySort = (a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id;

async function findStore(rawSlug) {
  // public_clients تعرض المتاجر السارية فقط: المنتهي أو الموقوف ما يرجع منه شي
  // عمود العملة من 23-currency.sql — لو ما انضاف للحين نكمل بدونه (الريال افتراضياً)
  // وخلفية صفحة الروابط من 67-links-background.sql — قبل إضافتها تاخذ الصفحة خلفية المنيو
  let found;
  const LINKS = ',links_bg_image_url,links_bg_video_url,links_order,links_hidden';
  // ومساعد المنيو من 68-menu-chat.sql. كل عمود اختياري لحاله، فعمود ناقص ما يشيل الباقي معه
  const OPT = [',currency', LINKS, ',menu_chat'];
  const combos = [];
  for (let m = 7; m >= 0; m--) combos.push(OPT.filter((_, i) => m & (1 << i)).join(''));
  for (const extra of combos) {
    try { found = await findPublicStore(rawSlug, STORE_FIELDS + extra); break; }
    catch (e) { if (!extra) throw e; }
  }
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
  // المنيو ضمن باقة المحل؟ (اللي مشترك في الولاء بس، ما يطلع له منيو)
  // ما عنده منيو؟ رابط المحل الرئيسي يفتح أول خدمة عنده (البيجر، الانتظار، الولاء)
  const feats = await storeFeatures(store.id);
  if (!feats.menu) {
    for (const k of ['pager', 'waitlist', 'loyalty']) if (feats[k]) throw new ApiError(404, 'المنيو غير متاح', `GO:${k}`);
    throw new ApiError(404, 'المنيو غير متاح حالياً', 'NOT_AVAILABLE');
  }
  const [categories, products, waitlist_open, has_coupons, occasion, promos] = await Promise.all([
    rest(`categories?client_id=eq.${store.id}&select=id,key,name,name_en,sort_order,group_name`),
    // المنتجات المخفية ما توصل للزبون أصلاً
    rest(`products?client_id=eq.${store.id}&is_hidden=is.false&select=${PRODUCT_FIELDS}`),
    waitlistOpen(store.id),
    hasCoupons(store.id),
    activeOccasion(store.id),
    menuPromos(store.id)
  ]);
  // زر المساعد: مشغّل من صاحب المحل + ضمن باقته + باقي له رصيد هالشهر
  // الزر يبقى ظاهر حتى لو خلص الرصيد: المساعد يرد رد لطيف بدل ما يختفي أو يذكر حدود
  const menu_chat = store.menu_chat === true && feats.chat;
  return { store: { ...store, menu_chat, waitlist_open, has_coupons, occasion, promos }, categories: categories.sort(bySort), products: products.sort(bySort), feats };
}
// ردود جاهزة للأسئلة البسيطة. أي شي غيرها يروح للمساعد
const AR = (t) => /[؀-ۿ]/.test(t);
function quickChat(text, store, first) {
  const t = String(text).trim().toLowerCase().replace(/[؟?!.،,]+/g, ' ').replace(/\s+/g, ' ').trim();
  const ar = AR(text), name = store.name;
  const words = t.split(' ');
  if (words.length <= 3 && /^(السلام عليكم|سلام عليكم|السلام|هلا|اهلا|أهلا|مرحبا|هاي|hi|hello|hey|salam)( .*)?$/.test(t)) {
    return ar ? `وعليكم السلام، يا هلا والله في ${name} 👋 وش ودك تاكل اليوم؟` : `Hi, welcome to ${name} 👋 What are you in the mood for?`;
  }
  if (words.length <= 4 && /^(شكرا|شكراً|مشكور|يعطيك العافيه|يعطيك العافية|تسلم|thanks|thank you|thx)( .*)?$/.test(t)) {
    return ar ? 'العفو، بالعافية مقدماً 😊' : "You're welcome, enjoy your meal 😊";
  }
  if (words.length <= 6 && /(اوقات|أوقات|الدوام|دوامكم|تفتحون|تسكرون|متى تفتح|مفتوحين|opening hours|open|hours|close)/.test(t)) {
    if (store.opening_hours) return ar ? `أوقاتنا: ${store.opening_hours}` : `Our hours: ${store.opening_hours}`;
    return null;   // ما فيه أوقات مكتوبة: المساعد يقول للزبون يسأل الموظف
  }
  if (words.length <= 6 && /(موقعكم|وين مكانكم|وينكم|العنوان|اللوكيشن|location|where are you|address)/.test(t)) {
    if (store.location_url) return ar ? `موقعنا هنا: ${store.location_url}` : `Here's our location: ${store.location_url}`;
    return null;
  }
  return null;
}
// مفتاح السؤال: نفس السؤال بكتابات مختلفة (همزات، تاء مربوطة، علامات) يصير واحد
const faqKey = (t) => String(t).toLowerCase().replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120);
// بصمة المنيو للأجوبة المحفوظة: الأطباق والأقسام والأوقات والموقع (تغيّر أي شي منها = الجواب يتجدد)
// أي تغيير في أسلوب الردود: غيّر "tone2" عشان الإجابات المحفوظة القديمة ما تنستخدم
const menuFingerprint = (d) => crypto.createHash('sha1').update(JSON.stringify(['tone2', d.products, d.categories, d.store.opening_hours, d.store.location_url, d.store.currency, d.store.show_calories])).digest('hex').slice(0, 16);
const versionOf = (data) => crypto.createHash('sha1').update(JSON.stringify(data)).digest('hex').slice(0, 16);

module.exports = handler(['GET', 'POST'], async (req, res) => {
  const action = req.query.action;

  // ─── مساعد المنيو: الزبون يسأل عن الأطباق ───
  if (action === 'menu-chat' && req.method === 'POST') {
    const b = await readBody(req);
    const data = await menuPayload(b.slug);
    const store = data.store;
    if (store.menu_chat !== true) throw new ApiError(403, 'المساعد غير متاح الحين، اسأل الموظف 😊', 'CHAT_OFF');
    // المحادثة قصيرة: آخر 6 رسائل، وكل رسالة 300 حرف (الحد الفعلي: أسئلة الجوال باليوم)
    const list = (Array.isArray(b.messages) ? b.messages : []).slice(-6)
      .map(m => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: String((m && m.content) || '').trim().slice(0, 300) }))
      .filter(m => m.content);
    if (!list.length || list[list.length - 1].role !== 'user') throw new ApiError(400, 'اكتب سؤالك');
    while (list.length && list[0].role !== 'user') list.shift();
    // الأسئلة البسيطة (سلام، شكر، الأوقات، الموقع) نرد عليها من بيانات المحل بدون ذكاء اصطناعي: ببلاش وفوري
    const quick = quickChat(list[list.length - 1].content, store, list.length === 1);
    if (quick) return { reply: quick };
    // السؤال الأول في المحادثة (ما يعتمد على كلام قبله): لو انسأل قبل وجوابه محفوظ والمنيو ما تغيّر، يرجع ببلاش
    const faqQ = list.length === 1 ? list[0].content : null, qkey = faqQ ? faqKey(faqQ) : null;
    const ver = menuFingerprint(data);
    if (qkey) {
      try {
        const hit = (await rpc('server_faq_get', { p_client: store.id, p_qkey: qkey, p_question: faqQ }))[0];
        if (hit && hit.answer && hit.version === ver) return { reply: hit.answer, cached: true };
      } catch (e) { console.warn('faq get', e.message); }
    }
    // الرصيد: سؤال من رصيد المحل الشهري، وحد يومي لكل جوال (بصمة من الـ IP والمتصفح، ما نحفظهم)
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const device = crypto.createHash('sha256').update(`${ip}|${req.headers['user-agent'] || ''}`).digest('hex').slice(0, 32);
    let took = 'ok';
    try { took = await rpc('server_chat_take', { p_client: store.id, p_device: device, p_limit: data.feats.chat_limit, p_day: PLANS.CHAT.day }); }
    catch (e) { console.warn('chat quota', e.message); }
    // خلص رصيد المحل أو وصل الجوال حده: ما نقول للزبون إن فيه حد، نوجّهه للموظف بلطف
    if (took === 'month' || took === 'day') return { reply: AR(faqQ || list[list.length - 1].content) ? 'سؤالك حلو 😊 الموظف يقدر يفيدك فيه أكثر، اسأله وبيخدمك.' : "Great question 😊 our staff can help you with that, just ask them." };
    const cur = CURRENCIES[store.currency] || CURRENCIES.SAR;
    const cats = Object.fromEntries(data.categories.map(c => [c.key, c.name]));
    const menu = data.products.map(p => {
      const parts = [`- ${p.name}${p.name_en ? ` (${p.name_en})` : ''}`, `section: ${cats[p.category] || p.category || ''}`, `price: ${p.price} ${cur}`];
      if (Array.isArray(p.sizes) && p.sizes.length) parts.push(`sizes: ${p.sizes.map(z => `${z.name || z.label || ''} ${z.price} ${cur}`).join(', ')}`);
      if (p.calories && store.show_calories !== false) parts.push(`calories: ${p.calories}`);
      if (p.description) parts.push(`about: ${String(p.description).slice(0, 160)}`);
      if (p.allergens && (Array.isArray(p.allergens) ? p.allergens.length : true)) parts.push(`allergens: ${Array.isArray(p.allergens) ? p.allergens.join(', ') : p.allergens}`);
      if (p.is_bestseller) parts.push('bestseller');
      parts.push(`available="${p.is_available === false ? 'no' : 'yes'}"`);
      return parts.join(' | ');
    }).join('\n');
    const info = [`name: ${store.name}`, store.opening_hours ? `hours: ${store.opening_hours}` : 'hours: not given', store.location_url ? `location: ${store.location_url}` : '',
      `currency: ${cur}`, `today (Riyadh): ${new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 16).replace('T', ' ')}`].filter(Boolean).join('\n');
    const { menuChat } = require('./_lib/ai');
    const reply = await menuChat({ storeName: store.name, storeInfo: info, menu, messages: list });
    // نحفظ الجواب للمرة الجاية. الأسئلة البرّانية أو الطويلة ما تطلع كأزرار للزبائن
    if (qkey) {
      const ok = faqQ.length <= 80 && !/المساعد الذكي ل|only the smart assistant|smart assistant for/i.test(reply);
      rpc('server_faq_set', { p_client: store.id, p_qkey: qkey, p_answer: reply, p_version: ver, p_ok: ok }).catch(e => console.warn('faq set', e.message));
    }
    return { reply };
  }

  // ─── أكثر أسئلة زبائن المحل (أزرار جاهزة في المساعد) ───
  if (action === 'chat-faq' && req.method === 'GET') {
    const { store } = await findStore(req.query.slug).then(store => ({ store })).catch(() => ({ store: null }));
    if (!store || store.menu_chat !== true) return { questions: [] };
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300');
    let rows = [];
    try { rows = await rest(`menu_chat_faq?client_id=eq.${store.id}&ok=is.true&hits=gte.3&select=question&order=hits.desc&limit=4`); } catch {}
    return { questions: rows.map(r => r.question) };
  }

  if (action === 'menu' && req.method === 'GET') {
    const { feats, ...data } = await menuPayload(req.query.slug);
    // المنيو يتخزن في شبكة Vercel القريبة من الزبون 15 ثانية (ويتجدد بالخلفية): يفتح فوراً بدل ما يروح للخادم كل مرة.
    // التحديث اللحظي يطلب المنيو برقم نسخته (&v=) فيتجاوز المخزن
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=15, stale-while-revalidate=300');
    return { ...data, version: versionOf(data), live: data.store.id ? topic('menu', data.store.id) : null };
  }

  // المنيو المفتوح عند الزبون يسأل هنا كل كم ثانية: لو تغيّرت البصمة يجيب المنيو من جديد.
  // الرد يتخزن 5 ثواني في CDN، فمهما كثر الزبائن ما ينفذ الخادم إلا مرة كل 5 ثواني لكل متجر
  if (action === 'menu-version' && req.method === 'GET') {
    let v;
    try { const { feats, ...d } = await menuPayload(req.query.slug); v = versionOf(d); }
    catch (e) { if (e.status === 404 || e.status === 400) v = 'off'; else throw e; }
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=5, stale-while-revalidate=10');
    return { v };
  }

  // صفحة الروابط السريعة: نفس بيانات المتجر بدون الأقسام والأطباق
  if (action === 'links' && req.method === 'GET') {
    const store = await findStore(req.query.slug);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');   // بيانات عامة: تتخزن 30 ثانية في CDN
    // صفحة الروابط لكل المشتركين (مو بس المنيو)، وتعرف وش الخدمات اللي عنده
    const services = {};
    Object.assign(services, await storeFeatures(store.id));
    const [waitlist_open, occasion] = await Promise.all([waitlistOpen(store.id), activeOccasion(store.id)]);
    return { store: { ...store, waitlist_open, occasion, services } };
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

  throw new ApiError(404, 'هذا الطلب غير معروف، حدّث الصفحة وحاول مرة ثانية', 'UNKNOWN');
});
