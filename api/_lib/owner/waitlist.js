// =====================================================================
// DEV MENU — API صاحب المتجر: قائمة الانتظار: التسجيلات والسجل والإعدادات وتغيير الحالة
// pre: طلبات قبل حد الـ POST (القراءة وغيرها)، post: طلبات الحفظ (بعد ما يتحدد المتجر)
// كل دالة ترجع NEXT لو الطلب مو لها
// =====================================================================
/* eslint-disable no-unused-vars */
const { crypto, handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET, ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, SLUG_RE, RESERVED_SLUGS, CURRENCIES, SITE, storeLink, loyaltyHome, later, followParentFeatures, FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor, sendMail, mailConfigured, sendPush, pushPublicKey, cleanSubscription, topic, storeTopics, poke, normalizeLoyalty, validPoint, PLANS, tr, wallet, queue, pushWalletCards, runAssistant, pagerReadyNotice, walletNotice, loyaltyMessages, loyaltyNearLines, stampPagerTicket, purchaseStamp, tagBranch, newStampCode, parseMemberQr, cooldownLeft, leftText, bySort, COFFEE_TYPES, SECTORS, LINKS_SECTIONS, BUSINESS_TYPES, ALLERGENS, PROCESS, ROAST, METHODS, DELIVERY, THEMES, MAX_SIZES, MAX_COUPONS, OCCASION_PRESETS, STICKER_POSITIONS, STICKER_LIB, STICKER_SIZES, STICKER_ANIMS, MAX_OCCASIONS, MAX_STICKERS, isDay, cleanOccasions, validPrice, round2, cleanSizes, cleanExtras, riyadhDate, MAX_ORDER_NUMBERS, MAX_CUSTOM_LINKS, phoneNumber, DESK_ACTIONS, DESK_KEY_RE, MENU_ONLY, context, familyIds, storeContext, familyOf, categoryIn, nextOrderIn, SHARED_PRODUCT_FIELDS, guestKeysOf, guestHistory, patchStore, cleanCoffee, IMAGE_TYPES, VIDEO_TYPES, PAGER_MAX_RINGS, ringTicket, refreshWalletCards, PAGER_MSG_GAP, winbackSettings, redeemMessage, FEEDBACK_REASONS, absenceDue, readyRewards } = require('./shared');
const NEXT = require('./next');

module.exports.pre = async function pre(action, req, b) {

  // ─── قائمة الانتظار: تسجيلات اليوم ───
  if (action === 'waitlist' && req.method === 'GET') {
    const { store } = await context(req);
    if (!store.waitlist_enabled || !PLANS.has(store, 'waitlist')) throw new ApiError(403, 'قائمة الانتظار متوقفة: غير مفعّلة أو انتهى اشتراكك', 'ADDON_OFF');
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
  return NEXT;
}

module.exports.post = async function post(action, req, b, env) {
  const { store, admin, here, sid, atBranch, notInPlan } = env;

  // ─── قائمة الانتظار: الإعدادات ───
  if (action === 'waitlist-settings') {
    if (!store.waitlist_enabled || !PLANS.has(store, 'waitlist')) throw new ApiError(403, 'قائمة الانتظار متوقفة: غير مفعّلة أو انتهى اشتراكك', 'ADDON_OFF');
    const current = normalizeSettings(store.waitlist_settings);
    const next = normalizeSettings({ ...current, ...b, fields: { ...current.fields, ...(b.fields || {}) } });
    const saved = await patchStore(sid, { waitlist_settings: next });
    await poke(topic('wl', sid));
    return { settings: normalizeSettings(saved.waitlist_settings) };
  }

  // ─── قائمة الانتظار: تغيير حالة عميل (الطاولة جاهزة / جلس / لم يحضر / إلغاء) ───
  if (action === 'waitlist-update') {
    if (!store.waitlist_enabled || !PLANS.has(store, 'waitlist')) throw new ApiError(403, 'قائمة الانتظار متوقفة: غير مفعّلة أو انتهى اشتراكك', 'ADDON_OFF');
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
      const home = await loyaltyHome(sid);
      const brand = home === sid ? store.name : ((await rest(`clients?id=eq.${home}&select=name`).catch(() => []))[0] || store).name;
      await walletNotice(home, updated.loyalty_card_id, `🔔 ${T.wlReady} دور #${updated.ticket}. تفضّل للاستقبال في ${brand}`).catch(() => {});
    }
    await poke(topic('wl', sid));
    return { entry: updated, email_sent };
  }
  return NEXT;
}
