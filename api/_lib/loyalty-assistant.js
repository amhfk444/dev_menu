// =====================================================================
// DEV MENU — بطاقة الولاء: تحديث بطاقات المحفظة + المساعد الذكي ("صاحب الزبون")
//   المساعد يشوف كل زبون: متى آخر زيارة، كم مرة جا، كم باقي له على المكافأة
//   ويكتب له رسالة عفوية (اشتياق، تشجيع، تذكير بالمكافأة) توصله إشعار في المحفظة وتطلع في صفحة بطاقته
//   وجمل "أنت قريب" تطلع على شاشة قفل الآيفون لما يقرب من المحل (تتجدد كل أسبوع)
// =====================================================================
const { rest, q } = require('./core');
const { normalizeLoyalty, staleAi } = require('./loyalty');
const wallet = require('./wallet');
const { loyaltyMessages, loyaltyNearLines } = require('./ai');

const DAY = 864e5;
const STORE_FIELDS = 'id,name,client_slug,logo_url,business_type,business_label,loyalty_enabled,loyalty_ai,loyalty_settings,loyalty_lat,loyalty_lng,loyalty_near_lines,loyalty_near_at';
const SECTORS = require('./sectors');

// جملة "أنت قريب" لهالبطاقة: تتغير كل أسبوع وتختلف بين الزبائن
function nearLineFor(store, card) {
  const lines = Array.isArray(store.loyalty_near_lines) ? store.loyalty_near_lines : [];
  if (!lines.length) return null;
  const week = Math.floor(Date.now() / (7 * DAY));
  return lines[(Number(card.id) + week) % lines.length];
}

// آخر رسالة لكل بطاقة (للكل أو لها)، عشان التحديث ما يطلع إشعار قديم من جديد
async function latestNotices(storeId, settings) {
  const msgs = await rest(`loyalty_messages?client_id=eq.${storeId}&select=id,card_id,body,source,created_at&order=id.desc&limit=300`).catch(() => []);
  const latest = { all: null, by: {} };
  for (const m of msgs) {
    if (staleAi(m, settings)) continue; if (m.card_id == null) { if (!latest.all) latest.all = m; } else if (!latest.by[m.card_id]) latest.by[m.card_id] = m; }
  return (card) => { const a = latest.all, o = latest.by[card.id]; return ((a && o ? (a.id > o.id ? a : o) : a || o) || {}).body; };
}

const ctxFor = (store, settings, card, notice) => wallet.buildCtx({
  store: { name: store.name, client_slug: store.client_slug, logo_url: store.logo_url }, settings, card,
  lat: store.loyalty_lat, lng: store.loyalty_lng, notice, nearText: nearLineFor(store, card)
});

// تحديث بطاقات المحفظة (كلها أو اللي نحددها). notices: card.id → نص الرسالة الجديدة
async function pushWalletCards(storeId, { cardIds = null, notice = null, notices = null } = {}) {
  if (!wallet.configured()) return 0;
  const store = (await rest(`clients?id=eq.${storeId}&select=${STORE_FIELDS}`))[0];
  if (!store) return 0;
  const settings = normalizeLoyalty(store.loyalty_settings);
  const filter = cardIds ? `&id=in.(${cardIds.map(Number).join(',')})` : '';
  const cards = await rest(`loyalty_cards?client_id=eq.${storeId}${filter}&wallet_serial=not.is.null&select=*&limit=500`);
  if (!cards.length) return 0;
  const noticeFor = notice != null || notices ? null : await latestNotices(storeId, settings);
  let sent = 0;
  const started = Date.now();
  for (let i = 0; i < cards.length && Date.now() - started < 40e3; i += 6) {
    await Promise.all(cards.slice(i, i + 6).map(async (c) => {
      const text = notices ? notices[c.id] : notice != null ? notice : noticeFor(c);
      const err = await wallet.updatePass(c.wallet_serial, ctxFor(store, settings, c, text));
      if (!err || err.startsWith('ok')) sent++;
      await rest(`loyalty_cards?id=eq.${c.id}`, { method: 'PATCH', body: { wallet_error: err } }).catch(() => {});
    }));
  }
  return sent;
}

// ساعات الهدوء كعرض حقيقي يقدر المساعد يذكره
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const hourText = (h) => h === 0 || h === 24 ? '12 بالليل' : h < 12 ? `${h} الصبح` : h === 12 ? '12 الظهر' : h <= 17 ? `${h - 12} العصر` : `${h - 12} بالليل`;
function happyText(settings) {
  const h = settings.happy;
  if (!h || !h.enabled) return '';
  const days = h.days.length === 7 ? 'كل يوم' : h.days.map(d => DAY_NAMES[d]).join(' و');
  return `الختم دبل ${days} من ${hourText(h.from)} إلى ${hourText(h.to)}`;
}

// مين يستاهل رسالة اليوم؟ (الأولوية: مكافأة جاهزة، باقي ختم، زيارة ثانية، اشتياق)
function pickGuests(cards, settings, now = Date.now()) {
  const out = [];
  for (const c of cards) {
    if (!c.last_stamp_at) continue;
    const days = Math.floor((now - Date.parse(c.last_stamp_at)) / DAY);
    const sinceAi = c.ai_last_at ? (now - Date.parse(c.ai_last_at)) / DAY : Infinity;
    const gap = c.visits > 1 ? Math.round((Date.parse(c.last_stamp_at) - Date.parse(c.created_at)) / DAY / (c.visits - 1)) : null;
    let kind = null, rank = 0;
    if (c.stamps >= settings.needed && days >= 3 && sinceAi >= 7) { kind = 'ready'; rank = 4; }
    else if (c.stamps === settings.needed - 1 && days >= 4 && sinceAi >= 7) { kind = 'almost'; rank = 3; }
    else if (c.visits === 1 && days >= 5 && days <= 30 && !c.ai_last_at) { kind = 'second'; rank = 2; }
    else if (days >= Math.max(14, (gap || 0) * 2) && days <= 120 && sinceAi >= 14) { kind = 'miss'; rank = 1; }
    if (kind) out.push({ card: c, kind, rank, days, gap });
  }
  return out.sort((a, b) => b.rank - a.rank || b.card.visits - a.card.visits);
}

// تشغيل المساعد لمتجر واحد. force = من زر "جرّب الحين" (يتجاوز شرط الأسبوع لجمل القرب)
async function runAssistant(storeId, { maxGuests = 25 } = {}) {
  const store = (await rest(`clients?id=eq.${storeId}&select=${STORE_FIELDS}`))[0];
  if (!store || !store.loyalty_enabled || !store.loyalty_ai) return { skipped: true };
  const settings = normalizeLoyalty(store.loyalty_settings);
  const type = SECTORS.label(store);
  const result = { near: false, messages: 0, wallet: 0 };

  // جمل القرب: كل أسبوع
  if (!store.loyalty_near_at || Date.now() - Date.parse(store.loyalty_near_at) > 7 * DAY) {
    const lines = await loyaltyNearLines({ storeName: store.name, businessType: type, reward: settings.reward }).catch(e => { console.error('AI_NEAR', e.message); return []; });
    if (lines.length) {
      await rest(`clients?id=eq.${storeId}`, { method: 'PATCH', body: { loyalty_near_lines: lines, loyalty_near_at: new Date().toISOString() } });
      result.near = true;
    }
  }

  const cards = await rest(`loyalty_cards?client_id=eq.${storeId}&select=id,name,gender,stamps,visits,rewards,last_stamp_at,created_at,ai_last_at,wallet_serial&limit=2000`);
  const picked = pickGuests(cards, settings).slice(0, maxGuests);
  if (picked.length) {
    const prev = await rest(`loyalty_messages?client_id=eq.${storeId}&source=eq.ai&card_id=in.(${picked.map(p => p.card.id).join(',')})&select=card_id,body&order=id.desc&limit=200`).catch(() => []);
    const previous = {};
    for (const m of prev) (previous[m.card_id] = previous[m.card_id] || []).length < 3 && previous[m.card_id].push(m.body);
    const texts = await loyaltyMessages({
      storeName: store.name, businessType: type, reward: settings.reward, needed: settings.needed, offer: happyText(settings),
      guests: picked.map(p => ({ ref: String(p.card.id), kind: p.kind, name: p.card.name, gender: p.card.gender, visits: p.card.visits, stamps: Math.min(p.card.stamps, settings.needed), days_since: p.days, usual_gap: p.gap, previous: previous[p.card.id] || [] }))
    });
    const now = new Date().toISOString();
    const rows = picked.filter(p => texts[p.card.id]).map(p => ({ client_id: storeId, card_id: p.card.id, body: texts[p.card.id], source: 'ai', kind: p.kind }));
    if (rows.length) {
      await rest('loyalty_messages', { method: 'POST', body: rows });
      await rest(`loyalty_cards?id=in.(${rows.map(r => r.card_id).join(',')})`, { method: 'PATCH', body: { ai_last_at: now } });
      result.messages = rows.length;
    }
    const inWallet = rows.filter(r => picked.find(p => p.card.id === r.card_id).card.wallet_serial);
    if (inWallet.length) result.wallet = await pushWalletCards(storeId, { cardIds: inWallet.map(r => r.card_id), notices: Object.fromEntries(inWallet.map(r => [r.card_id, r.body])) });
  }
  // جمل القرب الجديدة توصل لبطاقات المحفظة الباقية
  if (result.near) await pushWalletCards(storeId);
  return result;
}

// البيجر جهز ← إشعار من بطاقة الولاء في محفظة الجوال (يشتغل على الآيفون بدون المتصفح)
// ننحفظ الإشعار كرسالة (kind=pager) عشان التحديثات الجاية للبطاقة ما ترجّع إشعار قديم
async function pagerReadyNotice(storeId, cardId, number, storeName, T = SECTORS.terms(null)) {
  try {
    const card = (await rest(`loyalty_cards?id=eq.${Number(cardId)}&client_id=eq.${storeId}&select=id,wallet_serial`))[0];
    if (!card || !card.wallet_serial) return 'no-wallet';
    const body = `🔔 ${T.ready} رقم ${number}. ${T.readyBody}${storeName ? ` من ${storeName}` : ''}`;
    await rest('loyalty_messages', { method: 'POST', body: { client_id: storeId, card_id: card.id, body, source: 'system', kind: 'pager' } }).catch(() => {});
    const sent = await pushWalletCards(storeId, { cardIds: [card.id], notice: body });
    return sent ? 'sent' : 'failed';
  } catch (e) { console.error('PAGER_WALLET', e.message); return 'error'; }
}

module.exports = { pushWalletCards, runAssistant, nearLineFor, STORE_FIELDS, pickGuests, pagerReadyNotice };
