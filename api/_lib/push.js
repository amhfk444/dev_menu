// =====================================================================
// DEV MENU — إرسال إشعارات Web Push (البيجر)
// المفاتيح من متغيرات البيئة VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY.
// لو ما انضبطت، الإشعارات تتوقف بهدوء والبيجر يكمل بالصوت داخل الصفحة.
// =====================================================================
const webpush = require('web-push');

const PUBLIC = process.env.VAPID_PUBLIC_KEY || '';
const PRIVATE = process.env.VAPID_PRIVATE_KEY || '';
const ready = !!(PUBLIC && PRIVATE);
if (ready) webpush.setVapidDetails('mailto:dmenu950@gmail.com', PUBLIC, PRIVATE);

const pushPublicKey = () => (ready ? PUBLIC : '');

// اشتراك صالح من المتصفح: endpoint https + مفاتيح التشفير
function cleanSubscription(sub) {
  if (!sub || typeof sub !== 'object' || !sub.keys) return null;
  const endpoint = String(sub.endpoint || '');
  if (!/^https:\/\/[^\s]{10,700}$/.test(endpoint)) return null;
  const p256dh = String(sub.keys.p256dh || ''), auth = String(sub.keys.auth || '');
  if (!/^[A-Za-z0-9_-]{40,200}$/.test(p256dh) || !/^[A-Za-z0-9_-]{10,60}$/.test(auth)) return null;
  return { endpoint, keys: { p256dh, auth } };
}

// يرجّع: 'sent' | 'gone' (الاشتراك انتهى، احذفه) | 'failed' | 'off'
async function sendPush(sub, payload) {
  if (!ready || !sub) return 'off';
  try {
    await webpush.sendNotification(sub, JSON.stringify(payload), { TTL: 3600, urgency: 'high' });
    return 'sent';
  } catch (e) {
    if (e && (e.statusCode === 404 || e.statusCode === 410)) return 'gone';
    console.error('PAGER_PUSH_FAILED', e && (e.statusCode || e.message));
    return 'failed';
  }
}

module.exports = { pushPublicKey, cleanSubscription, sendPush };
