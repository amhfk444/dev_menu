// =====================================================================
// DEV MENU — المساعد الذكي لبطاقة الولاء (يشتغل كل يوم الساعة 4 العصر بتوقيت الرياض)
//   GET /api/loyalty-cron?key=<cron_key>
// يشغّله pg_cron داخل Supabase (35-loyalty-ai.sql). لكل متجر شغّل المساعد:
// يكتب رسائل عفوية للزبائن اللي يستاهلون (غايب، باقي له ختم، مكافأته جاهزة، زيارة ثانية) ويوصلها لمحفظتهم.
// =====================================================================
const { rest, handler } = require('./_lib/core');
const { assertCronKey } = require('./_lib/cron');
const { runAssistant } = require('./_lib/loyalty-assistant');

module.exports = handler(['GET', 'POST'], async (req) => {
  await assertCronKey(req);
  const started = Date.now();
  // الفروع ولاءها على المحل الرئيسي، فالمساعد يشتغل على الرئيسي بس
  const stores = await rest('clients?loyalty_enabled=is.true&loyalty_ai=is.true&is_active=is.true&parent_id=is.null&select=id&order=id.asc&limit=200');
  const results = [];
  for (const s of stores) {
    if (Date.now() - started > 45e3) break;   // الباقي ياخذ دوره بكرة
    try { results.push({ store: s.id, ...(await runAssistant(s.id, { maxGuests: 20 })) }); }
    catch (e) { results.push({ store: s.id, error: e.code || e.message }); }
  }
  console.log('LOYALTY_AI', JSON.stringify(results));
  return { stores: stores.length, results };
});

module.exports.config = { maxDuration: 60 };
