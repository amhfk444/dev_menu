// =====================================================================
// DEV MENU — بطاقة الولاء: الإعدادات وحساب المسافة
// =====================================================================

const COOLDOWNS = [4, 6, 12, 24];

// إعدادات البطاقة بقيم آمنة دايماً
function normalizeLoyalty(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  const int = (v, d) => (Number.isInteger(+v) ? +v : d);
  return {
    needed: Math.min(12, Math.max(4, int(s.needed, 8))),
    reward: String(s.reward || 'مشروب مجاني').trim().slice(0, 60) || 'مشروب مجاني',
    cooldown_hours: COOLDOWNS.includes(int(s.cooldown_hours, 12)) ? int(s.cooldown_hours, 12) : 12,
    radius_m: Math.min(200, Math.max(25, int(s.radius_m, 50)))
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

module.exports = { normalizeLoyalty, distanceM, validPoint, COOLDOWNS };
