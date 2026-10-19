// =====================================================================
// DEV MENU — التحقق من مفتاح المهام المجدولة (pg_cron في Supabase)
// المفتاح من app_settings (27-reviews-cron.sql يولّده)، أو CRON_SECRET لو انضبط في Vercel
// =====================================================================
const { rest, ApiError } = require('./core');

async function assertCronKey(req) {
  const given = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '') || String(req.query.key || '');
  let dbKey = '';
  try { dbKey = ((await rest('app_settings?key=eq.cron_key&select=value'))[0] || {}).value || ''; } catch {}
  const keys = [process.env.CRON_SECRET, dbKey].filter(k => k && k.length >= 24);
  if (!given || !keys.includes(given)) throw new ApiError(401, 'Unauthorized');
}

module.exports = { assertCronKey };
