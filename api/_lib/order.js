// =====================================================================
// DEV MENU — أسعار الطلب والطلب من المنيو للكاشير
//   priceCart: فحص الكوبون على السلة (طلب واتساب)
//   priceOrder: الطلب من المنيو: الأصناف بأسمائها وأسعارها من قاعدة البيانات، والكوبون اختياري
//   الطلب من المنيو: العميل يرسل طلبه (ورقم طاولته لو عنده)، ويوصل لشاشة الكاشير برمز مثل A12
// =====================================================================
const { rest, q, ApiError, int, CURRENCIES } = require('./core');
const round2 = (n) => Math.round(n * 100) / 100;
const money = (n, cur) => `${round2(n)} ${CURRENCIES[cur] || CURRENCIES.SAR}`;
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
// إضافات مربوطة بأصناف المنيو (قسم الإضافات): نحدّث اسمها وسعرها من الصنف، ونشيل اللي خلص.
// تشتغل على قائمة أطباق (للمنيو وحساب الطلب)، والصنف المربوط ممكن يكون مخفي من المنيو
async function resolveExtraLinks(storeId, products) {
  const pids = new Set();
  for (const p of products) for (const g of (Array.isArray(p.extras) ? p.extras : [])) for (const o of (g.options || [])) if (Number.isInteger(o.pid)) pids.add(o.pid);
  if (!pids.size) return products;
  const rows = await rest(`products?client_id=eq.${Number(storeId)}&id=in.(${[...pids].join(',')})&select=id,name,name_en,price,sizes,is_available`).catch(() => []);
  const byId = new Map(rows.map(r => [r.id, r]));
  for (const p of products) {
    if (!Array.isArray(p.extras)) continue;
    p.extras = p.extras.map(g => ({ ...g, options: (g.options || []).flatMap(o => {
      if (!Number.isInteger(o.pid)) return [o];
      const r = byId.get(o.pid);
      if (!r || r.is_available === false) return [];   // انحذف أو خلص: ما يطلع
      const price = Array.isArray(r.sizes) && r.sizes.length ? Math.min(...r.sizes.map(z => Number(z.price) || 0)) : Number(r.price) || 0;
      return [{ ...o, name: r.name, ...(r.name_en ? { name_en: r.name_en } : {}), price: round2(price) }];
    }) })).filter(g => g.options.length);
  }
  return products;
}
// إضافات الطبق اللي اختارها العميل: [{ g: اسم المجموعة, o: اسم الخيار }] ← { list: [{ group, name, price }], sum }
// نتأكد إنها موجودة في الطبق، وإن الإجبارية مختارة، وما يتعدى حد كل مجموعة. strict = نرمي خطأ (الطلب)، وإلا نتجاهل (فحص الكوبون)
function pickExtras(p, sel, strict) {
  const groups = Array.isArray(p.extras) ? p.extras : [];
  const want = (Array.isArray(sel) ? sel : []).slice(0, 60).map(x => ({ g: String((x && x.g) || ''), o: String((x && x.o) || '') }));
  const list = [];
  for (const g of groups) {
    const chosen = [...new Set(want.filter(x => x.g === g.name).map(x => x.o))]
      .map(o => (g.options || []).find(op => op.name === o)).filter(Boolean);
    // الإجبارية اختيار واحد، والاختيارية بدون حد
    if (g.required && chosen.length > 1) { if (strict) throw new ApiError(400, `«${p.name}»: اختر واحد بس من ${g.name}`, 'EXTRAS_MAX'); chosen.length = 1; }
    if (g.required && !chosen.length && strict) throw new ApiError(400, `«${p.name}»: اختر ${g.name}`, 'EXTRAS_REQUIRED');
    chosen.forEach(op => list.push({ group: g.name, name: op.name, price: round2(Number(op.price) || 0) }));
  }
  return { list, sum: round2(list.reduce((n, x) => n + x.price, 0)) };
}
async function priceCart(store, coupon, rawItems) {
  if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > 100) throw new ApiError(400, 'السلة فاضية');
  const items = rawItems.map(i => ({ id: int(i && i.id), qty: int(i && i.qty), size: i && i.size != null ? String(i.size) : null, extras: i && i.extras }))
    .filter(i => Number.isInteger(i.id) && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 99);
  if (!items.length) throw new ApiError(400, 'السلة فاضية');
  const ids = [...new Set(items.map(i => i.id))];
  const [products, categories, promos] = await Promise.all([
    rest(`products?client_id=eq.${store.id}&id=in.(${ids.join(',')})&is_hidden=is.false&select=id,name,price,category,sizes,extras,is_available`),
    rest(`categories?client_id=eq.${store.id}&select=key,name`),
    menuPromos(store.id)
  ]);
  await resolveExtraLinks(store.id, products);
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
    // الخصم التلقائي أولاً (على سعر الطبق)، وبعده الإضافات، ثم الكوبون
    const line = (autoPrice(unit, p, autos, catKeyOf) + pickExtras(p, i.extras, false).sum) * i.qty;
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

// الطلب من المنيو: كل سطر { id, name, qty, size, note, price } بسعر الوحدة بعد العروض التلقائية
// coupon (اختياري): نفس قواعد الكوبون، والخصم من الإجمالي
const cleanNote = (v, n) => String(v ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, n) || null;
async function priceOrder(store, rawItems, coupon = null) {
  if (!Array.isArray(rawItems) || !rawItems.length) throw new ApiError(400, 'طلبك فاضي، اختر صنف على الأقل', 'EMPTY');
  if (rawItems.length > 30) throw new ApiError(400, 'الطلب فيه أصناف كثيرة، اطلبها على دفعتين', 'TOO_MANY');
  const items = rawItems.map(i => ({ id: int(i && i.id), qty: int(i && i.qty), size: i && i.size != null ? String(i.size).slice(0, 60) : null, note: cleanNote(i && i.note, 100), extras: i && i.extras }))
    .filter(i => Number.isInteger(i.id) && Number.isInteger(i.qty) && i.qty > 0 && i.qty <= 20);
  if (!items.length) throw new ApiError(400, 'طلبك فاضي، اختر صنف على الأقل', 'EMPTY');
  if (items.reduce((n, i) => n + i.qty, 0) > 60) throw new ApiError(400, 'الكمية كبيرة، كلّم الكاشير مباشرة', 'TOO_MANY');
  const ids = [...new Set(items.map(i => i.id))];
  const [products, categories, promos] = await Promise.all([
    rest(`products?client_id=eq.${store.id}&id=in.(${ids.join(',')})&is_hidden=is.false&select=id,name,price,category,sizes,extras,is_available`),
    rest(`categories?client_id=eq.${store.id}&select=key,name`),
    menuPromos(store.id)
  ]);
  await resolveExtraLinks(store.id, products);
  const byId = new Map(products.map(p => [p.id, p]));
  const nameToKey = new Map(categories.map(c => [c.name, c.key]));
  const catKeyOf = (cat) => nameToKey.get(cat) || cat;
  const autos = promos.filter(x => x.auto);
  const lines = [], gone = [];
  let subtotal = 0, eligible = 0;
  for (const i of items) {
    const p = byId.get(i.id);
    if (!p || p.is_available === false) { gone.push(p ? p.name : i.id); continue; }
    const sizes = Array.isArray(p.sizes) ? p.sizes : [];
    let unit = Number(p.price) || 0, size = null;
    if (sizes.length) {
      const z = sizes.find(s => String(s.name || s.label || '').trim() === i.size);
      if (!z) { gone.push(p.name); continue; }
      unit = Number(z.price) || 0; size = String(z.name || z.label).trim();
    }
    const ex = pickExtras(p, i.extras, true);
    const price = round2(autoPrice(unit, p, autos, catKeyOf) + ex.sum);
    lines.push({ id: p.id, name: p.name, qty: i.qty, size, note: i.note, price, ...(ex.list.length ? { extras: ex.list } : {}) });
    subtotal += price * i.qty;
    if (coupon && promoCovers(coupon, p, catKeyOf)) eligible += price * i.qty;
  }
  if (gone.length) throw new ApiError(409, `بعض الأصناف ما عادت متوفرة: ${gone.filter(x => typeof x === 'string').join('، ') || 'حدّث المنيو'}`, 'GONE');
  subtotal = round2(subtotal); eligible = round2(eligible);
  let discount = 0;
  if (coupon) {
    if (coupon.min_order != null && subtotal < Number(coupon.min_order)) throw new ApiError(400, `الكوبون يحتاج طلب بقيمة ${money(coupon.min_order, store.currency)} أو أكثر`, 'COUPON_MIN_ORDER');
    if (eligible <= 0) throw new ApiError(400, 'الكوبون ما يشمل الأصناف اللي في طلبك', 'COUPON_NOT_ELIGIBLE');
    discount = round2(coupon.type === 'percent' ? eligible * Number(coupon.value) / 100 : Math.min(Number(coupon.value), eligible));
  }
  return { lines, subtotal, discount, total: round2(subtotal - discount) };
}


// الطلب من المنيو مفعّل؟ (صاحب المحل مشغّله + المنيو في باقته). 'table' أو null
async function orderMode(storeId) {
  const { storeFeatures } = require('./core');
  const [row, f] = await Promise.all([
    rest(`clients?id=eq.${Number(storeId)}&select=menu_order_mode`).then(r => r[0] || {}).catch(() => ({})),
    storeFeatures(storeId)
  ]);
  return row.menu_order_mode && f.menu ? 'table' : null;
}
// رقم الطاولة: أرقام وحروف (الأرقام العربية تتحول)، حتى 6
function cleanTable(v) {
  const t = String(v ?? '').trim().replace(/\s+/g, '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) & 15)).toUpperCase();
  if (t && !/^[A-Z0-9\u0621-\u064A-]{1,6}$/.test(t)) throw new ApiError(400, 'رقم الطاولة: أرقام أو حروف قصيرة فقط', 'BAD_TABLE');
  return t || null;
}
const DEV_RE = /^[A-Za-z0-9_-]{10,64}$/;
const dayStart = () => new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10) + 'T00:00:00+03:00';
// يجهز الطلب قبل الحفظ: الأسعار من القاعدة، والكوبون (اختياري)، وحد الطلبات المفتوحة من نفس الجوال
async function buildOrder(store, b) {
  const dev = DEV_RE.test(String(b.dev || '')) ? String(b.dev) : null;
  if (dev) {
    const since = new Date(Date.now() - 3 * 3600e3).toISOString();
    const open = await rest(`menu_orders?client_id=eq.${store.id}&device=eq.${q(dev)}&status=in.(new,accepted)&created_at=gte.${q(since)}&select=id&limit=4`).catch(() => []);
    if (open.length >= 3) throw new ApiError(429, 'عندك طلبات ما خلصت للحين. انتظر لين تجهز أو كلّم الكاشير', 'TOO_MANY_OPEN');
  }
  const coupon = b.coupon ? await loadCoupon(store.id, b.coupon) : null;
  const priced = await priceOrder(store, b.items, coupon);
  return {
    coupon, row: {
      client_id: store.id, token: require('crypto').randomBytes(18).toString('base64url'), mode: 'table',
      dine: b.dine === 'out' ? 'out' : 'in', table_no: b.dine === 'out' ? null : cleanTable(b.table),
      items: priced.lines, note: cleanNote(b.note, 300), total: priced.total, discount: priced.discount, coupon_code: coupon ? coupon.code : null,
      device: dev, lang: b.lang === 'en' ? 'en' : 'ar',
      // السفري: بطاقة النداء وبطاقة الولاء المحفوظة في جواله (تنربط برقم البيجر لما يستلمه الكاشير)
      ...(b.dine === 'out' ? { cards: { pc: (Array.isArray(b.pc) ? b.pc : []).map(String).filter(t => DEV_RE.test(t)).slice(0, 4), lt: DEV_RE.test(String(b.lt || '')) ? String(b.lt) : null } } : {})
    }
  };
}
// رمز الطلب اللي يوريه العميل للكاشير: A + رقم طلبات اليوم (بتوقيت الرياض)
async function nextCode(storeId) {
  const n = (await rest(`menu_orders?client_id=eq.${Number(storeId)}&created_at=gte.${q(dayStart())}&select=id`).catch(() => [])).length;
  return `A${n + 1}`;
}
async function saveOrder(built) {
  const { rpc } = require('./core');
  built.row.code = await nextCode(built.row.client_id);
  const o = (await rest('menu_orders', { method: 'POST', prefer: 'return=representation', body: built.row }))[0];
  if (built.coupon) await rpc('redeem_coupon', { p_coupon_id: built.coupon.id }).catch(() => {});
  return o;
}
// الطلب كما يطلع للكاشير وللعميل
const publicOrder = (o) => o && ({ id: o.id, code: o.code || null, pager: !!o.pager_ticket_id, dine: o.dine === 'out' ? 'out' : 'in', table_no: o.table_no, items: o.items || [], note: o.note, total: Number(o.total) || 0,
  discount: Number(o.discount) || 0, coupon_code: o.coupon_code || null, status: o.status, created_at: o.created_at, accepted_at: o.accepted_at || null, closed_at: o.closed_at || null });

// طلب سفري استلمه الكاشير: رقم بيجر للعميل (يرن لما يجهز)، وتنربط بطاقاته. المحل لازم عنده البيجر
async function givePager(storeId, o) {
  const { rpc } = require('./core');
  const sid = Number(storeId);
  if (o.dine !== 'out' || o.pager_ticket_id) return null;
  const token = require('crypto').randomBytes(18).toString('base64url');
  const res = await rpc('server_pager_take', { p_client_id: sid, p_token: token });
  const t = (await rest(`pager_tickets?token=eq.${q(res.token)}&client_id=eq.${sid}`, { method: 'PATCH', prefer: 'return=representation', body: { lang: o.lang === 'en' ? 'en' : 'ar' } }))[0];
  // لو استلمه كاشيرين بنفس اللحظة: واحد بس ينربط، والثاني ينلغى رقمه
  const linked = await rest(`menu_orders?id=eq.${o.id}&pager_ticket_id=is.null`, { method: 'PATCH', prefer: 'return=representation', body: { pager_ticket_id: t.id } });
  if (!linked.length) { await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { status: 'cancelled', closed_at: new Date().toISOString() } }); return null; }
  await require('../pager').linkOrderCards(sid, t.token, o.cards).catch(e => console.error('ORDER_CARDS', e.message));
  return t;
}

module.exports = { resolveExtraLinks, pickExtras, givePager, menuPromos, promoCovers, autoPrice, loadCoupon, priceCart, priceOrder, cleanNote, round2, orderMode, cleanTable, buildOrder, saveOrder, publicOrder, dayStart };
