// =====================================================================
// DEV MENU — بطاقة الولاء (صفحة الزبون، بدون تطبيق وبدون الكاشير)
//   GET  /api/loyalty?action=info&slug=        اسم المتجر وإعدادات البطاقة
//   GET  /api/loyalty?action=card&slug=&t=     بطاقة الزبون
//   POST /api/loyalty?action=join              تسجيل (اسم، جوال، نوع) + أول ختم + ترحيب { slug, name, phone, gender, lat, lng, acc }
//   POST /api/loyalty?action=phone             إكمال البيانات أو استرجاع بطاقة قديمة { slug, t, name, phone, gender, lat?, lng?, acc? }
//   POST /api/loyalty?action=stamp             ختم زيارة { slug, t, lat, lng, acc }
//   POST /api/loyalty?action=redeem            استخدام المكافأة قدام الموظف { slug, t, lat, lng, acc }
//   POST /api/loyalty?action=wallet            رابط إضافة البطاقة لمحفظة آبل أو قوقل { slug, t }
// كل ختم يحتاج الزبون يكون داخل نطاق المحل (50 متر افتراضياً). ما نخزن موقعه، بس المسافة.
// =====================================================================
const crypto = require('crypto');
const { handler, rest, rpc, q, ApiError, readBody, findPublicStore, waNumber } = require('./_lib/core');
const { normalizeLoyalty, distanceM, validPoint } = require('./_lib/loyalty');
const wallet = require('./_lib/wallet');
const { nearLineFor } = require('./_lib/loyalty-assistant');
const { loyaltyMessages } = require('./_lib/ai');

const TOKEN_RE = /^[A-Za-z0-9_-]{10,64}$/;
const MAX_ACCURACY_M = 100;   // دقة أسوأ من كذا = نطلب منه يحاول مرة ثانية

async function loadStore(slug) {
  const { store, bad } = await findPublicStore(slug, 'id,name,client_slug,logo_url');
  if (bad) throw new ApiError(400, 'الرابط غير صحيح');
  if (!store) throw new ApiError(404, 'بطاقة الولاء غير متاحة حالياً', 'NOT_AVAILABLE');
  const extra = (await rest(`clients?id=eq.${store.id}&select=loyalty_enabled,loyalty_settings,loyalty_lat,loyalty_lng,loyalty_near_lines`))[0] || {};
  if (!extra.loyalty_enabled) throw new ApiError(404, 'بطاقة الولاء غير متاحة حالياً', 'NOT_AVAILABLE');
  return { store, settings: normalizeLoyalty(extra.loyalty_settings), lat: extra.loyalty_lat, lng: extra.loyalty_lng, nearLines: extra.loyalty_near_lines };
}

// الزبون داخل المحل؟ يرجّع المسافة أو يرمي سبب الرفض
function checkPresence(ctx, b) {
  if (!validPoint(ctx.lat, ctx.lng)) throw new ApiError(409, 'المحل ما حدد موقعه للحين، اسأل الموظف', 'NO_STORE_LOCATION');
  const lat = Number(b.lat), lng = Number(b.lng), acc = Number(b.acc);
  if (!validPoint(lat, lng)) throw new ApiError(400, 'ما وصلنا موقعك، فعّل الموقع وحاول مرة ثانية', 'NO_LOCATION');
  if (!Number.isFinite(acc) || acc > MAX_ACCURACY_M) throw new ApiError(409, 'موقعك مو دقيق كفاية، قرّب من الباب أو انتظر ثواني وحاول مرة ثانية', 'WEAK_GPS');
  const d = distanceM(ctx.lat, ctx.lng, lat, lng);
  if (d > ctx.settings.radius_m) {
    const e = new ApiError(409, `أنت بعيد عن المحل (${d} متر). الختم يحتاج تكون داخل المحل`, 'TOO_FAR');
    e.extra = { distance: d };
    throw e;
  }
  return d;
}

const cardView = (c) => ({ name: c.name || null, gender: c.gender || null, stamps: c.stamps, visits: c.visits, rewards: c.rewards, last_stamp_at: c.last_stamp_at, in_wallet: !!c.wallet_url, has_phone: !!c.phone, has_profile: !!(c.name && c.phone && c.gender) });

// بيانات التسجيل: الاسم والجوال والنوع (كلها إجبارية)
function readProfile(b) {
  const name = String(b.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
  if (name.length < 2) throw new ApiError(400, 'اكتب اسمك');
  const phone = optionalPhone(b.phone);
  if (!phone) throw new ApiError(400, 'اكتب رقم جوالك');
  if (!['m', 'f'].includes(b.gender)) throw new ApiError(400, 'اختر ذكر أو أنثى');
  return { name, phone, gender: b.gender };
}

// رسالة الترحيب: اللي كتبها صاحب المحل، أو يكتبها المساعد الذكي لهالزبون، أو بدون
async function welcomeMessage(ctx, card) {
  const w = ctx.settings.welcome;
  if (!w || w.mode === 'off') return null;
  let body = w.mode === 'custom' ? w.text : '';
  let source = 'owner';
  if (w.mode === 'ai' || !body) {
    try {
      const out = await Promise.race([
        loyaltyMessages({ storeName: ctx.store.name, businessType: '', reward: ctx.settings.reward, needed: ctx.settings.needed,
          guests: [{ ref: 'w', kind: 'welcome', name: card.name, gender: card.gender, visits: 1, stamps: 1, days_since: 0 }] }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 9000))
      ]);
      body = out.w; source = 'ai';
    } catch (e) { console.error('WELCOME_AI', e.message); }
  }
  if (!body) body = w.text || `حيّاك في ${ctx.store.name}! هذا أول ختم لك، وباقي ${ctx.settings.needed - 1} على ${ctx.settings.reward}`;
  const row = (await rest('loyalty_messages', { method: 'POST', prefer: 'return=representation', body: { client_id: ctx.store.id, card_id: card.id, body, source, kind: 'welcome' } }).catch(() => []))[0];
  return row ? { id: row.id, body } : { id: 0, body };
}
const optionalPhone = (v) => { if (!String(v || '').trim()) return ''; try { return waNumber(v); } catch { throw new ApiError(400, 'رقم الجوال غير صحيح'); } };

// آخر رسالة من المحل لهالبطاقة (للكل أو له هو)
const latestMessage = async (storeId, cardId) => ((await rest(`loyalty_messages?client_id=eq.${storeId}&or=${q(`(card_id.is.null,card_id.eq.${cardId})`)}&select=id,body,created_at&order=id.desc&limit=1`).catch(() => []))[0]) || null;
const walletCtx = async (ctx, card) => wallet.buildCtx({ store: ctx.store, settings: ctx.settings, card, lat: ctx.lat, lng: ctx.lng, notice: ((await latestMessage(ctx.store.id, card.id)) || {}).body, nearText: nearLineFor({ loyalty_near_lines: ctx.nearLines }, card) });
// البطاقة في المحفظة تتحدث مع كل ختم (لو الزبون ضافها)
const syncWallet = async (ctx, card) => {
  if (!card.wallet_serial) return;
  const err = await wallet.updatePass(card.wallet_serial, await walletCtx(ctx, card));
  await rest(`loyalty_cards?id=eq.${card.id}`, { method: 'PATCH', body: { wallet_error: err } }).catch(() => {});
};
const publicInfo = (ctx) => ({
  store: { name: ctx.store.name, logo_url: ctx.store.logo_url },
  settings: { needed: ctx.settings.needed, reward: ctx.settings.reward, cooldown_hours: ctx.settings.cooldown_hours, design: ctx.settings.design },
  wallet: wallet.configured()
});

async function stampCard(ctx, card, distance) {
  const r = await rpc('server_loyalty_stamp', { p_card: card.id, p_cooldown_hours: ctx.settings.cooldown_hours, p_needed: ctx.settings.needed, p_distance: distance });
  const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0];
  if (r.ok) await syncWallet(ctx, fresh);
  return { stamped: !!r.ok, reason: r.ok ? null : r.reason, next_at: r.next_at || null, card: cardView(fresh) };
}

async function cardByToken(ctx, token) {
  if (!TOKEN_RE.test(String(token || ''))) throw new ApiError(404, 'البطاقة غير موجودة', 'NOT_FOUND');
  const card = (await rest(`loyalty_cards?token=eq.${q(token)}&client_id=eq.${ctx.store.id}&select=*`))[0];
  if (!card) throw new ApiError(404, 'البطاقة غير موجودة', 'NOT_FOUND');
  return card;
}

module.exports = handler(['GET', 'POST'], async (req, res) => {
  const action = req.query.action;
  const b = req.method === 'POST' ? readBody(req) : {};
  try {
    if (action === 'info' && req.method === 'GET') {
      return publicInfo(await loadStore(req.query.slug));
    }

    if (action === 'card' && req.method === 'GET') {
      const ctx = await loadStore(req.query.slug);
      const card = await cardByToken(ctx, req.query.t);
      // رسالة المحل تطلع إذا عمرها أقل من 14 يوم
      const m = await latestMessage(ctx.store.id, card.id);
      const message = m && Date.parse(m.created_at) > Date.now() - 14 * 864e5 ? { id: m.id, body: m.body, at: m.created_at } : null;
      return { ...publicInfo(ctx), card: cardView(card), message };
    }

    // بطاقة جديدة (أو رجوع لبطاقته من جوال ثاني بنفس الرقم، وهو داخل المحل) + ختم أول زيارة
    // أول تسجيل: الاسم والجوال والنوع (إجبارية) + أول ختم + رسالة ترحيب
    // ولو الرقم مسجل من قبل (غيّر جواله) نرجّع له بطاقته وهو داخل المحل
    if (action === 'join' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const profile = readProfile(b);
      const distance = checkPresence(ctx, b);
      let card = (await rest(`loyalty_cards?client_id=eq.${ctx.store.id}&phone=eq.${q(profile.phone)}&select=*`))[0];
      const isNew = !card;
      if (!card) {
        card = (await rest('loyalty_cards', {
          method: 'POST', prefer: 'return=representation',
          body: { client_id: ctx.store.id, token: crypto.randomBytes(18).toString('base64url'), ...profile }
        }))[0];
      } else if (!card.name || !card.gender) {
        await rest(`loyalty_cards?id=eq.${card.id}`, { method: 'PATCH', body: { name: card.name || profile.name, gender: card.gender || profile.gender } });
      }
      const out = await stampCard(ctx, card, distance);
      const welcome = isNew ? await welcomeMessage(ctx, { ...card, ...out.card }) : null;
      return { ...publicInfo(ctx), token: card.token, is_new: isNew, ...out, message: welcome };
    }

    // إكمال البيانات (للبطاقات القديمة اللي انسجلت بدون اسم). لو الرقم مربوط ببطاقة ثانية ندمجهم
    if (action === 'phone' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const card = await cardByToken(ctx, b.t);
      const profile = readProfile(b);
      const phone = profile.phone;
      const owner = (await rest(`loyalty_cards?client_id=eq.${ctx.store.id}&phone=eq.${q(phone)}&select=*`))[0];
      if (!owner || owner.id === card.id) {
        await rest(`loyalty_cards?id=eq.${card.id}`, { method: 'PATCH', body: profile });
        const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0];
        return { ...publicInfo(ctx), token: card.token, merged: false, card: cardView(fresh) };
      }
      checkPresence(ctx, b);
      const body = {
        stamps: Math.min(ctx.settings.needed, owner.stamps + card.stamps), visits: owner.visits + card.visits,
        rewards: owner.rewards + card.rewards, last_stamp_at: [owner.last_stamp_at, card.last_stamp_at].filter(Boolean).sort().pop() || null,
        name: owner.name || profile.name, gender: owner.gender || profile.gender
      };
      await rest(`loyalty_cards?id=eq.${owner.id}`, { method: 'PATCH', body });
      await rest(`loyalty_events?card_id=eq.${card.id}`, { method: 'PATCH', body: { card_id: owner.id } }).catch(() => {});
      await rest(`loyalty_cards?id=eq.${card.id}`, { method: 'DELETE' });
      const fresh = (await rest(`loyalty_cards?id=eq.${owner.id}&select=*`))[0];
      await syncWallet(ctx, fresh);
      return { ...publicInfo(ctx), token: owner.token, merged: true, card: cardView(fresh) };
    }

    if (action === 'stamp' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const card = await cardByToken(ctx, b.t);
      const distance = checkPresence(ctx, b);
      return { ...publicInfo(ctx), ...(await stampCard(ctx, card, distance)) };
    }

    // استخدام المكافأة: الزبون يضغط بنفسه قدام الموظف، وتطلع له شاشة تأكيد حيّة
    if (action === 'redeem' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const card = await cardByToken(ctx, b.t);
      if (card.stamps < ctx.settings.needed) throw new ApiError(409, 'ما كملت الأختام للحين', 'NOT_ENOUGH');
      const distance = checkPresence(ctx, b);
      const r = await rpc('server_loyalty_redeem', { p_card: card.id, p_needed: ctx.settings.needed, p_distance: distance });
      if (!r.ok) throw new ApiError(409, 'ما كملت الأختام للحين', 'NOT_ENOUGH');
      const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0];
      await syncWallet(ctx, fresh);
      return { ...publicInfo(ctx), redeemed: true, redeemed_at: new Date().toISOString(), card: cardView(fresh) };
    }

    // إضافة البطاقة للمحفظة: نجهزها أول مرة يطلبها الزبون بس (عشان ما نستهلك رصيد الخدمة على الكل)
    if (action === 'wallet' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const card = await cardByToken(ctx, b.t);
      if (card.wallet_url) return { url: card.wallet_url };
      const pass = await wallet.createPass(await walletCtx(ctx, card));
      await rest(`loyalty_cards?id=eq.${card.id}`, { method: 'PATCH', body: { wallet_serial: pass.serialNumber, wallet_url: pass.shareUrl } });
      return { url: pass.shareUrl };
    }
  } catch (e) {
    // نرجّع المسافة مع رفض "بعيد" عشان الصفحة توضحها للزبون
    if (e.extra && !res.headersSent) return res.status(e.status).json({ error: e.message, code: e.code, ...e.extra });
    throw e;
  }
  throw new ApiError(404, 'Unknown action');
});
module.exports.config = { maxDuration: 30 };
