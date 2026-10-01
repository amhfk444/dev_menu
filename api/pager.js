// =====================================================================
// DEV MENU — البيجر الرقمي (صفحة العميل، بدون تسجيل دخول)
//   GET  /api/pager?action=info&slug=     اسم المتجر وشعاره
//   POST /api/pager?action=take            رقم جديد للعميل { slug } ← { token, number }
//   GET  /api/pager?action=status&slug=&t= حالة الرقم (waiting / ready / done / cancelled)
// الكاشير يغيّر الحالة من /api/owner?action=pager-update
// =====================================================================
const crypto = require('crypto');
const { handler, rest, rpc, q, ApiError, readBody, findPublicStore } = require('./_lib/core');

const TOKEN_RE = /^[A-Za-z0-9_-]{10,64}$/;

async function loadStore(slug) {
  const { store, bad } = await findPublicStore(slug, 'id,name,client_slug,logo_url');
  if (bad) throw new ApiError(400, 'الرابط غير صحيح');
  if (!store) throw new ApiError(404, 'البيجر غير متاح حالياً', 'NOT_AVAILABLE');
  return store;
}

module.exports = handler(['GET', 'POST'], async (req) => {
  const action = req.query.action;
  const b = req.method === 'POST' ? readBody(req) : {};

  if (action === 'info' && req.method === 'GET') {
    const store = await loadStore(req.query.slug);
    return { store: { name: store.name, logo_url: store.logo_url } };
  }

  if (action === 'take' && req.method === 'POST') {
    const store = await loadStore(b.slug);
    const token = crypto.randomBytes(18).toString('base64url');
    try {
      const res = await rpc('server_pager_take', { p_client_id: store.id, p_token: token });
      return { token: res.token, number: res.number, store: { name: store.name, logo_url: store.logo_url } };
    } catch (e) {
      if (String(e.dbMessage || e.message).includes('PAGER_FULL')) throw new ApiError(409, 'وصلنا الحد اليومي للأرقام', 'FULL');
      throw e;
    }
  }

  if (action === 'status' && req.method === 'GET') {
    const store = await loadStore(req.query.slug);
    const token = String(req.query.t || '');
    if (!TOKEN_RE.test(token)) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    const t = (await rest(`pager_tickets?token=eq.${q(token)}&client_id=eq.${store.id}&select=number,status,created_at,ready_at`))[0];
    if (!t) throw new ApiError(404, 'الرقم غير موجود', 'NOT_FOUND');
    // رقم من يوم سابق ما زال ينتظر = منتهي
    const stale = t.status === 'waiting' && Date.now() - Date.parse(t.created_at) > 18 * 3600e3;
    return { store: { name: store.name, logo_url: store.logo_url }, ticket: { number: t.number, status: stale ? 'expired' : t.status, ready_at: t.ready_at } };
  }

  throw new ApiError(404, 'Unknown action');
});
