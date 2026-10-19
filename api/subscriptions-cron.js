// =====================================================================
// DEV MENU — تذكير تلقائي بتجديد الاشتراك (يشتغل كل يوم 9 الصبح بتوقيت الرياض)
//   GET /api/subscriptions-cron?key=<cron_key>
// يشغّلها pg_cron داخل Supabase (29-grace-reminders.sql).
//   • قبل الانتهاء بـ 3 أيام أو أقل: "اشتراكك ينتهي قريب"
//   • بعد الانتهاء (خلال مهلة الـ 3 أيام للمشتركين، أو انتهاء التجربة): "انتهى اشتراكك"
// كل تذكير ينرسل مرة وحدة لكل تاريخ انتهاء (reminder_key)، بالبريد وإشعار على أجهزة صاحب المتجر.
// =====================================================================
const { rest, handler } = require('./_lib/core');
const { assertCronKey } = require('./_lib/cron');
const { sendMail, mailConfigured } = require('./_lib/mail');
const { sendPush } = require('./_lib/push');
const { PLAN_PRICE } = require('./_lib/invoice');

const DAY = 864e5;
const GRACE_DAYS = 3;
const DASHBOARD = 'https://www.devmenu.digital/admin.html#dashboard';
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dateText = (d) => new Date(d).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn', { timeZone: 'Asia/Riyadh', day: 'numeric', month: 'long' });

function message(store, stage, end, branches) {
  const trial = store.subscription_status === 'trial';
  const year = PLAN_PRICE.year + branches * PLAN_PRICE.branch;
  const month = PLAN_PRICE.month + branches * PLAN_PRICE.branchMonth;
  const what = trial ? 'التجربة المجانية' : 'اشتراك';
  const graceEnd = new Date(Date.parse(end) + GRACE_DAYS * DAY);
  let title, body;
  if (stage === 'soon') {
    title = `${what} ${store.name} ينتهي ${dateText(end)}`;
    body = `اختر باقتك من لوحة التحكم عشان يبقى المنيو شغال لزبائنك بدون توقف.`;
  } else if (trial) {
    title = `انتهت التجربة المجانية لـ ${store.name}`;
    body = 'المنيو متوقف عن الزبائن حالياً. اختر باقتك من لوحة التحكم ويرجع على طول.';
  } else {
    title = `انتهى اشتراك ${store.name}`;
    body = `أعطيناك مهلة، والمنيو بيبقى شغال لزبائنك لين ${dateText(graceEnd)}. جدّد قبلها عشان ما يوقف.`;
  }
  const prices = `السنوي ${year} ر.س، أو الشهري ${month} ر.س.`;
  const html = `
<div dir="rtl" style="background:#efe5dc;padding:28px 12px;font-family:Tahoma,Arial,sans-serif;color:#22362a">
  <div style="max-width:520px;margin:0 auto;background:#faf6f1;border-radius:18px;border:1px solid #e0d6c8;padding:26px">
    <p style="margin:0 0 4px;font-size:13px;color:#6f7d72">DEV MENU</p>
    <h2 style="margin:0 0 10px;font-size:19px;line-height:1.6">${esc(title)}</h2>
    <p style="margin:0 0 8px;font-size:14px;line-height:1.9;color:#4d5e52">${esc(body)}</p>
    <p style="margin:0 0 20px;font-size:14px;line-height:1.9;color:#4d5e52">${esc(prices)}</p>
    <a href="${DASHBOARD}" style="display:inline-block;background:#384f3d;color:#faf6f1;text-decoration:none;font-weight:bold;padding:12px 22px;border-radius:10px">اختر باقتك</a>
  </div>
</div>`;
  return { title, body, html, text: `${title}\n\n${body}\n${prices}\n\nاختر باقتك: ${DASHBOARD}` };
}

module.exports = handler(['GET', 'POST'], async (req) => {
  await assertCronKey(req);
  const now = Date.now();
  // المتاجر الرئيسية فقط (الفروع تتبعها)، والموقوفة من الإدارة ما نذكّرها
  const stores = await rest('clients?parent_id=is.null&is_active=is.true&subscription_status=in.(active,trial)&select=id,name,email,subscription_status,subscription_end_date,trial_ends_at,reminder_key');
  const results = [];
  for (const s of stores) {
    const end = s.subscription_status === 'active' ? s.subscription_end_date : s.trial_ends_at;
    if (!end) continue;
    const left = (Date.parse(end) - now) / DAY;
    let stage = null;
    if (left > 0 && left <= 3) stage = 'soon';
    else if (left <= 0 && left > -GRACE_DAYS) stage = 'ended';
    if (!stage) continue;
    const key = `${stage}:${String(end).slice(0, 10)}`;
    if (s.reminder_key === key) continue;

    let branches = 0;
    try { branches = (await rest(`clients?parent_id=eq.${s.id}&select=id`)).length; } catch {}
    const m = message(s, stage, end, branches);

    let mailed = false;
    if (s.email && !/@prospect\.invalid$/.test(s.email) && mailConfigured()) {
      mailed = await sendMail({ to: s.email, subject: m.title, html: m.html, text: m.text });
    }
    let pushed = 0;
    try {
      const devices = await rest(`owner_push?client_id=eq.${s.id}&select=id,sub`);
      for (const d of devices) {
        const r = await sendPush(d.sub, { title: m.title, body: m.body, url: DASHBOARD, tag: `renew-${s.id}` });
        if (r === 'sent') pushed++;
        if (r === 'gone') await rest(`owner_push?id=eq.${d.id}`, { method: 'DELETE' }).catch(() => {});
      }
    } catch {}
    await rest(`clients?id=eq.${s.id}`, { method: 'PATCH', body: { reminder_key: key } }).catch(() => {});
    results.push({ store: s.id, stage, mailed, pushed });
  }
  console.log('RENEW_REMINDERS', JSON.stringify(results));
  return { checked: stores.length, reminded: results.length, results };
});

module.exports.config = { maxDuration: 60 };
