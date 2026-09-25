// =====================================================================
// DEV MENU — نواة الباك إند (تشتغل على خوادم Vercel فقط)
// المفتاح السري (service role) موجود هنا فقط، ولا يوصل للمتصفح أبداً
// =====================================================================
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const BUCKET = 'menu-images';

class ApiError extends Error {
  constructor(status, message, code) { super(message); this.status = status; this.code = code; }
}

function assertConfig() {
  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    throw new ApiError(500, 'الخادم غير مهيأ: أضف SUPABASE_URL و SUPABASE_ANON_KEY و SUPABASE_SERVICE_ROLE_KEY في إعدادات Vercel', 'NOT_CONFIGURED');
  }
}

// المفاتيح القديمة (JWT) تُرسل أيضاً في Authorization، والجديدة (sb_secret_) في apikey فقط
function keyHeaders(key, extra = {}) {
  const h = { apikey: key, ...extra };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

async function parse(r) {
  const t = await r.text();
  if (!t) return null;
  try { return JSON.parse(t); } catch { return t; }
}

// ─── قاعدة البيانات (PostgREST) بصلاحية الخادم ───
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const headers = keyHeaders(SERVICE_KEY, { 'Content-Type': 'application/json' });
  if (prefer) headers.Prefer = prefer;
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await parse(r);
  if (!r.ok) {
    const msg = (data && (data.message || data.error)) || `DB error ${r.status}`;
    const err = new ApiError(r.status >= 500 ? 502 : 400, msg, data && data.code);
    err.dbMessage = msg;
    throw err;
  }
  return data;
}
const rpc = (fn, args = {}) => rest(`rpc/${fn}`, { method: 'POST', body: args });
const q = (v) => encodeURIComponent(String(v));

// ─── التخزين ───
async function storage(path, { method = 'POST', body } = {}) {
  const r = await fetch(`${SUPABASE_URL}/storage/v1/${path}`, {
    method, headers: keyHeaders(SERVICE_KEY, { 'Content-Type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const data = await parse(r);
  if (!r.ok) throw new ApiError(502, (data && (data.message || data.error)) || `Storage error ${r.status}`);
  return data;
}
const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
const publicUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${encodePath(path)}`;
const PUBLIC_PREFIX = () => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
const ownsMediaUrl = (url, clientId) => typeof url === 'string' && url.startsWith(`${PUBLIC_PREFIX()}${clientId}/`);
function storagePathFromUrl(url) {
  if (typeof url !== 'string') return '';
  const i = url.indexOf(`/storage/v1/object/public/${BUCKET}/`);
  return i === -1 ? '' : decodeURIComponent(url.slice(i + `/storage/v1/object/public/${BUCKET}/`.length).split('?')[0]);
}

// ─── هوية المستخدم: نتحقق من الجلسة عند Supabase Auth نفسه ───
async function getUser(req) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  if (!token) throw new ApiError(401, 'سجّل دخولك أولاً', 'NO_SESSION');
  const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, { headers: { apikey: ANON_KEY, Authorization: `Bearer ${token}` } });
  const data = await parse(r);
  if (!r.ok || !data || !data.email) throw new ApiError(401, 'انتهت الجلسة، سجّل دخولك مرة ثانية', 'BAD_SESSION');
  return { id: data.id, email: String(data.email).toLowerCase() };
}
async function isSuperAdmin(email) {
  return (await rpc('server_is_super_admin', { p_email: email })) === true;
}

// ─── التحقق من المدخلات ───
function str(v, max, field) {
  if (v === undefined || v === null) return '';
  if (typeof v !== 'string' && typeof v !== 'number') throw new ApiError(400, `قيمة غير صالحة: ${field}`);
  const s = String(v).trim();
  if (s.length > max) throw new ApiError(400, `النص طويل جداً: ${field}`);
  return s;
}
function httpUrl(v, field) {
  const s = str(v, 500, field);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error();
    return u.href;
  } catch { throw new ApiError(400, `رابط غير صحيح: ${field}`); }
}
function waNumber(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (d.startsWith('05')) d = '966' + d.slice(1);
  else if (d.startsWith('5') && d.length === 9) d = '966' + d;
  if (!d) return '';
  const ok = d.startsWith('966') ? /^9665\d{8}$/.test(d) : /^[1-9]\d{10,14}$/.test(d);
  if (!ok) throw new ApiError(400, 'رقم الواتساب غير صحيح، اكتبه مثل 05xxxxxxxx');
  return d;
}
const int = (v) => { const n = Number(v); return Number.isInteger(n) ? n : NaN; };

function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  try { return JSON.parse(req.body || '{}'); } catch { return {}; }
}

// غلاف موحد لكل نقطة API: أخطاء واضحة + منع التخزين المؤقت
function handler(methods, fn) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    try {
      assertConfig();
      if (!methods.includes(req.method)) throw new ApiError(405, 'Method not allowed');
      const out = await fn(req, res);
      if (!res.headersSent) res.status(200).json(out === undefined ? { ok: true } : out);
    } catch (e) {
      const known = e instanceof ApiError;
      const status = known ? e.status : 500;
      if (!known || status >= 500) console.error('[api]', req.method, req.url, e);
      if (!res.headersSent) res.status(status).json({ error: known ? e.message : 'حدث خطأ في الخادم', code: known ? e.code : undefined });
    }
  };
}

module.exports = {
  SUPABASE_URL, BUCKET, ApiError, rest, rpc, q, storage, publicUrl, ownsMediaUrl, storagePathFromUrl,
  getUser, isSuperAdmin, str, httpUrl, waNumber, int, readBody, handler
};
