// =====================================================================
// DEV MENU — الدفع الإلكتروني من المنيو (Moyasar)
// كل مطعم يربط حساب Moyasar الخاص فيه: الفلوس تروح لحسابه مباشرة، و DEV MENU ما يلمسها.
// المفتاح السري يتخزن مشفّر (AES-256-GCM) في payment_settings، وما يطلع للمتصفح أبداً.
// مفتاح التشفير: PAYMENT_ENC_KEY في Vercel (ولو ما انضبط نشتقه من مفتاح Supabase السري).
// =====================================================================
const crypto = require('crypto');
const { rest, rpc, q, ApiError } = require('./core');

const ENC_SOURCE = process.env.PAYMENT_ENC_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const encKey = () => {
  if (!ENC_SOURCE) throw new ApiError(500, 'تشفير مفاتيح الدفع غير مضبوط في الخادم');
  return crypto.createHash('sha256').update(`devmenu-pay:${ENC_SOURCE}`).digest();
};
function encrypt(text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', encKey(), iv);
  const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), data].map(b => b.toString('base64url')).join('.');
}
function decrypt(blob) {
  const [iv, tag, data] = String(blob || '').split('.').map(s => Buffer.from(s, 'base64url'));
  const d = crypto.createDecipheriv('aes-256-gcm', encKey(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(data), d.final()]).toString('utf8');
}

const SECRET_RE = /^sk_(test|live)_[A-Za-z0-9]{10,100}$/;

// إعدادات الدفع لمتجر (مع المفتاح السري مفكوك) — null لو ما فيه أو الجدول ما انضاف
async function paySettings(clientId) {
  let row;
  try { row = (await rest(`payment_settings?client_id=eq.${clientId}&select=*&limit=1`))[0]; } catch { return null; }
  if (!row) return null;
  let secret = '';
  try { secret = row.secret_key_enc ? decrypt(row.secret_key_enc) : ''; } catch { secret = ''; }
  return { enabled: row.enabled === true && !!secret, live: row.live === true, secret, hasSecret: !!secret };
}

// ─── Moyasar ───
async function moyasar(secret, method, path, body) {
  const r = await fetch(`https://api.moyasar.com/v1/${path}`, {
    method,
    headers: { Authorization: `Basic ${Buffer.from(`${secret}:`).toString('base64')}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await r.json(); } catch {}
  if (!r.ok) {
    const msg = (data && (data.message || data.type)) || `Moyasar ${r.status}`;
    console.error('MOYASAR_ERROR', r.status, msg, data && data.errors);
    const err = new ApiError(r.status === 401 ? 400 : 502, r.status === 401 ? 'مفتاح Moyasar غير صحيح' : 'تعذر الاتصال ببوابة الدفع');
    err.providerStatus = r.status;
    throw err;
  }
  return data;
}
// المبلغ بأصغر وحدة (هللة): الدينار الكويتي/البحريني/العماني/الأردني والتونسي بـ 3 خانات
const DECIMALS3 = new Set(['KWD', 'BHD', 'OMR', 'JOD', 'TND']);
const minorUnits = (amount, currency) => Math.round(Number(amount) * (DECIMALS3.has(currency) ? 1000 : 100));

// ─── تأكيد الدفع (من الرجوع لصفحة الطلب أو من إشعار Moyasar) ───
// ما نثق بأي بيانات جاية من المتصفح أو الإشعار: نسأل Moyasar بنفسنا عن الفاتورة
async function refreshOrder(order) {
  if (order.status !== 'pending' || !order.payment_ref) return order;
  const pay = await paySettings(order.client_id);
  if (!pay || !pay.secret) return order;
  let inv;
  try { inv = await moyasar(pay.secret, 'GET', `invoices/${encodeURIComponent(order.payment_ref)}`); } catch { return order; }
  if (inv.status === 'paid' && Number(inv.amount) === minorUnits(order.total, order.currency)) return markPaid(order);
  if (['failed', 'canceled', 'expired'].includes(inv.status)) {
    await rest(`orders?id=eq.${order.id}&status=eq.pending`, { method: 'PATCH', body: { status: 'failed' } }).catch(() => {});
    return { ...order, status: 'failed' };
  }
  return order;
}

// مدفوع ← رقم بيجر تلقائي، عشان الطلب يطلع في شاشة الكاشير ويرن جوال العميل لما يجهز
async function markPaid(order) {
  const rows = await rest(`orders?id=eq.${order.id}&status=eq.pending`, {
    method: 'PATCH', body: { status: 'paid', paid_at: new Date().toISOString() }, prefer: 'return=representation'
  });
  if (!rows.length) return (await rest(`orders?id=eq.${order.id}&select=*`))[0];   // انحسب قبل (الإشعار والصفحة وصلوا مع بعض)
  let paid = rows[0];
  try {
    const token = crypto.randomBytes(18).toString('base64url');
    const t = await rpc('server_pager_take', { p_client_id: order.client_id, p_token: token });
    const ticket = (await rest(`pager_tickets?token=eq.${q(token)}&select=id`))[0];
    if (ticket) {
      await rest(`pager_tickets?id=eq.${ticket.id}`, { method: 'PATCH', body: { order_id: order.id, invoice_no: `#${order.id}` } }).catch(() => {});
      paid = (await rest(`orders?id=eq.${order.id}`, { method: 'PATCH', body: { pager_ticket_id: ticket.id }, prefer: 'return=representation' }))[0] || paid;
    }
    console.log('ORDER_PAID', order.client_id, order.id, t && t.number);
  } catch (e) { console.error('ORDER_PAGER_FAILED', order.id, e.message); }
  if (order.coupon_id) rpc('redeem_coupon', { p_coupon_id: order.coupon_id }).catch(() => {});
  return paid;
}

module.exports = { encrypt, SECRET_RE, paySettings, moyasar, minorUnits, refreshOrder, markPaid };
