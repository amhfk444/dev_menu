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
const { reqLang, handler, rest, rpc, q, ApiError, readBody, findPublicStore, storeHasFeature, loyaltyHome, later } = require('./_lib/core');
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
  const r = await wallet.updatePagerPass(t.wallet_serial, wallet.pagerStep({ store, number: t.number, step: 'ready', lang: t.lang }));
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
  if (!pc || !pc.wallet_serial || (await loyaltyOf(store.id)).enabled) return null;
  const t = (await rest(`pager_tickets?token=eq.${q(ticketToken)}&client_id=eq.${store.id}`, { method: 'PATCH', prefer: 'return=representation', body: { wallet_serial: pc.wallet_serial, wallet_url: pc.wallet_url } }))[0];
  if (!t) return null;
  // الفرع ينضاف لفروع البطاقة (عشان رسائل زبائن الفرع توصله)
  const branches = (pc.branch_ids || []).map(Number);
  await rest(`pager_cards?id=eq.${pc.id}`, { method: 'PATCH', body: { last_used_at: new Date().toISOString(), ...(branches.includes(store.id) ? {} : { branch_ids: [...branches, store.id] }) } }).catch(() => {});
  later(wallet.updatePagerPass(pc.wallet_serial, wallet.pagerStep({ store, number: t.number, step: t.status, lang: t.lang || pc.lang }))
    .then(r => rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { wallet_error: `link ${r}` } })));
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
// بطاقة الولاء المربوطة بالرقم: في المحفظة؟ وعنده مكافأة جاهزة؟ (تطلع للعميل وللموظف)
async function linkedCard(branchId, cardId) {
  if (!cardId) return { wallet: false, reward_ready: false };
  const storeId = await loyaltyHome(branchId);
  const c = (await rest(`loyalty_cards?id=eq.${cardId}&select=stamps,wallet_serial`).catch(() => []))[0] || {};
  const x = (await rest(`clients?id=eq.${storeId}&select=loyalty_settings`).catch(() => []))[0] || {};
  const gifts = await rest(`loyalty_gifts?to_card=eq.${cardId}&status=eq.claimed&expires_at=gt.${q(new Date().toISOString())}&select=code&limit=1`).catch(() => []);
  return { wallet: !!c.wallet_serial, reward_ready: (c.stamps || 0) >= normalizeLoyalty(x.loyalty_settings).needed || gifts.length > 0 };
}
// رابط تقييم المحل في قوقل ماب: رابط "اكتب تقييم" لو حطه، وإلا رابط موقعه في قوقل ماب
const GOOGLE_RE = /^https:\/\/(g\.page|search\.google\.com|www\.google\.com|maps\.app\.goo\.gl|goo\.gl|maps\.google\.com|g\.co)\//i;
async function reviewUrl(storeId) {
  const x = (await rest(`clients?id=eq.${storeId}&select=google_review_url,location_url`).catch(() => []))[0] || {};
  return [x.google_review_url, x.location_url].find(u => u && GOOGLE_RE.test(u) && u.length < 500) || null;
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

async function loadStore(slug) {
  const { store, bad } = await findPublicStore(slug, 'id,name,client_slug,logo_url,business_type,accent_color');
  if (bad) throw new ApiError(400, 'الرابط غير صحيح');
  if (!store) throw new ApiError(404, 'البيجر غير متاح حالياً', 'NOT_AVAILABLE');
  if (!(await storeHasFeature(store.id, 'pager'))) throw new ApiError(404, 'البيجر غير متاح حالياً', 'NOT_AVAILABLE');
  return store;
}

module.exports = handler(['GET', 'POST'], async (req, res) => {
  const action = req.query.action;
  const b = req.method === 'POST' ? readBody(req) : {};

  if (action === 'info' && req.method === 'GET') {
    const store = await loadStore(req.query.slug);
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=30, stale-while-revalidate=300');   // بيانات المحل العامة: تتخزن 30 ثانية في CDN
    return { store: { name: store.name, logo_url: store.logo_url, business_type: store.business_type, accent_color: store.accent_color || null }, push_key: pushPublicKey(), brand: await brandOf(store) };
  }

  if (action === 'take' && req.method === 'POST') {
    const store = await loadStore(b.slug);
    const token = crypto.randomBytes(18).toString('base64url');
    try {
      const res = await rpc('server_pager_take', { p_client_id: store.id, p_token: token });
      if (reqLang(req) === 'en') await rest(`pager_tickets?token=eq.${q(res.token)}&client_id=eq.${store.id}`, { method: 'PATCH', body: { lang: 'en' } }).catch(() => {});
      // عنده بطاقة ولاء في نفس الجوال: نربطها برقم البيجر، وينختم لما يجهز الطلب
      if (/^[A-Za-z0-9_-]{10,64}$/.test(String(b.lt || ''))) {
        const card = (await rest(`loyalty_cards?token=eq.${q(b.lt)}&client_id=eq.${await loyaltyHome(store.id)}&select=id`).catch(() => []))[0];
        if (card) await rest(`pager_tickets?token=eq.${q(res.token)}&client_id=eq.${store.id}`, { method: 'PATCH', body: { loyalty_card_id: card.id } }).catch(() => {});
      }
      // عنده بطاقة نداء من زيارة سابقة: نربطها بالرقم الجديد وتتحدث برقمه
      if (TOKEN_RE.test(String(b.pc || ''))) await linkPagerCard(store, res.token, b.pc).catch(e => console.error('PAGER_CARD', e.message));
      await poke(topic('pager', store.id));
      return { token: res.token, number: res.number, store: { name: store.name, logo_url: store.logo_url, accent_color: store.accent_color || null } };
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
    const t = (await rest(`${sel},invoice_no,loyalty_card_id,loyalty_stamped,wallet_url`).catch(() => rest(`${sel},invoice_no`)).catch(() => rest(sel)))[0];
    if (!t) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    if (DEMO.has(store.client_slug) && t.status === 'waiting' && Date.now() - Date.parse(t.created_at) > (t.wallet_url ? DEMO_AFTER_CARD : DEMO_AFTER)) {
      await demoRing(store, token);
      t.status = 'ready'; t.ready_at = new Date().toISOString();
    }
    // رقم من يوم سابق ما زال ينتظر = منتهي
    const stale = t.status === 'waiting' && Date.now() - Date.parse(t.created_at) > 18 * 3600e3;
    const review = ['ready', 'done'].includes(t.status) ? await reviewUrl(store.id) : null;
    return { demo: DEMO.has(store.client_slug), wallet: wallet.configured(), in_wallet: !!t.wallet_url, review_url: review, store: { name: store.name, logo_url: store.logo_url, business_type: store.business_type, accent_color: store.accent_color || null }, ticket: { number: t.number, status: stale ? 'expired' : t.status, ready_at: t.ready_at, invoice_no: t.invoice_no || null }, live: topic('ticket', token),
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
    if (!TOKEN_RE.test(token)) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    const t = (await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&status=in.(waiting,ready)&select=id,number,status,wallet_url,lang`))[0];
    if (!t) throw new ApiError(404, 'الرقم غير موجود أو انتهى', 'NOT_FOUND');
    // المحل المشترك في الولاء: النداء يوصل من بطاقة الولاء، فما فيه بطاقة نداء
    if ((await loyaltyOf(store.id)).enabled) throw new ApiError(409, 'سجّل في بطاقة الولاء ويوصلك النداء منها', 'USE_LOYALTY');
    const pc = TOKEN_RE.test(String(b.pc || '')) ? await linkPagerCard(store, token, b.pc) : null;
    if (pc && DEMO.has(store.client_slug)) await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { created_at: new Date().toISOString() } }).catch(() => {});
    if (pc) return { url: pc.wallet_url, card: b.pc };
    if (t.wallet_url) return { url: t.wallet_url };
    const pass = await wallet.createPagerPass(wallet.pagerStep({ store, number: t.number, step: t.status, lang: t.lang }));
    const card = crypto.randomBytes(18).toString('base64url');
    await rest('pager_cards', { method: 'POST', body: { client_id: await brandOf(store), token: card, wallet_serial: pass.serialNumber, wallet_url: pass.shareUrl, lang: t.lang || null, branch_ids: [store.id] } });
    await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { wallet_serial: pass.serialNumber, wallet_url: pass.shareUrl, ...(DEMO.has(store.client_slug) ? { created_at: new Date().toISOString() } : {}) } });
    return { url: pass.shareUrl, card };
  }

  // ─── العميل يكتب رقم فاتورته (الموظف يشوفه على شاشته على طول) ───
  if (action === 'invoice' && req.method === 'POST') {
    const store = await loadStore(b.slug);
    const token = String(b.t || '');
    if (!TOKEN_RE.test(token)) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    const invoice = String(b.invoice ?? '').trim().replace(/\s+/g, '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) & 15));
    if (invoice && !/^[A-Za-z0-9#\-_/]{1,20}$/.test(invoice)) throw new ApiError(400, 'رقم الفاتورة: أرقام وحروف إنجليزية فقط');
    const t = (await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&status=in.(waiting,ready)&select=id,number`))[0];
    if (!t) throw new ApiError(404, 'الرقم غير موجود أو انتهى', 'NOT_FOUND');
    if (invoice) {
      const dup = await rest(`pager_tickets?client_id=eq.${store.id}&invoice_no=eq.${q(invoice)}&id=neq.${t.id}&created_at=gte.${q(riyadhDayStart())}&status=in.(waiting,ready)&select=number&limit=1`);
      if (dup.length) throw new ApiError(409, 'هذي الفاتورة مسجلة على رقم ثاني، تأكد من الرقم', 'DUPLICATE');
    }
    await rest(`pager_tickets?id=eq.${t.id}`, { method: 'PATCH', body: { invoice_no: invoice || null } });
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
    // لو الزبون ضغط "استلمت" قبل الكاشير، نقفل الرقم
    await rest(`pager_tickets?id=eq.${rows[0].id}&status=eq.ready`, { method: 'PATCH', body: { status: 'done', closed_at: new Date().toISOString(), push_sub: null } }).catch(() => {});
    // ضغط "استلمت" قبل الكاشير: بطاقة النداء ترجع "بالعافية"
    if (rows[0].wallet_serial && rows[0].status === 'ready') later(wallet.updatePagerPass(rows[0].wallet_serial, wallet.pagerStep({ store, step: 'idle', lang: rows[0].lang })));
    await poke(topic('pager', store.id));
    return { ok: true, google: rating >= 4 ? await reviewUrl(store.id) : null };
  }

  throw new ApiError(404, 'هذا الطلب غير معروف، حدّث الصفحة وحاول مرة ثانية', 'UNKNOWN');
});
