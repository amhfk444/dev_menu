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

// إحصاءات المحل آخر 7 أيام: الوسيط للانتظار، والوقت بين كل طلب يجهز والطلب اللي بعده (سرعة التجهيز)
async function waitStats(storeId) {
  const week = new Date(Date.now() - 7 * 864e5).toISOString();
  const past = await rest(`pager_tickets?client_id=eq.${storeId}&ready_at=not.is.null&created_at=gte.${q(week)}&select=created_at,ready_at&order=created_at.desc&limit=120`).catch(() => []);
  const waits = past.map(r => mins(Date.parse(r.ready_at) - Date.parse(r.created_at))).filter(m => m > 0 && m <= 60).sort((a, b) => a - b);
  const typical = waits.length >= 5 ? waits[Math.floor(waits.length / 2)] : null;
  // الفرق بين أوقات الجاهزية المتتالية (نفس الفترة، أقل من 20 دقيقة) = كم ياخذ الطلب الواحد لما فيه طابور
  const readies = past.map(r => Date.parse(r.ready_at)).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < readies.length; i++) { const g = (readies[i] - readies[i - 1]) / 60000; if (g >= 0.3 && g <= 20) gaps.push(g); }
  gaps.sort((a, b) => a - b);
  const gap = gaps.length >= 5 ? gaps[Math.floor(gaps.length / 2)] : null;
  return { typical, gap };
}

// التقدير للزبون: مدة تقريبية (من - إلى)، ونسبة التقدّم للحلقة، ولو تأخر عن التقدير (overdue)
// الإجمالي = الأكبر بين الوسيط و(الطلبات قدامه + طلبه) × وقت الطلب الواحد
function estimate(t, ahead, stats) {
  if (t.status !== 'waiting') return null;
  const waited = (Date.now() - Date.parse(t.created_at)) / 60000;
  if (t.eta_at) {   // الكاشير حدد الوقت
    const left = (Date.parse(t.eta_at) - Date.now()) / 60000, total = Math.max(1, waited + left);
    return { staff: true, low: Math.max(1, Math.ceil(left)), high: Math.max(1, Math.ceil(left)), overdue: left <= 0, progress: Math.min(1, waited / total) };
  }
  const { typical, gap } = stats || {};
  if (!typical && !gap) return { low: null, high: null, overdue: false, progress: null };
  const total = Math.max(typical || 0, gap ? (ahead + 1) * gap : 0);
  const left = total - waited;
  if (left <= 0.5) return { low: null, high: null, overdue: true, progress: 1 };
  const low = Math.max(1, Math.round(left * 0.8)), high = Math.max(low + 1, Math.round(left * 1.25));
  return { low, high, overdue: false, progress: Math.min(.95, waited / total) };
}

// الوقت الباقي تقريباً: الوسيط ناقص اللي انتظره (أقل شي دقيقة). null = ما نعرف
function etaOf(t, typical) {
  if (t.status !== 'waiting') return null;
  // الكاشير حدد الوقت بنفسه (أصناف تتأخر): هو المعتمد
  if (t.eta_at) return Math.max(1, Math.ceil((Date.parse(t.eta_at) - Date.now()) / 60000));
  if (!typical) return null;
  return Math.max(1, typical - mins(Date.now() - Date.parse(t.created_at)));
}

// سطر الإضافة كما يطلع للكاشير والمساعد: «2× كوكيز (كبير) — بدون سكر»
const addonLine = (a) => `${(a.qty || 1) > 1 ? `${a.qty}× ` : ''}${a.name}${a.size ? ` (${a.size})` : ''}${a.note ? ` — ${a.note}` : ''}`;

module.exports = { mins, aheadOf, typicalWait, waitStats, estimate, etaOf, addonLine };
