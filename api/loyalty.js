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
const { normalizeLoyalty, distanceM, validPoint, isHappyNow } = require('./_lib/loyalty');
const wallet = require('./_lib/wallet');
const { nearLineFor } = require('./_lib/loyalty-assistant');
const { loyaltyMessages } = require('./_lib/ai');
const { purchaseStamp, consumeStampCode, pagerTicket, cooldownLeft, leftText } = require('./_lib/loyalty-stamp');

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

const cardView = (c) => ({ id: c.id, name: c.name || null, gender: c.gender || null, stamps: c.stamps, visits: c.visits, rewards: c.rewards, last_stamp_at: c.last_stamp_at, in_wallet: !!c.wallet_url, has_phone: !!c.phone, has_profile: !!(c.name && c.phone && c.gender) });

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
  settings: { needed: ctx.settings.needed, reward: ctx.settings.reward, cooldown_hours: ctx.settings.cooldown_hours, design: ctx.settings.design,
              happy: ctx.settings.happy, gifts: ctx.settings.gifts.enabled, stamp_mode: ctx.settings.stamp_mode, pager_stamp: ctx.settings.pager_stamp },
  happy_now: isHappyNow(ctx.settings),
  wallet: wallet.configured()
});

// ختم زيارة (ختمين في ساعات الهدوء)
async function stampCard(ctx, card, distance) {
  const count = isHappyNow(ctx.settings) ? 2 : 1;
  const r = await rpc('server_loyalty_stamp', { p_card: card.id, p_cooldown_hours: ctx.settings.cooldown_hours, p_needed: ctx.settings.needed, p_distance: distance, p_count: count });
  const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0];
  if (r.ok) await syncWallet(ctx, fresh);
  return { stamped: !!r.ok, count: r.ok ? count : 0, reason: r.ok ? null : r.reason, next_at: r.next_at || null, card: cardView(fresh) };
}

const FEEDBACK = ['wait', 'price', 'quality', 'far', 'busy', 'other'];
// "ليش ما رجعت؟" يطلع للي غاب 10 أيام وأكثر، ومرة وحدة كل شهرين
async function surveyDue(ctx, card) {
  if (!ctx.settings.feedback.enabled || !card.last_stamp_at) return false;
  if (Date.now() - Date.parse(card.last_stamp_at) < 10 * 864e5) return false;
  const last = await rest(`loyalty_feedback?card_id=eq.${card.id}&created_at=gte.${q(new Date(Date.now() - 60 * 864e5).toISOString())}&select=id&limit=1`).catch(() => [1]);
  return !last.length;
}
// "نوف" ← "نـ**" (يتأكد إنه الشخص الصح بدون ما نكشف الاسم كامل)
const maskName = (n) => { const f = String(n || '').trim().split(/\s+/)[0]; return f ? (f.length <= 2 ? `${f[0]}*` : `${f.slice(0, 2)}${'*'.repeat(Math.min(4, f.length - 2))}`) : 'عضو'; };

// الزبون مختوم قبل شوي: الكود ما ينستهلك، وشاشة الكاشير تعرف السبب
async function assertNotCooling(ctx, card, code) {
  const next = cooldownLeft(card, ctx.settings);
  if (!next) return;
  const why = `ختمت قبل شوي، الختم الجاي بعد ${leftText(next)}`;
  await rest(`loyalty_stamp_codes?code=eq.${q(String(code || ''))}&client_id=eq.${ctx.store.id}&used_at=is.null`, { method: 'PATCH', body: { card_id: card.id, note: why } }).catch(() => {});
  throw new ApiError(409, why, 'COOLDOWN');
}

// الهدايا اللي وصلت لهالبطاقة وما استخدمها
async function giftsFor(ctx, card) {
  const rows = await rest(`loyalty_gifts?to_card=eq.${card.id}&status=eq.claimed&expires_at=gt.${q(new Date().toISOString())}&select=code,reward,from_card,expires_at&order=id.desc&limit=5`).catch(() => []);
  if (!rows.length) return [];
  const from = await rest(`loyalty_cards?id=in.(${rows.map(r => r.from_card).join(',')})&select=id,name`).catch(() => []);
  const names = Object.fromEntries(from.map(f => [f.id, f.name]));
  return rows.map(r => ({ code: r.code, reward: r.reward, from: names[r.from_card] || 'صديقك', expires_at: r.expires_at }));
}
// ربط هدية بالبطاقة (الصديق استلمها)
async function claimGift(ctx, card, code, isNew) {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(String(code || ''))) return null;
  const g = (await rest(`loyalty_gifts?code=eq.${q(code)}&client_id=eq.${ctx.store.id}&select=*`))[0];
  if (!g) throw new ApiError(404, 'الهدية غير موجودة', 'GIFT_NOT_FOUND');
  if (g.from_card === card.id) throw new ApiError(409, 'ما تقدر تستلم هديتك أنت، أرسلها لصديقك', 'OWN_GIFT');
  if (g.status !== 'sent') {
    if (g.to_card === card.id) return g;
    throw new ApiError(409, 'هذي الهدية انستلمت من قبل', 'GIFT_TAKEN');
  }
  if (Date.parse(g.expires_at) < Date.now()) throw new ApiError(409, 'انتهت صلاحية الهدية', 'GIFT_EXPIRED');
  const rows = await rest(`loyalty_gifts?id=eq.${g.id}&status=eq.sent`, { method: 'PATCH', prefer: 'return=representation', body: { to_card: card.id, status: 'claimed', claimed_at: new Date().toISOString(), new_member: !!isNew } });
  if (!rows.length) throw new ApiError(409, 'هذي الهدية انستلمت من قبل', 'GIFT_TAKEN');
  return rows[0];
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
      const [survey, gifts] = await Promise.all([surveyDue(ctx, card), giftsFor(ctx, card)]);
      return { ...publicInfo(ctx), card: cardView(card), message, survey, gifts };
    }

    // بطاقة جديدة (أو رجوع لبطاقته من جوال ثاني بنفس الرقم، وهو داخل المحل) + ختم أول زيارة
    // أول تسجيل: الاسم والجوال والنوع (إجبارية) + أول ختم + رسالة ترحيب
    // ولو الرقم مسجل من قبل (غيّر جواله) نرجّع له بطاقته وهو داخل المحل
    if (action === 'join' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const profile = readProfile(b);
      // الإثبات: كود الكاشير، أو رقم بيجر، أو الموقع (لو المحل يسمح بالختم بالموقع)
      const ticket = !b.code && b.pt ? await pagerTicket(ctx.store.id, b.pt) : null;
      if (b.pt && !b.code && (!ticket || Date.now() - Date.parse(ticket.created_at) > 18 * 3600e3)) throw new ApiError(409, 'رقم البيجر منتهي، اطلب كود الختم من الكاشير', 'BAD_TICKET');
      if (!b.code && !ticket && ctx.settings.stamp_mode === 'purchase') throw new ApiError(409, 'الختم في هذا المحل بعد الشراء: امسح كود الختم من الكاشير', 'PURCHASE_ONLY');
      const distance = b.code || ticket ? null : checkPresence(ctx, b);
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
      let out;
      if (b.code) {
        if (!isNew) await assertNotCooling(ctx, card, b.code);
        await consumeStampCode(ctx.store.id, b.code, card.id);
        const r = await purchaseStamp(ctx.store.id, card.id, ctx.settings);
        out = { ...r, card: cardView((await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0]) };
      } else if (ticket) {
        // نربط البطاقة برقم البيجر: ينختم لما يجهز الطلب (أو الحين لو جاهز)
        await rest(`pager_tickets?id=eq.${ticket.id}`, { method: 'PATCH', body: { loyalty_card_id: card.id } });
        let r = { stamped: false, count: 0, reason: 'PAGER_PENDING' };
        if (['ready', 'done'].includes(ticket.status) && !ticket.loyalty_stamped) {
          r = await purchaseStamp(ctx.store.id, card.id, ctx.settings);
          await rest(`pager_tickets?id=eq.${ticket.id}`, { method: 'PATCH', body: { loyalty_stamped: true } });
        }
        out = { ...r, card: cardView((await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0]) };
      } else out = await stampCard(ctx, card, distance);
      // جاي من رابط هدية: نستلمها مع التسجيل
      let gift_error = null;
      if (b.gift) { try { await claimGift(ctx, card, b.gift, isNew); } catch (e) { gift_error = e.message; } }
      const welcome = isNew ? await welcomeMessage(ctx, { ...card, ...out.card }) : null;
      return { ...publicInfo(ctx), token: card.token, is_new: isNew, ...out, message: welcome, gifts: await giftsFor(ctx, card), gift_error };
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

    // الزبون ما يختم بنفسه: الختم بكود الكاشير أو مع البيجر بس
    if (action === 'stamp' && req.method === 'POST') {
      throw new ApiError(409, 'الختم بعد الشراء: اطلب من الكاشير كود الختم وامسحه', 'PURCHASE_ONLY');
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

    // ─── ختم بكود الكاشير (بعد الدفع) ───
    if (action === 'stamp-code' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const card = await cardByToken(ctx, b.t);
      await assertNotCooling(ctx, card, b.code);
      await consumeStampCode(ctx.store.id, b.code, card.id);
      const r = await purchaseStamp(ctx.store.id, card.id, ctx.settings);
      const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0];
      return { ...publicInfo(ctx), ...r, card: cardView(fresh) };
    }

    // ─── ربط بطاقة موجودة برقم بيجر (من صفحة البيجر) ───
    if (action === 'pager-link' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const card = await cardByToken(ctx, b.t);
      const ticket = await pagerTicket(ctx.store.id, b.pt);
      if (!ticket || Date.now() - Date.parse(ticket.created_at) > 18 * 3600e3) throw new ApiError(409, 'رقم البيجر منتهي', 'BAD_TICKET');
      if (ticket.loyalty_card_id && ticket.loyalty_card_id !== card.id) throw new ApiError(409, 'هذا الطلب مربوط ببطاقة ثانية', 'TICKET_TAKEN');
      await rest(`pager_tickets?id=eq.${ticket.id}`, { method: 'PATCH', body: { loyalty_card_id: card.id } });
      let r = { stamped: false, count: 0, reason: 'PAGER_PENDING' };
      if (['ready', 'done'].includes(ticket.status) && !ticket.loyalty_stamped) {
        await rest(`pager_tickets?id=eq.${ticket.id}`, { method: 'PATCH', body: { loyalty_stamped: true } });
        r = await purchaseStamp(ctx.store.id, card.id, ctx.settings);
      }
      const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0];
      return { ...publicInfo(ctx), ...r, card: cardView(fresh) };
    }

    // ─── ليش ما رجعت؟ ───
    if (action === 'feedback' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const card = await cardByToken(ctx, b.t);
      if (!FEEDBACK.includes(b.reason)) throw new ApiError(400, 'اختر سبب');
      if (!(await surveyDue(ctx, card))) throw new ApiError(409, 'وصلنا ردك، شكراً لك', 'DONE');
      const note = String(b.note || '').replace(/\s+/g, ' ').trim().slice(0, 300);
      await rest('loyalty_feedback', { method: 'POST', body: { client_id: ctx.store.id, card_id: card.id, reason: b.reason, note: note || null } });
      // ختم هدية على الرد (لو صاحب المحل مفعّلها)
      let gifted = false;
      if (ctx.settings.feedback.gift && card.stamps < ctx.settings.needed) {
        const r = await rpc('server_loyalty_stamp', { p_card: card.id, p_cooldown_hours: 0, p_needed: ctx.settings.needed, p_distance: null, p_count: 1 });
        gifted = !!r.ok;
      }
      const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0];
      if (gifted) await syncWallet(ctx, fresh);
      return { ok: true, gifted, card: cardView(fresh) };
    }

    // ─── رقم عضوية صديق: نعرض اسمه مخفي جزئياً عشان يتأكد قبل الإهداء ───
    if (action === 'member-lookup' && req.method === 'GET') {
      const ctx = await loadStore(req.query.slug);
      const id = parseInt(String(req.query.id || '').replace(/[^\d]/g, ''), 10);
      const m = Number.isInteger(id) ? (await rest(`loyalty_cards?id=eq.${id}&client_id=eq.${ctx.store.id}&select=id,name`))[0] : null;
      if (!m) throw new ApiError(404, 'ما لقينا عضو بهذا الرقم في هذا المحل', 'NO_MEMBER');
      return { member: { id: m.id, name: maskName(m.name) } };
    }

    // ─── أهدِ مكافأتك لصديق برقم عضويته: تنقص أختامك وتنتقل الهدية لبطاقته على طول ───
    if (action === 'gift' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      if (!ctx.settings.gifts.enabled) throw new ApiError(403, 'الإهداء متوقف في هذا المحل');
      const card = await cardByToken(ctx, b.t);
      const toId = parseInt(String(b.to || '').replace(/[^\d]/g, ''), 10);
      const friend = Number.isInteger(toId) ? (await rest(`loyalty_cards?id=eq.${toId}&client_id=eq.${ctx.store.id}&select=*`))[0] : null;
      if (!friend) throw new ApiError(404, 'ما لقينا عضو بهذا الرقم في هذا المحل', 'NO_MEMBER');
      if (friend.id === card.id) throw new ApiError(409, 'هذا رقم عضويتك أنت، اكتب رقم صديقك', 'OWN_GIFT');
      if (card.stamps < ctx.settings.needed) throw new ApiError(409, 'ما كملت الأختام للحين', 'NOT_ENOUGH');
      const r = await rpc('server_loyalty_gift', { p_card: card.id, p_needed: ctx.settings.needed });
      if (!r.ok) throw new ApiError(409, 'ما كملت الأختام للحين', 'NOT_ENOUGH');
      const now = new Date().toISOString();
      await rest('loyalty_gifts', { method: 'POST', body: { client_id: ctx.store.id, code: crypto.randomBytes(9).toString('base64url'), from_card: card.id, to_card: friend.id, reward: ctx.settings.reward, status: 'claimed', claimed_at: now } });
      // رسالة لصديقه: تطلع في بطاقته وإشعار في محفظته
      const who = card.name ? card.name.split(' ')[0] : 'صديقك';
      await rest('loyalty_messages', { method: 'POST', body: { client_id: ctx.store.id, card_id: friend.id, body: `${who} أهداك ${ctx.settings.reward} 🎁 استخدمها من ${ctx.store.name} خلال 30 يوم`, source: 'owner', kind: 'gift' } }).catch(() => {});
      const fresh = (await rest(`loyalty_cards?id=eq.${card.id}&select=*`))[0];
      await syncWallet(ctx, fresh);
      await syncWallet(ctx, friend);
      return { ok: true, to: { id: friend.id, name: maskName(friend.name) }, card: cardView(fresh) };
    }

    // ─── رابط الهدية: مين أهداها ووش هي ───
    if (action === 'gift-info' && req.method === 'GET') {
      const ctx = await loadStore(req.query.slug);
      const g = (await rest(`loyalty_gifts?code=eq.${q(String(req.query.code || ''))}&client_id=eq.${ctx.store.id}&select=from_card,reward,status,expires_at`))[0];
      if (!g) throw new ApiError(404, 'الهدية غير موجودة', 'GIFT_NOT_FOUND');
      const from = (await rest(`loyalty_cards?id=eq.${g.from_card}&select=name`))[0] || {};
      return { ...publicInfo(ctx), gift: { from: from.name ? from.name.split(' ')[0] : 'صديقك', reward: g.reward, available: g.status === 'sent' && Date.parse(g.expires_at) > Date.now() } };
    }

    // ─── استلام هدية لبطاقة موجودة ───
    if (action === 'gift-claim' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const card = await cardByToken(ctx, b.t);
      await claimGift(ctx, card, b.code, false);
      return { ok: true, gifts: await giftsFor(ctx, card) };
    }

    // ─── استخدام الهدية في المحل (قدام الموظف) ───
    if (action === 'gift-redeem' && req.method === 'POST') {
      const ctx = await loadStore(b.slug);
      const card = await cardByToken(ctx, b.t);
      checkPresence(ctx, b);
      const rows = await rest(`loyalty_gifts?code=eq.${q(String(b.code || ''))}&to_card=eq.${card.id}&status=eq.claimed&expires_at=gt.${q(new Date().toISOString())}`,
        { method: 'PATCH', prefer: 'return=representation', body: { status: 'redeemed', redeemed_at: new Date().toISOString() } });
      if (!rows.length) throw new ApiError(409, 'الهدية مستخدمة أو منتهية', 'GIFT_USED');
      await rest('loyalty_events', { method: 'POST', body: { client_id: ctx.store.id, card_id: card.id, kind: 'gift_redeem' } }).catch(() => {});
      return { ok: true, reward: rows[0].reward, redeemed_at: new Date().toISOString(), gifts: await giftsFor(ctx, card) };
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
