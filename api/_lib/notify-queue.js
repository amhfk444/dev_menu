// =====================================================================
// DEV MENU — طابور إشعارات بطاقة النداء (رسائل المحل و"وحشتنا")
//   الإرسال ما يصير لحظة ما يضغط صاحب المحل: الرسائل تنحفظ في notification_queue، وكل دقيقة
//   api/notify-cron يرسل الجاهز منها بالترتيب:
//   • Google Wallet: 3 إشعارات للبطاقة كل 24 ساعة، نخلي واحد منها لـ "طلبك جاهز"، والزايد يتأجل بدل ما يضيع
//   • الفشل المؤقت ينعاد (3 محاولات)
//   • كل رسالة لها نتيجة: sent (وصلت) أو gone (حذف البطاقة) أو failed
//   "طلبك جاهز" ما يمر من هنا: ينرسل لحظياً من owner.js
// =====================================================================
const { rest, q } = require('./core');
const wallet = require('./wallet');
const { riyadhDayStart } = require('./waitlist');

const GOOGLE_DAILY = 3, READY_RESERVE = 1, DAY = 864e5, RETRY_MS = 2 * 60e3, MAX_ATTEMPTS = 3;
const PRIORITY = { pager_msg: 5, winback: 8 };

// رسالة المحل: سطر لكل بطاقة. يرجّع كم بطاقة انضافت
async function enqueuePagerMessage(homeId, msgId, body, branchId = null) {
  const cards = await rest(`pager_cards?client_id=eq.${homeId}&wallet_serial=not.is.null${branchId ? `&branch_ids=cs.{${Number(branchId)}}` : ''}&select=id,wallet_serial,platform,lang&limit=20000`);
  for (let i = 0; i < cards.length; i += 1000) {
    await rest('notification_queue', { method: 'POST', body: cards.slice(i, i + 1000).map(c => ({
      kind: 'pager_msg', client_id: homeId, ref_id: msgId, card_id: c.id, serial: c.wallet_serial, platform: c.platform || null,
      body, lang: c.lang || null, priority: PRIORITY.pager_msg
    })) });
  }
  await rest(`pager_messages?id=eq.${msgId}`, { method: 'PATCH', body: { queued: cards.length } }).catch(() => {});
  return cards.length;
}

// "وحشتنا": البطاقات اللي حان وقتها (winback.js يختارها)
async function enqueueWinback(homeId, cards, body) {
  if (!cards.length) return 0;
  await rest('notification_queue', { method: 'POST', body: cards.map(c => ({
    kind: 'winback', client_id: homeId, card_id: c.id, serial: c.wallet_serial, platform: c.platform || null,
    body, lang: c.lang || null, priority: PRIORITY.winback
  })) });
  return cards.length;
}

// Google: كم إشعار وصل البطاقة آخر 24 ساعة (رسائل الطابور + "طلبك جاهز")، ومتى يفضى مكان
async function googleSlot(serial) {
  const since = new Date(Date.now() - DAY).toISOString();
  const [msgs, ready] = await Promise.all([
    rest(`notification_queue?serial=eq.${q(serial)}&status=eq.sent&sent_at=gte.${q(since)}&select=sent_at`).catch(() => []),
    rest(`pager_tickets?wallet_serial=eq.${q(serial)}&ready_at=gte.${q(since)}&select=ready_at`).catch(() => [])
  ]);
  const times = [...msgs.map(m => m.sent_at), ...ready.map(t => t.ready_at)].map(Date.parse).sort((a, b) => a - b);
  if (times.length < GOOGLE_DAILY - READY_RESERVE) return null;
  return new Date(times[times.length - (GOOGLE_DAILY - READY_RESERVE)] + DAY + 60e3).toISOString();   // أول ما يطلع أقدم إشعار من الـ 24 ساعة
}

const STORE_FIELDS = 'id,name,client_slug,logo_url,accent_color,business_type';
async function sendOne(row, stores) {
  if (!stores.has(row.client_id)) stores.set(row.client_id, (await rest(`clients?id=eq.${row.client_id}&select=${STORE_FIELDS}`).catch(() => []))[0] || null);
  const store = stores.get(row.client_id);
  if (!store) return { status: 'failed', result: 'store gone' };
  if (row.platform === 'google') {
    const wait = await googleSlot(row.serial);
    if (wait) return { status: 'pending', run_at: wait, result: 'google daily limit' };
  }
  // عنده رقم شغّال اليوم: الرسالة توصله والبطاقة تبقى على رقمه (ولو في محل ثاني، باسم ذاك المحل والرسالة باسم هالمحل)
  const t = (await rest(`pager_tickets?wallet_serial=eq.${q(row.serial)}&status=in.(waiting,ready)&created_at=gte.${q(riyadhDayStart())}&select=number,status,client_id&order=id.desc&limit=1`).catch(() => []))[0];
  if (t && t.client_id !== store.id && !stores.has(t.client_id)) stores.set(t.client_id, (await rest(`clients?id=eq.${t.client_id}&select=${STORE_FIELDS}`).catch(() => []))[0] || null);
  const at = t && t.client_id !== store.id ? stores.get(t.client_id) : null;
  const step = t ? wallet.pagerStep({ store: at || store, number: t.number, step: t.status === 'ready' ? 'ready' : 'waiting', lang: row.lang })
    : wallet.pagerStep({ store, step: 'idle', lang: row.lang });
  // force: رسالة المحل لازم يطلع لها إشعار (updatePagerPass يسكّت كل شي غير "جاهز")
  const r = await wallet.updatePagerPass(row.serial, { ...step, notice: at ? `${store.name}: ${row.body}` : row.body, force: true });
  if (!r.startsWith('ok')) return { status: 'failed', result: r };
  return { status: wallet.reached(r, row.platform) ? 'sent' : 'gone', result: r };
}

// يرسل الجاهز من الطابور لين يخلص أو يقرب وقت الدالة يخلص
async function processQueue(maxMs = 45e3) {
  const started = Date.now(), stores = new Map(), counts = { sent: 0, gone: 0, failed: 0, deferred: 0 };
  while (Date.now() - started < maxMs) {
    const rows = await rest(`notification_queue?status=eq.pending&run_at=lte.${q(new Date().toISOString())}&select=*&order=priority.asc,id.asc&limit=20`);
    if (!rows.length) break;
    await Promise.all(rows.map(async (row) => {
      let out;
      try { out = await sendOne(row, stores); } catch (e) { out = { status: 'failed', result: e.message }; }
      const attempts = row.attempts + (out.status === 'pending' ? 0 : 1);
      const patch = { attempts, result: String(out.result || '').slice(0, 300) };
      if (out.status === 'pending') { patch.run_at = out.run_at; counts.deferred++; }
      else if (out.status === 'failed' && attempts < MAX_ATTEMPTS) { patch.run_at = new Date(Date.now() + RETRY_MS).toISOString(); counts.failed++; }
      else { patch.status = out.status; patch.sent_at = new Date().toISOString(); counts[out.status === 'sent' ? 'sent' : out.status === 'gone' ? 'gone' : 'failed']++; }
      await rest(`notification_queue?id=eq.${row.id}`, { method: 'PATCH', body: patch }).catch(() => {});
    }));
    // الرسائل اللي خلصت: نحدّث عدد اللي وصلتهم
    const refs = [...new Set(rows.filter(r => r.ref_id).map(r => r.ref_id))];
    for (const id of refs) {
      const sent = (await rest(`notification_queue?ref_id=eq.${id}&status=eq.sent&select=id`).catch(() => [])).length;
      await rest(`pager_messages?id=eq.${id}`, { method: 'PATCH', body: { sent } }).catch(() => {});
    }
  }
  return counts;
}

// حالة رسالة المحل: كم وصلت، وكم تنتظر، وكم حذفوا البطاقة
async function messageStatus(msgId) {
  const rows = await rest(`notification_queue?ref_id=eq.${Number(msgId)}&select=status,result`).catch(() => []);
  const c = { total: rows.length, sent: 0, gone: 0, failed: 0, pending: 0, waiting_limit: 0 };
  rows.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; if (r.status === 'pending' && r.result === 'google daily limit') c.waiting_limit++; });
  return c;
}

module.exports = { enqueuePagerMessage, enqueueWinback, processQueue, messageStatus };
