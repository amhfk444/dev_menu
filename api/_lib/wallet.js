// =====================================================================
// DEV MENU — بطاقة الولاء في المحفظة (Apple Wallet + Google Wallet) عبر WalletWallet
//   https://www.walletwallet.dev — توقّع البطاقة بشهادتها، فما نحتاج حساب مطوّر آبل
//   المتغير في Vercel: WALLET_API_KEY
// نرسل أقل بيانات ممكنة: اسم المحل وعدد الأختام (بدون أي بيانات عن الزبون)
// =====================================================================
const { ApiError } = require('./core');
const { stampStrip } = require('./strip');

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
function passBody({ store, settings, card, url, restoreUrl, lat, lng, notice, strip, nearText }, full = true) {
  const n = settings.needed, s = Math.min(card.stamps, n);
  const body = {
    logoText: String(store.name || 'DEV MENU').slice(0, 40),
    organizationName: String(store.name || 'DEV MENU').slice(0, 64),
    description: `بطاقة الولاء: ${store.name || ''}`.slice(0, 120),
    colorPreset: 'green',
    // العدد فوق (يبان حتى والبطاقة بين البطاقات)، والأختام نفسها في الصورة العريضة
    headerFields: [{ label: 'الأختام', value: `${s} / ${n}`, changeMessage: 'صار عندك %@ ختم' }],
    // المكافأة وحامل البطاقة بس (عدد الأختام فوق، والأختام نفسها في الصورة)
    secondaryFields: [{ label: s >= n ? 'مكافأتك جاهزة' : 'المكافأة', value: settings.reward }, ...(card.name ? [{ label: 'صاحب البطاقة', value: String(card.name).slice(0, 40) }] : [])],
    backFields: [
      { label: 'رقم العضوية', value: `#${card.member_no || ''}` },
      { label: 'زياراتك', value: String(card.visits || 0) },
      { label: 'طريقة الختم', value: 'بعد ما تدفع، اعرض الكود اللي في البطاقة للكاشير، أو امسح كود الختم اللي يطلعه لك.' },
      { label: 'افتح بطاقتك', value: restoreUrl || url }
    ],
    // كود العضوية: الكاشير يصوّره من المحفظة ويختم
    ...(card.client_id ? { barcodeValue: require('./loyalty-stamp').memberQr(card), barcodeFormat: 'QR', barcodeAltText: `رقم العضوية #${card.member_no || ''}` } : {}),
    sharingProhibited: true,
    // رسالة المحل: لما تتغير تطلع إشعار على الجوال (لازم تكون موجودة من أول مرة، عشان كذا مسافة لو ما فيه رسالة)
    notification: String(notice || ' ').slice(0, 250)
  };
  if (full) {
    // لون المحل بدل اللون الجاهز (ما نرسل الاثنين، عشان الجاهز ما يغطي عليه)
    if (settings.design && settings.design.color) { body.color = settings.design.color; delete body.colorPreset; }
    // شعار البطاقة الخاص لو حطه صاحب المحل، وإلا شعار المنيو
    const logo = (settings.design && settings.design.logo) || store.logo_url;
    if (logo && /^https:\/\//.test(logo)) body.logoURL = logo;
    // صورة الأختام بنفس شكل بطاقة DEV MENU
    if (strip) body.stripURL = strip;
    if (Number.isFinite(lat) && Number.isFinite(lng)) body.locations = [{ latitude: lat, longitude: lng, relevantText: String(nearText || `أنت قريب من ${store.name}، خذ ختمك`).slice(0, 80) }];
  }
  return body;
}

// بطاقة جديدة. لو الباقة المجانية رفضت المزايا المدفوعة نعيد بدونها
async function createPass(ctx) {
  if (!configured()) throw new ApiError(503, 'إضافة البطاقة للمحفظة مو متاحة حالياً', 'WALLET_OFF');
  ctx = { ...ctx, strip: await stampStrip(ctx.settings, ctx.card) };
  try { return await call('POST', '', passBody(ctx, true)); }
  catch (e) {
    if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 429) {
      try { return await call('POST', '', passBody(ctx, false)); } catch (e2) { e = e2; }
    }
    if (e.status === 429) throw new ApiError(503, 'المحفظة مشغولة الحين، جرّب بعد شوي', 'WALLET_LIMIT');
    throw new ApiError(502, 'تعذر تجهيز البطاقة للمحفظة، جرّب بعد شوي', 'WALLET_FAILED');
  }
}

// تحديث البطاقة في المحفظة (التحديث من مزايا الباقة المدفوعة، ولو فشل ما يوقف الختم)
// يرجّع null لو نجح، أو سبب الفشل (ينحفظ مع البطاقة عشان نعرف وش صار، والنجاح يبدأ بـ ok)
async function updatePass(serial, ctx) {
  if (!configured() || !serial) return 'not configured';
  ctx = { ...ctx, strip: await stampStrip(ctx.settings, ctx.card) };
  try {
    const r = await call('PUT', `/${encodeURIComponent(serial)}`, passBody(ctx, true));
    // نسجل رد الخدمة: كم جهاز وصله التحديث، وهل المحتوى تغيّر
    return `ok devices=${r.notifiedDevices ?? '?'} unchanged=${r.unchanged ?? '?'} strip=${ctx.strip ? Math.round(ctx.strip.length / 1024) + 'KB' : 'none ' + (stampStrip.lastError || '')} at=${new Date().toISOString().slice(0, 19)}`;
  }
  catch (e) {
    const first = `${e.status || ''} ${e.message || ''}`.trim();
    if (e.status >= 400 && e.status < 500 && e.status !== 401 && e.status !== 404 && e.status !== 429) {
      try { await call('PUT', `/${encodeURIComponent(serial)}`, passBody(ctx, false)); return `partial: ${first}`.slice(0, 300); }
      catch (e2) { return `${e2.status || ''} ${e2.message || ''}`.trim().slice(0, 300); }
    }
    return first.slice(0, 300);
  }
}

// رابط صفحة البطاقة، ورابط الاسترجاع (فيه رقم البطاقة السري، يطلع على ظهر بطاقة المحفظة بس)
const cardUrl = (slug) => require('./core').storeLink(slug, 'loyalty');
function buildCtx({ store, settings, card, lat, lng, notice, nearText }) {
  const url = cardUrl(store.client_slug);
  return { store, settings, card, url, restoreUrl: `${url}${url.includes('?') ? '&' : '?'}t=${encodeURIComponent(card.token)}`, lat, lng, notice, nearText };
}

// إلغاء البطاقة من المحفظة (لما يُحذف العضو): آبل تطفيها وتشيل كودها وتنقلها للبطاقات المنتهية، وقوقل تنهيها
async function revokePass(serial) {
  if (!configured() || !serial) return 'off';
  try { const r = await call('DELETE', `/${encodeURIComponent(serial)}`); return r.deleted ? 'revoked' : 'unknown'; }
  catch (e) { return e.status === 404 ? 'gone' : `error ${e.status || ''}`.trim(); }
}

module.exports = { configured, createPass, updatePass, revokePass, buildCtx, cardUrl };
