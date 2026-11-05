// =====================================================================
// DEV MENU — API صاحب المتجر: الحساب: الدخول والتسجيل، تحميل اللوحة، الإشعارات والدعم، الإحصائيات، الباقة، بيانات المتجر والرابط والرفع
// pre: طلبات قبل حد الـ POST (القراءة وغيرها)، post: طلبات الحفظ (بعد ما يتحدد المتجر)
// كل دالة ترجع NEXT لو الطلب مو لها
// =====================================================================
/* eslint-disable no-unused-vars */
const { crypto, handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET, ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, SLUG_RE, RESERVED_SLUGS, CURRENCIES, SITE, storeLink, loyaltyHome, later, followParentFeatures, FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor, sendMail, mailConfigured, sendPush, pushPublicKey, cleanSubscription, topic, storeTopics, poke, normalizeLoyalty, validPoint, PLANS, tr, wallet, queue, pushWalletCards, runAssistant, pagerReadyNotice, walletNotice, loyaltyMessages, loyaltyNearLines, stampPagerTicket, purchaseStamp, tagBranch, newStampCode, parseMemberQr, cooldownLeft, leftText, bySort, COFFEE_TYPES, SECTORS, LINKS_SECTIONS, BUSINESS_TYPES, ALLERGENS, PROCESS, ROAST, METHODS, DELIVERY, THEMES, MAX_SIZES, MAX_COUPONS, OCCASION_PRESETS, STICKER_POSITIONS, STICKER_LIB, STICKER_SIZES, STICKER_ANIMS, MAX_OCCASIONS, MAX_STICKERS, isDay, cleanOccasions, validPrice, round2, cleanSizes, cleanExtras, riyadhDate, MAX_ORDER_NUMBERS, MAX_CUSTOM_LINKS, phoneNumber, DESK_ACTIONS, DESK_KEY_RE, MENU_ONLY, context, familyIds, storeContext, familyOf, categoryIn, nextOrderIn, SHARED_PRODUCT_FIELDS, guestKeysOf, guestHistory, patchStore, cleanCoffee, IMAGE_TYPES, VIDEO_TYPES, PAGER_MAX_RINGS, ringTicket, refreshWalletCards, PAGER_MSG_GAP, winbackSettings, redeemMessage, FEEDBACK_REASONS, absenceDue, readyRewards } = require('./shared');
const NEXT = require('./next');

module.exports.pre = async function pre(action, req, b) {

  // ─── من أنا؟ (لتوجيه المستخدم بعد الدخول) ───
  if (action === 'whoami') {
    const { user, admin, store } = await context(req, { needStore: false });
    return { email: user.email, is_admin: admin, has_store: !!store, slug: store && store.client_slug };
  }

  // ─── إنشاء متجر جديد بعد التحقق من البريد ───
  if (action === 'register' && req.method === 'POST') {
    const user = await getUser(req);
    const name = str(b.name, 80, 'اسم المتجر');
    if (!name) throw new ApiError(400, 'اكتب اسم المنشأة', 'INVALID_NAME');
    let phone = '';
    try { phone = waNumber(b.phone); } catch { throw new ApiError(400, 'رقم الجوال غير صحيح', 'INVALID_PHONE'); }
    const type = BUSINESS_TYPES.includes(b.business_type) ? b.business_type : 'restaurant';
    // الحساب يتفعل بالخدمات اللي اختارها بس (بدونها كانت التجربة تفتح كل الخدمات)
    const chosen = PLANS.clean(Array.isArray(b.features) ? b.features : []).filter(k => k !== 'freepager');   // البيجر المجاني المضاف تعطيه الإدارة بس
    if (!chosen.length) throw new ApiError(400, 'اختر الخدمات التي تحتاجها أولاً', 'NO_FEATURES');
    try {
      const slug = await rpc('server_register_client', { p_email: user.email, p_name: name, p_phone: phone, p_type: type });
      // الأنواع الجديدة (عيادة، صالون...) تنحفظ بعد الإنشاء، ومعها اسم النشاط لو اختار "أخرى"
      const label = type === 'other' ? str(b.business_label, 60, 'اسم النشاط') : null;
      if (!['restaurant', 'cafe', 'mixed', 'bakery'].includes(type) || label) {
        await rest(`clients?client_slug=eq.${q(slug)}`, { method: 'PATCH', body: { business_type: type, business_label: label || null } }).catch(e => console.error('REGISTER_TYPE', e.message));
      }
      // الباقة اللي اختارها قبل التسجيل: تنحفظ كطلب اشتراك، يبدأ التجربة المجانية، ونتواصل معه للدفع
      const plan = ['month', 'year'].includes(b.plan) ? b.plan : 'month';
      const features = chosen;
      const freeChoice = b.free === true && features.length === 1 && features[0] === 'pager';   // اختار "البيجر مجاناً": ما هو طلب اشتراك
      if (features.length) {
        // الخدمات اللي اختارها تشتغل على طول في التجربة، والإدارة يوصلها إشعار بس
        // "البيجر مجاناً": يبدأ على الباقة المجانية من أول يوم (بدون تجربة، فما فيه بطاقة نداء ولا رسائل)
        const main = (await rest(`clients?client_slug=eq.${q(slug)}`, { method: 'PATCH', prefer: 'return=representation',
          body: { plan_features: features, waitlist_enabled: features.includes('waitlist'), loyalty_enabled: features.includes('loyalty'), trial_ends_at: new Date(freeChoice ? Date.now() - 1000 : Date.now() + PLANS.TRIAL_DAYS * 864e5).toISOString(),
                  ...(freeChoice ? {} : { requested_plan: plan, requested_features: features, plan_requested_at: new Date().toISOString() }) } }).catch(e => { console.error('REGISTER_FEATURES', slug, e.message); return []; }))[0];
        if (main && mailConfigured()) {
          await sendMail({
            to: process.env.ADMIN_EMAIL || 'dmenu950@gmail.com', fromName: 'DEV MENU',
            subject: freeChoice ? `متجر جديد على البيجر المجاني: ${main.name}` : `متجر جديد مع طلب اشتراك: ${main.name}`,
            text: `${main.name} (${main.client_slug}) سجّل و${freeChoice ? 'بدأ على البيجر المجاني' : 'بدأ التجربة المجانية'}.\n${freeChoice ? `البيجر الأساسي: ${PLANS.FREE.pager} رقم بالشهر، بدون بطاقة النداء والرسائل.` : `اختار ${plan === 'month' ? 'الشهري' : 'السنوي'}: ${features.map(k => PLANS.FEATURES[k].name).join('، ')} = ${PLANS.price(features, plan).total} ر.س.`}\nجوال: ${main.phone || '-'}\nبريد: ${main.email || '-'}\nلوحة المشتركين: ${SITE}/super-admin.html`
          }).catch(e => console.error('REGISTER_PLAN_MAIL', e.message));
        }
      }
      return { slug };
    } catch (e) {
      if (String(e.dbMessage || e.message).includes('EMAIL_TAKEN')) throw new ApiError(409, 'هذا البريد مرتبط بمتجر مسجل مسبقاً', 'EMAIL_TAKEN');
      throw e;
    }
  }

  // ─── تحميل لوحة التحكم ───
  if (action === 'load') {
    const { user, admin, store } = await context(req, { needStore: false });
    if (!store) return { email: user.email, is_admin: admin, store: null };
    store.waitlist_settings = normalizeSettings(store.waitlist_settings);
    const root = store.parent_id || store.id;
    const [categories, products, branches] = await Promise.all([
      rest(`categories?client_id=eq.${store.id}&select=*`),
      rest(`products?client_id=eq.${store.id}&select=*`),
      // المتجر الرئيسي وفروعه (لقائمة التبديل بين الفروع)
      familyOf(store, 'id,name,client_slug,parent_id,occasions,branch_features').catch(() => [])
    ]);
    return { email: user.email, is_admin: admin, store, branches, categories: categories.sort(bySort), products: products.sort(bySort), live: storeTopics(store.id) };
  }

  // ─── طلبات صاحب المتجر للإدارة (تجديد، باقة، تفعيل، تواصل): بدل الواتساب ───
  // ─── جرس الإشعارات: ردود الإدارة، الفروع، وإشعارات الإدارة (للحساب كله) ───
  if (action === 'notifications' && req.method === 'GET') {
    const { store } = await context(req);
    const mainId = store.parent_id || store.id;
    // المقروءة تنحذف بعد يوم من قراءتها (غير المقروءة تبقى لين يقرأها)
    await rest(`owner_notifications?client_id=eq.${mainId}&read_at=lt.${q(new Date(Date.now() - 864e5).toISOString())}`, { method: 'DELETE' }).catch(() => {});
    const [items, unread] = await Promise.all([
      rest(`owner_notifications?client_id=eq.${mainId}&select=id,kind,title,body,link,created_at,read_at&order=id.desc&limit=30`).catch(() => []),
      rest(`owner_notifications?client_id=eq.${mainId}&read_at=is.null&select=id&limit=100`).catch(() => [])
    ]);
    return { items, unread: unread.length };
  }
  // قراءة إشعار واحد (id) أو الكل
  if (action === 'notifications-read' && req.method === 'POST') {
    const { store } = await context(req);
    const one = Number.isInteger(Number(b.id)) && b.id != null ? `&id=eq.${Number(b.id)}` : '';
    await rest(`owner_notifications?client_id=eq.${store.parent_id || store.id}&read_at=is.null${one}`, { method: 'PATCH', body: { read_at: new Date().toISOString() } }).catch(() => {});
    return { ok: true };
  }
  // حذف إشعار واحد (id) أو الكل
  if (action === 'notifications-delete' && req.method === 'POST') {
    const { store } = await context(req);
    const one = Number.isInteger(Number(b.id)) && b.id != null ? `&id=eq.${Number(b.id)}` : '';
    await rest(`owner_notifications?client_id=eq.${store.parent_id || store.id}${one}`, { method: 'DELETE' });
    return { ok: true };
  }

  if (action === 'support-list' && req.method === 'GET') {
    const { store } = await context(req);
    const mainId = store.parent_id || store.id;
    const rows = await rest(`support_requests?client_id=eq.${mainId}&select=id,kind,body,meta,status,reply,created_at,handled_at&order=id.desc&limit=20`).catch(() => null);
    return { requests: rows || [], ready: !!rows };
  }
  if (action === 'support-send' && req.method === 'POST') {
    // الموقوف والمنتهي يقدرون يرسلون كمان (عشان يجددون)
    const { store } = await context(req);
    const mainId = store.parent_id || store.id;
    const kind = ['renew', 'plan', 'addon', 'branch', 'suspended', 'contact'].includes(b.kind) ? b.kind : 'contact';
    const body = str(b.body, 1000, 'الرسالة');
    if (!body || body.length < 3) throw new ApiError(400, 'اكتب رسالتك');
    const today = await rest(`support_requests?client_id=eq.${mainId}&created_at=gte.${q(new Date(Date.now() - 864e5).toISOString())}&select=id`).catch(() => null);
    if (!today) throw new ApiError(503, 'خدمة الطلبات تتجهز، حاول بعد شوي', 'NOT_READY');
    if (today.length >= 10) throw new ApiError(429, 'أرسلت طلبات كثيرة اليوم، بنرد عليك قريب');
    // طلب فرع: الاسم ونوع المنيو محفوظة، والمدير يوافق بضغطة. طلب واحد مفتوح بس
    let meta = null;
    if (kind === 'branch') {
      if (store.parent_id) throw new ApiError(400, 'اطلب الفرع من حساب المحل الرئيسي');
      // البيجر المجاني لفرع واحد: الفرع الإضافي يحتاج اشتراك في ميزة وحدة على الأقل
      if (PLANS.isFree(store)) throw new ApiError(403, 'البيجر المجاني لفرع واحد. عشان تضيف فرع، اشترك في ميزة وحدة على الأقل من "اشتراكك"', 'FREE_PLAN');
      const name = str(b.meta && b.meta.name, 80, 'اسم الفرع');
      if (!name || name.length < 2) throw new ApiError(400, 'اكتب اسم الفرع');
      const open = await rest(`support_requests?client_id=eq.${mainId}&kind=eq.branch&status=eq.open&select=id`).catch(() => []);
      if (open.length) throw new ApiError(409, 'عندك طلب فرع قيد الإضافة، بنضيفه لك قريب', 'BRANCH_PENDING');
      const features = PLANS.clean(PLANS.ownBranch(b.meta && b.meta.features));
      if (!PLANS.branchFeatures(features, PLANS.featuresOf(store)).length) throw new ApiError(400, 'اختر ميزة وحدة على الأقل للفرع');
      meta = { name, features, empty_menu: !!(b.meta && b.meta.empty_menu) };
    }
    // طلب تغيير مميزات فرع: من فروع نفس المحل بس، وطلب واحد مفتوح لكل فرع
    if (kind === 'addon' && b.meta && b.meta.branch_id) {
      const br = (await rest(`clients?id=eq.${int(b.meta.branch_id)}&parent_id=eq.${mainId}&select=id,name`))[0];
      if (!br) throw new ApiError(404, 'الفرع غير موجود', 'NO_BRANCH');
      const open = await rest(`support_requests?client_id=eq.${mainId}&kind=eq.addon&status=eq.open&select=id,meta`).catch(() => []);
      if (open.some(x => x.meta && Number(x.meta.branch_id) === br.id)) throw new ApiError(409, 'عندك طلب لهالفرع قيد التفعيل، بنفعّله لك قريب', 'BRANCH_PENDING');
      const features = PLANS.clean(PLANS.ownBranch(b.meta.features));
      if (!PLANS.branchFeatures(features, PLANS.featuresOf(store)).length) throw new ApiError(400, 'اختر ميزة وحدة على الأقل للفرع');
      meta = { branch_id: br.id, name: br.name, features };
    }
    const row = (await rest('support_requests', { method: 'POST', prefer: 'return=representation', body: { client_id: mainId, kind, body, ...(meta ? { meta } : {}) } }))[0];
    if (mailConfigured()) {
      const KIND = { renew: 'تجديد', plan: 'تغيير باقة', addon: 'تفعيل إضافة', branch: 'فرع جديد', suspended: 'حساب موقوف', contact: 'رسالة' };
      await sendMail({
        to: process.env.ADMIN_EMAIL || 'dmenu950@gmail.com', fromName: 'DEV MENU',
        subject: `طلب ${KIND[kind]}: ${store.name}`,
        text: `${store.name} (${store.client_slug})\n\n${body}\n\nرد عليه من لوحة المشتركين: ${SITE}/super-admin.html`
      }).catch(e => console.error('SUPPORT_MAIL', e.message));
    }
    return { request: row };
  }

  // ─── الإحصائيات ───
  // ─── اسأل عن أرقامك: مساعد صاحب المحل (البيجر، المنيو، آراء الزبائن) ───
  if (action === 'insights' && req.method === 'POST') {
    const { store } = await context(req);
    if (PLANS.isFree(store)) throw new ApiError(403, 'اسأل عن أرقامك متاح مع الاشتراك', 'FREE_PLAN');
    const question = str(b.question, 300, 'السؤال');
    if (!question) throw new ApiError(400, 'اكتب سؤالك');
    // 30 سؤال باليوم لكل محل (يكفي صاحب المحل، ويحمي التكلفة)
    const day = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 10);
    try {
      const row = (await rest(`menu_chat_devices?client_id=eq.${store.id}&device=eq.owner-insights&day=eq.${day}&select=used`))[0];
      if (row && row.used >= 30) throw new ApiError(429, 'سألت كثير اليوم 😅 كمّل بكرة', 'INSIGHTS_DAY');
      if (row) await rest(`menu_chat_devices?client_id=eq.${store.id}&device=eq.owner-insights&day=eq.${day}`, { method: 'PATCH', body: { used: row.used + 1 } });
      else await rest('menu_chat_devices', { method: 'POST', body: { client_id: store.id, device: 'owner-insights', day, used: 1 } });
    } catch (e) { if (e.code === 'INSIGHTS_DAY') throw e; }
    const hourOf = (iso) => new Date(Date.parse(iso) + 3 * 3600e3).getUTCHours();
    const dayOf = (iso) => new Date(Date.parse(iso) + 3 * 3600e3).toISOString().slice(0, 10);
    const minsBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / 6e4;
    const avg = (l) => l.length ? Math.round(l.reduce((x, y) => x + y, 0) / l.length * 10) / 10 : null;
    const data = { today: day, services: PLANS.featuresOf(store) };
    // البيجر: آخر 30 يوم، واليوم وأمس لحالهم
    if (PLANS.has(store, 'pager')) {
      const since = new Date(Date.now() - 30 * 864e5).toISOString();
      const base = `pager_tickets?client_id=eq.${store.id}&created_at=gte.${q(since)}&order=id.asc&limit=20000&select=created_at,ready_at,closed_at,status`;
      const rows = await rest(`${base},rating,rating_note`).catch(() => rest(base).catch(() => []));
      const sum = (list) => {
        const waits = list.filter(t => t.ready_at).map(t => minsBetween(t.created_at, t.ready_at)).filter(m => m >= 0 && m < 240);
        const hours = {}; list.forEach(t => { const h = hourOf(t.created_at); hours[h] = (hours[h] || 0) + 1; });
        const hw = {}; list.forEach(t => { if (!t.ready_at) return; const m = minsBetween(t.created_at, t.ready_at); if (m < 0 || m > 240) return; const h = hourOf(t.created_at); (hw[h] = hw[h] || []).push(m); });
        return { numbers: list.length, picked_up: list.filter(t => t.status === 'done').length, avg_wait_min: avg(waits), longest_wait_min: waits.length ? Math.round(Math.max(...waits)) : null,
          numbers_by_hour: hours, avg_wait_by_hour: Object.fromEntries(Object.entries(hw).map(([h, l]) => [h, avg(l)])) };
      };
      const yest = new Date(Date.parse(day) - 864e5).toISOString().slice(0, 10);
      const byDay = {}; rows.forEach(t => { const d = dayOf(t.created_at); byDay[d] = (byDay[d] || 0) + 1; });
      const rated = rows.filter(t => t.rating);
      data.pager = { last_30_days: sum(rows), today: sum(rows.filter(t => dayOf(t.created_at) === day)), yesterday: sum(rows.filter(t => dayOf(t.created_at) === yest)), numbers_per_day: byDay,
        ratings: { avg: avg(rated.map(t => t.rating)), count: rated.length, notes: rated.filter(t => t.rating_note).slice(-25).map(t => ({ stars: t.rating, note: String(t.rating_note).slice(0, 200), day: dayOf(t.created_at) })) } };
    }
    // المنيو: الزيارات وأكثر الأطباق مشاهدة (آخر 30 يوم)
    if (PLANS.has(store, 'menu')) {
      try {
        const m = await rpc('server_menu_stats', { p_client_id: store.id, p_days: 30 });
        data.menu = { period: 'last 30 days (not today only)', totals_last_30_days: m.totals, views_by_hour_last_30_days: m.hours, views_by_weekday_0_is_sunday: m.weekdays, top_dishes: (m.dishes || []).filter(d => d.views > 0).slice(0, 10).map(d => ({ name: d.name, views: d.views })),
          dishes_nobody_opened: (m.dishes || []).filter(d => !d.views).slice(0, 15).map(d => d.name) };
      } catch {}
    }
    const { ownerInsights } = require('../ai');
    return { reply: await ownerInsights({ storeName: store.name, data, question }) };
  }

  // ─── الباقة المجانية: أرقام البيجر هالشهر ───
  if (action === 'free-usage') {
    const { store } = await context(req);
    const start = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7) + '-01T00:00:00+03:00';
    const used = (await rest(`pager_tickets?client_id=eq.${store.id}&created_at=gte.${q(start)}&select=id&limit=${PLANS.FREE.pager}`).catch(() => [])).length;
    return { used, limit: PLANS.FREE.pager };
  }

  // ─── رصيد المساعد الذكي هالشهر ───
  // أكثر أسئلة زبائن المحل لمساعد المنيو (من ذاكرة الأسئلة: أول سؤال في كل محادثة، بدون أي بيانات عن الزبون)
  if (action === 'chat-top') {
    const { store } = await context(req);
    const month = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7);
    const [rows, use] = await Promise.all([
      rest(`menu_chat_faq?client_id=eq.${store.id}&hits=gte.1&select=question,answer,hits&order=hits.desc,updated_at.desc&limit=8`).catch(() => []),
      rest(`menu_chat_usage?client_id=eq.${store.id}&month=eq.${month}&select=used`).catch(() => [])
    ]);
    return { questions: rows.map(r => ({ q: r.question, a: r.answer || '', n: r.hits })), month_used: use[0] ? use[0].used : 0 };
  }

  if (action === 'chat-usage') {
    const { store } = await context(req);
    const month = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7);
    let used = 0;
    try { const r = (await rest(`menu_chat_usage?client_id=eq.${store.id}&month=eq.${month}&select=used`))[0]; used = r ? r.used : 0; } catch {}
    return { used, limit: store.subscription_status === 'trial' ? PLANS.CHAT.trial : PLANS.CHAT.month };
  }

  if (action === 'stats') {
    const { store } = await context(req);
    const days = Math.min(365, Math.max(1, int(req.query.days) || 30));
    return await rpc('server_menu_stats', { p_client_id: store.id, p_days: days });
  }

  // مفتاح إشعارات الجوال (لوحة التحكم تشترك فيه عشان يوصل صاحب المتجر «طلب جديد»)
  if (action === 'push-key' && req.method === 'GET') return { key: pushPublicKey() };
  return NEXT;
}

module.exports.post = async function post(action, req, b, env) {
  const { store, admin, here, sid, atBranch, notInPlan } = env;

  // ─── اختيار الباقة: صاحب المتجر يختار شهري أو سنوي، ويظهر الطلب في لوحة المشتركين ───
  if (action === 'plan-request') {
    const plan = ['month', 'year'].includes(b.plan) ? b.plan : null;
    if (!plan) throw new ApiError(400, 'اختر الباقة: شهري أو سنوي');
    const features = PLANS.clean(b.features && b.features.length ? b.features : PLANS.LEGACY);
    if (!features.length) throw new ApiError(400, 'اختر ميزة وحدة على الأقل');
    const mainId = store.parent_id || sid;   // اشتراك الفروع تابع للمتجر الرئيسي
    // في التجربة: الخدمات الجديدة تشتغل على طول (والمشترك يتعدل بعد الدفع من لوحة المشتركين)
    const cur = (await rest(`clients?id=eq.${mainId}&select=subscription_status,plan_features`))[0] || {};
    // بطاقة الولاء: لو انضافت للباقة تشتغل على طول (صاحب المحل يقدر يطفيها بعدين)
    const loyaltyOn = features.includes('loyalty') && !(cur.plan_features || []).includes('loyalty') ? { loyalty_enabled: true } : {};
    const live = cur.subscription_status === 'trial' ? { plan_features: features, waitlist_enabled: features.includes('waitlist'), ...loyaltyOn } : {};
    const main = (await rest(`clients?id=eq.${mainId}`, {
      method: 'PATCH', body: { ...live, requested_plan: plan, requested_features: features, plan_requested_at: new Date().toISOString() }, prefer: 'return=representation'
    }))[0];
    // الفروع: كل فرع يحتفظ بمميزاته الخاصة (فرع بدون منيو يبقى بدون منيو)، وياخذ من الحساب الولاء والرسائل
    if (live.plan_features) await followParentFeatures(mainId, features);
    if (!main) throw new ApiError(404, 'المتجر غير موجود');
    console.log('PLAN_REQUEST', mainId, plan);
    // تنبيه للإدارة بالبريد
    const to = process.env.ADMIN_EMAIL || 'dmenu950@gmail.com';
    if (mailConfigured()) {
      const label = plan === 'month' ? 'الشهرية' : 'السنوية';
      await sendMail({
        to, fromName: 'DEV MENU',
        subject: `طلب اشتراك: ${main.name} (الباقة ${label})`,
        text: `${main.name} (${main.client_slug}) اختار الباقة ${label}: ${features.map(k => PLANS.FEATURES[k].name).join('، ')} = ${PLANS.price(features, plan).total} ر.س.\nجوال: ${main.phone || '-'}\nبريد: ${main.email || '-'}\nفعّلها من لوحة المشتركين: ${SITE}/super-admin.html`
      }).catch(e => console.error('PLAN_MAIL', e.message));
    }
    return { requested_plan: plan, requested_features: features, plan_requested_at: main.plan_requested_at };
  }

  if (action === 'owner-push') {
    const sub = cleanSubscription(b.sub);
    if (!sub) throw new ApiError(400, 'اشتراك الإشعارات غير صالح');
    await rest('owner_push?on_conflict=endpoint', { method: 'POST', body: { client_id: sid, endpoint: sub.endpoint, sub }, prefer: 'resolution=merge-duplicates' });
    return { ok: true };
  }

  // ─── تعديل بيانات المتجر (حقول محددة فقط) ───
  if (action === 'update-store') {
    const p = {};
    const has = (k) => Object.prototype.hasOwnProperty.call(b, k);
    if (has('name')) { p.name = str(b.name, 80, 'الاسم'); if (!p.name) throw new ApiError(400, 'اكتب اسم المنشأة'); }
    if (has('promo_message')) p.promo_message = str(b.promo_message, 120, 'العرض');
    for (const k of ['website_url', 'tiktok_url', 'instagram_url', 'snapchat_url', 'location_url']) if (has(k)) p[k] = httpUrl(b[k], k);
    if (has('whatsapp_number')) p.whatsapp_number = waNumber(b.whatsapp_number);
    if (has('opening_hours')) p.opening_hours = str(b.opening_hours, 80, 'ساعات العمل');
    if (has('whatsapp_orders')) p.whatsapp_orders = b.whatsapp_orders === true;
    if (has('show_calories')) p.show_calories = b.show_calories !== false;
    if (has('menu_chat')) p.menu_chat = b.menu_chat === true;
    if (has('kiosk_call')) p.kiosk_call = b.kiosk_call === true;
    if (has('pager_car')) p.pager_car = b.pager_car === true;
    if (has('menu_order_mode')) {
      // الطلب من المنيو للكاشير: يحتاج المنيو في باقته
      const m = b.menu_order_mode ? 'table' : null;
      if (m && !PLANS.has(store, 'menu')) throw new ApiError(403, 'الطلب من المنيو يحتاج المنيو في باقتك', 'ADDON_OFF');
      p.menu_order_mode = m;
    }
    if (has('menu_order_opts')) {
      if (!PLANS.has(store, 'menu')) throw new ApiError(403, 'الطلب من المنيو يحتاج المنيو في باقتك', 'ADDON_OFF');
      p.menu_order_opts = require('../order').orderOpts(b.menu_order_opts);
    }
    if (has('pager_upsell')) {
      // الاقتراحات من أصناف المنيو: تحتاج المنيو والبيجر
      if (b.pager_upsell === true && (!PLANS.has(store, 'menu') || !PLANS.has(store, 'pager'))) throw new ApiError(403, '«أضف لطلبك» تحتاج المنيو والبيجر في باقتك', 'ADDON_OFF');
      p.pager_upsell = b.pager_upsell === true;
    }
    if (has('pager_chat')) {
      // المساعد يرد من المنيو ويُحسب من رصيد المساعد الذكي
      if (b.pager_chat === true && (!PLANS.has(store, 'menu') || !PLANS.has(store, 'chat'))) throw new ApiError(403, 'المساعد في صفحة الانتظار يحتاج المنيو والمساعد الذكي في باقتك', 'ADDON_OFF');
      p.pager_chat = b.pager_chat === true;
    }
    if (has('pager_game')) p.pager_game = b.pager_game !== false;
    if (has('pager_game_reward')) p.pager_game_reward = String(b.pager_game_reward || '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
    if (has('pager_quiz_need')) p.pager_quiz_need = Math.min(5, Math.max(3, int(b.pager_quiz_need) || 4));
    if (has('pager_game_moves')) p.pager_game_moves = Math.min(40, Math.max(10, int(b.pager_game_moves) || 20));
    if (has('pager_near_text')) p.pager_near_text = String(b.pager_near_text || '').replace(/\s+/g, ' ').trim().slice(0, 80) || null;
    if (has('menu_layout')) p.menu_layout = b.menu_layout === 'photos' ? 'photos' : 'list';
    if (has('google_review_url')) {
      const u = String(b.google_review_url || '').trim();
      if (u && !/^https:\/\/(g\.page|search\.google\.com|www\.google\.com|maps\.app\.goo\.gl|goo\.gl|maps\.google\.com|g\.co)\//i.test(u)) throw new ApiError(400, 'رابط تقييم قوقل لازم يكون من قوقل (مثل g.page/r/... أو maps.app.goo.gl)');
      p.google_review_url = u.slice(0, 500) || null;
    }
    if (has('currency')) {
      if (!Object.prototype.hasOwnProperty.call(CURRENCIES, b.currency)) throw new ApiError(400, 'العملة غير مدعومة');
      p.currency = b.currency;
    }
    if (has('delivery_apps')) {
      // كل تطبيق: نوعه من القائمة + رابط صفحة المطعم فيه (و"أخرى" يحتاج اسم)
      if (!Array.isArray(b.delivery_apps) || b.delivery_apps.length > 12) throw new ApiError(400, 'قائمة تطبيقات التوصيل غير صحيحة');
      const seen = new Set();
      p.delivery_apps = b.delivery_apps.map((d) => {
        if (!d || !DELIVERY.includes(d.app)) throw new ApiError(400, 'تطبيق توصيل غير معروف');
        const url = httpUrl(d.url, 'رابط التطبيق');
        if (!url) throw new ApiError(400, 'أضف رابط صفحتك في كل تطبيق توصيل مختار');
        const item = { app: d.app, url };
        if (d.app === 'other') {
          item.name = str(d.name, 30, 'اسم التطبيق');
          if (!item.name) throw new ApiError(400, 'اكتب اسم تطبيق التوصيل');
        } else if (seen.has(d.app)) {
          throw new ApiError(400, 'تطبيق التوصيل مكرر');
        }
        seen.add(d.app);
        return item;
      });
    }
    if (has('theme')) {
      if (!THEMES.includes(b.theme)) throw new ApiError(400, 'ثيم غير معروف');
      p.theme = b.theme;
    }
    if (has('accent_color')) {
      // null أو فاضي = بدون لون مخصص (يرجع للون الثيم)
      if (b.accent_color === null || b.accent_color === '') p.accent_color = null;
      else if (typeof b.accent_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(b.accent_color)) p.accent_color = b.accent_color.toLowerCase();
      else throw new ApiError(400, 'اللون لازم يكون بصيغة #RRGGBB');
    }
    if (has('order_numbers')) {
      if (!Array.isArray(b.order_numbers) || b.order_numbers.length > MAX_ORDER_NUMBERS) throw new ApiError(400, `أرقام الطلبات حدها ${MAX_ORDER_NUMBERS}`);
      p.order_numbers = b.order_numbers.map((n) => {
        if (!n || typeof n !== 'object') throw new ApiError(400, 'رقم طلبات غير صحيح');
        return { label: str(n.label, 40, 'عنوان الرقم'), phone: phoneNumber(n.phone) };
      });
    }
    // ترتيب أقسام صفحة الروابط والمخفي منها: مفاتيح معروفة بدون تكرار
    for (const k of ['links_order', 'links_hidden']) {
      if (!has(k)) continue;
      const o = b[k];
      if (o !== null && (!Array.isArray(o) || o.some(x => !LINKS_SECTIONS.includes(x)) || new Set(o).size !== o.length)) throw new ApiError(400, 'ترتيب غير صحيح');
      p[k] = o && o.length ? o : null;
    }
    if (has('custom_links')) {
      if (!Array.isArray(b.custom_links) || b.custom_links.length > MAX_CUSTOM_LINKS) throw new ApiError(400, `الروابط حدها ${MAX_CUSTOM_LINKS}`);
      p.custom_links = b.custom_links.map((l) => {
        if (!l || typeof l !== 'object') throw new ApiError(400, 'رابط غير صحيح');
        const title = str(l.title, 40, 'عنوان الرابط');
        if (!title) throw new ApiError(400, 'اكتب عنوان لكل رابط');
        const url = httpUrl(l.url, 'الرابط');
        if (!url) throw new ApiError(400, `أضف رابط صحيح لـ "${title}"`);
        return { title, url };
      });
    }
    if (has('occasions')) p.occasions = cleanOccasions(b.occasions, sid);
    if (has('business_type')) {
      if (!BUSINESS_TYPES.includes(b.business_type)) throw new ApiError(400, 'نوع نشاط غير صحيح');
      if (has('business_label') || b.business_type !== 'other') p.business_label = b.business_type === 'other' ? (str(b.business_label, 60, 'اسم النشاط') || null) : null;
      p.business_type = b.business_type;
    }
    for (const k of ['logo_url', 'bg_image_url', 'bg_video_url', 'links_bg_image_url', 'links_bg_video_url']) {
      if (!has(k)) continue;
      if (b[k] === null || b[k] === '') { p[k] = null; continue; }
      if (!ownsMediaUrl(b[k], sid)) throw new ApiError(400, 'ملف غير تابع لمتجرك');
      p[k] = b[k];
    }
    // طلبات واتساب ما تشتغل بدون رقم صالح
    const finalWa = has('whatsapp_number') ? p.whatsapp_number : store.whatsapp_number;
    if ((has('whatsapp_orders') ? p.whatsapp_orders : store.whatsapp_orders) && !finalWa) p.whatsapp_orders = false;
    if (!Object.keys(p).length) return { store };
    const saved = await patchStore(sid, p);
    // الشعار أو الاسم أو اللون تغيّر: بطاقات المحفظة (الولاء والنداء) تتحدث على طول بدل ما تنتظر الختم أو الرقم الجاي
    if (['logo_url', 'name', 'accent_color'].some(k => k in p && p[k] !== store[k])) later(refreshWalletCards(saved));
    return { store: saved };
  }

  // ─── إخفاء تنبيه الإدارة بعد قراءته ───
  if (action === 'notice-dismiss') {
    await patchStore(sid, { admin_notification: null });
    return { ok: true };
  }

  // ─── اسم فرع (من لوحة صاحب المتجر) ───
  if (action === 'branch-rename') {
    const id = int(b.id);
    const family = await familyOf(store);
    if (!family.some(f => f.id === id)) throw new ApiError(404, 'الفرع غير موجود');
    const name = str(b.name, 80, 'اسم الفرع');
    if (!name) throw new ApiError(400, 'اكتب اسم الفرع');
    await patchStore(id, { name });
    return { family: await familyOf(store) };
  }

  // ─── تغيير رابط المتجر (يصير النطاق الفرعي: slug.devmenu.digital) ───
  // الرابط القديم ينحفظ في old_slugs: المنيو يفتح منه، وما يقدر متجر ثاني ياخذه
  if (action === 'update-slug') {
    const slug = String(b.slug || '').trim().toLowerCase();
    if (!SLUG_RE.test(slug) || slug.includes('--')) {
      throw new ApiError(400, 'الرابط لازم يكون من 3 إلى 30 حرف: حروف إنجليزية صغيرة وأرقام وشرطة (-) في الوسط فقط', 'BAD_SLUG');
    }
    if (RESERVED_SLUGS.has(slug)) throw new ApiError(400, 'هذا الرابط محجوز، اختر اسم ثاني', 'RESERVED_SLUG');
    if (slug === store.client_slug) return { store };
    const taken = await rest(`clients?or=${q(`(client_slug.eq.${slug},old_slugs.cs.{${slug}})`)}&id=neq.${sid}&select=id&limit=1`);
    if (taken.length) throw new ApiError(409, 'هذا الرابط مستخدم لمتجر ثاني، اختر اسم ثاني', 'SLUG_TAKEN');
    const old = (Array.isArray(store.old_slugs) ? store.old_slugs : []).filter(s => s !== slug && s !== store.client_slug);
    if (old.length >= 20) throw new ApiError(400, 'غيّرت رابط متجرك مرات كثيرة. تواصل مع الدعم', 'SLUG_LIMIT');
    try {
      return { store: await patchStore(sid, { client_slug: slug, old_slugs: [...old, store.client_slug] }) };
    } catch (e) {
      if (e.code === '23505') throw new ApiError(409, 'هذا الرابط مستخدم لمتجر ثاني، اختر اسم ثاني', 'SLUG_TAKEN');
      throw e;
    }
  }

  // ─── رابط رفع ملف (الرفع يتم مباشرة للتخزين برابط موقّع صالح لملف واحد) ───
  if (action === 'upload-url') {
    const kind = b.kind;
    if (!['logo', 'bg_image', 'bg_video', 'links_bg_image', 'links_bg_video', 'prod', 'sticker', 'stamp', 'card_bg'].includes(kind)) throw new ApiError(400, 'نوع ملف غير صحيح');
    const isVideo = kind === 'bg_video' || kind === 'links_bg_video';
    const ext = (isVideo ? VIDEO_TYPES : IMAGE_TYPES)[b.type];
    if (!ext) throw new ApiError(400, isVideo ? 'الملف لازم يكون فيديو MP4' : 'صيغة الصورة غير مدعومة، استخدم JPG أو PNG أو WebP');
    const size = int(b.size);
    const maxMb = isVideo ? 30 : kind === 'sticker' || kind === 'stamp' ? 2 : 5;
    if (!Number.isInteger(size) || size <= 0 || size > maxMb * 1024 * 1024) throw new ApiError(400, `حجم الملف أكبر من المسموح (${maxMb} ميجا)`);
    const path = `${sid}/${kind}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const signed = await storage(`object/upload/sign/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, { body: {} });
    return { upload_url: `${SUPABASE_URL}/storage/v1${signed.url}`, public_url: publicUrl(path) };
  }
  return NEXT;
}
