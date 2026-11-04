// صفحة انتظار البيجر: كم طلب قدام الزبون، ومتوسط الانتظار في المحل (للطابور الحي والمساعد الذكي)
const { rest, q } = require('./core');

const mins = (ms) => Math.max(0, Math.round(ms / 60000));

// طلبات قبله ما زالت تتجهز (من نفس اليوم)
async function aheadOf(storeId, t) {
  if (t.status !== 'waiting') return 0;
  const from = new Date(Date.parse(t.created_at) - 18 * 3600e3).toISOString();
  return (await rest(`pager_tickets?client_id=eq.${storeId}&status=eq.waiting&created_at=lt.${q(t.created_at)}&created_at=gte.${q(from)}&select=id&limit=50`).catch(() => [])).length;
}

// الوسيط آخر 7 أيام (بدون الأرقام الشاذة: نسوا يضغطون جاهز). أقل من 5 طلبات = ما نعطي رقم
async function typicalWait(storeId) {
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const past = await rest(`pager_tickets?client_id=eq.${storeId}&ready_at=not.is.null&created_at=gte.${q(week)}&select=created_at,ready_at&order=created_at.desc&limit=60`).catch(() => []);
  const waits = past.map(r => mins(Date.parse(r.ready_at) - Date.parse(r.created_at))).filter(m => m > 0 && m <= 60).sort((a, b) => a - b);
  return waits.length >= 5 ? waits[Math.floor(waits.length / 2)] : null;
}

// الوقت الباقي تقريباً: الوسيط ناقص اللي انتظره (أقل شي دقيقة). null = ما نعرف
function etaOf(t, typical) {
  if (t.status !== 'waiting' || !typical) return null;
  return Math.max(1, typical - mins(Date.now() - Date.parse(t.created_at)));
}

module.exports = { mins, aheadOf, typicalWait, etaOf };
