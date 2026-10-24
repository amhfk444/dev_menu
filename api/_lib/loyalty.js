// =====================================================================
// DEV MENU — بطاقة الولاء: الإعدادات وحساب المسافة
// =====================================================================

const COOLDOWNS = [1, 2, 3, 4, 6, 12, 24];

// شكل البطاقة
const STYLES = ['gradient', 'solid', 'paper', 'dark'];
const ICONS = ['coffee', 'fork-knife', 'hamburger', 'pizza', 'ice-cream', 'bread', 'cookie', 'cake', 'bowl-food', 'popcorn', 'heart', 'star'];
const HEX = /^#[0-9a-f]{6}$/i;
const okUrl = (u) => typeof u === 'string' && /^https:\/\/[^\s"'<>]{8,500}$/.test(u) ? u : null;
function normalizeDesign(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  return {
    style: STYLES.includes(d.style) ? d.style : 'gradient',
    color: HEX.test(d.color) ? d.color.toLowerCase() : '#233d2c',
    stamp_color: HEX.test(d.stamp_color) ? d.stamp_color.toLowerCase() : '#c9a227',
    icon: ICONS.includes(d.icon) ? d.icon : 'coffee',
    stamp_image: okUrl(d.stamp_image),
    // خلفية البطاقة: لون (حسب الشكل)، أو صورة، أو فيديو (والصورة تكون أول لقطة منه للمحفظة)
    bg: ['color', 'image', 'video'].includes(d.bg) && (d.bg !== 'image' || okUrl(d.bg_image)) && (d.bg !== 'video' || okUrl(d.bg_video)) ? d.bg : 'color',
    bg_image: okUrl(d.bg_image),
    bg_video: okUrl(d.bg_video)
  };
}

// رسالة الترحيب لأول تسجيل: صاحب المحل يكتبها، أو المساعد الذكي يكتب لكل زبون رسالة مختلفة، أو بدون
function normalizeWelcome(raw) {
  const w = raw && typeof raw === 'object' ? raw : {};
  return {
    mode: ['custom', 'ai', 'off'].includes(w.mode) ? w.mode : 'ai',
    text: String(w.text || '').trim().slice(0, 200)
  };
}

// ساعات الهدوء: الختم فيها دبل (بتوقيت الرياض). from/to ساعات من 0 إلى 24، days من 0 (الأحد) إلى 6
function normalizeHappy(raw) {
  const h = raw && typeof raw === 'object' ? raw : {};
  const hr = (v, d) => (Number.isInteger(+v) && +v >= 0 && +v <= 24 ? +v : d);
  let from = hr(h.from, 15), to = hr(h.to, 17);
  if (to <= from) to = Math.min(24, from + 1);
  const days = Array.isArray(h.days) ? [...new Set(h.days.map(Number).filter(d => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : [0, 1, 2, 3, 4, 5, 6];
  return { enabled: h.enabled === true, from, to, days: days.length ? days : [0, 1, 2, 3, 4, 5, 6] };
}
// هل الحين ساعات الهدوء؟ (الرياض UTC+3 طول السنة)
function isHappyNow(settings, now = new Date()) {
  const h = settings.happy;
  if (!h || !h.enabled) return false;
  const riyadh = new Date(now.getTime() + 3 * 3600e3);
  return h.days.includes(riyadh.getUTCDay()) && riyadh.getUTCHours() >= h.from && riyadh.getUTCHours() < h.to;
}

// إعدادات البطاقة بقيم آمنة دايماً
function normalizeLoyalty(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const int = (v, d) => (Number.isInteger(+v) ? +v : d);
  return {
    needed: Math.min(12, Math.max(4, int(s.needed, 8))),
    reward: String(s.reward || 'مشروب مجاني').trim().slice(0, 60) || 'مشروب مجاني',
    cooldown_hours: COOLDOWNS.includes(int(s.cooldown_hours, 12)) ? int(s.cooldown_hours, 12) : 12,
    radius_m: Math.min(200, Math.max(25, int(s.radius_m, 50))),
    design: normalizeDesign(s.design),
    welcome: normalizeWelcome(s.welcome),
    happy: normalizeHappy(s.happy),
    feedback: { enabled: !(s.feedback && s.feedback.enabled === false), gift: !(s.feedback && s.feedback.gift === false) },
    gifts: { enabled: !(s.gifts && s.gifts.enabled === false) },
    // الختم بعد الشراء بس: كود الكاشير أو البيجر (الزبون ما يختم بنفسه)
    stamp_mode: 'purchase',
    pager_stamp: s.pager_stamp !== false
  };
}

// المسافة بالمتر بين نقطتين (Haversine)
function distanceM(lat1, lng1, lat2, lng2) {
  const R = 6371000, rad = (d) => d * Math.PI / 180;
  const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

// موقع صالح؟
const validPoint = (lat, lng) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);

module.exports = { normalizeLoyalty, normalizeDesign, isHappyNow, distanceM, validPoint, COOLDOWNS, STYLES, ICONS };
