// =====================================================================
// DEV MENU — المساعد الذكي لبطاقة الولاء (يشتغل كل يوم الساعة 4 العصر بتوقيت الرياض)
//   GET /api/loyalty-cron?key=<cron_key>
// وبعده "وحشتنا" التلقائية لبطاقة النداء (المحل اللي عنده البيجر بدون ولاء، ومفعّلها)
// يشغّله pg_cron داخل Supabase (35-loyalty-ai.sql). لكل متجر شغّل المساعد:
// يكتب رسائل عفوية للزبائن اللي يستاهلون (غايب، باقي له ختم، مكافأته جاهزة، زيارة ثانية) ويوصلها لمحفظتهم.
// =====================================================================
const { rest, handler } = require('./_lib/core');
const { assertCronKey } = require('./_lib/cron');
const { runAssistant } = require('./_lib/loyalty-assistant');
const { runWinback } = require('./_lib/winback');

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
  const wbStores = await rest(`clients?pager_winback->>enabled=eq.true&is_active=is.true&parent_id=is.null&select=*&order=id.asc&limit=200`).catch(() => []);
  const winback = [];
  for (const s of wbStores) {
    if (Date.now() - started > 52e3) break;
    try { winback.push({ store: s.id, ...(await runWinback(s)) }); }
    catch (e) { winback.push({ store: s.id, error: e.code || e.message }); }
  }
  console.log('PAGER_WINBACK', JSON.stringify(winback));
  return { stores: stores.length, results, winback };
});

module.exports.config = { maxDuration: 60 };
