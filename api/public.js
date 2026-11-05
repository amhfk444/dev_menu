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
const { handler, rest, rpc, q, ApiError, readBody, int, findPublicStore, CURRENCIES, storeHasFeature, storeFeatures, storesFeatures } = require('./_lib/core');
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

// الأسعار والعروض والكوبونات: api/_lib/order.js (نفس الحساب لطلب واتساب والطلب من المنيو)
const { menuPromos, loadCoupon, priceCart, orderMode, buildOrder, saveOrder, publicOrder } = require('./_lib/order');
const { poke } = require('./_lib/live');

// زر "قائمة الانتظار": الإضافة مفعّلة + القائمة مفتوحة + صاحب المتجر مختار يظهر الزر
async function waitlistOpen(storeId) {
  const wl = (await rest(`clients?id=eq.${storeId}&select=waitlist_enabled,waitlist_settings`))[0] || {};
  const ws = wl.waitlist_settings || {};
  return wl.waitlist_enabled === true && ws.open === true && ws.show_in_menu !== false;
}

// كل بيانات المنيو العام لمتجر
// اسم المحل للزبون: الفرع ياخذ اسم المحل الرئيسي (ماندولين، مو "ماندولين فرع بيش")
async function brandName(storeId, name) {
  const self = (await rest(`clients?id=eq.${Number(storeId)}&select=parent_id`).catch(() => []))[0];
  if (!self || !self.parent_id) return name;
  const root = (await rest(`clients?id=eq.${self.parent_id}&select=name`).catch(() => []))[0];
  return (root && root.name) || name;
}

// طلب الزبون من البيجر (للمساعد): رقمه، حالته، كم طلب قبله، ومتوسط الانتظار في المحل آخر 7 أيام
async function pagerOrder(storeId, token) {
  const t = (await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${storeId}&select=number,status,created_at,ready_at,addons,eta_at`).catch(() => rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${storeId}&select=number,status,created_at,ready_at,addons`)).catch(() => []))[0];
  if (!t) return null;
  const { mins, aheadOf, waitStats, estimate, etaOf, addonLine } = require('./_lib/pager-wait');
  const [ahead, stats] = await Promise.all([aheadOf(storeId, t), waitStats(storeId)]);
  const typical = stats.typical, est = estimate(t, ahead, stats);
  const STATUS = { waiting: 'being prepared (waiting)', ready: 'READY now, guest should pick it up from the counter', done: 'already picked up', cancelled: 'cancelled by the store' };
  const added = Array.isArray(t.addons) && t.addons.length ? `items the guest added from this page (sent to the cashier, paid at pickup): ${t.addons.map(addonLine).join(', ')}` : '';
  const staff = t.status === 'waiting' && t.eta_at ? `EXPECTED READY IN (set by the cashier just now, authoritative): about ${etaOf(t, null)} minutes from now` : '';
  return [`pager number: ${t.number}`, `status: ${STATUS[t.status] || t.status}`, staff, `waiting since: ${mins(Date.now() - Date.parse(t.created_at))} minutes`,
    t.status === 'waiting' ? `orders ahead still being prepared: ${ahead}` : '',
    est && !t.eta_at ? (est.overdue ? 'estimate: already past the usual time, it should be ready any moment' : est.low ? `estimated time left (counts the orders ahead): ${est.low} to ${est.high} minutes` : 'estimate: not enough data, do not give minutes') : '',
    typical ? `typical wait at this place (median, last 7 days): ${typical} minutes` : '', added].filter(Boolean).join('\n');
}

async function menuPayload(slug) {
  const store = await findStore(slug);
  // المنيو ضمن باقة المحل؟ (اللي مشترك في الولاء بس، ما يطلع له منيو)
  // ما عنده منيو؟ رابط المحل الرئيسي يفتح أول خدمة عنده (البيجر، الانتظار، الولاء)
  const feats = await storeFeatures(store.id);
  if (!feats.menu) {
    for (const k of ['pager', 'waitlist', 'loyalty']) if (feats[k]) throw new ApiError(404, 'المنيو غير متاح', `GO:${k}`);
    throw new ApiError(404, 'المنيو غير متاح حالياً', 'NOT_AVAILABLE');
  }
  const [categories, products, waitlist_open, has_coupons, occasion, promos, name, order_mode] = await Promise.all([
    rest(`categories?client_id=eq.${store.id}&select=id,key,name,name_en,sort_order,group_name`),
    // المنتجات المخفية ما توصل للزبون أصلاً
    rest(`products?client_id=eq.${store.id}&is_hidden=is.false&select=${PRODUCT_FIELDS}`),
    waitlistOpen(store.id),
    hasCoupons(store.id),
    activeOccasion(store.id),
    menuPromos(store.id),
    brandName(store.id, store.name),
    orderMode(store.id)   // الطلب من المنيو للكاشير: 'table' أو null (واتساب)
  ]);
  // زر المساعد: مشغّل من صاحب المحل + ضمن باقته + باقي له رصيد هالشهر
  // الزر يبقى ظاهر حتى لو خلص الرصيد: المساعد يرد رد لطيف بدل ما يختفي أو يذكر حدود
  const menu_chat = store.menu_chat === true && feats.chat;
  return { store: { ...store, name, menu_chat, waitlist_open, has_coupons, occasion, promos, order_mode }, categories: categories.sort(bySort), products: products.sort(bySort), feats };
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

// معاينة الرابط في واتساب وتويتر وتيليجرام: اسم المحل وشعاره بدل DEV MENU (middleware.js يحوّل لها البوتات بس)
const SHARE_PAGES = {
  menu: ['menu', (n) => `المنيو الرقمي لـ ${n}`],
  links: ['links', (n) => `روابط ${n}`],
  waitlist: ['waitlist', (n) => `سجّل في قائمة الانتظار عند ${n}`],
  pager: ['pager', (n) => `خذ رقمك من البيجر عند ${n}`],
  loyalty: ['loyalty', (n) => `بطاقة الولاء من ${n}`]
};
const escAttr = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = handler(['GET', 'POST'], async (req, res) => {
  const action = req.query.action;

  if (action === 'share-img' && req.method === 'GET') {
    const { store } = await findPublicStore(req.query.slug, 'logo_url').catch(() => ({ store: null }));
    const { SUPABASE_URL } = require('./_lib/core');
    const src = store && String(store.logo_url || '');
    if (!src || !src.startsWith(`${SUPABASE_URL}/storage/`)) throw new ApiError(404, 'لا يوجد شعار', 'NO_LOGO');
    const r = await fetch(src, { signal: AbortSignal.timeout(8000) });
    if (!r.ok) throw new ApiError(404, 'لا يوجد شعار', 'NO_LOGO');
    const png = await require('sharp')(Buffer.from(await r.arrayBuffer())).resize(512, 512, { fit: 'contain', background: '#ffffff' }).flatten({ background: '#ffffff' }).jpeg({ quality: 85 }).toBuffer();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.status(200).send(png);
    return;
  }

  if (action === 'share' && req.method === 'GET') {
    const [page, desc] = SHARE_PAGES[req.query.page] || SHARE_PAGES.menu;
    const { store } = await findPublicStore(req.query.slug, 'id,name,client_slug,logo_url,promo_message').catch(() => ({ store: null }));
    if (store) store.name = await brandName(store.id, store.name);
    const url = store ? require('./_lib/core').storeLink(store.client_slug, page) : require('./_lib/core').SITE;
    const name = store ? store.name : 'DEV MENU';
    // الشعار محفوظ webp، وواتساب ما يعرضه دايم: نعطيه نسخة JPEG خفيفة (أقل من 300KB) من share-img
    const image = store && /^https:\/\//.test(store.logo_url || '') ? `${require('./_lib/core').SITE}/api/public?action=share-img&slug=${encodeURIComponent(store.client_slug)}` : `${require('./_lib/core').SITE}/images/icon-512.png`;
    const text = (store && String(store.promo_message || '').trim()) || desc(name);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.status(200).send(`<!DOCTYPE html><html lang="ar" dir="rtl"><head><meta charset="utf-8">
<title>${escAttr(name)}</title>
<meta name="description" content="${escAttr(text)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${escAttr(name)}">
<meta property="og:title" content="${escAttr(name)}">
<meta property="og:description" content="${escAttr(text)}">
<meta property="og:image" content="${escAttr(image)}">
<meta property="og:url" content="${escAttr(url)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escAttr(name)}">
<meta name="twitter:image" content="${escAttr(image)}">
<link rel="icon" href="${escAttr(image)}">
<meta http-equiv="refresh" content="0;url=${escAttr(url)}">
</head><body><a href="${escAttr(url)}">${escAttr(name)}</a></body></html>`);
    return;
  }

  // ─── مساعد المنيو: الزبون يسأل عن الأطباق ───
  if (action === 'menu-chat' && req.method === 'POST') {
    const b = await readBody(req);
    const data = await menuPayload(b.slug);
    const store = data.store;
    // من صفحة انتظار البيجر: يتبع إعداد «المساعد في صفحة الانتظار». ومن المنيو: إعداد مساعد المنيو
    const fromPager = /^[A-Za-z0-9_-]{10,64}$/.test(String(b.t || ''));
    const on = fromPager ? ((await rest(`clients?id=eq.${store.id}&select=pager_chat`).catch(() => []))[0] || {}).pager_chat === true && data.feats.chat : store.menu_chat === true;
    if (!on) throw new ApiError(403, 'المساعد غير متاح الحين، اسأل الموظف 😊', 'CHAT_OFF');
    // المحادثة قصيرة: آخر 6 رسائل، وكل رسالة 300 حرف (الحد الفعلي: أسئلة الجوال باليوم)
    const list = (Array.isArray(b.messages) ? b.messages : []).slice(-6)
      .map(m => ({ role: m && m.role === 'assistant' ? 'assistant' : 'user', content: String((m && m.content) || '').trim().slice(0, 300) }))
      .filter(m => m.content);
    if (!list.length || list[list.length - 1].role !== 'user') throw new ApiError(400, 'اكتب سؤالك');
    while (list.length && list[0].role !== 'user') list.shift();
    // من صفحة انتظار البيجر: المساعد يعرف رقم الزبون وحالته وكم طلب قدامه
    const order = fromPager ? await pagerOrder(store.id, b.t) : null;
    // الأسئلة البسيطة (سلام، شكر، الأوقات، الموقع) نرد عليها من بيانات المحل بدون ذكاء اصطناعي: ببلاش وفوري
    const quick = quickChat(list[list.length - 1].content, store, list.length === 1);
    if (quick) return { reply: quick };
    // السؤال الأول في المحادثة (ما يعتمد على كلام قبله): لو انسأل قبل وجوابه محفوظ والمنيو ما تغيّر، يرجع ببلاش
    const faqQ = list.length === 1 && !order ? list[0].content : null, qkey = faqQ ? faqKey(faqQ) : null;
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
    // ما قدرنا نعرف الرصيد: نوقف بدل ما نفتح المساعد بلا حد (كل سؤال عليه تكلفة)
    catch (e) { console.warn('chat quota', e.message); took = 'day'; }
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
    const reply = await menuChat({ storeName: store.name, storeInfo: info, menu, messages: list, order });
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
    let store = await findStore(req.query.slug);
    // المحل اللي عنده فروع: صفحة روابط وحدة للمحل كله بإعدادات الرئيسي (رابط الفرع يفتحها بعد)، وفيها "فروعنا"
    const self = (await rest(`clients?id=eq.${store.id}&select=parent_id`).catch(() => []))[0];
    const rootId = (self && self.parent_id) || store.id;
    if (rootId !== store.id) {
      const root = (await rest(`public_clients?id=eq.${rootId}&select=client_slug`).catch(() => []))[0];
      if (root) store = await findStore(root.client_slug);
    }
    let branches = [];
    const kids = await rest(`clients?parent_id=eq.${rootId}&select=id`).catch(() => []);
    if (kids.length) {
      // الفروع السارية بس (public_clients)، الرئيسي أول
      const ids = [rootId, ...kids.map(k => k.id)];
      const live = await rest(`public_clients?id=in.(${ids.join(',')})&select=id,name,client_slug,location_url,order_numbers,whatsapp_number,delivery_apps`).catch(() => []);
      const feats = await storesFeatures(live.map(x => x.id)).catch(() => ({}));
      branches = live.sort((x, y) => ids.indexOf(x.id) - ids.indexOf(y.id)).map((x) => ({
        name: x.name, slug: x.client_slug, location_url: x.location_url || null, menu: !!(feats[x.id] || {}).menu,
        // رقم الطلب للفرع: أول رقم طلبات صحيح، وإلا واتساب الفرع
        phone: ((Array.isArray(x.order_numbers) ? x.order_numbers : []).map(n => String((n && n.phone) || '').replace(/[^\d+]/g, '')).find(n => /^\+?\d{9,15}$/.test(n))) || null,
        whatsapp: String(x.whatsapp_number || '').replace(/\D/g, '') || null,
        delivery: (Array.isArray(x.delivery_apps) ? x.delivery_apps : []).filter(d => d && d.url).map(d => ({ app: d.app || null, name: d.name || null, url: d.url }))
      }));
      if (branches.length < 2) branches = [];
    }
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');   // بيانات عامة: تتخزن 30 ثانية في CDN
    // صفحة الروابط لكل المشتركين (مو بس المنيو)، وتعرف وش الخدمات اللي عنده
    const services = {};
    Object.assign(services, await storeFeatures(store.id));
    const [waitlist_open, occasion] = await Promise.all([waitlistOpen(store.id), activeOccasion(store.id)]);
    return { store: { ...store, waitlist_open, occasion, services, branches } };
  }

  if (action === 'featured' && req.method === 'GET') {
    // أمثلة الصفحة الرئيسية: شعار واسم كل منشأة مختارة (والسارية فقط)
    // الشعار والاسم بس: ما نكشف رابط المنشأة ولا خدماتها
    const stores = await rest('public_clients?is_featured=eq.true&logo_url=not.is.null&select=name,logo_url&order=id.desc&limit=12');
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

  // ─── الطلب من المنيو: العميل يرسل طلبه (ورقم طاولته لو عنده)، ويوصل لشاشة الكاشير برمز مثل A12 ───
  if (action === 'order' && req.method === 'POST') {
    const b = readBody(req);
    const store = await findStore(b.slug);
    if (!(await orderMode(store.id))) throw new ApiError(409, 'الطلب من المنيو متوقف الحين، اطلب من الكاشير', 'ORDERS_OFF');
    const o = await saveOrder(await buildOrder(store, b));
    await poke([topic('pager', store.id)]);   // شاشة الكاشير
    console.log('MENU_ORDER', store.id, o.id, o.code, o.table_no);
    return { token: o.token, order: publicOrder(o), live: topic('mo', o.token) };
  }

  // حالة طلب العميل (يطلع له في المنيو: وصل، الكاشير استلمه، جاهز)
  if (action === 'order-status' && req.method === 'GET') {
    const store = await findStore(req.query.slug);
    const tokens = String(req.query.t || '').split(',').filter(t => /^[A-Za-z0-9_-]{10,64}$/.test(t)).slice(0, 5);
    if (!tokens.length) return { orders: [] };
    res.setHeader('Cache-Control', 'no-store');
    const rows = await rest(`menu_orders?client_id=eq.${store.id}&token=in.(${tokens.map(t => q(t)).join(',')})&select=*`).catch(() => []);
    // السفري اللي استلمه الكاشير: رقم البيجر حقه (صفحة الانتظار)
    const tids = rows.map(o => o.pager_ticket_id).filter(Boolean);
    const tks = tids.length ? await rest(`pager_tickets?id=in.(${tids.join(',')})&client_id=eq.${store.id}&select=id,token`).catch(() => []) : [];
    const tokOf = new Map(tks.map(x => [x.id, x.token]));
    return { orders: rows.map(o => ({ token: o.token, ...publicOrder(o), pager_token: tokOf.get(o.pager_ticket_id) || null, live: ['new', 'accepted'].includes(o.status) ? topic('mo', o.token) : null })) };
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
