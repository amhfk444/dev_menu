// =====================================================================
// DEV MENU — ربط قوقل ماب (Google Business Profile)
// صاحب المطعم يربط حسابه مرة وحدة (OAuth)، ونحفظ مفتاح التجديد (refresh token) مشفّر.
// بعدها نقرأ تعليقات فرعه وننشر الرد اللي يوافق عليه — كل شي باسم حسابه وبصلاحيته.
// المتغيرات في Vercel: GOOGLE_CLIENT_ID و GOOGLE_CLIENT_SECRET
// =====================================================================
const crypto = require('crypto');
const { ApiError } = require('./core');

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const REDIRECT_URI = `${(process.env.SITE_URL || 'https://www.devmenu.digital').replace(/\/+$/, '')}/api/google-callback`;
const SCOPES = 'https://www.googleapis.com/auth/business.manage openid email';
const configured = () => !!(CLIENT_ID && CLIENT_SECRET);

// ─── تشفير المفتاح + توقيع حالة الربط ───
const ENC_SOURCE = process.env.TOKEN_ENC_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const encKey = () => crypto.createHash('sha256').update(`devmenu-google:${ENC_SOURCE}`).digest();
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
// state = رقم المتجر + وقت الانتهاء، موقّع عشان ما أحد يربط حسابه بمتجر غيره
// r = الرابط اللي يرجع له بعد الربط (?client= للمدير العام أو ?branch= للفروع)
function signState(clientId, back = '') {
  const r = /^\?(client=[a-z0-9_-]{2,60}|branch=\d{1,12})$/.test(back) ? back : '';
  const body = Buffer.from(JSON.stringify({ c: clientId, r, e: Date.now() + 15 * 60e3, n: crypto.randomBytes(6).toString('hex') })).toString('base64url');
  const sig = crypto.createHmac('sha256', CLIENT_SECRET).update(body).digest('base64url');
  return `${body}.${sig}`;
}
function verifyState(state) {
  const [body, sig] = String(state || '').split('.');
  if (!body || !sig) return null;
  const good = crypto.createHmac('sha256', CLIENT_SECRET).update(body).digest('base64url');
  if (sig.length !== good.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null;
  const s = JSON.parse(Buffer.from(body, 'base64url').toString());
  return s.e > Date.now() ? s : null;
}

// ─── OAuth ───
function authUrl(clientId, back) {
  if (!configured()) throw new ApiError(503, 'ربط قوقل غير مضبوط في الخادم بعد', 'GOOGLE_OFF');
  const p = new URLSearchParams({
    client_id: CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: 'code', scope: SCOPES,
    access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state: signState(clientId, back)
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}
async function tokenRequest(params) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: CLIENT_SECRET, ...params })
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (d.error === 'invalid_grant') throw new ApiError(401, 'انتهى ربط حساب قوقل، اربطه من جديد', 'GOOGLE_RECONNECT');
    console.error('GOOGLE_TOKEN', r.status, d.error, d.error_description);
    throw new ApiError(502, 'تعذر الاتصال بقوقل');
  }
  return d;
}
const exchangeCode = (code) => tokenRequest({ code, grant_type: 'authorization_code', redirect_uri: REDIRECT_URI });
async function accessToken(refreshTokenEnc) {
  const d = await tokenRequest({ refresh_token: decrypt(refreshTokenEnc), grant_type: 'refresh_token' });
  return d.access_token;
}
// الإيميل من id_token (جاي مباشرة من قوقل عبر HTTPS في نفس الطلب، فما يحتاج تحقق توقيع)
function emailFromIdToken(idToken) {
  try { return JSON.parse(Buffer.from(String(idToken).split('.')[1], 'base64url').toString()).email || null; } catch { return null; }
}

// ─── Business Profile APIs ───
async function gapi(token, url, { method = 'GET', body } = {}) {
  const r = await fetch(url, {
    method, headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (r.ok) return d;
  const msg = (d.error && d.error.message) || '';
  const status = (d.error && d.error.status) || '';
  console.error('GOOGLE_API', r.status, status, msg.slice(0, 200));
  // قبل موافقة قوقل على طلب الوصول: الحد صفر طلب في الدقيقة
  if (r.status === 429 || /quota/i.test(msg)) throw new ApiError(503, 'قوقل لسا ما وافق على صلاحية DEV MENU لقراءة التقييمات، جرّب لاحقاً', 'GOOGLE_NOT_APPROVED');
  if (r.status === 403 && /has not been used|disabled|SERVICE_DISABLED/i.test(msg + status)) throw new ApiError(503, 'واجهة قوقل غير مفعّلة في مشروع DEV MENU بعد', 'GOOGLE_API_DISABLED');
  if (r.status === 401) throw new ApiError(401, 'انتهى ربط حساب قوقل، اربطه من جديد', 'GOOGLE_RECONNECT');
  if (r.status === 403 || r.status === 404) throw new ApiError(403, 'حسابك ما يقدر يدير هذا الفرع في قوقل ماب', 'GOOGLE_FORBIDDEN');
  throw new ApiError(502, 'تعذر الاتصال بقوقل');
}

// كل فروع حساب قوقل: [{ account, location, title, address }]
async function listLocations(token) {
  const { accounts = [] } = await gapi(token, 'https://mybusinessaccountmanagement.googleapis.com/v1/accounts');
  const out = [];
  for (const a of accounts.slice(0, 10)) {
    const { locations = [] } = await gapi(token, `https://mybusinessbusinessinformation.googleapis.com/v1/${a.name}/locations?readMask=name,title,storefrontAddress&pageSize=100`);
    locations.forEach(l => out.push({
      account: a.name, location: l.name, title: l.title || '',
      address: l.storefrontAddress ? [l.storefrontAddress.locality, ...(l.storefrontAddress.addressLines || [])].filter(Boolean).join('، ') : ''
    }));
  }
  return out;
}

const STARS = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
// قوقل يترجم التعليقات أحياناً: "(Translated by Google) ... (Original) ..." ← ناخذ الأصل
function originalText(comment) {
  const s = String(comment || '');
  const i = s.indexOf('(Original)');
  return (i >= 0 ? s.slice(i + 10) : s.replace(/^\(Translated by Google\)\s*/, '')).trim();
}
// أحدث التعليقات على الفرع
async function listReviews(token, account, location) {
  const id = String(location).split('/').pop();
  const { reviews = [] } = await gapi(token, `https://mybusiness.googleapis.com/v4/${account}/locations/${id}/reviews?pageSize=50&orderBy=${encodeURIComponent('updateTime desc')}`);
  return reviews.map(r => ({
    name: r.name, reviewer: (r.reviewer && !r.reviewer.isAnonymous && r.reviewer.displayName) || '',
    rating: STARS[r.starRating] || 0, comment: originalText(r.comment), createTime: r.createTime,
    replied: !!(r.reviewReply && r.reviewReply.comment)
  }));
}
// نشر الرد (ينشئه أو يستبدله) باسم المطعم
const postReply = (token, reviewName, comment) => gapi(token, `https://mybusiness.googleapis.com/v4/${reviewName}/reply`, { method: 'PUT', body: { comment } });

module.exports = { configured, authUrl, verifyState, exchangeCode, accessToken, emailFromIdToken, encrypt, listLocations, listReviews, postReply };
