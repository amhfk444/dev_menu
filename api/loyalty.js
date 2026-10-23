// =====================================================================
// DEV MENU — بطاقة الولاء (صفحة الزبون، بدون تطبيق وبدون الكاشير)
//   GET  /api/loyalty?action=info&slug=        اسم المتجر وإعدادات البطاقة
//   GET  /api/loyalty?action=card&slug=&t=     بطاقة الزبون
//   POST /api/loyalty?action=join              بطاقة جديدة + أول ختم { slug, name, phone, lat, lng, acc }
//   POST /api/loyalty?action=stamp             ختم زيارة { slug, t, lat, lng, acc }
//   POST /api/loyalty?action=redeem            استخدام المكافأة قدام الموظف { slug, t, lat, lng, acc }
//   POST /api/loyalty?action=wallet            رابط إضافة البطاقة لمحفظة آبل أو قوقل { slug, t }
// كل ختم يحتاج الزبون يكون داخل نطاق المحل (50 متر افتراضياً). ما نخزن موقعه، بس المسافة.
// =====================================================================
const crypto = require('crypto');
const { handler, rest, rpc, q, ApiError, readBody, findPublicStore, str, waNumber } = require('./_lib/core');
const { normalizeLoyalty, distanceM, validPoint } = require('./_lib/loyalty');
const wallet = require('./_lib/wallet');

const TOKEN_RE = /^[A-Za-z0-9_-]{10,64}$/;
const MAX_ACCURACY_M = 100;   // دقة أسوأ من كذا = نطلب منه يحاول مرة ثانية

async function loadStore(slug) {
  const { store, bad } = await findPublicStore(slug, 'id,name,client_slug,logo_url');
  if (bad) throw new ApiError(400, 'الرابط غير صحيح');
  if (!store) throw new ApiError(404, 'بطاقة الولاء غير متاحة حالياً', 'NOT_AVAILABLE');
  const extra = (await rest(`clients?id=eq.${store.id}&select=loyalty_enabled,loyalty_settings,loyalty_lat,loyalty_lng`))[0] || {};
  if (!extra.loyalty_enabled) throw new ApiError(404, 'بطاقة الولاء غير متاحة حالياً', 'NOT_AVAILABLE');
  return { store, settings: normalizeLoyalty(extra.loyalty_settings), lat: extra.loyalty_lat, lng: extra.loyalty_lng };
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

const cardView = (c) => ({ name: c.name, stamps: c.stamps, visits: c.visits, rewards: c.rewards, last_stamp_at: c.last_stamp_at, in_wallet: !!c.wallet_url });

// رابط صفحة البطاقة (يطلع في المحفظة)
const cardUrl = (slug) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) && !['app', 'www'].includes(slug)
  ? `https://${slug}.devmenu.digital/loyalty` : `https://www.devmenu.digital/loyalty.html?client=${encodeURIComponent(slug)}`;
const walletCtx = (ctx, card) => ({ store: ctx.store, settings: ctx.settings, card, url: cardUrl(ctx.store.client_slug), lat: ctx.lat, lng: ctx.lng });
// البطاقة في المحفظة تتحدث مع كل ختم (لو الزبون ضافها)
const syncWallet = (ctx, card) => card.wallet_serial ? wallet.updatePass(card.wallet_serial, walletCtx(ctx, card)) : null;
const publicInfo = (ctx) => ({
  store: { name: ctx.store.name, logo_url: ctx.store.logo_url },
  settings: { needed: ctx.settings.needed, reward: ctx.settings.reward, cooldown_hours: ctx.settings.cooldown_hours },
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
      return { ...publicInfo(ctx), card: cardView(card) };
    }

    // بطاقة جديدة (أو رجوع لبطاقته من جوال ثاني بنفس الرقم، وهو داخل المحل) + ختم أول زيارة
    if (action === 'join' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const name = str(b.name, 40, 'الاسم');
      if (name.length < 2) throw new ApiError(400, 'اكتب اسمك');
      let phone;
      try { phone = waNumber(b.phone); } catch { throw new ApiError(400, 'رقم الجوال غير صحيح'); }
      if (!phone) throw new ApiError(400, 'اكتب رقم جوالك');
      const distance = checkPresence(ctx, b);
      let card = (await rest(`loyalty_cards?client_id=eq.${ctx.store.id}&phone=eq.${q(phone)}&select=*`))[0];
      const isNew = !card;
      if (!card) {
        card = (await rest('loyalty_cards', {
          method: 'POST', prefer: 'return=representation',
          body: { client_id: ctx.store.id, token: crypto.randomBytes(18).toString('base64url'), name, phone }
        }).catch(async (e) => {
          // تسجيل بنفس الرقم في نفس اللحظة
          const again = (await rest(`loyalty_cards?client_id=eq.${ctx.store.id}&phone=eq.${q(phone)}&select=*`))[0];
          if (again) return [again];
          throw e;
        }))[0];
      }
      const out = await stampCard(ctx, card, distance);
      return { ...publicInfo(ctx), token: card.token, is_new: isNew, ...out };
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
      const pass = await wallet.createPass(walletCtx(ctx, card));
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
