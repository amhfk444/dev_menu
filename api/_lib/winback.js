// =====================================================================
// DEV MENU — "وحشتنا" التلقائية لبطاقة النداء
// صاحب المحل يكتب الرسالة مرة وحدة، وتوصل للي ما أخذ رقم من عدد أيام يختاره.
// مرة وحدة لكل غيبة: ما تنعاد لين يرجع الزبون (ياخذ رقم) ويغيب من جديد. يشغّلها loyalty-cron كل يوم
// =====================================================================
const { rest, q } = require('./core');
const wallet = require('./wallet');
const PLANS = require('./plans');
const { riyadhDayStart } = require('./waitlist');

const WINBACK_DAYS = [7, 14, 21, 30];
const WINBACK_MAX_AGE = 120;   // اللي غاب أكثر من كذا غالباً حذف البطاقة، فما نرسل له
const WINBACK_BATCH = 40;      // لكل محل كل يوم، والباقي ياخذ دوره بكرة

function winbackSettings(w) {
  w = w || {};
  const days = Number(w.days);
  return { enabled: w.enabled === true, days: WINBACK_DAYS.includes(days) ? days : 14, text: String(w.text || '').trim().slice(0, 150) };
}

// يرسل لزبائن محل رئيسي واحد. يرجّع كم وصلت
async function runWinback(store) {
  const w = winbackSettings(store.pager_winback);
  if (!w.enabled || w.text.length < 2 || !wallet.configured()) return { skipped: 'off' };
  if (!PLANS.has(store, 'notify') || !PLANS.has(store, 'pager') || PLANS.has(store, 'loyalty')) return { skipped: 'plan' };
  const day = 864e5, now = Date.now();
  const rows = await rest(`pager_cards?client_id=eq.${store.id}&wallet_serial=not.is.null&last_used_at=lt.${q(new Date(now - w.days * day).toISOString())}&last_used_at=gt.${q(new Date(now - WINBACK_MAX_AGE * day).toISOString())}&select=id,wallet_serial,lang,platform,last_used_at,winback_at&order=last_used_at.desc&limit=500`);
  const due = rows.filter(c => !c.winback_at || Date.parse(c.winback_at) < Date.parse(c.last_used_at)).slice(0, WINBACK_BATCH);
  if (!due.length) return { sent: 0 };
  // عنده رقم شغّال اليوم (رجع بنفسه): ما نرسل له
  const live = new Set((await rest(`pager_tickets?wallet_serial=in.(${due.map(c => q(c.wallet_serial)).join(',')})&status=in.(waiting,ready)&created_at=gte.${q(riyadhDayStart())}&select=wallet_serial`).catch(() => [])).map(t => t.wallet_serial));
  let sent = 0, gone = 0;
  await Promise.all(due.filter(c => !live.has(c.wallet_serial)).map(async (c) => {
    const r = await wallet.updatePagerPass(c.wallet_serial, { ...wallet.pagerStep({ store, step: 'idle', lang: c.lang }), notice: w.text });
    if (!r.startsWith('ok')) return console.error('PAGER_WINBACK', store.id, c.id, r);
    await rest(`pager_cards?id=eq.${c.id}`, { method: 'PATCH', body: { winback_at: new Date().toISOString() } }).catch(() => {});
    wallet.reached(r, c.platform) ? sent++ : gone++;
  }));
  const last = { at: new Date().toISOString(), sent };
  await rest(`clients?id=eq.${store.id}`, { method: 'PATCH', body: { pager_winback: { ...(store.pager_winback || {}), last } } }).catch(() => {});
  return { sent, gone };
}

module.exports = { winbackSettings, runWinback, WINBACK_DAYS };
