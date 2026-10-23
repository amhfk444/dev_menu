// =====================================================================
// DEV MENU — بطاقة الولاء في المحفظة (Apple Wallet + Google Wallet) عبر WalletWallet
//   https://www.walletwallet.dev — توقّع البطاقة بشهادتها، فما نحتاج حساب مطوّر آبل
//   المتغير في Vercel: WALLET_API_KEY
// نرسل أقل بيانات ممكنة: اسم المحل وعدد الأختام (بدون أي بيانات عن الزبون)
// =====================================================================
const { ApiError } = require('./core');

const BASE = 'https://api.walletwallet.dev/api/passes';
const KEY = process.env.WALLET_API_KEY || '';
const configured = () => !!KEY;

async function call(method, path, body) {
  const r = await fetch(BASE + path, {
    method, signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) {
    console.error('WALLET', method, path, r.status, JSON.stringify(d).slice(0, 300));
    const e = new Error(d.message || d.error || `wallet ${r.status}`); e.status = r.status; throw e;
  }
  return d;
}

// محتوى البطاقة. full = مزايا الباقة المدفوعة (الشعار، الموقع على شاشة القفل)
function passBody({ store, settings, card, url, restoreUrl, lat, lng }, full = true) {
  const n = settings.needed, s = Math.min(card.stamps, n);
  const body = {
    logoText: String(store.name || 'DEV MENU').slice(0, 40),
    organizationName: String(store.name || 'DEV MENU').slice(0, 64),
    description: `بطاقة الولاء: ${store.name || ''}`.slice(0, 120),
    colorPreset: 'green',
    headerFields: [{ label: 'الزيارات', value: String(card.visits || 0), changeMessage: 'زيارتك رقم %@' }],
    primaryFields: [{ label: 'الأختام', value: `${s} / ${n}`, changeMessage: 'صار عندك %@ ختم' }],
    secondaryFields: [{ label: 'المكافأة', value: settings.reward }, { label: s >= n ? 'جاهزة' : 'باقي', value: s >= n ? 'استخدمها الحين' : `${n - s} أختام` }],
    backFields: [
      { label: 'طريقة الختم', value: 'امسح كود المحل وأنت داخله، وينضاف ختمك على طول.' },
      { label: 'افتح بطاقتك', value: restoreUrl || url }
    ],
    sharingProhibited: true
  };
  if (full) {
    if (store.logo_url && /^https:\/\//.test(store.logo_url)) body.logoURL = store.logo_url;
    if (Number.isFinite(lat) && Number.isFinite(lng)) body.locations = [{ latitude: lat, longitude: lng, relevantText: `أنت قريب من ${store.name}، خذ ختمك` }];
  }
  return body;
}

// بطاقة جديدة. لو الباقة المجانية رفضت المزايا المدفوعة نعيد بدونها
async function createPass(ctx) {
  if (!configured()) throw new ApiError(503, 'إضافة البطاقة للمحفظة مو متاحة حالياً', 'WALLET_OFF');
  try { return await call('POST', '', passBody(ctx, true)); }
  catch (e) {
    if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) {
      try { return await call('POST', '', passBody(ctx, false)); } catch (e2) { e = e2; }
    }
    if (e.status === 429) throw new ApiError(503, 'المحفظة مشغولة الحين، جرّب بعد شوي', 'WALLET_LIMIT');
    throw new ApiError(502, 'تعذر تجهيز البطاقة للمحفظة، جرّب بعد شوي', 'WALLET_FAILED');
  }
}

// تحديث الأختام في المحفظة (التحديث من مزايا الباقة المدفوعة، ولو فشل ما يوقف الختم)
async function updatePass(serial, ctx) {
  if (!configured() || !serial) return;
  try { await call('PUT', `/${encodeURIComponent(serial)}`, passBody(ctx, true)); }
  catch (e) {
    if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 404 && e.status !== 429) {
      await call('PUT', `/${encodeURIComponent(serial)}`, passBody(ctx, false)).catch(() => {});
    }
  }
}

module.exports = { configured, createPass, updatePass };
