// =====================================================================
// DEV MENU — طابور إشعارات بطاقة النداء (يشغّله pg_cron كل دقيقة لو فيه رسائل جاهزة)
//   GET /api/notify-cron?key=<cron_key>
//   يرسل رسائل المحل و"وحشتنا" من notification_queue (شوف _lib/notify-queue.js)
// =====================================================================
const { handler } = require('./_lib/core');
const { assertCronKey } = require('./_lib/cron');
const { processQueue } = require('./_lib/notify-queue');

module.exports = handler(['GET', 'POST'], async (req) => {
  await assertCronKey(req);
  const counts = await processQueue(45e3);
  if (counts.sent || counts.gone || counts.failed || counts.deferred) console.log('NOTIFY_QUEUE', JSON.stringify(counts));
  return counts;
});
module.exports.config = { maxDuration: 60 };
