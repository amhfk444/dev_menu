// =====================================================================
// DEV MENU — الختم مع الشراء (كود الكاشير أو البيجر)
// ما يحتاج موقع ولا فترة انتظار بين الأختام: الشراء نفسه هو الإثبات
// =====================================================================
const crypto = require('crypto');
const { rest, rpc, q, ApiError } = require('./core');
const { normalizeLoyalty, isHappyNow } = require('./loyalty');
const { pushWalletCards } = require('./loyalty-assistant');

// ختم مع الشراء: يلتزم بإعداد "ختم واحد كل" عشان ما يتكرر مع كل رقم بيجر أو كود
async function purchaseStamp(storeId, cardId, settings = null) {
  if (!settings) {
    const extra = (await rest(`clients?id=eq.${storeId}&select=loyalty_settings`))[0] || {};
    settings = normalizeLoyalty(extra.loyalty_settings);
  }
  const count = isHappyNow(settings) ? 2 : 1;
  const r = await rpc('server_loyalty_stamp', { p_card: cardId, p_cooldown_hours: settings.cooldown_hours, p_needed: settings.needed, p_distance: null, p_count: count });
  if (r.ok) await pushWalletCards(storeId, { cardIds: [cardId] }).catch(e => console.error('WALLET_SYNC', e.message));
  return { stamped: !!r.ok, count: r.ok ? count : 0, reason: r.ok ? null : r.reason, next_at: r.next_at || null };
}

// الزبون مختوم قبل شوي؟ يرجّع وقت الختم الجاي أو null
function cooldownLeft(card, settings) {
  if (!card.last_stamp_at) return null;
  const next = Date.parse(card.last_stamp_at) + settings.cooldown_hours * 3600e3;
  return next > Date.now() ? new Date(next).toISOString() : null;
}
const leftText = (iso) => {
  const ms = Date.parse(iso) - Date.now(), h = Math.floor(ms / 3600e3), m = Math.ceil((ms % 3600e3) / 60e3);
  return h ? `${h} ساعة${m && h < 3 ? ` و ${m} دقيقة` : ''}` : `${m} دقيقة`;
};

// كود ختم جديد لشاشة الكاشير (يصلح لزبون واحد ولمدة 90 ثانية)
async function newStampCode(storeId) {
  const code = crypto.randomBytes(12).toString('base64url');
  const row = (await rest('loyalty_stamp_codes', { method: 'POST', prefer: 'return=representation', body: { client_id: storeId, code } }))[0];
  return row;
}

// استخدام الكود (مرة وحدة بس)
async function consumeStampCode(storeId, code, cardId) {
  if (!/^[A-Za-z0-9_-]{10,40}$/.test(String(code || ''))) throw new ApiError(400, 'كود الختم غير صحيح', 'BAD_CODE');
  const rows = await rest(`loyalty_stamp_codes?code=eq.${q(code)}&client_id=eq.${storeId}&used_at=is.null&expires_at=gt.${q(new Date().toISOString())}`,
    { method: 'PATCH', prefer: 'return=representation', body: { used_at: new Date().toISOString(), card_id: cardId } });
  if (!rows.length) throw new ApiError(409, 'الكود انتهى أو انستخدم، اطلب كود جديد من الكاشير', 'CODE_USED');
  return rows[0];
}

// رقم البيجر كإثبات شراء (للتسجيل من صفحة البيجر)
async function pagerTicket(storeId, token) {
  if (!/^[A-Za-z0-9_-]{10,64}$/.test(String(token || ''))) return null;
  return (await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${storeId}&select=id,status,created_at,loyalty_card_id,loyalty_stamped`).catch(() => []))[0] || null;
}

// كود العضوية اللي يعرضه الزبون للكاشير: DMV1.<رقم العضوية>.<توقيع>
// التوقيع بمفتاح الخادم، فما أحد يقدر يسوي كود لرقم ثاني. وما فيه الرقم السري للبطاقة
const SECRET = `devmenu-member:${process.env.SUPABASE_SERVICE_ROLE_KEY || ''}`;
const sign = (storeId, cardId) => crypto.createHmac('sha256', SECRET).update(`${storeId}:${cardId}`).digest('base64url').slice(0, 10);
const memberQr = (card) => `DMV1.${card.id}.${sign(card.client_id, card.id)}`;
function parseMemberQr(storeId, value) {
  const m = String(value || '').trim().match(/^DMV1\.(\d{1,12})\.([A-Za-z0-9_-]{10})$/);
  if (!m) return null;
  const id = Number(m[1]);
  return crypto.timingSafeEqual(Buffer.from(m[2]), Buffer.from(sign(storeId, id))) ? id : null;
}

module.exports = { purchaseStamp, newStampCode, consumeStampCode, pagerTicket, cooldownLeft, leftText, memberQr, parseMemberQr };
