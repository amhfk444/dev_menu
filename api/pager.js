// =====================================================================
// DEV MENU — البيجر الرقمي (صفحة العميل، بدون تسجيل دخول)
//   GET  /api/pager?action=info&slug=     اسم المتجر وشعاره
//   POST /api/pager?action=take            رقم جديد للعميل { slug } ← { token, number }
//   GET  /api/pager?action=status&slug=&t= حالة الرقم (waiting / ready / done / cancelled)
//   POST /api/pager?action=subscribe       اشتراك إشعارات الجوال للرقم { slug, t, sub }
//   POST /api/pager?action=ack             العميل شاف التنبيه ← يوقف تكرار الإشعار { slug, t }
//   POST /api/pager?action=invoice         العميل يكتب رقم فاتورته، ويطلع عند الموظف { slug, t, invoice }
//   POST /api/pager?action=rate            تقييم الزبون بعد الاستلام { slug, t, rating, note } ← رابط تقييم قوقل للراضين
// الكاشير يغيّر الحالة من /api/owner?action=pager-update
// =====================================================================
const crypto = require('crypto');
const PLANS = require('./_lib/plans');
const { reqLang, handler, rest, rpc, q, ApiError, readBody, findPublicStore, storeHasFeature, loyaltyHome, later, googleReviewLink } = require('./_lib/core');
const { pushPublicKey, cleanSubscription, sendPush } = require('./_lib/push');
const { topic, poke } = require('./_lib/live');
const { normalizeLoyalty } = require('./_lib/loyalty');
const { pagerReadyNotice } = require('./_lib/loyalty-assistant');
const SECTORS = require('./_lib/sectors');
const { riyadhDayStart } = require('./_lib/waitlist');
const wallet = require('./_lib/wallet');
// تحديث رقم المحفظة لما يجي دوره (يطلع إشعار من النظام)
async function walletReady(store, t) {
  if (!t.wallet_serial) return;
  const r = await wallet.updatePagerPass(t.wallet_serial, wallet.pagerStep({ store, number: t.number, step: 'ready', lang: t.lang, invoice: t.invoice_no }));
  console.log('PAGER_PASS', store.id, t.id, r);
}

// المحل الرئيسي للفرع: بطاقة النداء وحدة لكل الفروع (تنحفظ على المحل الرئيسي)
async function brandOf(store) {
  if (store._brand) return store._brand;
  const row = (await rest(`clients?id=eq.${store.id}&select=parent_id`).catch(() => []))[0] || {};
  return (store._brand = row.parent_id || store.id);
}

// بطاقة النداء (المحل اللي ما عنده ولاء): نربطها بالرقم ونحدّثها برقمه واسم الفرع. يرجّع البطاقة أو null
async function linkPagerCard(store, ticketToken, cardToken) {
  const pc = (await rest(`pager_cards?token=eq.${q(cardToken)}&client_id=eq.${await brandOf(store)}&select=id,wallet_serial,wallet_url,lang,branch_ids`).catch(() => []))[0];
  if (!pc || !pc.wallet_serial || !pc.wallet_url) return null;   // ما عادت شغالة (انلغت أو انحذفت)
  if ((await loyaltyOf(store.id)).enabled) return undefined;      // محل الولاء: النداء من بطاقة الولاء
  const t = (await rest(`pager_tickets?token=eq.${q(ticketToken)}&client_id=eq.${store.id}`, { method: 'PATCH', prefer: 'return=representation', body: { wallet_serial: pc.wallet_serial, wallet_url: pc.wallet_url } }))[0];
  if (!t) return null;
  // الفرع ينضاف لفروع البطاقة (عشان رسائل زبائن الفرع توصله)
  const branches = (pc.branch_ids || []).map(Number);
  await rest(`pager_cards?id=eq.${pc.id}`, { method: 'PATCH', body: { last_used_at: new Date().toISOString(), ...(branches.includes(store.id) ? {} : { branch_ids: [...branches, store.id] }) } }).catch(() => {});
  // رقمه الجديد في البطاقة بصمت (الإشعار الوحيد "طلبك جاهز"، شوف wallet.updatePagerPass)
  later(wallet.updatePagerPass(pc.wallet_serial, wallet.pagerStep({ store, number: t.number, step: t.status, lang: t.lang || pc.lang, invoice: t.invoice_no }))
    .then(async r => {
      await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { wallet_error: `link ${r}` } });
      // البطاقة انلغت عند شركة المحفظة: نفكها عن الزبون عشان يقدر يضيف وحدة جديدة
      if (/^404\b/.test(r)) await rest(`pager_cards?id=eq.${pc.id}`, { method: 'PATCH', body: { wallet_serial: null, wallet_url: null } });
    }));
  return pc;
}

// بطاقة الولاء في المحل: شغالة؟ وتختم مع البيجر؟
async function loyaltyOf(branchId) {
  const storeId = await loyaltyHome(branchId);   // الولاء على المحل الرئيسي
  const x = (await rest(`clients?id=eq.${storeId}&select=loyalty_enabled,loyalty_settings`).catch(() => []))[0] || {};
  const st = normalizeLoyalty(x.loyalty_settings);
  const entitled = await storeHasFeature(storeId, 'loyalty');
  return { enabled: entitled && x.loyalty_enabled === true && st.pager_stamp, reward: st.reward, reward_en: st.reward_en, needed: st.needed };
}

const TOKEN_RE = /^[A-Za-z0-9_-]{10,64}$/;
// رقم الفاتورة: الأرقام العربية تتحول، والمسموح أرقام وحروف إنجليزية
function cleanInvoice(v) {
  const invoice = String(v ?? '').trim().replace(/\s+/g, '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) & 15));
  if (invoice && !/^[A-Za-z0-9#\-_/]{1,20}$/.test(invoice)) throw new ApiError(400, 'رقم الفاتورة: أرقام وحروف إنجليزية فقط');
  return invoice;
}
// بطاقة الولاء المربوطة بالرقم: في المحفظة؟ وعنده مكافأة جاهزة؟ (تطلع للعميل وللموظف)
async function linkedCard(branchId, cardId) {
  if (!cardId) return { wallet: false, reward_ready: false };
  const storeId = await loyaltyHome(branchId);
  const c = (await rest(`loyalty_cards?id=eq.${cardId}&select=stamps,wallet_serial,wallet_error,wallet_platform`).catch(() => []))[0] || {};
  const x = (await rest(`clients?id=eq.${storeId}&select=loyalty_settings`).catch(() => []))[0] || {};
  const gifts = await rest(`loyalty_gifts?to_card=eq.${cardId}&status=eq.claimed&expires_at=gt.${q(new Date().toISOString())}&select=code&limit=1`).catch(() => []);
  return { wallet: !!c.wallet_serial && !wallet.passRemoved(c.wallet_error, c.wallet_platform), wallet_removed: !!c.wallet_serial && wallet.passRemoved(c.wallet_error, c.wallet_platform), reward_ready: (c.stamps || 0) >= normalizeLoyalty(x.loyalty_settings).needed || gifts.length > 0 };
}
// رابط تقييم المحل في قوقل ماب، وحساباته في التواصل (تطلع للزبون بعد ما يستلم)
async function afterPickup(store) {
  const x = (await rest(`clients?id=eq.${store.id}&select=google_review_url,location_url,instagram_url,tiktok_url,snapchat_url,website_url`).catch(() => []))[0] || {};
  const https = (u) => /^https:\/\/[^\s"'<>]+$/i.test(String(u || '')) ? u : null;
  const social = store.free ? {} : Object.fromEntries(['instagram', 'tiktok', 'snapchat', 'website'].map(k => [k, https(x[`${k}_url`])]).filter(([, u]) => u));
  return { review: googleReviewLink(x), social };
}
async function reviewUrl(storeId) {
  return googleReviewLink((await rest(`clients?id=eq.${storeId}&select=google_review_url,location_url`).catch(() => []))[0]);
}
// محل التجربة في الصفحة التعريفية: الرقم يجهز تلقائياً بعد ثواني عشان الزائر يجرب الرنّة بنفسه
const DEMO = new Set(['bistrobella']);
// بدون بطاقة نداء: 25 ثانية (وقت يضيفها لو حب)، ومع البطاقة: 10 ثواني من إضافتها، عشان يشوف إشعار المحفظة يوصله
const DEMO_AFTER = 25e3, DEMO_AFTER_CARD = 10e3;
async function demoRing(store, token) {
  const rows = await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&status=eq.waiting`, { method: 'PATCH', prefer: 'return=representation',
    body: { status: 'ready', ready_at: new Date().toISOString(), ring_count: 1, last_ring_at: new Date().toISOString() } }).catch(() => []);
  const t = rows[0];
  if (!t) return;
  const T = SECTORS.terms(store);
  if (t.loyalty_card_id) await pagerReadyNotice(await loyaltyHome(store.id), t.loyalty_card_id, t.number, store.name, T);
  await walletReady(store, t).catch(() => {});
  if (t.push_sub) await sendPush(t.push_sub, { title: `🔔 ${T.ready} رقم ${t.number}`, body: `هذي تجربة من DEV MENU، كذا يوصل التنبيه لزبونك`, url: `https://${store.client_slug}.devmenu.digital/pager`, tag: `pager-${t.id}-1` }).catch(() => {});
  await poke([topic('pager', store.id), topic('ticket', token)]);
}

const SLUG_OK = /^[a-z0-9-]{2,63}$/i;
const CAR_COLORS = ['أبيض', 'أسود', 'فضي', 'رمادي', 'أحمر', 'أزرق', 'بني', 'بيج', 'أخضر', 'ذهبي'];
// سيارة الزبون: اللون من القائمة، والنوع نص قصير، وآخر 4 أرقام من اللوحة (اختيارية). null لو ما فيها لون ولا نوع
function cleanCar(b) {
  b = b || {};
  const color = CAR_COLORS.includes(b.color) ? b.color : null;
  const model = String(b.model || '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 24) || null;
  const plate = String(b.plate || '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) & 15)).replace(/\D/g, '').slice(0, 4) || null;
  return color || model ? { color, model, plate } : null;
}

async function loadStore(slug) {
  let { store, bad } = await findPublicStore(slug, 'id,name,client_slug,logo_url,business_type,accent_color');
  if (bad) throw new ApiError(400, 'الرابط غير صحيح');
  // المحل اللي انتهت تجربته ما يطلع في public_clients، بس لو هو على البيجر المجاني يكمل يشتغل
  if (!store && SLUG_OK.test(String(slug || ''))) {
    const row = (await rest(`clients?client_slug=eq.${q(String(slug).toLowerCase())}&select=id,name,client_slug,logo_url,business_type,accent_color,subscription_status,plan_features,parent_id,is_active,trial_ends_at`).catch(() => []))[0];
    if (row && PLANS.isFree(row)) store = row;
  }
  if (!store) throw new ApiError(404, 'البيجر غير متاح حالياً', 'NOT_AVAILABLE');
  if (!(await storeHasFeature(store.id, 'pager'))) throw new ApiError(404, 'البيجر غير متاح حالياً', 'NOT_AVAILABLE');
  // الباقة المجانية: البيجر الأساسي بس (بدون بطاقة النداء)
  const plan = (await rest(`clients?id=eq.${store.id}&select=subscription_status,plan_features,parent_id,is_active,trial_ends_at,subscription_end_date`))[0];
  store.free = PLANS.pagerLite(plan);   // الباقة المجانية، أو البيجر المجاني المضاف لمشترك
  // الاسم اللي يشوفه الزبون في صفحة البيجر: الفرع ياخذ اسم المحل الرئيسي (ماندولين، مو "ماندولين فرع بيش")
  store.display_name = store.name;
  if (plan && plan.parent_id) {
    const root = (await rest(`clients?id=eq.${Number(plan.parent_id)}&select=name`).catch(() => []))[0];
    if (root && root.name) store.display_name = root.name;
  }
  return store;
}
// أرقام المحل هالشهر (بتوقيت الرياض)
async function monthTickets(storeId, limit) {
  const start = new Date(Date.now() + 3 * 3600e3).toISOString().slice(0, 7) + '-01T00:00:00+03:00';
  return (await rest(`pager_tickets?client_id=eq.${storeId}&created_at=gte.${q(start)}&select=id&limit=${limit}`).catch(() => [])).length;
}

module.exports = handler(['GET', 'POST'], async (req, res) => {
  const action = req.query.action;
  const b = req.method === 'POST' ? readBody(req) : {};

  if (action === 'info' && req.method === 'GET') {
    const store = await loadStore(req.query.slug);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');   // بيانات المحل العامة: تتخزن 30 ثانية في CDN
    const full = store.free && (await monthTickets(store.id, PLANS.FREE.pager)) >= PLANS.FREE.pager;   // البيجر المجاني خلّص عدده
    // بطاقة النداء تنعرض قبل أخذ الرقم (المحل اللي ما عنده ولاء)
    const card = wallet.configured() && !store.free && !(await wallet.cardMaintenance()) && !(await loyaltyOf(store.id)).enabled;
    const car = (await rest(`clients?id=eq.${store.id}&select=pager_car`).catch(() => []))[0]?.pager_car === true;   // خطوة السيارة قبل الرقم
    return { store: { name: store.display_name || store.name, logo_url: store.logo_url, business_type: store.business_type, accent_color: store.accent_color || null }, push_key: pushPublicKey(), brand: await brandOf(store), card, car, ...(full ? { full: true } : {}) };
  }

  // بطاقة النداء المحفوظة في جواله: شغالة؟ (لو انلغت أو انحذفت، الصفحة تعرض عليه يضيف وحدة جديدة)
  if (action === 'card' && req.method === 'GET') {
    const store = await loadStore(req.query.slug);
    const pc = String(req.query.pc || '');
    if (!TOKEN_RE.test(pc)) return { ok: false };
    const row = (await rest(`pager_cards?token=eq.${q(pc)}&client_id=eq.${await brandOf(store)}&select=wallet_url`).catch(() => null));
    return { ok: row === null ? true : !!(row[0] && row[0].wallet_url) };   // خطأ في القراءة: نفترض إنها شغالة
  }

  if (action === 'take' && req.method === 'POST') {
    const store = await loadStore(b.slug);
    // المجانية: 200 رقم بالشهر. الزبون ما يشوف إن فيه حد، بس يطلب من الموظف
    if (store.free && (await monthTickets(store.id, PLANS.FREE.pager)) >= PLANS.FREE.pager) throw new ApiError(409, 'البيجر متوقف مؤقتاً، تفضّل عند الكاشير وبيبلغك أول ما يجهز طلبك.', 'FREE_FULL');
    const invoice = cleanInvoice(b.invoice);
    if (invoice && (await rest(`pager_tickets?client_id=eq.${store.id}&invoice_no=eq.${q(invoice)}&created_at=gte.${q(riyadhDayStart())}&status=in.(waiting,ready)&select=number&limit=1`)).length) throw new ApiError(409, 'هذي الفاتورة مسجلة على رقم ثاني، تأكد من الرقم', 'DUPLICATE');
    const token = crypto.randomBytes(18).toString('base64url');
    try {
      const res = await rpc('server_pager_take', { p_client_id: store.id, p_token: token });
      const car = cleanCar(b.car);
      if (invoice || car) await rest(`pager_tickets?token=eq.${q(res.token)}&client_id=eq.${store.id}`, { method: 'PATCH', body: { ...(invoice ? { invoice_no: invoice } : {}), ...(car ? { car } : {}) } }).catch(() => {});
      if (reqLang(req) === 'en') await rest(`pager_tickets?token=eq.${q(res.token)}&client_id=eq.${store.id}`, { method: 'PATCH', body: { lang: 'en' } }).catch(() => {});
      // عنده بطاقة ولاء في نفس الجوال: نربطها برقم البيجر، وينختم لما يجهز الطلب
      if (/^[A-Za-z0-9_-]{10,64}$/.test(String(b.lt || ''))) {
        const home = await loyaltyHome(store.id);
        const card = (await rest(`loyalty_cards?token=eq.${q(b.lt)}&client_id=eq.${home}&select=id,wallet_serial`).catch(() => []))[0];
        if (card) await rest(`pager_tickets?token=eq.${q(res.token)}&client_id=eq.${store.id}`, { method: 'PATCH', body: { loyalty_card_id: card.id } }).catch(() => {});
      }
      // عنده بطاقة نداء من زيارة سابقة: نربطها بالرقم الجديد وتتحدث برقمه
      // card_ok: false = البطاقة المحفوظة في جواله ما عادت شغالة، والصفحة تعرض عليه يضيف وحدة جديدة
      const linked = TOKEN_RE.test(String(b.pc || '')) ? await linkPagerCard(store, res.token, b.pc).catch(e => { console.error('PAGER_CARD', e.message); return null; }) : undefined;
      await poke(topic('pager', store.id));
      return { token: res.token, number: res.number, ...(linked === null ? { card_ok: false } : {}), store: { name: store.display_name || store.name, logo_url: store.logo_url, accent_color: store.accent_color || null } };
    } catch (e) {
      if (String(e.dbMessage || e.message).includes('PAGER_FULL')) throw new ApiError(409, 'وصلنا الحد اليومي للأرقام', 'FULL');
      throw e;
    }
  }

  if (action === 'status' && req.method === 'GET') {
    const store = await loadStore(req.query.slug);
    const token = String(req.query.t || '');
    if (!TOKEN_RE.test(token)) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    const sel = `pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&select=number,status,created_at,ready_at`;
    const t = (await rest(`${sel},invoice_no,loyalty_card_id,loyalty_stamped,wallet_url,wallet_serial,wallet_error,car`).catch(() => rest(`${sel},invoice_no,loyalty_card_id,loyalty_stamped,wallet_url,wallet_serial,wallet_error`)).catch(() => rest(`${sel},invoice_no`)).catch(() => rest(sel)))[0];
    if (!t) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    if (DEMO.has(store.client_slug) && t.status === 'waiting' && Date.now() - Date.parse(t.created_at) > (t.wallet_url ? DEMO_AFTER_CARD : DEMO_AFTER)) {
      await demoRing(store, token);
      t.status = 'ready'; t.ready_at = new Date().toISOString();
    }
    // رقم من يوم سابق ما زال ينتظر = منتهي
    const stale = t.status === 'waiting' && Date.now() - Date.parse(t.created_at) > 18 * 3600e3;
    const { review = null, social = {} } = ['ready', 'done'].includes(t.status) ? await afterPickup(store) : {};
    // البطاقة المربوطة انحذفت من محفظته (آخر تحديث وصل لـ 0 جوال): نعرض عليه يضيفها من جديد
    const card_gone = !!t.wallet_url && wallet.passRemoved(t.wallet_error)
      && ((await rest(`pager_cards?wallet_serial=eq.${q(t.wallet_serial || '')}&select=platform`).catch(() => []))[0] || {}).platform !== 'google';
    // تسليم الطلب للسيارة: صاحب المحل مشغّله، فنسأل الزبون عن سيارته
    const car_ask = t.status === 'waiting' && ((await rest(`clients?id=eq.${store.id}&select=pager_car`).catch(() => []))[0] || {}).pager_car === true;
    return { demo: DEMO.has(store.client_slug), wallet: wallet.configured() && !store.free && !(await wallet.cardMaintenance()), in_wallet: !!t.wallet_url && !card_gone, card_gone, car_ask, car: t.car || null, review_url: review, social, store: { name: store.display_name || store.name, logo_url: store.logo_url, business_type: store.business_type, accent_color: store.accent_color || null }, ticket: { number: t.number, status: stale ? 'expired' : t.status, ready_at: t.ready_at, invoice_no: t.invoice_no || null }, live: topic('ticket', token),
      loyalty: { ...(await loyaltyOf(store.id)), linked: !!t.loyalty_card_id, stamped: !!t.loyalty_stamped,
        ...(await linkedCard(store.id, t.loyalty_card_id)) } };
  }

  if (action === 'subscribe' && req.method === 'POST') {
    const store = await loadStore(b.slug);
    const token = String(b.t || '');
    if (!TOKEN_RE.test(token)) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    const sub = cleanSubscription(b.sub);
    if (!sub) throw new ApiError(400, 'اشتراك الإشعارات غير صالح');
    const rows = await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&status=in.(waiting,ready)`,
      { method: 'PATCH', body: { push_sub: sub }, prefer: 'return=representation' });
    if (!rows.length) throw new ApiError(404, 'الرقم غير موجود أو انتهى', 'NOT_FOUND');
    console.log('PAGER_SUBSCRIBED', store.id, new URL(sub.endpoint).host);
    await poke(topic('pager', store.id));
    return { ok: true };
  }

  if (action === 'ack' && req.method === 'POST') {
    const store = await loadStore(b.slug);
    const token = String(b.t || '');
    if (!TOKEN_RE.test(token)) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&status=eq.ready&acked_at=is.null`,
      { method: 'PATCH', body: { acked_at: new Date().toISOString() } }).catch(() => {});
    await poke(topic('pager', store.id));
    return { ok: true };
  }

  // ─── بطاقة النداء: وحدة للزبون في المحل، تنعاد مع كل رقم ───
  if (action === 'wallet' && req.method === 'POST') {
    const store = await loadStore(b.slug);
    const token = String(b.t || '');
    // قبل أخذ الرقم: بطاقة فاضية ("—")، وتتحدث برقمه أول ما ياخذه
    if (!token && b.pre) {
      if ((await loyaltyOf(store.id)).enabled) throw new ApiError(409, 'سجّل في بطاقة الولاء ويوصلك النداء منها', 'USE_LOYALTY');
      if (store.free) throw new ApiError(409, 'بطاقة النداء مو متاحة الحين', 'NO_CARD');
      const lang = reqLang(req) === 'en' ? 'en' : null;
      const pc = TOKEN_RE.test(String(b.pc || '')) ? (await rest(`pager_cards?token=eq.${q(b.pc)}&client_id=eq.${await brandOf(store)}&select=wallet_url`).catch(() => []))[0] : null;
      if (pc && pc.wallet_url) return { url: pc.wallet_url, card: b.pc };
      const notice = 'خذ رقمك من البيجر، ويوصلك هنا إشعار لما يجهز طلبك';
      const pass = await wallet.createPagerPass({ ...wallet.pagerStep({ store, step: 'idle', lang }), status: 'خذ رقمك من البيجر', notice });
      const card = crypto.randomBytes(18).toString('base64url');
      await rest('pager_cards', { method: 'POST', body: { client_id: await brandOf(store), token: card, wallet_serial: pass.serialNumber, wallet_url: pass.shareUrl, platform: wallet.walletPlatform(req), lang, branch_ids: [store.id], last_notice: notice } });
      return { url: pass.shareUrl, card };
    }
    if (!TOKEN_RE.test(token)) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    const t = (await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&status=in.(waiting,ready)&select=id,number,status,wallet_url,lang,invoice_no`))[0];
    if (!t) throw new ApiError(404, 'الرقم غير موجود أو انتهى', 'NOT_FOUND');
    // المحل المشترك في الولاء: النداء يوصل من بطاقة الولاء، فما فيه بطاقة نداء
    if ((await loyaltyOf(store.id)).enabled) throw new ApiError(409, 'سجّل في بطاقة الولاء ويوصلك النداء منها', 'USE_LOYALTY');
    if (store.free) throw new ApiError(409, 'بطاقة النداء مو متاحة الحين', 'NO_CARD');
    const pc = TOKEN_RE.test(String(b.pc || '')) ? await linkPagerCard(store, token, b.pc) : null;
    if (pc && DEMO.has(store.client_slug)) await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { created_at: new Date().toISOString() } }).catch(() => {});
    if (pc) return { url: pc.wallet_url, card: b.pc };
    if (t.wallet_url) return { url: t.wallet_url };
    const step = wallet.pagerStep({ store, number: t.number, step: t.status, lang: t.lang, invoice: t.invoice_no });
    const pass = await wallet.createPagerPass(step);
    const card = crypto.randomBytes(18).toString('base64url');
    await rest('pager_cards', { method: 'POST', body: { client_id: await brandOf(store), token: card, wallet_serial: pass.serialNumber, wallet_url: pass.shareUrl, platform: wallet.walletPlatform(req), lang: t.lang || null, branch_ids: [store.id], last_notice: step.notice } });
    await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { wallet_serial: pass.serialNumber, wallet_url: pass.shareUrl, ...(DEMO.has(store.client_slug) ? { created_at: new Date().toISOString() } : {}) } });
    return { url: pass.shareUrl, card };
  }

  // ─── العميل يكتب رقم فاتورته (الموظف يشوفه على شاشته على طول) ───
  // ─── تسليم الطلب للسيارة: لون السيارة ونوعها وآخر أرقام اللوحة ───
  if (action === 'car' && req.method === 'POST') {
    const store = await loadStore(b.slug);
    const token = String(b.t || '');
    if (!TOKEN_RE.test(token)) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    const car = cleanCar(b);
    if (!car) throw new ApiError(400, 'اختر لون سيارتك أو اكتب نوعها');
    const t = (await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&status=in.(waiting,ready)&select=id`))[0];
    if (!t) throw new ApiError(404, 'الرقم غير موجود أو انتهى', 'NOT_FOUND');
    await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { car } });
    await poke([topic('pager', store.id), topic('ticket', token)]);
    return { car };
  }

  if (action === 'invoice' && req.method === 'POST') {
    const store = await loadStore(b.slug);
    const token = String(b.t || '');
    if (!TOKEN_RE.test(token)) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    const invoice = cleanInvoice(b.invoice);
    const t = (await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&status=in.(waiting,ready)&select=id,number,status,lang,wallet_serial`))[0];
    if (!t) throw new ApiError(404, 'الرقم غير موجود أو انتهى', 'NOT_FOUND');
    if (invoice) {
      const dup = await rest(`pager_tickets?client_id=eq.${store.id}&invoice_no=eq.${q(invoice)}&id=neq.${t.id}&created_at=gte.${q(riyadhDayStart())}&status=in.(waiting,ready)&select=number&limit=1`);
      if (dup.length) throw new ApiError(409, 'هذي الفاتورة مسجلة على رقم ثاني، تأكد من الرقم', 'DUPLICATE');
    }
    await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { invoice_no: invoice || null } });
    // رقم الفاتورة في بطاقة النداء (بصمت)
    if (t.wallet_serial) later(wallet.updatePagerPass(t.wallet_serial, { ...wallet.pagerStep({ store, number: t.number, step: t.status, lang: t.lang, invoice }), silent: true }));
    await poke([topic('pager', store.id), topic('ticket', token)]);
    return { invoice_no: invoice || null };
  }

  // ─── تقييم الزبون بعد الاستلام: الراضي (4-5) نعطيه رابط تقييم المحل في قوقل ───
  if (action === 'rate' && req.method === 'POST') {
    const store = await loadStore(b.slug);
    const token = String(b.t || '');
    if (!TOKEN_RE.test(token)) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    const rating = parseInt(b.rating, 10);
    if (!(rating >= 1 && rating <= 5)) throw new ApiError(400, 'اختر من 1 إلى 5 نجوم');
    const note = String(b.note || '').trim().slice(0, 300) || null;
    const body = note && b.note_only ? { rating_note: note } : { rating, rating_note: note, rated_at: new Date().toISOString() };
    const filter = b.note_only ? '&rating=not.is.null' : '&rating=is.null';
    const rows = await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&status=in.(ready,done)${filter}`, { method: 'PATCH', body, prefer: 'return=representation' }).catch(() => []);
    if (!rows.length) return { ok: false };
    // الزبون ضغط "استلمت": نوقف الرنين بس. الرقم يظل عند الكاشير لين يضغط "استلم" (وهو اللي يعطي ختم الولاء)
    await rest(`pager_tickets?id=eq.${rows[0].id}&status=eq.ready`, { method: 'PATCH', body: { push_sub: null } }).catch(() => {});
    // ضغط "استلمت" قبل الكاشير: بطاقة النداء ترجع "بالعافية"
    if (rows[0].wallet_serial && rows[0].status === 'ready') later(wallet.endPagerPass(rows[0].wallet_serial, rows[0].id, wallet.pagerStep({ store, step: 'idle', lang: rows[0].lang })));
    await poke(topic('pager', store.id));
    return { ok: true, google: rating >= 4 ? await reviewUrl(store.id) : null };
  }

  throw new ApiError(404, 'هذا الطلب غير معروف، حدّث الصفحة وحاول مرة ثانية', 'UNKNOWN');
});
