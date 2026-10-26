// =====================================================================
// DEV MENU — المساعد الذكي لبطاقة الولاء (يشتغل كل يوم الساعة 4 العصر بتوقيت الرياض)
//   GET /api/loyalty-cron?key=<cron_key>
// يشغّله pg_cron داخل Supabase (35-loyalty-ai.sql). لكل متجر شغّل المساعد:
// يكتب رسائل عفوية للزبائن اللي يستاهلون (غايب، باقي له ختم، مكافأته جاهزة، زيارة ثانية) ويوصلها لمحفظتهم.
// وللغايبين: إشعار "ليش ما رجعت؟" (absenceNudges) لكل محل مفعّل الولاء.
// =====================================================================
const { rest, handler } = require('./_lib/core');
const { assertCronKey } = require('./_lib/cron');
const { runAssistant, absenceNudges } = require('./_lib/loyalty-assistant');

module.exports = handler(['GET', 'POST'], async (req) => {
  await assertCronKey(req);
  const started = Date.now();
  const stores = await rest('clients?loyalty_enabled=is.true&is_active=is.true&select=id,loyalty_ai&order=id.asc&limit=500');
  const results = [];
  for (const s of stores) {
    if (Date.now() - started > 45e3) break;   // الباقي ياخذ دوره بكرة
    const r = { store: s.id };
    // "ليش ما رجعت؟" لكل محل مفعّل الولاء (ما يحتاج المساعد)
    try { r.survey = await absenceNudges(s.id); } catch (e) { r.survey = { error: e.code || e.message }; }
    if (s.loyalty_ai) {
      try { Object.assign(r, await runAssistant(s.id, { maxGuests: 20 })); }
      catch (e) { r.error = e.code || e.message; }
    }
    results.push(r);
  }
  console.log('LOYALTY_AI', JSON.stringify(results));
  return { stores: stores.length, results };
});

module.exports.config = { maxDuration: 60 };
