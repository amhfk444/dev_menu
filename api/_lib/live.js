// =====================================================================
// DEV MENU — التحديث اللحظي (WebSocket عبر Supabase Realtime)
// الخادم يرسل "تنبيه" بدون أي بيانات على قناة، والصفحة اللي فاتحتها تجيب الجديد من /api
// القنوات:
//   menu-…     المنيو تغيّر (للزبون اللي فاتح المنيو)
//   wl-…       قائمة الانتظار تغيّرت (للزبون المنتظر وللوحة التحكم)
//   pager-…    أرقام البيجر تغيّرت (لشاشة الكاشير ولوحة التحكم)
//   ticket-…   رقم بيجر واحد تغيّر (لجوال صاحب الرقم)
//   owner-…    تقييمات جديدة (للوحة التحكم)
// أسماء القنوات موقّعة بمفتاح الخادم، فما أحد يعرفها إلا من رد /api
// =====================================================================
const crypto = require('crypto');

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const topic = (kind, id) =>
  `${kind}-${crypto.createHmac('sha256', `devmenu-live:${SERVICE_KEY}`).update(`${kind}:${id}`).digest('base64url').slice(0, 22)}`;

// كل قنوات المتجر اللي تحتاجها لوحة التحكم وشاشة الكاشير
const storeTopics = (id) => ({ menu: topic('menu', id), waitlist: topic('wl', id), pager: topic('pager', id), owner: topic('owner', id) });

// يرسل التنبيه ولا يوقف الطلب لو فشل (الصفحات عندها تحديث دوري احتياطي)
async function poke(topics, event = 'changed') {
  const list = [].concat(topics).filter(Boolean);
  if (!list.length || !SUPABASE_URL || !SERVICE_KEY) return;
  const headers = { 'Content-Type': 'application/json', apikey: SERVICE_KEY };
  if (SERVICE_KEY.startsWith('eyJ')) headers.Authorization = `Bearer ${SERVICE_KEY}`;
  try {
    const r = await fetch(`${SUPABASE_URL}/realtime/v1/api/broadcast`, {
      method: 'POST', headers, signal: AbortSignal.timeout(2000),
      body: JSON.stringify({ messages: list.map(t => ({ topic: t, event, payload: {}, private: false })) })
    });
    if (!r.ok) console.error('LIVE_POKE', r.status, (await r.text()).slice(0, 200));
  } catch (e) {
    console.error('LIVE_POKE', e.message);
  }
}

module.exports = { topic, storeTopics, poke };
