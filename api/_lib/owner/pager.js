// =====================================================================
// DEV MENU — API صاحب المتجر: البيجر: شاشة الكاشير والعرض، الأرقام والرنين والفاتورة والوقت، رسائل الزبائن، الإحصائيات
// pre: طلبات قبل حد الـ POST (القراءة وغيرها)، post: طلبات الحفظ (بعد ما يتحدد المتجر)
// كل دالة ترجع NEXT لو الطلب مو لها
// =====================================================================
/* eslint-disable no-unused-vars */
const { crypto, handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET, ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, SLUG_RE, RESERVED_SLUGS, CURRENCIES, SITE, storeLink, loyaltyHome, later, followParentFeatures, FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor, sendMail, mailConfigured, sendPush, pushPublicKey, cleanSubscription, topic, storeTopics, poke, normalizeLoyalty, validPoint, PLANS, tr, wallet, queue, pushWalletCards, runAssistant, pagerReadyNotice, walletNotice, loyaltyMessages, loyaltyNearLines, stampPagerTicket, purchaseStamp, tagBranch, newStampCode, parseMemberQr, cooldownLeft, leftText, bySort, COFFEE_TYPES, SECTORS, LINKS_SECTIONS, BUSINESS_TYPES, ALLERGENS, PROCESS, ROAST, METHODS, DELIVERY, THEMES, MAX_SIZES, MAX_COUPONS, OCCASION_PRESETS, STICKER_POSITIONS, STICKER_LIB, STICKER_SIZES, STICKER_ANIMS, MAX_OCCASIONS, MAX_STICKERS, isDay, cleanOccasions, validPrice, round2, cleanSizes, cleanExtras, riyadhDate, MAX_ORDER_NUMBERS, MAX_CUSTOM_LINKS, phoneNumber, DESK_ACTIONS, DESK_KEY_RE, MENU_ONLY, context, familyIds, storeContext, familyOf, categoryIn, nextOrderIn, SHARED_PRODUCT_FIELDS, guestKeysOf, guestHistory, patchStore, cleanCoffee, IMAGE_TYPES, VIDEO_TYPES, PAGER_MAX_RINGS, ringTicket, refreshWalletCards, PAGER_MSG_GAP, winbackSettings, redeemMessage, FEEDBACK_REASONS, absenceDue, readyRewards } = require('./shared');
const NEXT = require('./next');

module.exports.pre = async function pre(action, req, b) {

  // ─── البيجر: أرقام اليوم ───
  // ─── شاشة العرض للزبون (تابلت عند الكاشير): بيانات المحل وخدماته ───
  if (action === 'kiosk' && req.method === 'GET') {
    // الشاشة تعرض الفرع نفسه (اسمه وأكواد خدماته)، وإعدادات الولاء من المحل الرئيسي
    const { store, here } = await context(req);
    const x = (await rest(`clients?id=eq.${store.id}&select=loyalty_enabled,loyalty_settings`))[0] || {};
    const settings = normalizeLoyalty(x.loyalty_settings);
    const services = ['menu', 'pager', 'waitlist', 'loyalty'].filter(k => PLANS.has(here, k) && (k !== 'waitlist' || here.waitlist_enabled) && (k !== 'loyalty' || x.loyalty_enabled));
    // البيجر المجاني خلّص عدده هالشهر: الشاشة تكمل تعرض الجاهزين، بس بدون كود أخذ رقم
    let pager_full = false;
    if (PLANS.pagerLite(here)) {
      const start = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7) + '-01T00:00:00+03:00';
      pager_full = (await rest(`pager_tickets?client_id=eq.${here.id}&created_at=gte.${q(start)}&select=id&limit=${PLANS.FREE.pager}`).catch(() => [])).length >= PLANS.FREE.pager;
    }
    return { pager_full, kiosk_call: here.kiosk_call === true, name: here.name, logo_url: here.logo_url || store.logo_url || '', slug: here.client_slug, business_type: here.business_type, business_label: here.business_label, services, enabled: services.includes('loyalty'), needed: settings.needed, reward: settings.reward, reward_en: settings.reward_en };
  }
  // ─── رابط الكاشير للفرع: يطلع (وينشأ أول مرة)، أو يتغيّر والقديم يوقف ───
  if (action === 'desk-link') {
    const { store, desk } = await context(req);
    if (desk) throw new ApiError(403, 'رابط الكاشير يفتح شاشة الكاشير بس', 'DESK_ONLY');
    let key = store.desk_key;
    if (!key || (req.method === 'POST' && b.reset === true)) {
      key = crypto.randomBytes(24).toString('base64url');
      await rest(`clients?id=eq.${store.id}`, { method: 'PATCH', body: { desk_key: key } });
    }
    // نفس مفتاح الفرع يفتح شاشة الزبون (شاشة خارجية قدّام العميل) بدون حساب المالك
    return { url: `${SITE}/pager-desk.html?k=${key}`, kiosk_url: `${SITE}/kiosk.html?k=${key}`, name: store.name };
  }

  if (action === 'pager' && req.method === 'GET') {
    const { store } = await context(req);
    // شاشة الكاشير تخدم البيجر والولاء: مشترك الولاء لحاله يستخدمها لمسح بطاقات الزبائن
    const hasPager = PLANS.has(store, 'pager');
    // الطلب من المنيو: طلبات الطاولات (المنيو بس) أو مع رقم البيجر (الخدمة الذاتية)، كلها في نفس الشاشة
    const orderMode = await require('../order').orderMode(store.id);
    if (!hasPager && !PLANS.has(store, 'loyalty') && !orderMode) throw new ApiError(403, 'البيجر مو ضمن باقتك، أضفه من "اشتراكك" في لوحة التحكم', 'ADDON_OFF');
    // أرقام اليوم، والأرقام اللي للحين مفتوحة من أمس (بعد منتصف الليل ما تختفي قبل لا يستلمها العميل)
    const day0 = riyadhDayStart(), open0 = new Date(Date.now() - 18 * 3600e3).toISOString();   // نفس مدة صلاحية الرقم عند الزبون (18 ساعة)
    const base = `pager_tickets?client_id=eq.${store.id}&or=${encodeURIComponent(`(created_at.gte."${day0}",and(status.in.(waiting,ready),created_at.gte."${open0}"))`)}&order=created_at.asc,number.asc&select=id,number,status,created_at,ready_at,closed_at,push_sub`;
    // أعمدة التكرار من 21-pager-repeat.sql — لو ما انضافت نكمل بدونها
    const tickets = !hasPager ? [] : await rest(`${base},ring_count,acked_at,invoice_no,loyalty_card_id,car,addons,game_won,eta_at`).catch(() => rest(`${base},ring_count,acked_at,invoice_no,loyalty_card_id,car,addons,game_won`)).catch(() => rest(`${base},ring_count,acked_at,invoice_no,loyalty_card_id,car`)).catch(() => rest(`${base},ring_count,acked_at,invoice_no,loyalty_card_id`)).catch(() => rest(`${base},ring_count,acked_at,invoice_no`)).catch(() => rest(`${base},ring_count,acked_at`)).catch(() => rest(base));
    const lhome = await loyaltyHome(store.id);   // الولاء على المحل الرئيسي
    const lx = (await rest(`clients?id=eq.${lhome}&select=loyalty_enabled`).catch(() => []))[0] || {};
    lx.loyalty_enabled = lx.loyalty_enabled && PLANS.has(store, 'loyalty');
    // أرقام مربوطة ببطاقات ولاء فيها مكافأة جاهزة
    const rewardsBy = {};
    const linked = [...new Set(tickets.filter(t => t.loyalty_card_id && t.status !== 'done').map(t => t.loyalty_card_id))];
    if (linked.length && lx.loyalty_enabled) {
      const st = normalizeLoyalty((await rest(`clients?id=eq.${lhome}&select=loyalty_settings`).catch(() => []))[0]?.loyalty_settings);
      const cards = await rest(`loyalty_cards?id=in.(${linked.join(',')})&select=id,member_no,name,stamps`).catch(() => []);
      for (const c of cards) { const r = await readyRewards(lhome, c, st); if (r.length) rewardsBy[c.id] = { card_id: c.id, name: c.name || `عضو #${c.member_no}`, rewards: r }; }
    }
    // طلبات المنيو المفتوحة اليوم (وصلت / استلمها الكاشير)
    const { publicOrder } = require('../order');
    // طلبات اليوم + أي طلب للحين مفتوح من قبل (ما استلمه العميل، أو طلب بموعد لبكرة) ما يختفي بعد منتصف الليل
    const mos = await rest(`menu_orders?client_id=eq.${store.id}&or=${encodeURIComponent(`(created_at.gte."${day0}",status.in.(new,accepted))`)}&select=*&order=id.asc&limit=300`).catch(() => []);
    // السفري اللي صار له رقم بيجر: يطلع تحت رقمه في أعمدة البيجر، والباقي في «طلبات المنيو»
    const byTicket = new Map(mos.filter(o => o.pager_ticket_id).map(o => [o.pager_ticket_id, publicOrder(o)]));
    const orders = mos.filter(o => !o.pager_ticket_id && ['new', 'accepted'].includes(o.status)).map(publicOrder);
    // build: نسخة الموقع المنشورة، شاشة الكاشير تحدّث نفسها لو تغيّرت (تبقى مفتوحة أيام)
    return { build: (process.env.VERCEL_GIT_COMMIT_SHA || '').slice(0, 12) || null, order_mode: orderMode, orders, currency: CURRENCIES[store.currency] || CURRENCIES.SAR, tickets: tickets.map(({ push_sub, ...t }) => ({ ...t, has_push: !!push_sub, order: byTicket.get(t.id) || null, reward: t.loyalty_card_id ? rewardsBy[t.loyalty_card_id] || null : null })), slug: store.client_slug, name: store.name, business_type: store.business_type, max_rings: PAGER_MAX_RINGS, live: topic('pager', store.id), loyalty: lx.loyalty_enabled === true, pager: hasPager, loyalty_entitled: PLANS.has(store, 'loyalty') };
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
  return NEXT;
}

module.exports.post = async function post(action, req, b, env) {
  const { store, admin, here, sid, atBranch, notInPlan } = env;

  // ─── رسائل لزبائنك: إشعار على بطاقة النداء لكل زبون حافظها (إضافة على البيجر) ───
  // البطاقات للمحل الرئيسي (كل الفروع). اللي عنده رقم شغّال الحين ما نغيّر بطاقته عشان ما يضيع رقمه
  // صاحب المحل يختار: كل الفروع، أو زبائن فرع واحد (اللي أخذوا منه رقم)
  if (action === 'pager-messages') {
    const home = await loyaltyHome(sid);
    const [list, cards, wb] = await Promise.all([
      rest(`pager_messages?client_id=eq.${home}&select=id,body,sent,created_at,branch_id&order=id.desc&limit=10`).catch(() => []),
      rest(`pager_cards?client_id=eq.${home}&wallet_serial=not.is.null&select=branch_ids&limit=20000`).catch(() => []),
      rest(`clients?id=eq.${home}&select=pager_winback`).then(r => (r[0] || {}).pager_winback).catch(() => null)
    ]);
    const by_branch = {};
    cards.forEach(c => (c.branch_ids || []).forEach(id => { by_branch[id] = (by_branch[id] || 0) + 1; }));
    return { messages: list, cards: cards.length, by_branch, winback: { ...winbackSettings(wb), last: (wb && wb.last) || null } };
  }
  if (action === 'pager-message') {
    const body = str(b.body, 150, 'الرسالة');
    if (body.length < 2) throw new ApiError(400, 'اكتب الرسالة');
    const home = await loyaltyHome(sid);
    const branch = b.branch_id ? Number(b.branch_id) : null;
    if (branch && !(await familyIds(store)).includes(branch)) throw new ApiError(400, 'الفرع غير موجود');
    const recent = await rest(`pager_messages?client_id=eq.${home}&created_at=gte.${q(new Date(Date.now() - PAGER_MSG_GAP).toISOString())}&select=id&limit=1`).catch(() => []);
    if (recent.length) throw new ApiError(429, 'أرسلت رسالة قبل شوي، انتظر دقيقتين وأرسل الثانية', 'MSG_LIMIT');
    const msg = (await rest('pager_messages', { method: 'POST', prefer: 'return=representation', body: { client_id: home, body, branch_id: branch } }))[0];
    // الطابور يرسلها بالخلفية (api/notify-cron كل دقيقة)، ونبدأ أول دفعة الحين عشان توصل خلال ثواني
    const queued = await queue.enqueuePagerMessage(home, msg.id, body, branch);
    later(queue.processQueue(20e3));
    return { message: { ...msg, queued, sent: 0 }, queued };
  }
  // "وحشتنا" التلقائية: تنحفظ على المحل الرئيسي، ويرسلها loyalty-cron كل يوم
  if (action === 'pager-winback') {
    const home = await loyaltyHome(sid);
    const w = winbackSettings({ enabled: b.enabled === true, days: b.days, text: b.text });
    if (w.enabled && w.text.length < 2) throw new ApiError(400, 'اكتب رسالة "وحشتنا"');
    const old = (await rest(`clients?id=eq.${home}&select=pager_winback`))[0] || {};
    await rest(`clients?id=eq.${home}`, { method: 'PATCH', body: { pager_winback: { ...(old.pager_winback || {}), ...w } } });
    return { winback: w };
  }
  // وين وصلت رسالة المحل (لوحة التحكم تسأل كل كم ثانية لين تخلص)
  if (action === 'pager-message-status') {
    const home = await loyaltyHome(sid);
    const msg = (await rest(`pager_messages?id=eq.${int(b.message_id)}&client_id=eq.${home}&select=id`))[0];
    if (!msg) throw new ApiError(404, 'الرسالة غير موجودة');
    return { status: await queue.messageStatus(msg.id, 'pager_msg') };
  }

  // ─── الخدمة الذاتية: العميل دفع، والكاشير يكتب رقم الفاتورة ← يدخل التجهيز برقم بيجر داخلي يرن عليه ───
  // ─── البيجر: الطلب جاهز (يرن جوال العميل) / تم التسليم / إلغاء / إرجاع للانتظار ───
  if (action === 'pager-update') {
    const id = int(b.id);
    const status = b.status;
    if (!['waiting', 'ready', 'done', 'cancelled'].includes(status)) throw new ApiError(400, 'حالة غير صحيحة');
    const now = new Date().toISOString();
    const patch = { status };
    // "جاهز" = أول رنّة، والعدّاد يبدأ من جديد (لو رجع للتجهيز ثم جاهز مرة ثانية)
    if (status === 'ready') Object.assign(patch, { ready_at: now, closed_at: null, ring_count: 0, last_ring_at: null, acked_at: null });
    else if (status === 'waiting') { patch.ready_at = null; patch.closed_at = null; }
    else patch.closed_at = now;
    if (status === 'done' || status === 'cancelled') patch.push_sub = null;
    const rows = await rest(`pager_tickets?id=eq.${id}&client_id=eq.${sid}`, { method: 'PATCH', body: patch, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الرقم غير موجود');
    const t = rows[0];
    // طلب سفري من المنيو مربوط بالرقم: استلم = تم، حذف = انلغى
    if (status === 'done' || status === 'cancelled') await rest(`menu_orders?pager_ticket_id=eq.${t.id}&client_id=eq.${sid}`, { method: 'PATCH', body: { status: status === 'done' ? 'served' : 'cancelled', closed_at: now } }).catch(() => {});
    if (status === 'ready' && !t.push_sub) console.log('PAGER_READY_NO_SUB', sid, t.id);
    // بطاقة النداء وبطاقة الولاء يتحدثون بالخلفية: الكاشير ياخذ الرد على طول، والإشعار يوصل خلال ثواني
    // تحديث البطاقة يبدأ قبل رنّة المتصفح (WalletWallet ياخذ ثواني، فما ينتظر الرنّة)
    // رقمه مضاف للمحفظة: تحديث يطلع إشعار من النظام (حتى لو يشوف فيديو)
    if (status === 'ready' && t.wallet_serial) {
      later(wallet.updatePagerPass(t.wallet_serial, wallet.pagerStep({ store, number: t.number, step: 'ready', lang: t.lang, invoice: t.invoice_no })).then(wr => {
        console.log('PAGER_PASS', sid, t.id, wr);
        return rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { wallet_error: `ready ${wr} at=${new Date().toISOString().slice(11, 19)}` } });
      }));
    }
    // استلم أو انلغى: بطاقة النداء ترجع "بالعافية" (إشعار) وتنتظر الزيارة الجاية
    if ((status === 'done' || status === 'cancelled') && t.wallet_serial) {
      later(wallet.endPagerPass(t.wallet_serial, t.id, wallet.pagerStep({ store, step: 'idle', lang: t.lang })).then(er => {
        console.log('PAGER_PASS_END', sid, t.id, er);
        return rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { wallet_error: `${t.wallet_error || ''} | end ${er}`.slice(0, 300) } });
      }));
    }
    // بطاقة ولاء مربوطة بالرقم: "جاهز" = إشعار من بطاقة المحفظة، و"استلم" = الختم (مرة وحدة)
    // الختم مع الاستلام مو الجاهز: اللي أخذ رقم من بعيد وما طلب ما يجي يستلم، فما ينختم له لو انضغط "جاهز" بالغلط
    if (status === 'ready' && t.loyalty_card_id && PLANS.has(store, 'loyalty')) {
      later((async () => console.log('PAGER_WALLET', sid, t.id, await (async () => { const home = await loyaltyHome(sid); const brand = home === sid ? store.name : ((await rest(`clients?id=eq.${home}&select=name`).catch(() => []))[0] || store).name; return pagerReadyNotice(home, t.loyalty_card_id, t.number, brand, SECTORS.terms(store)); })()))());
    }
    if (status === 'done' && t.loyalty_card_id && !t.loyalty_stamped) {
      later((async () => {
        try { await stampPagerTicket(await loyaltyHome(sid), sid, t); } catch (e) { console.error('PAGER_STAMP', e.message); }
        await poke([topic('pager', sid), topic('ticket', t.token)]);   // صفحة الزبون تشوف الختم
      })());
    }
    const push = status === 'ready' ? await ringTicket(store, t) : 'off';
    await poke([topic('pager', sid), topic('ticket', t.token)]);
    return { ticket: { id: t.id, number: t.number, status: t.status, created_at: t.created_at, ready_at: t.ready_at, closed_at: t.closed_at, has_push: !!t.push_sub, ring_count: t.ring_count || 0, acked_at: t.acked_at || null }, push };
  }

  // ─── البيجر: الكاشير يربط رقم البيجر برقم الفاتورة ───
  // ─── البيجر: الكاشير شاف اللي أضافه الزبون (يطلع للزبون «الكاشير استلم إضافتك»، وما يقدر يحذفها بعدها) ───
  if (action === 'pager-addons-seen') {
    const id = int(b.id);
    const t = (await rest(`pager_tickets?id=eq.${id}&client_id=eq.${sid}&select=id,token,addons`))[0];
    if (!t) throw new ApiError(404, 'الرقم غير موجود');
    const addons = (Array.isArray(t.addons) ? t.addons : []).map(a => ({ ...a, seen: true }));
    await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { addons } });
    await poke([topic('pager', sid), topic('ticket', t.token)]);
    return { ticket: { id: t.id, addons } };
  }

  // ─── البيجر: الكاشير يحدد وقت الانتظار لرقم (بعض الأصناف تتأخر). 0 = يرجع للتقدير التلقائي ───
  if (action === 'pager-eta') {
    const id = int(b.id), m = int(b.minutes);
    if (!(m >= 0 && m <= 120)) throw new ApiError(400, 'الوقت من 1 إلى 120 دقيقة');
    const eta_at = m ? new Date(Date.now() + m * 60000).toISOString() : null;
    const rows = await rest(`pager_tickets?id=eq.${id}&client_id=eq.${sid}&status=eq.waiting`, { method: 'PATCH', body: { eta_at }, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الرقم غير موجود أو جهز');
    await poke([topic('pager', sid), topic('ticket', rows[0].token)]);
    return { ticket: { id: rows[0].id, eta_at } };
  }

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
    const t = rows[0];
    // رقم الفاتورة في بطاقة النداء (بصمت)
    if (t.wallet_serial && ['waiting', 'ready'].includes(t.status)) later(wallet.updatePagerPass(t.wallet_serial, { ...wallet.pagerStep({ store, number: t.number, step: t.status, lang: t.lang, invoice: t.invoice_no }), silent: true }));
    await poke([topic('pager', sid), topic('ticket', t.token)]);
    return { ticket: { id: t.id, number: t.number, invoice_no: t.invoice_no } };
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
  return NEXT;
}
