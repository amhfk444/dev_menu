// =====================================================================
// DEV MENU — مزامنة تعليقات قوقل ماب لكل المتاجر المربوطة (تشتغل كل ربع ساعة)
//   GET /api/reviews-sync?key=<cron_key>
// يشغّلها pg_cron داخل Supabase كل ربع ساعة (27-reviews-cron.sql)، والمفتاح محفوظ في app_settings.
// =====================================================================
const { rest, ApiError, handler } = require('./_lib/core');
const { syncStore } = require('./_lib/reviews');

const DEADLINE_MS = 50e3;   // نوقف قبل حد وقت الخادم، والباقي ياخذ دوره في المرة الجاية

module.exports = handler(['GET', 'POST'], async (req) => {
  // المفتاح: من Supabase (27-reviews-cron.sql يولّده ويستخدمه في pg_cron)، أو CRON_SECRET لو انضبط في Vercel
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.query.key || '');
  let dbKey = '';
  try { dbKey = ((await rest('app_settings?key=eq.cron_key&select=value'))[0] || {}).value || ''; } catch {}
  const keys = [process.env.CRON_SECRET, dbKey].filter(k => k && k.length >= 24);
  if (!given || !keys.includes(given)) throw new ApiError(401, 'Unauthorized');
  const started = Date.now();
  // الأقدم مزامنة أول، عشان كل المتاجر تاخذ دورها
  const conns = await rest('google_connections?location_name=not.is.null&select=*&order=last_sync_at.asc.nullsfirst&limit=100');
  const results = [];
  for (const conn of conns) {
    if (Date.now() - started > DEADLINE_MS) break;
    const store = (await rest(`clients?id=eq.${conn.client_id}&select=id,name,email,parent_id,business_type,reviews_enabled,is_active`))[0];
    if (!store || !store.reviews_enabled || store.is_active === false) continue;
    try { results.push({ store: store.id, ...(await syncStore(store, conn)) }); }
    catch (e) { results.push({ store: store.id, error: e.code || e.message }); }
  }
  return { synced: results.length, results };
});

module.exports.config = { maxDuration: 60 };
