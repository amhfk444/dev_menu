// =====================================================================
// DEV MENU — API صاحب المتجر: بطاقة الولاء: الإعدادات، الأعضاء، الختم والصرف والنقل، الرسائل والمساعد الذكي
// pre: طلبات قبل حد الـ POST (القراءة وغيرها)، post: طلبات الحفظ (بعد ما يتحدد المتجر)
// كل دالة ترجع NEXT لو الطلب مو لها
// =====================================================================
/* eslint-disable no-unused-vars */
const { crypto, handler, rest, rpc, q, storage, publicUrl, ownsMediaUrl, SUPABASE_URL, BUCKET, ApiError, getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, SLUG_RE, RESERVED_SLUGS, CURRENCIES, SITE, storeLink, loyaltyHome, later, followParentFeatures, FIELDS, normalizeSettings, riyadhDayStart, positionOf, emailTemplate, statusUrlFor, sendMail, mailConfigured, sendPush, pushPublicKey, cleanSubscription, topic, storeTopics, poke, normalizeLoyalty, validPoint, PLANS, tr, wallet, queue, pushWalletCards, runAssistant, pagerReadyNotice, walletNotice, loyaltyMessages, loyaltyNearLines, stampPagerTicket, purchaseStamp, tagBranch, newStampCode, parseMemberQr, cooldownLeft, leftText, bySort, COFFEE_TYPES, SECTORS, LINKS_SECTIONS, BUSINESS_TYPES, ALLERGENS, PROCESS, ROAST, METHODS, DELIVERY, THEMES, MAX_SIZES, MAX_COUPONS, OCCASION_PRESETS, STICKER_POSITIONS, STICKER_LIB, STICKER_SIZES, STICKER_ANIMS, MAX_OCCASIONS, MAX_STICKERS, isDay, cleanOccasions, validPrice, round2, cleanSizes, cleanExtras, riyadhDate, MAX_ORDER_NUMBERS, MAX_CUSTOM_LINKS, phoneNumber, DESK_ACTIONS, DESK_KEY_RE, MENU_ONLY, context, familyIds, storeContext, familyOf, categoryIn, nextOrderIn, SHARED_PRODUCT_FIELDS, guestKeysOf, guestHistory, patchStore, cleanCoffee, IMAGE_TYPES, VIDEO_TYPES, PAGER_MAX_RINGS, ringTicket, refreshWalletCards, PAGER_MSG_GAP, winbackSettings, redeemMessage, FEEDBACK_REASONS, absenceDue, readyRewards } = require('./shared');
const NEXT = require('./next');
// البطاقة في المحفظة: لو آخر تحديث لها ما وصل لأي جهاز، الزبون حذفها (ما نعرف إلا بعد أول تحديث: ختم أو رسالة)
const walletState = (serial, err, platform) => {
  const removed = !!serial && wallet.passRemoved(err, platform);
  return { in_wallet: !!serial && !removed, wallet_removed: removed };
};

module.exports.pre = async function pre(action, req, b) {

  // ─── بطاقة الولاء: الإعدادات والإحصائيات وآخر البطاقات ───
  if (action === 'loyalty' && req.method === 'GET') {
    const { store, here } = await context(req);
    const spot = here.id === store.id ? null : (await rest(`clients?id=eq.${here.id}&select=loyalty_lat,loyalty_lng`).catch(() => []))[0];
    const extra = (await rest(`clients?id=eq.${store.id}&select=loyalty_enabled,loyalty_settings,loyalty_lat,loyalty_lng,loyalty_ai,loyalty_near_lines,business_type`))[0] || {};
    const day = 864e5, iso = (n) => q(new Date(Date.now() - n * day).toISOString());
    const [cards, stamps7, redeemed, messages, feedback, gifts] = await Promise.all([
      rest(`loyalty_cards?client_id=eq.${store.id}&select=id,member_no,name,phone,stamps,visits,rewards,last_stamp_at,created_at&order=last_stamp_at.desc.nullslast&limit=500`),
      rest(`loyalty_events?client_id=eq.${store.id}&kind=eq.stamp&created_at=gte.${iso(7)}&select=id,card_id,created_at&order=id.desc&limit=5000`),
      rest(`loyalty_events?client_id=eq.${store.id}&kind=eq.redeem&select=id`),
      rest(`loyalty_messages?client_id=eq.${store.id}&or=${q('(kind.is.null,kind.not.in.(pager,away))')}&select=id,card_id,body,wallet_sent,created_at,source,kind,branch_id&order=id.desc&limit=15`).catch(() => []),
      rest(`loyalty_feedback?client_id=eq.${store.id}&created_at=gte.${iso(90)}&select=reason,note,created_at,card_id&order=id.desc&limit=500`).catch(() => []),
      rest(`loyalty_gifts?client_id=eq.${store.id}&select=status,new_member,created_at&limit=5000`).catch(() => [])
    ]);
    // عملاء كل فرع (للي عنده أكثر من فرع)
    let branchStats = null;
    const family = await familyOf(store, 'id,name,parent_id').catch(() => []);
    if (family.length > 1) {
      const rows = await rpc('server_loyalty_branch_stats', { p_client: store.id }).catch(() => null);
      if (Array.isArray(rows)) {
        const by = Object.fromEntries(rows.map(r => [r.branch_id == null ? 'none' : r.branch_id, r]));
        const zero = { members: 0, customers30: 0, stamps30: 0, redeems30: 0 };
        branchStats = family.map(f => ({ id: f.id, name: f.name, main: !f.parent_id, ...zero, ...(by[f.id] || {}) }));
        // الأعضاء والأختام قبل تتبع الفروع
        if (by.none && (by.none.members || by.none.stamps30)) branchStats.push({ id: null, name: null, ...zero, ...by.none });
      }
      // رسائل لزبائن فرع واحد: كم عضو زار كل فرع (سجّل فيه أو انختم له فيه)
      const tags = await rest(`loyalty_cards?client_id=eq.${store.id}&select=branch_ids&limit=20000`).catch(() => []);
      const visitors = {};
      tags.forEach(c => (c.branch_ids || []).forEach(id => { visitors[id] = (visitors[id] || 0) + 1; }));
      if (branchStats) branchStats.forEach(x => { if (x.id != null) x.visitors = visitors[x.id] || 0; });
    }
    const active = cards.filter(c => c.last_stamp_at && Date.parse(c.last_stamp_at) > Date.now() - 30 * day).length;
    // آخر 7 أيام (بتوقيت الرياض): زيارات كل يوم، والعملاء العائدين، وآخر الزيارات
    const dayKey = (t) => new Date(Date.parse(t) + 3 * 3600e3).toISOString().slice(0, 10);
    const week = Array.from({ length: 7 }, (_, i) => ({ d: dayKey(new Date(Date.now() - (6 - i) * day).toISOString()), n: 0 }));
    stamps7.forEach(e => { const w = week.find(x => x.d === dayKey(e.created_at)); if (w) w.n++; });
    const byId = Object.fromEntries(cards.map(c => [c.id, c]));
    const returning = new Set(stamps7.filter(e => byId[e.card_id] && byId[e.card_id].visits > 1).map(e => e.card_id)).size;
    const recent = stamps7.slice(0, 8).map(e => ({ id: e.card_id, at: e.created_at, name: (byId[e.card_id] || {}).name || null, no: (byId[e.card_id] || {}).member_no, stamps: (byId[e.card_id] || {}).stamps }));
    return {
      enabled: extra.loyalty_enabled === true, settings: normalizeLoyalty(extra.loyalty_settings, extra),
      location_set: validPoint(spot ? spot.loyalty_lat : extra.loyalty_lat, spot ? spot.loyalty_lng : extra.loyalty_lng), slug: here.client_slug,
      stats: { members: cards.length, active30: active, away30: cards.filter(c => c.last_stamp_at && Date.parse(c.last_stamp_at) < Date.now() - 30 * day).length, stamps7: stamps7.length, redeemed: redeemed.length, returning7: returning }, week, recent,
      cards: cards.slice(0, 50), messages, wallet: wallet.configured(), branches: branchStats,
      entitled: PLANS.has(store, 'loyalty'),
      ai: extra.loyalty_ai === true, near_lines: Array.isArray(extra.loyalty_near_lines) ? extra.loyalty_near_lines : [],
      feedback: {
        total: feedback.length,
        reasons: feedback.reduce((a, f) => (a[f.reason] = (a[f.reason] || 0) + 1, a), {}),
        notes: feedback.filter(f => f.note).slice(0, 10).map(f => ({ note: f.note, reason: f.reason, created_at: f.created_at })),
        // آخر الردود بأسماء أصحابها، عشان التاجر يعرف مين وليش ويتواصل معه
        latest: feedback.slice(0, 20).map(f => ({ card_id: f.card_id, name: (byId[f.card_id] || {}).name || null, no: (byId[f.card_id] || {}).member_no, phone: (byId[f.card_id] || {}).phone || null, reason: f.reason, note: f.note, created_at: f.created_at }))
      },
      gifts: {
        sent: gifts.length, claimed: gifts.filter(g => g.status !== 'sent').length,
        redeemed: gifts.filter(g => g.status === 'redeemed').length, new_members: gifts.filter(g => g.new_member).length
      }
    };
  }

  // ─── كود الختم: انستخدم؟ ولمين؟ (شاشة الكاشير تسأل كل ثانيتين) ───
  if (action === 'loyalty-stamp-code' && req.method === 'GET') {
    const { store } = await context(req);
    const row = (await rest(`loyalty_stamp_codes?code=eq.${q(String(req.query.code || ''))}&client_id=eq.${store.id}&select=used_at,expires_at,card_id,note`))[0];
    if (!row) throw new ApiError(404, 'الكود غير موجود');
    let who = null;
    if (row.card_id) { const c = (await rest(`loyalty_cards?id=eq.${row.card_id}&select=member_no,name,stamps`))[0] || {}; who = { name: c.name || `عضو #${c.member_no}`, stamps: c.stamps }; }
    return { used: !!row.used_at, expired: !row.used_at && Date.parse(row.expires_at) < Date.now(), who, note: row.used_at ? null : row.note || null };
  }
  // ─── بطاقة الولاء: كل الأعضاء (للقائمة والداشبورد وملف CSV) ───
  if (action === 'loyalty-members' && req.method === 'GET') {
    const { store } = await context(req);
    const cards = await rest(`loyalty_cards?client_id=eq.${store.id}&select=id,member_no,name,phone,gender,stamps,visits,rewards,last_stamp_at,created_at,wallet_serial,wallet_error,wallet_platform,ai_last_at,branch_ids&order=last_stamp_at.desc.nullslast&limit=5000`);
    return { members: cards.map(({ wallet_serial, wallet_error, wallet_platform, ...c }) => ({ ...c, ...walletState(wallet_serial, wallet_error, wallet_platform) })) };
  }

  // ─── بطاقة الولاء: تفاصيل عضو (زياراته ورسائله) ───
  if (action === 'loyalty-member' && req.method === 'GET') {
    const { store } = await context(req);
    const id = int(req.query.id);
    const card = (await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${store.id}&select=id,member_no,name,phone,gender,stamps,visits,rewards,last_stamp_at,created_at,wallet_serial,wallet_error,wallet_platform,ai_last_at,transferred,transferred_at,token`))[0];
    if (!card) throw new ApiError(404, 'العضو غير موجود');
    const [events, messages, feedback] = await Promise.all([
      rest(`loyalty_events?card_id=eq.${id}&select=kind,created_at,distance_m&order=id.desc&limit=200`),
      rest(`loyalty_messages?client_id=eq.${store.id}&card_id=eq.${id}&or=${q('(kind.is.null,kind.neq.pager)')}&select=id,body,source,kind,created_at&order=id.desc&limit=30`).catch(() => []),
      rest(`loyalty_feedback?client_id=eq.${store.id}&card_id=eq.${id}&select=reason,note,created_at&order=id.desc&limit=10`).catch(() => [])
    ]);
    const { wallet_serial, wallet_error, wallet_platform, token, ...rest_ } = card;
    // رابط استرجاع البطاقة: صاحب المحل يرسله للعضو بعد ما يتأكد إنه هو (لو غيّر جواله)
    const base = wallet.cardUrl(store.client_slug);
    const restore_url = `${base}${base.includes('?') ? '&' : '?'}t=${encodeURIComponent(token)}`;
    return { member: { ...rest_, ...walletState(wallet_serial, wallet_error, wallet_platform), restore_url }, events, messages, feedback };
  }
  return NEXT;
}

module.exports.post = async function post(action, req, b, env) {
  const { store, admin, here, sid, atBranch, notInPlan } = env;


  // ─── بطاقة الولاء: تشغيل وإعدادات ───
  if (action === 'loyalty-settings') {
    const extra = (await rest(`clients?id=eq.${sid}&select=loyalty_settings,business_type`))[0] || {};
    const current = normalizeLoyalty(extra.loyalty_settings, extra);
    const design = { ...current.design, ...((b.settings && b.settings.design) || {}) };
    if (design.stamp_image && !ownsMediaUrl(design.stamp_image, sid)) throw new ApiError(400, 'صورة الختم غير تابعة لمتجرك');
    for (const k of ['logo', 'reward_image']) if (design[k] && !ownsMediaUrl(design[k], sid)) throw new ApiError(400, 'الصورة غير تابعة لمتجرك');
    const settings = normalizeLoyalty({ ...current, ...(b.settings || {}), design }, extra);
    const body = { loyalty_settings: settings };
    // الشروط تغيّرت: رسائل الذكاء القديمة (مثلاً "باقي لك 5 من 8") تختفي، وجمل القرب تنكتب من جديد
    const rulesChanged = settings.needed !== current.needed || settings.reward !== current.reward || JSON.stringify(settings.happy) !== JSON.stringify(current.happy);
    if (rulesChanged) {
      settings.rules_at = new Date().toISOString();
      body.loyalty_near_lines = []; body.loyalty_near_at = null;
    }
    if (typeof b.enabled === 'boolean') body.loyalty_enabled = b.enabled;
    let row = (await rest(`clients?id=eq.${sid}`, { method: 'PATCH', body, prefer: 'return=representation' }))[0];
    if (rulesChanged && row.loyalty_ai) {
      const lines = await loyaltyNearLines({ storeName: row.name, businessType: SECTORS.label(row), reward: settings.reward }).catch(() => []);
      if (lines.length) await rest(`clients?id=eq.${sid}`, { method: 'PATCH', body: { loyalty_near_lines: lines, loyalty_near_at: new Date().toISOString() } }).catch(() => {});
    }
    // الشكل أو المكافأة تغيّرت ← نحدّث البطاقات اللي في المحفظة
    const wallet_updated = await pushWalletCards(sid);
    return { enabled: row.loyalty_enabled === true, settings: normalizeLoyalty(row.loyalty_settings), wallet_updated };
  }

  // ─── بطاقة الولاء: رسالة للكل أو لعضو واحد ───
  // توصل إشعار لمحفظة الجوال للي حافظين البطاقة، وتطلع في صفحة البطاقة لما يفتحها
  if (action === 'loyalty-message') {
    const body = str(b.body, 200, 'الرسالة');
    if (body.length < 2) throw new ApiError(400, 'اكتب الرسالة');
    // بدون حد يومي، بس نفس الرسالة ما تنرسل مرتين ورا بعض بالغلط
    const since = new Date(Date.now() - 60e3).toISOString();
    const dup = await rest(`loyalty_messages?client_id=eq.${sid}&created_at=gte.${q(since)}&body=eq.${q(body)}&select=id&limit=1`).catch(() => []);
    if (dup.length) throw new ApiError(429, 'انرسلت هالرسالة قبل شوي');
    // رسالة جماعية للي غابوا أكثر من 30 يوم (بدون أسئلة): تنحفظ لكل واحد منهم وتوصل لبطاقته
    if (b.audience === 'away') {
      const away = await rest(`loyalty_cards?client_id=eq.${sid}&last_stamp_at=lt.${q(new Date(Date.now() - 30 * 864e5).toISOString())}&select=id&order=last_stamp_at.desc&limit=2000`);
      if (!away.length) throw new ApiError(409, 'ما فيه أحد غايب أكثر من 30 يوم', 'NO_AWAY');
      for (let i = 0; i < away.length; i += 500) {
        await rest('loyalty_messages', { method: 'POST', body: away.slice(i, i + 500).map(c => ({ client_id: sid, card_id: c.id, body, source: 'owner', kind: 'away' })) });
      }
      const cards = await rest(`loyalty_cards?id=in.(${away.map(c => c.id).join(',')})&wallet_serial=not.is.null&select=id,wallet_serial,wallet_platform,lang`).catch(() => []);
      const queued = await queue.enqueueLoyalty(sid, 'loyalty_msg', cards, { body });
      later(queue.processQueue(20e3));
      return { message: { id: 0, body, card_id: null, audience: 'away', wallet_sent: 0, created_at: new Date().toISOString() }, queued };
    }
    // زبائن فرع واحد (من فروع المحل بس)
    const branch = b.branch_id ? Number(b.branch_id) : null;
    if (branch && !(await familyIds(store)).includes(branch)) throw new ApiError(400, 'الفرع غير موجود');
    let cardId = null;
    if (!branch && b.card_id != null && b.card_id !== '') {
      cardId = int(b.card_id);
      const own = (await rest(`loyalty_cards?id=eq.${cardId}&client_id=eq.${sid}&select=id`))[0];
      if (!own) throw new ApiError(404, 'العضو غير موجود');
    }
    const msg = (await rest('loyalty_messages', { method: 'POST', prefer: 'return=representation', body: { client_id: sid, card_id: cardId, body, branch_id: branch } }))[0];
    // المحفظة: لعضو واحد على طول، وللكل على دفعات (لوحة التحكم تكمّل الباقي بـ loyalty-message-push)
    if (cardId) {
      const sent = await pushWalletCards(sid, { cardIds: [cardId], notice: body });
      await rest(`loyalty_messages?id=eq.${msg.id}`, { method: 'PATCH', body: { wallet_sent: sent } }).catch(() => {});
      return { message: { ...msg, wallet_sent: sent }, progress: { done: true, sent, total: 1 } };
    }
    // للكل أو لفرع: الطابور يرسلها بالخلفية ويحترم حد قوقل (لوحة التحكم تتابع بـ loyalty-message-status)
    const cards = await rest(`loyalty_cards?client_id=eq.${sid}&wallet_serial=not.is.null${branch ? `&branch_ids=cs.{${branch}}` : ''}&select=id,wallet_serial,wallet_platform,lang&limit=20000`).catch(() => []);
    const queued = await queue.enqueueLoyalty(sid, 'loyalty_msg', cards, { body, refId: msg.id });
    later(queue.processQueue(20e3));
    return { message: { ...msg, wallet_sent: 0 }, queued };
  }
  if (action === 'loyalty-message-status') {
    const msg = (await rest(`loyalty_messages?id=eq.${int(b.message_id)}&client_id=eq.${sid}&select=id`))[0];
    if (!msg) throw new ApiError(404, 'الرسالة غير موجودة');
    return { status: await queue.messageStatus(msg.id, 'loyalty_msg') };
  }

  // ─── كود ختم جديد من شاشة الكاشير (بعد الدفع) ───
  if (action === 'loyalty-stamp-code') {
    const x = (await rest(`clients?id=eq.${sid}&select=loyalty_enabled`))[0] || {};
    if (!x.loyalty_enabled) throw new ApiError(409, 'شغّل بطاقة الولاء أول من لوحة التحكم');
    const row = await newStampCode(sid);
    const url = `${wallet.cardUrl(store.client_slug)}${wallet.cardUrl(store.client_slug).includes('?') ? '&' : '?'}c=${row.code}`;
    return { code: row.code, url, expires_at: row.expires_at };
  }

  // ─── الكاشير يمسح كود عضوية الزبون (أو يكتب رقمه) ويختمه بعد الدفع ───
  if (action === 'loyalty-scan') {
    const x = (await rest(`clients?id=eq.${sid}&select=loyalty_enabled,loyalty_settings`))[0] || {};
    if (!x.loyalty_enabled) throw new ApiError(409, 'شغّل بطاقة الولاء أول من لوحة التحكم');
    const settings = normalizeLoyalty(x.loyalty_settings);
    let id = null;
    if (b.qr) { id = parseMemberQr(await familyIds(store), b.qr); if (!id) throw new ApiError(400, 'هذا مو كود عضوية من بطاقتنا', 'BAD_QR'); }
    const no = b.qr ? null : parseInt(String(b.member_id || '').replace(/[^\d]/g, ''), 10);
    const card = b.qr ? (await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${sid}&select=*`))[0]
      : Number.isInteger(no) ? (await rest(`loyalty_cards?member_no=eq.${no}&client_id=eq.${sid}&select=*`))[0] : null;
    if (!card) throw new ApiError(404, 'ما لقينا عضو بهذا الرقم', 'NO_MEMBER');
    const who = { id: card.id, no: card.member_no, name: card.name || `عضو #${card.member_no}`, transferred: card.transferred_at ? card.transferred : null };
    const rewards = await readyRewards(sid, card, settings);
    if (card.stamps >= settings.needed) return { stamped: false, rewards, who, reason: 'FULL', note: 'بطاقته مكتملة، يستخدم مكافأته أول', stamps: card.stamps, needed: settings.needed };
    const next = cooldownLeft(card, settings);
    if (next) return { stamped: false, who, reason: 'COOLDOWN', note: `انختم قبل شوي، الختم الجاي بعد ${leftText(next)}`, stamps: card.stamps, needed: settings.needed };
    // شاشة الختم: اللي غاب المدة المحددة نسأله "وش أخّرك؟" قبل الختم، وجوابه يوصل للتاجر
    let answered = false;
    if (b.kiosk && settings.feedback.enabled) {
      if (FEEDBACK_REASONS.includes(b.reason)) {
        await rest('loyalty_feedback', { method: 'POST', body: { client_id: sid, card_id: card.id, reason: b.reason, note: null } }).catch(e => console.error('KIOSK_FEEDBACK', e.message));
        answered = true;
      } else if (!b.skip && await absenceDue(sid, card, settings)) {
        return { ask: true, who, days: Math.floor((Date.now() - Date.parse(card.last_stamp_at)) / 864e5), gift: settings.feedback.gift, stamps: card.stamps, needed: settings.needed };
      }
    }
    const r = await purchaseStamp(sid, card.id, settings, here.id);
    let count = r.count;
    // ختم هدية على الجواب (لو صاحب المحل مفعّلها)
    if (r.stamped && answered && settings.feedback.gift) {
      const g = await rpc('server_loyalty_stamp', { p_card: card.id, p_cooldown_hours: 0, p_needed: settings.needed, p_distance: null, p_count: 1 }).catch(() => ({}));
      if (g.ok) await tagBranch(card.id, here.id);
      if (g.ok) { count++; await pushWalletCards(sid, { cardIds: [card.id] }).catch(() => 0); }
    }
    const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=stamps`))[0] || {};
    return { stamped: r.stamped, count, answered, who, reason: r.reason, stamps: fresh.stamps, needed: settings.needed, rewards: await readyRewards(sid, { ...card, stamps: fresh.stamps }, settings) };
  }

  // ─── صرف المكافأة (أو هدية صديق) عند الموظف: من مسح كود العضو أو من رقم البيجر ───
  if (action === 'loyalty-redeem') {
    const x = (await rest(`clients?id=eq.${sid}&select=loyalty_settings`))[0] || {};
    const settings = normalizeLoyalty(x.loyalty_settings);
    const card = (await rest(`loyalty_cards?id=eq.${int(b.card_id)}&client_id=eq.${sid}&select=*`))[0];
    if (!card) throw new ApiError(404, 'العضو غير موجود');
    let reward = settings.reward;
    if (b.gift) {
      const rows = await rest(`loyalty_gifts?code=eq.${q(String(b.gift))}&to_card=eq.${card.id}&status=eq.claimed&expires_at=gt.${q(new Date().toISOString())}`,
        { method: 'PATCH', prefer: 'return=representation', body: { status: 'redeemed', redeemed_at: new Date().toISOString() } });
      if (!rows.length) throw new ApiError(409, 'الهدية مستخدمة أو منتهية', 'GIFT_USED');
      await rest('loyalty_events', { method: 'POST', body: { client_id: sid, branch_id: await atBranch(), card_id: card.id, kind: 'gift_redeem' } }).catch(() => {});
      reward = rows[0].reward;
    } else {
      const r = await rpc('server_loyalty_redeem', { p_card: card.id, p_needed: settings.needed, p_distance: null });
      if (!r.ok) throw new ApiError(409, 'أختامه ما كملت', 'NOT_ENOUGH');
      await tagBranch(card.id, await atBranch());
    }
    // رسالة تسليم المكافأة على بطاقة العميل (والتحديث نفسه يصفّر أختامه)
    const msg = await redeemMessage(store, settings, card, reward);
    const sent = msg ? await walletNotice(sid, card.id, msg).catch(() => 'error') : 'off';
    if (sent !== 'sent') await pushWalletCards(sid, { cardIds: [card.id] }).catch(() => 0);
    const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0];
    await poke(topic('pager', sid)).catch(() => {});
    return { ok: true, reward, who: { id: card.id, no: card.member_no, name: card.name || `عضو #${card.member_no}` }, stamps: fresh.stamps, needed: settings.needed, rewards: await readyRewards(sid, fresh, settings) };
  }

  // ─── نقل رصيد من بطاقة قديمة: الكاشير يشوف البطاقة القديمة ويضيف أختامها (مرة وحدة لكل عضو) ───
  if (action === 'loyalty-transfer') {
    const x = (await rest(`clients?id=eq.${sid}&select=loyalty_settings`))[0] || {};
    const settings = normalizeLoyalty(x.loyalty_settings);
    const no = parseInt(String(b.member_no || '').replace(/[^\d]/g, ''), 10);
    const card = Number.isInteger(no) ? (await rest(`loyalty_cards?member_no=eq.${no}&client_id=eq.${sid}&select=id,name,member_no,stamps,transferred_at`))[0] : null;
    if (!card) throw new ApiError(404, 'ما لقينا العضو', 'NO_MEMBER');
    if (card.transferred_at) throw new ApiError(409, 'هذا العضو نقل رصيده القديم من قبل', 'ALREADY');
    const count = int(b.count);
    if (!Number.isInteger(count) || count < 1 || count > settings.needed) throw new ApiError(400, `عدد الأختام من 1 إلى ${settings.needed}`);
    const stamps = Math.min(settings.needed, card.stamps + count);
    const row = (await rest(`loyalty_cards?id=eq.${card.id}&transferred_at=is.null`, { method: 'PATCH', prefer: 'return=representation', body: { stamps, transferred: count, transferred_at: new Date().toISOString() } }))[0];
    if (!row) throw new ApiError(409, 'هذا العضو نقل رصيده القديم من قبل', 'ALREADY');
    await pushWalletCards(sid, { cardIds: [card.id] }).catch(() => 0);
    return { ok: true, who: { no: card.member_no, name: card.name || `عضو #${card.member_no}` }, stamps: row.stamps, needed: settings.needed, count };
  }

  // ─── حذف عضو من بطاقة الولاء (وأختامه ورسائله تنحذف معه) ───
  // ─── استيراد أعضاء من نظام ولاء سابق (ملف Excel أو CSV): الاسم والجوال والأختام ───
  // ينحفظون كبطاقات جاهزة، ولما يمسح الزبون كود التسجيل ويكتب نفس جواله تطلع له بطاقته بأختامه
  if (action === 'loyalty-import') {
    const x = (await rest(`clients?id=eq.${sid}&select=loyalty_settings`))[0] || {};
    const settings = normalizeLoyalty(x.loyalty_settings);
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 1000) : [];
    if (!rows.length) throw new ApiError(400, 'الملف فاضي');
    const seen = new Map();
    let invalid = 0;
    for (const r of rows) {
      let phone = '';
      try { phone = waNumber(String((r && r.phone) || '').replace(/[\u0660-\u0669\u06F0-\u06F9]/g, d => String(d.charCodeAt(0) & 15))); } catch {}
      if (!phone) { invalid++; continue; }
      const stamps = Math.max(0, Math.min(settings.needed, parseInt(String((r && r.stamps) || 0).replace(/[^\d]/g, ''), 10) || 0));
      const name = String((r && r.name) || '').replace(/\s+/g, ' ').trim().slice(0, 40);
      if (!seen.has(phone)) seen.set(phone, { name, stamps });
    }
    const phones = [...seen.keys()];
    const existing = new Set();
    for (let i = 0; i < phones.length; i += 200) {
      const got = await rest(`loyalty_cards?client_id=eq.${sid}&phone=in.(${phones.slice(i, i + 200).join(',')})&select=phone`);
      got.forEach(c => existing.add(c.phone));
    }
    const now = new Date().toISOString();
    const fresh = phones.filter(p => !existing.has(p)).map(p => {
      const v = seen.get(p);
      return { client_id: sid, token: crypto.randomBytes(18).toString('base64url'), name: v.name || 'عضو', phone: p, stamps: v.stamps,
        transferred: v.stamps, transferred_at: now };
    });
    for (let i = 0; i < fresh.length; i += 500) await rest('loyalty_cards', { method: 'POST', body: fresh.slice(i, i + 500) });
    return { added: fresh.length, existing: existing.size, invalid };
  }

  if (action === 'loyalty-member-delete') {
    const id = int(b.card_id);
    const card = (await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${sid}&select=id,wallet_serial`))[0];
    if (!card) throw new ApiError(404, 'العضو غير موجود');
    // بطاقته في محفظة جواله تنلغي بعد (ما تبقى شغالة بأختامها)
    const wallet_revoked = card.wallet_serial ? await wallet.revokePass(card.wallet_serial) : 'none';
    await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${sid}`, { method: 'DELETE' });
    return { ok: true, wallet: wallet_revoked };
  }

  // ─── بطاقة الولاء: صاحب المحل يعطي ختم لعضو بنفسه ───
  if (action === 'loyalty-give-stamp') {
    const id = int(b.card_id);
    const card = (await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${sid}&select=id`))[0];
    if (!card) throw new ApiError(404, 'العضو غير موجود');
    const extra = (await rest(`clients?id=eq.${sid}&select=loyalty_settings`))[0] || {};
    const settings = normalizeLoyalty(extra.loyalty_settings);
    const r = await rpc('server_loyalty_stamp', { p_card: id, p_cooldown_hours: 0, p_needed: settings.needed, p_distance: null });
    if (r.ok) await tagBranch(id, await atBranch());
    if (!r.ok && r.reason === 'FULL') throw new ApiError(409, 'بطاقته مكتملة، لازم يستخدم المكافأة أول');
    await pushWalletCards(sid, { cardIds: [id] });
    const fresh = (await rest(`loyalty_cards?id=eq.${id}&select=id,stamps,visits,rewards,last_stamp_at`))[0];
    return { ok: !!r.ok, member: fresh };
  }

  // ─── المساعد الذكي: تشغيل وإيقاف ───
  if (action === 'loyalty-ai') {
    const row = (await rest(`clients?id=eq.${sid}`, { method: 'PATCH', body: { loyalty_ai: b.enabled === true }, prefer: 'return=representation' }))[0];
    // تشغيل المساعد: جمل القرب تنكتب على طول (ما تنتظر موعده اليومي) وتوصل لبطاقات المحفظة
    const stale = !Array.isArray(row.loyalty_near_lines) || !row.loyalty_near_lines.length || !row.loyalty_near_at || Date.now() - Date.parse(row.loyalty_near_at) > 7 * 864e5;
    if (row.loyalty_ai === true && stale) {
      later((async () => {
        const lines = await loyaltyNearLines({ storeName: row.name, businessType: SECTORS.label(row), reward: normalizeLoyalty(row.loyalty_settings).reward });
        if (!lines.length) return;
        await rest(`clients?id=eq.${sid}`, { method: 'PATCH', body: { loyalty_near_lines: lines, loyalty_near_at: new Date().toISOString() } });
        await pushWalletCards(sid);
      })());
    }
    return { ai: row.loyalty_ai === true };
  }

  // ─── المساعد الذكي: شغّله الحين (بدل ما ننتظر موعده اليومي) ───
  if (action === 'loyalty-ai-run') {
    const recent = await rest(`loyalty_messages?client_id=eq.${sid}&source=eq.ai&created_at=gte.${q(new Date(Date.now() - 10 * 60e3).toISOString())}&select=id&limit=1`).catch(() => []);
    if (recent.length) throw new ApiError(429, 'المساعد اشتغل قبل شوي، جرّب بعد 10 دقايق');
    return await runAssistant(sid);
  }

  // ─── المساعد الذكي: أمثلة على أسلوبه (ما تنرسل لأحد) ───
  if (action === 'loyalty-ai-preview') {
    const extra = (await rest(`clients?id=eq.${sid}&select=loyalty_settings`))[0] || {};
    const settings = normalizeLoyalty(extra.loyalty_settings);
    const n = settings.needed;
    const guests = [
      { ref: 'welcome', kind: 'welcome', visits: 1, stamps: 1, days_since: 0 },
      { ref: 'miss', kind: 'miss', name: 'فهد', gender: 'm', visits: 6, stamps: Math.min(3, n - 2), days_since: 19, usual_gap: 5 },
      { ref: 'second', kind: 'second', visits: 1, stamps: 1, days_since: 8 },
      { ref: 'almost', kind: 'almost', visits: n - 1, stamps: n - 1, days_since: 6, usual_gap: 4 },
      { ref: 'ready', kind: 'ready', visits: n, stamps: n, days_since: 4, usual_gap: 6 },
      { ref: 'near', kind: 'near', visits: 3, stamps: 3, days_since: 2 }
    ];
    return { examples: await loyaltyMessages({ storeName: store.name, businessType: SECTORS.label(store), reward: settings.reward, needed: n, guests }) };
  }

  // ─── بطاقة الولاء: موقع المحل (صاحب المحل يحدده وهو داخل المحل) ───
  if (action === 'loyalty-location') {
    const lat = Number(b.lat), lng = Number(b.lng), acc = Number(b.acc);
    if (!validPoint(lat, lng)) throw new ApiError(400, 'ما وصلنا موقعك، فعّل الموقع وحاول مرة ثانية');
    if (!Number.isFinite(acc) || acc > 100) throw new ApiError(409, `الموقع مو دقيق كفاية (${Math.round(acc) || '؟'} متر). قرّب من الشباك أو الباب وحاول مرة ثانية`, 'WEAK_GPS');
    await rest(`clients?id=eq.${sid}`, { method: 'PATCH', body: { loyalty_lat: lat, loyalty_lng: lng } });
    return { ok: true, accuracy: Math.round(acc) };
  }
  return NEXT;
}
