// =====================================================================
// DEV MENU — API صاحب المتجر: الطلب من المنيو: تقرير المبيعات، والكاشير يستلم الطلب أو يلغيه
// pre: طلبات قبل حد الـ POST (القراءة وغيرها)، post: طلبات الحفظ (بعد ما يتحدد المتجر)
// كل دالة ترجع NEXT لو الطلب مو لها
// =====================================================================
/* eslint-disable no-unused-vars */
const { crypto, handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET, ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, SLUG_RE, RESERVED_SLUGS, CURRENCIES, SITE, storeLink, loyaltyHome, later, followParentFeatures, FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor, sendMail, mailConfigured, sendPush, pushPublicKey, cleanSubscription, topic, storeTopics, poke, normalizeLoyalty, validPoint, PLANS, tr, wallet, queue, pushWalletCards, runAssistant, pagerReadyNotice, walletNotice, loyaltyMessages, loyaltyNearLines, stampPagerTicket, purchaseStamp, tagBranch, newStampCode, parseMemberQr, cooldownLeft, leftText, bySort, COFFEE_TYPES, SECTORS, LINKS_SECTIONS, BUSINESS_TYPES, ALLERGENS, PROCESS, ROAST, METHODS, DELIVERY, THEMES, MAX_SIZES, MAX_COUPONS, OCCASION_PRESETS, STICKER_POSITIONS, STICKER_LIB, STICKER_SIZES, STICKER_ANIMS, MAX_OCCASIONS, MAX_STICKERS, isDay, cleanOccasions, validPrice, round2, cleanSizes, cleanExtras, riyadhDate, MAX_ORDER_NUMBERS, MAX_CUSTOM_LINKS, phoneNumber, DESK_ACTIONS, DESK_KEY_RE, MENU_ONLY, context, familyIds, storeContext, familyOf, categoryIn, nextOrderIn, SHARED_PRODUCT_FIELDS, guestKeysOf, guestHistory, patchStore, cleanCoffee, IMAGE_TYPES, VIDEO_TYPES, PAGER_MAX_RINGS, ringTicket, refreshWalletCards, PAGER_MSG_GAP, winbackSettings, redeemMessage, FEEDBACK_REASONS, absenceDue, readyRewards } = require('./shared');
const NEXT = require('./next');

module.exports.pre = async function pre(action, req, b) {

  // ─── كوبونات الخصم: القائمة ───
  // ─── مبيعات القائمة: أرقام طلبات المنيو (اليوم / 7 أيام / 30 يوم). تقرير فقط، وليس فاتورة ضريبية ───
  if (action === 'sales' && req.method === 'GET') {
    const { store } = await context(req);
    if (['active', 'trial'].includes(store.subscription_status) && !PLANS.has(store, 'menu')) throw new ApiError(403, 'المنيو مو ضمن باقتك. أضفه من "اشتراكك" في لوحة التحكم', 'ADDON_OFF');
    const days = ({ today: 1, '7': 7, '30': 30 })[String(req.query.range || '7')] || 7;
    const DAY = 864e5, R = 3 * 3600e3;
    const now = new Date(Date.now() + R);
    const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - R;
    const from = new Date(todayStart - (days - 1) * DAY).toISOString();
    // كل الطلبات في الفترة (صفحات 1000)
    const rows = [];
    for (let off = 0; off < 20000; off += 1000) {
      const page = await rest(`menu_orders?client_id=eq.${store.id}&created_at=gte.${q(from)}&select=status,dine,total,delivery_fee,items,created_at&order=id.asc&limit=1000&offset=${off}`);
      rows.push(...page);
      if (page.length < 1000) break;
    }
    const sold = rows.filter(o => o.status !== 'cancelled');
    const r2 = (n) => Math.round(n * 100) / 100;
    const sum = sold.reduce((a, o) => a + (Number(o.total) || 0), 0);
    const fees = sold.reduce((a, o) => a + (Number(o.delivery_fee) || 0), 0);
    // المنتجات والإضافات
    const prods = new Map(), extras = new Map();
    for (const o of sold) for (const i of (Array.isArray(o.items) ? o.items : [])) {
      const key = String(i.id || i.name), qty = Number(i.qty) || 0;
      const p = prods.get(key) || { id: i.id || null, name: i.name, qty: 0, amount: 0 };
      p.qty += qty; p.amount += (Number(i.price) || 0) * qty; prods.set(key, p);
      for (const e of (Array.isArray(i.extras) ? i.extras : [])) {
        const k = `${e.group || ''}|${e.name}`;
        const x = extras.get(k) || { name: e.name, group: e.group || null, qty: 0 };
        x.qty += qty; extras.set(k, x);
      }
    }
    const list = [...prods.values()].map(p => ({ ...p, amount: r2(p.amount) })).sort((a, b) => b.qty - a.qty || b.amount - a.amount);
    // منتجات ظاهرة في القائمة وما انطلبت أبد في الفترة
    const soldIds = new Set(list.map(p => p.id).filter(Boolean));
    const menu = await rest(`products?client_id=eq.${store.id}&is_available=is.true&select=id,name&order=id.asc&limit=1000`).catch(() => []);
    const unsold = menu.filter(p => !soldIds.has(p.id)).slice(0, 8).map(p => p.name);
    // أوقات الذروة (بتوقيت الرياض) والمبيعات اليومية
    const hours = Array(24).fill(0), weekdays = Array(7).fill(0);
    const daily = Array.from({ length: days }, (_, i) => ({ d: new Date(todayStart - (days - 1 - i) * DAY + R).toISOString().slice(0, 10), n: 0, amount: 0 }));
    const dine = { in: { n: 0, amount: 0 }, out: { n: 0, amount: 0 }, delivery: { n: 0, amount: 0 } };
    for (const o of sold) {
      const t = new Date(Date.parse(o.created_at) + R);
      hours[t.getUTCHours()]++; weekdays[t.getUTCDay()]++;
      const d = daily.find(x => x.d === t.toISOString().slice(0, 10));
      if (d) { d.n++; d.amount = r2(d.amount + (Number(o.total) || 0)); }
      const k = dine[o.dine] ? o.dine : 'in';
      dine[k].n++; dine[k].amount = r2(dine[k].amount + (Number(o.total) || 0));
    }
    return {
      range: days === 1 ? 'today' : String(days), order_mode: await require('../order').orderMode(store.id).catch(() => null),
      orders: rows.length, sold: sold.length, served: rows.filter(o => o.status === 'served').length,
      open: rows.filter(o => o.status === 'new' || o.status === 'accepted').length, cancelled: rows.length - sold.length,
      total: r2(sum), fees: r2(fees), avg: sold.length ? r2(sum / sold.length) : 0,
      top: list.slice(0, 10), least: list.length > 10 ? list.slice(-5).reverse() : [], unsold,
      extras: [...extras.values()].sort((a, b) => b.qty - a.qty).slice(0, 8),
      hours, weekdays, daily, dine
    };
  }
  return NEXT;
}

module.exports.post = async function post(action, req, b, env) {
  const { store, admin, here, sid, atBranch, notInPlan } = env;

  // ─── طلب من المنيو (طاولة): الكاشير استلمه ← انقدّم، أو حذفه ───
  if (action === 'order-update') {
    if (!PLANS.has(store, 'menu')) throw new ApiError(403, 'المنيو مو ضمن باقتك', 'ADDON_OFF');
    const id = int(b.id), status = b.status;
    if (!['new', 'accepted', 'served', 'cancelled'].includes(status)) throw new ApiError(400, 'حالة غير صحيحة');
    const now = new Date().toISOString();
    const patch = { status, ...(status === 'accepted' ? { accepted_at: now, closed_at: null } : status === 'new' ? { accepted_at: null, closed_at: null } : { closed_at: now }) };
    const rows = await rest(`menu_orders?id=eq.${id}&client_id=eq.${sid}&pager_ticket_id=is.null`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الطلب غير موجود');
    // سفري واستلمه الكاشير: العميل ياخذ رقم بيجر في جواله (يرن لما يجهز، ومعه بطاقة النداء)
    let ticket = null;
    if (status === 'accepted' && rows[0].dine === 'out' && PLANS.has(store, 'pager')) {
      ticket = await require('../order').givePager(sid, rows[0]).catch(e => { console.error('ORDER_PAGER', sid, e.message); return null; });
      if (ticket) rows[0].pager_ticket_id = ticket.id;
    }
    await poke([topic('pager', sid), topic('mo', rows[0].token)]);
    return { order: require('../order').publicOrder(rows[0]), ticket: ticket ? { id: ticket.id, number: ticket.number } : null };
  }
  return NEXT;
}
